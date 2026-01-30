/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 词库扫描与预处理 Composable
 *
 * 功能：扫描 ACU 数据库中表名含"随机词"的表，解析词库并支持随机抽取
 *
 * @example
 * ```typescript
 * import { detectWordPoolTables, parseWordPool, drawWords } from './useWordPool';
 *
 * // 检测可用的词库表
 * const tables = detectWordPoolTables();
 * console.log('找到词库表:', tables);
 *
 * // 解析词库数据
 * const pools = parseWordPool(tableData);
 *
 * // 随机抽取关键词
 * const words = drawWords(pools, 4);
 * console.log('抽取结果:', words);
 * ```
 */

import { computed, ref, type Ref } from 'vue';
import { getCore } from '../utils';

// ============================================
// 类型定义
// ============================================

/**
 * 词库分组
 */
export interface WordPool {
  /** 分组名称（列名） */
  category: string;
  /** 该分组下的所有词（已去重） */
  words: string[];
}

/**
 * ACU 表格数据格式
 * key 为列名，value 为单元格内容
 */
export type TableRow = Record<string, string>;

// ============================================
// 核心函数
// ============================================

/**
 * 检测是否有可用的词库表
 *
 * 扫描 ACU 数据库，查找表名包含"随机词"的表
 *
 * @returns 词库表名列表
 *
 * @example
 * ```typescript
 * const tables = detectWordPoolTables();
 * // ['词库随机词', '事件随机词']
 * ```
 */
export function detectWordPoolTables(): string[] {
  // 使用 ACU API 获取所有表数据
  const api = getCore().getDB();
  const tableData = api?.exportTableAsJson ? api.exportTableAsJson() : null;

  if (!tableData) {
    console.info('[useWordPool] ACU API 不可用或返回空，无法检测词库表');
    return [];
  }

  // 筛选表名包含"随机表"、"随机词"、"Random"、"Dict"、"Chaos"、"词库"的表
  // 优先匹配显示名称(name)，其次匹配ID
  const wordPoolTables: string[] = [];

  for (const [key, value] of Object.entries(tableData)) {
    if (!key.startsWith('sheet_')) continue;

    const sheetId = key.replace('sheet_', '');
    const sheetData = value as { name?: string };
    const displayName = sheetData.name || '';

    // 检查显示名称
    const nameMatch = ['随机', '随机词', 'random', 'dict', 'chaos'].some(keyword =>
      displayName.toLowerCase().includes(keyword.toLowerCase())
    );

    // 检查 ID
    const idMatch = ['随机', '随机词', 'random', 'dict', 'chaos'].some(keyword =>
      sheetId.toLowerCase().includes(keyword.toLowerCase())
    );

    if (nameMatch || idMatch) {
      wordPoolTables.push(sheetId);
    }
  }

  console.info(`[useWordPool] 扫描了 ${Object.keys(tableData).length} 个表，检测到 ${wordPoolTables.length} 个词库表:`, wordPoolTables);
  return wordPoolTables;
}

/**
 * 获取指定词库表的数据
 *
 * @param tableName - 表名（不含 "sheet_" 前缀）
 * @returns 表格数据行数组，如果表不存在则返回空数组
 */
export function getWordPoolTableData(tableName: string): TableRow[] {
  const api = getCore().getDB();
  const tableData = api?.exportTableAsJson ? api.exportTableAsJson() : null;

  if (!tableData) {
    return [];
  }

  const sheetKey = `sheet_${tableName}`;
  const data = tableData[sheetKey];

  // 兼容性处理：ACU exportTableAsJson 返回的数据可能包含 content 字段（数组），也可能直接是 content 数组
  // 用户提供的 JSON 显示数据在 content 字段中，且第一行是表头
  let rows: any[] = [];
  if (Array.isArray(data)) {
    // 纯数组情况
    rows = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as any).content)) {
    // 对象包含 content 数组的情况
    const content = (data as any).content;
    // 将 content 转换为 TableRow[] 格式 (对象数组)
    // 假设第一行是表头
    if (content.length > 1) {
      const headers = content[0];
      for (let i = 1; i < content.length; i++) {
        const rowData = content[i];
        const rowObj: TableRow = {};
        headers.forEach((header: string, index: number) => {
          if (header) {
            rowObj[header] = rowData[index] || '';
          }
        });
        rows.push(rowObj);
      }
    }
  }

  // 调试日志：检查数据行数
  console.log(`[useWordPool] 表 "${tableName}" 解析后的数据行数: ${rows.length}`);
  if (rows.length > 0) {
    console.log(`[useWordPool] 表 "${tableName}" 第一行示例:`, rows[0]);
  } else {
    console.warn(`[useWordPool] 表 "${tableName}" 解析后为空，无法提取词库`);
  }

  return rows as TableRow[];
}

/**
 * 解析词库表数据
 *
 * 将 ACU 表格数据转换为词库格式：
 * - 按列分组
 * - 按逗号拆分单元格内容
 * - 自动去重
 *
 * @param tableData - 表格数据行数组
 * @returns 词库分组列表
 *
 * @example
 * ```typescript
 * const tableData = [
 *   { '环境氛围': '静电噪音,刺眼的白炽灯', '交互物品': '半截粉笔' },
 *   { '环境氛围': '阴冷的穿堂风', '交互物品': '一卷胶带,生锈的手术刀' },
 * ];
 * const pools = parseWordPool(tableData);
 * // [
 * //   { category: '环境氛围', words: ['静电噪音', '刺眼的白炽灯', '阴冷的穿堂风'] },
 * //   { category: '交互物品', words: ['半截粉笔', '一卷胶带', '生锈的手术刀'] },
 * // ]
 * ```
 */
export function parseWordPool(tableData: TableRow[]): WordPool[] {
  const pools: Map<string, Set<string>> = new Map();

  for (const row of tableData) {
    for (const [column, cellValue] of Object.entries(row)) {
      // 跳过空值或非字符串
      if (!cellValue || typeof cellValue !== 'string') continue;

      // 初始化分组
      if (!pools.has(column)) {
        pools.set(column, new Set());
      }

      // 按中英文逗号分隔，并去除空白
      const words = cellValue
        .split(/[,，]/)
        .map(w => w.trim())
        .filter(Boolean);

      // 添加到对应分组（Set 自动去重）
      words.forEach(w => pools.get(column)!.add(w));
    }
  }

  // 转换为数组格式
  return Array.from(pools.entries()).map(([category, wordSet]) => ({
    category,
    words: Array.from(wordSet),
  }));
}

/**
 * 从词库中随机抽取指定数量的词
 *
 * 使用 Fisher-Yates 洗牌算法保证均匀随机
 *
 * @param pools - 词库分组列表
 * @param count - 抽取数量
 * @returns 抽取的词列表
 *
 * @example
 * ```typescript
 * const words = drawWords(pools, 4);
 * // ['静电噪音', '半截粉笔', '偏头痛', '阴冷的穿堂风']
 * ```
 */
export function drawWords(pools: WordPool[], count: number): string[] {
  // 合并所有词
  const allWords = pools.flatMap(p => p.words);

  if (allWords.length === 0) {
    console.info('[useWordPool] 词库为空，无法抽取');
    return [];
  }

  // Fisher-Yates 洗牌算法
  const shuffled = [...allWords];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 取前 N 个（不超过总数）
  const result = shuffled.slice(0, Math.min(count, shuffled.length));
  console.info(`[useWordPool] 抽取了 ${result.length} 个词:`, result);
  return result;
}

/**
 * 从指定分组中随机抽取一个词
 *
 * @param pool - 词库分组
 * @returns 抽取的词，如果分组为空则返回 null
 */
export function drawOneFromPool(pool: WordPool): string | null {
  if (pool.words.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * pool.words.length);
  return pool.words[index];
}

/**
 * 从每个分组各抽取一个词
 *
 * @param pools - 词库分组列表
 * @returns 每个分组抽取的词（分组名 -> 词）
 */
export function drawOneFromEachPool(pools: WordPool[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const pool of pools) {
    const word = drawOneFromPool(pool);
    if (word) {
      result.set(pool.category, word);
    }
  }

  return result;
}

/**
 * 获取词库统计信息
 *
 * @param pools - 词库分组列表
 * @returns 统计信息
 */
export function getWordPoolStats(pools: WordPool[]): {
  totalCategories: number;
  totalWords: number;
  categorySizes: Map<string, number>;
} {
  const categorySizes = new Map<string, number>();

  for (const pool of pools) {
    categorySizes.set(pool.category, pool.words.length);
  }

  return {
    totalCategories: pools.length,
    totalWords: pools.reduce((sum, p) => sum + p.words.length, 0),
    categorySizes,
  };
}

// ============================================
// 从最新行抽词（新功能）
// ============================================

/**
 * 从最新行（最后一行）抽词
 *
 * @param mode 抽词模式
 *   - 'perColumn': 每列抽1个词
 *   - 'mixed': 所有词混一起抽 count 个
 * @param count 混合模式下抽取数量
 * @returns 抽取的词数组
 *
 * @example
 * ```typescript
 * // 每列抽1个
 * const words = drawFromLatestRow('perColumn');
 * // ['静电噪音', '半截粉笔', '偏头痛']
 *
 * // 混合抽4个
 * const words = drawFromLatestRow('mixed', 4);
 * // ['静电噪音', '半截粉笔', '阴冷的穿堂风', '偏头痛']
 * ```
 */
export function drawFromLatestRow(
  mode: 'perColumn' | 'mixed' | 'perItem' | 'custom' = 'perColumn',
  count: number = 4
): string[] {
  const tables = detectWordPoolTables();
  const result: string[] = [];

  for (const tableName of tables) {
    const rows = getWordPoolTableData(tableName);
    if (rows.length === 0) continue;

    // 取最后一行（最新生成的）
    const latestRow = rows[rows.length - 1];

    if (mode === 'perColumn' || mode === 'perItem') {
      // 每列抽1个
      for (const [column, cellValue] of Object.entries(latestRow)) {
        if (!cellValue || typeof cellValue !== 'string') continue;

        // 按 , · ， 分隔
        const words = cellValue
          .split(/[,，·]/)
          .map(w => w.trim())
          .filter(Boolean);

        if (words.length > 0) {
          const randomWord = words[Math.floor(Math.random() * words.length)];
          result.push(randomWord);
        }
      }
    } else {
      // 混合模式：收集所有词
      for (const cellValue of Object.values(latestRow)) {
        if (!cellValue || typeof cellValue !== 'string') continue;

        const words = cellValue
          .split(/[,，·]/)
          .map(w => w.trim())
          .filter(Boolean);

        result.push(...words);
      }
    }
  }

  if (mode === 'mixed' || mode === 'custom') {
    // 混合模式：洗牌后取前 count 个
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    const sliced = result.slice(0, count);
    console.info(`[useWordPool] 混合模式从最新行抽取 ${sliced.length} 个词:`, sliced);
    return sliced;
  }

  console.info(`[useWordPool] 每列模式从最新行抽取 ${result.length} 个词:`, result);
  return result;
}

// ============================================
// 从最新行抽词（支持列配置）
// ============================================

/**
 * 列配置类型
 */
export interface ColumnConfig {
  enabled: boolean;
  limit: number; // 0 表示不限制
}

/**
 * 从最新行抽词（带列配置）
 *
 * @param mode 抽词模式
 *   - 'perItem': 每个开启的列抽 wordsPerItem 个（不受总数限制）
 *   - 'custom': 每列最多抽 limit 个，总数不超过 drawCount
 *   - 'mixed': 所有开启列的词混合池抽取（受总数限制）
 * @param wordsPerItem perItem 模式下每列抽取数量
 * @param drawCount 抽词总数上限（custom/mixed 模式使用）
 * @param columnConfig 列配置（列名 -> {enabled, limit}）
 * @returns 抽取的词数组
 *
 * @example
 * ```typescript
 * // perItem 模式：每个开启的列抽 2 个
 * const words = drawFromLatestRowWithConfig('perItem', 2, 10, {
 *   '环境氛围': { enabled: true, limit: 0 },
 *   '交互物品': { enabled: true, limit: 0 },
 * });
 *
 * // custom 模式：每列最多抽 limit 个，总计不超过 drawCount
 * const words = drawFromLatestRowWithConfig('custom', 1, 4, {
 *   '环境氛围': { enabled: true, limit: 2 },
 *   '交互物品': { enabled: true, limit: 3 },
 * });
 *
 * // mixed 模式：所有开启列混合抽取
 * const words = drawFromLatestRowWithConfig('mixed', 1, 4, {
 *   '环境氛围': { enabled: true, limit: 0 },
 *   '交互物品': { enabled: true, limit: 0 },
 * });
 * ```
 */
export function drawFromLatestRowWithConfig(
  mode: 'perItem' | 'custom' | 'mixed',
  wordsPerItem: number,
  drawCount: number,
  columnConfig: Record<string, ColumnConfig>
): string[] {
  const tables = detectWordPoolTables();
  const result: string[] = [];

  // 收集所有列的词（按列分组）
  const columnWords: Map<string, string[]> = new Map();

  for (const tableName of tables) {
    const rows = getWordPoolTableData(tableName);
    if (rows.length === 0) continue;

    // 取最后一行（最新生成的）
    const latestRow = rows[rows.length - 1];

    for (const [column, cellValue] of Object.entries(latestRow)) {
      if (!cellValue || typeof cellValue !== 'string') continue;

      // 检查列是否启用（如果配置中没有该列，默认启用）
      const colConfig = columnConfig[column];
      if (colConfig && !colConfig.enabled) continue;

      // 按 , · ， 分隔
      const words = cellValue
        .split(/[,，·]/)
        .map(w => w.trim())
        .filter(Boolean);

      if (words.length > 0) {
        if (!columnWords.has(column)) {
          columnWords.set(column, []);
        }
        columnWords.get(column)!.push(...words);
      }
    }
  }

  // 根据模式抽词
  if (mode === 'perItem') {
    // perItem 模式：每个开启的列抽 wordsPerItem 个（不受总数限制）
    for (const [column, words] of columnWords) {
      const count = Math.min(wordsPerItem, words.length);
      const shuffled = shuffleArray([...words]);
      result.push(...shuffled.slice(0, count));
    }
    console.info(`[useWordPool] perItem 模式从表格抽取 ${result.length} 个词:`, result);
  } else if (mode === 'custom') {
    // custom 模式：每列最多抽 limit 个，总数不超过 drawCount
    let remaining = drawCount;

    for (const [column, words] of columnWords) {
      if (remaining <= 0) break;

      const colConfig = columnConfig[column];
      const limit = colConfig?.limit || 0;
      // limit 为 0 表示不限制，使用 wordsPerItem 作为默认值
      const maxFromThisColumn = limit > 0 ? Math.min(limit, remaining) : Math.min(wordsPerItem, remaining);
      const count = Math.min(maxFromThisColumn, words.length);

      const shuffled = shuffleArray([...words]);
      result.push(...shuffled.slice(0, count));
      remaining -= count;
    }
    console.info(`[useWordPool] custom 模式从表格抽取 ${result.length} 个词:`, result);
  } else {
    // mixed 模式：所有开启列的词混合池抽取
    const allWords: string[] = [];
    for (const words of columnWords.values()) {
      allWords.push(...words);
    }

    const shuffled = shuffleArray(allWords);
    const count = Math.min(drawCount, shuffled.length);
    result.push(...shuffled.slice(0, count));
    console.info(`[useWordPool] mixed 模式从表格抽取 ${result.length} 个词:`, result);
  }

  return result;
}

/**
 * Fisher-Yates 洗牌算法（返回新数组）
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 获取所有可用的列名（用于 UI 配置）
 *
 * @returns 列名数组
 */
export function getAvailableColumns(): string[] {
  const tables = detectWordPoolTables();
  const columns = new Set<string>();

  for (const tableName of tables) {
    const rows = getWordPoolTableData(tableName);
    if (rows.length === 0) continue;

    // 从最后一行获取列名
    const latestRow = rows[rows.length - 1];
    for (const column of Object.keys(latestRow)) {
      columns.add(column);
    }
  }

  return Array.from(columns);
}

// ============================================
// Composable 封装（Vue 3）
// ============================================

export interface UseWordPoolOptions {
  /** 是否自动加载，默认 true */
  autoLoad?: boolean;
}

export interface UseWordPoolReturn {
  /** 检测到的词库表名列表 */
  tables: Ref<string[]>;
  /** 当前加载的词库数据 */
  pools: Ref<WordPool[]>;
  /** 是否正在加载 */
  loading: Ref<boolean>;
  /** 是否有可用词库 */
  hasWordPool: Ref<boolean>;
  /** 总词数 */
  totalWords: Ref<number>;
  /** 检测词库表 */
  detect: () => string[];
  /** 加载指定表的词库 */
  loadTable: (tableName: string) => void;
  /** 加载所有词库表 */
  loadAllTables: () => void;
  /** 刷新（重新检测并加载） */
  refresh: () => void;
  /** 抽取词 */
  draw: (count: number) => string[];
  /** 从每个分组各抽取一个 */
  drawFromEach: () => Map<string, string>;
}

/**
 * 词库管理 Composable
 *
 * 提供响应式的词库检测、加载和抽取功能
 *
 * @example
 * ```typescript
 * const { pools, hasWordPool, draw, refresh } = useWordPool();
 *
 * // 刷新词库
 * refresh();
 *
 * // 检查是否有词库
 * if (hasWordPool.value) {
 *   // 抽取4个词
 *   const words = draw(4);
 *   console.log('抽取结果:', words);
 * }
 * ```
 */
export function useWordPool(options: UseWordPoolOptions = {}): UseWordPoolReturn {
  const { autoLoad = true } = options;

  const tables = ref<string[]>([]);
  const pools = ref<WordPool[]>([]);
  const loading = ref(false);

  // 计算属性
  const hasWordPool = computed(() => pools.value.length > 0 && pools.value.some(p => p.words.length > 0));
  const totalWords = computed(() => pools.value.reduce((sum, p) => sum + p.words.length, 0));

  // 检测词库表
  function detect(): string[] {
    const detected = detectWordPoolTables();
    tables.value = detected;
    return detected;
  }

  // 加载指定表
  function loadTable(tableName: string): void {
    const data = getWordPoolTableData(tableName);
    const parsed = parseWordPool(data);

    // 合并到现有词库（避免重复）
    for (const newPool of parsed) {
      const existing = pools.value.find(p => p.category === newPool.category);
      if (existing) {
        // 合并词（去重）
        const wordSet = new Set([...existing.words, ...newPool.words]);
        existing.words = Array.from(wordSet);
      } else {
        pools.value.push(newPool);
      }
    }
  }

  // 加载所有词库表
  function loadAllTables(): void {
    loading.value = true;
    pools.value = [];

    try {
      const tableNames = detect();
      for (const tableName of tableNames) {
        const data = getWordPoolTableData(tableName);
        const parsed = parseWordPool(data);
        pools.value.push(...parsed);
      }
      console.info(`[useWordPool] 加载完成，共 ${totalWords.value} 个词`);
    } finally {
      loading.value = false;
    }
  }

  // 刷新
  function refresh(): void {
    loadAllTables();
  }

  // 抽取词
  function draw(count: number): string[] {
    return drawWords(pools.value, count);
  }

  // 从每个分组各抽取一个
  function drawFromEach(): Map<string, string> {
    return drawOneFromEachPool(pools.value);
  }

  // 自动加载
  if (autoLoad) {
    loadAllTables();
  }

  return {
    tables,
    pools,
    loading,
    hasWordPool,
    totalWords,
    detect,
    loadTable,
    loadAllTables,
    refresh,
    draw,
    drawFromEach,
  };
}
