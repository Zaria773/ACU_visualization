/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 词库扫描与预处理 Composable
 *
 * 功能：扫描 ACU 数据库中表名含"随机"的表，解析词库并支持随机抽取
 *
 * ## 核心概念变更 (v2)
 * - **分类** = 表名（而非列名）
 * - 每个表只有一行数据
 * - 一个单元格 = 一个完整的词（不再按逗号拆分）
 *
 * @example
 * ```typescript
 * import { detectWordPoolTables, getAvailableTables, drawFromLatestRowWithConfig } from './useWordPool';
 *
 * // 检测可用的词库表
 * const tables = detectWordPoolTables();
 * console.log('找到词库表:', tables);
 *
 * // 获取表信息（含显示名称）
 * const tableInfos = getAvailableTables();
 *
 * // 从最新行抽词（带配置）
 * const words = drawFromLatestRowWithConfig('perItem', 1, 4, {});
 * console.log('抽取结果:', words);
 * ```
 */

import { computed, ref, type Ref } from 'vue';
import { getCore } from '../utils';

// ============================================
// 类型定义
// ============================================

/**
 * 词库分组（按表）
 */
export interface WordPool {
  /** 表ID（不含 sheet_ 前缀） */
  tableId: string;
  /** 表显示名称 */
  tableName: string;
  /** 该表第一行所有非空单元格（每格一个词） */
  words: string[];
}

/**
 * @deprecated 使用 WordPool.tableId 代替
 */
export interface LegacyWordPool {
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

/**
 * 表配置
 */
export interface TableConfig {
  enabled: boolean;
  limit: number; // 0 = 不限
}

/**
 * @deprecated 使用 TableConfig 代替
 */
export interface ColumnConfig {
  enabled: boolean;
  limit: number; // 0 表示不限制
}

// ============================================
// 核心函数
// ============================================

/**
 * 获取表的显示名称
 * @param tableId 表ID（不含 sheet_ 前缀）
 * @returns 显示名称，若无则返回 tableId
 */
export function getTableDisplayName(tableId: string): string {
  const api = getCore().getDB();
  const tableData = api?.exportTableAsJson?.();
  if (!tableData) return tableId;

  const sheetKey = `sheet_${tableId}`;
  const data = tableData[sheetKey];
  return (data as any)?.name || tableId;
}

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
      displayName.toLowerCase().includes(keyword.toLowerCase()),
    );

    // 检查 ID
    const idMatch = ['随机', '随机词', 'random', 'dict', 'chaos'].some(keyword =>
      sheetId.toLowerCase().includes(keyword.toLowerCase()),
    );

    if (nameMatch || idMatch) {
      wordPoolTables.push(sheetId);
    }
  }

  console.info(
    `[useWordPool] 扫描了 ${Object.keys(tableData).length} 个表，检测到 ${wordPoolTables.length} 个词库表:`,
    wordPoolTables,
  );
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
 * 解析词库表数据（按表分组，单元格不拆分）
 *
 * @param tableId - 表ID（不含 sheet_ 前缀）
 * @param tableData - 表格数据行数组
 * @returns 词库分组
 *
 * @example
 * ```typescript
 * const pool = parseWordPoolByTable('随机事件', tableData);
 * // { tableId: '随机事件', tableName: '随机事件表', words: ['苹果', '香蕉', '橙子'] }
 * ```
 */
export function parseWordPoolByTable(tableId: string, tableData: TableRow[]): WordPool {
  const words: string[] = [];

  // 取最新一行（每表只有一行）
  const row = tableData[tableData.length - 1];
  if (row) {
    for (const cellValue of Object.values(row)) {
      if (cellValue && typeof cellValue === 'string') {
        const trimmed = cellValue.trim();
        if (trimmed) {
          words.push(trimmed);
        }
      }
    }
  }

  return {
    tableId,
    tableName: getTableDisplayName(tableId),
    words,
  };
}

/**
 * @deprecated 使用 parseWordPoolByTable 代替
 *
 * 解析词库表数据（旧版：按列分组，逗号拆分）
 */
export function parseWordPool(tableData: TableRow[]): LegacyWordPool[] {
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
export function drawWords(pools: (WordPool | LegacyWordPool)[], count: number): string[] {
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
export function drawOneFromPool(pool: WordPool | LegacyWordPool): string | null {
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
 * @returns 每个分组抽取的词（分组名/表名 -> 词）
 */
export function drawOneFromEachPool(pools: (WordPool | LegacyWordPool)[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const pool of pools) {
    const word = drawOneFromPool(pool);
    if (word) {
      // 兼容新旧格式
      const key = 'tableId' in pool ? pool.tableName : (pool as LegacyWordPool).category;
      result.set(key, word);
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
export function getWordPoolStats(pools: (WordPool | LegacyWordPool)[]): {
  totalCategories: number;
  totalWords: number;
  categorySizes: Map<string, number>;
} {
  const categorySizes = new Map<string, number>();

  for (const pool of pools) {
    // 兼容新旧格式
    const key = 'tableId' in pool ? pool.tableName : (pool as LegacyWordPool).category;
    categorySizes.set(key, pool.words.length);
  }

  return {
    totalCategories: pools.length,
    totalWords: pools.reduce((sum, p) => sum + p.words.length, 0),
    categorySizes,
  };
}

// ============================================
// 从最新行抽词（按表分组，单元格不拆分）
// ============================================

/**
 * @deprecated 使用 drawFromLatestRowWithConfig 代替
 *
 * 从最新行（最后一行）抽词（旧版：按列分组，逗号拆分）
 */
export function drawFromLatestRow(
  mode: 'perColumn' | 'mixed' | 'perItem' | 'custom' = 'perColumn',
  count: number = 4,
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
// 从最新行抽词（按表分组，单元格不拆分）- V2
// ============================================

/**
 * 从最新行抽词（按表分组，单元格不拆分）
 *
 * ## V2 核心变更
 * - 分类 = 表名（而非列名）
 * - 每个单元格 = 一个完整的词（不再按逗号拆分）
 * - 每表只有一行数据
 *
 * @param mode 抽词模式
 *   - 'perItem': 每个开启的表抽 wordsPerItem 个词（不受总数限制）
 *   - 'custom': 每表最多抽 limit 个，总数不超过 drawCount
 *   - 'mixed': 所有开启表的词混合后随机抽取（受总数限制）
 * @param wordsPerItem perItem 模式下每表抽取数量
 * @param drawCount 抽词总数上限（custom/mixed 模式使用）
 * @param tableConfig 表配置（表ID -> {enabled, limit}）
 * @returns 抽取的词数组
 *
 * @example
 * ```typescript
 * // perItem 模式：每个开启的表抽 2 个
 * const words = drawFromLatestRowWithConfig('perItem', 2, 10, {
 *   '随机事件': { enabled: true, limit: 0 },
 *   '随机物品': { enabled: true, limit: 0 },
 * });
 *
 * // custom 模式：每表最多抽 limit 个，总计不超过 drawCount
 * const words = drawFromLatestRowWithConfig('custom', 1, 4, {
 *   '随机事件': { enabled: true, limit: 2 },
 *   '随机物品': { enabled: true, limit: 3 },
 * });
 *
 * // mixed 模式：所有开启表混合抽取
 * const words = drawFromLatestRowWithConfig('mixed', 1, 4, {
 *   '随机事件': { enabled: true, limit: 0 },
 *   '随机物品': { enabled: true, limit: 0 },
 * });
 * ```
 */
export function drawFromLatestRowWithConfig(
  mode: 'perItem' | 'custom' | 'mixed',
  wordsPerItem: number,
  drawCount: number,
  tableConfig: Record<string, TableConfig>,
): string[] {
  const tables = detectWordPoolTables();
  const result: string[] = [];

  // 收集所有表的词（按表分组）
  const tableWords: Map<string, string[]> = new Map();

  for (const tableId of tables) {
    // 检查表是否启用（如果配置中没有该表，默认启用）
    const cfg = tableConfig[tableId];
    if (cfg && !cfg.enabled) continue;

    const rows = getWordPoolTableData(tableId);
    if (rows.length === 0) continue;

    // 取最后一行（最新生成的 / 每表唯一行）
    const latestRow = rows[rows.length - 1];
    const words: string[] = [];

    // 每个单元格是一个词（不再按逗号拆分）
    for (const cellValue of Object.values(latestRow)) {
      if (cellValue && typeof cellValue === 'string') {
        const trimmed = cellValue.trim();
        if (trimmed) words.push(trimmed);
      }
    }

    if (words.length > 0) {
      tableWords.set(tableId, words);
    }
  }

  // 根据模式抽词
  if (mode === 'perItem') {
    // perItem 模式：每个开启的表抽 wordsPerItem 个（不受总数限制）
    for (const [tableId, words] of tableWords) {
      const count = Math.min(wordsPerItem, words.length);
      const shuffled = shuffleArray([...words]);
      result.push(...shuffled.slice(0, count));
    }
    console.info(`[useWordPool] perItem 模式从表格抽取 ${result.length} 个词:`, result);
  } else if (mode === 'custom') {
    // custom 模式：每表最多抽 limit 个，总数不超过 drawCount
    let remaining = drawCount;

    for (const [tableId, words] of tableWords) {
      if (remaining <= 0) break;

      const cfg = tableConfig[tableId];
      const limit = cfg?.limit || 0;
      // limit 为 0 表示不限制，使用 wordsPerItem 作为默认值
      const maxFromThisTable = limit > 0 ? Math.min(limit, remaining) : Math.min(wordsPerItem, remaining);
      const count = Math.min(maxFromThisTable, words.length);

      const shuffled = shuffleArray([...words]);
      result.push(...shuffled.slice(0, count));
      remaining -= count;
    }
    console.info(`[useWordPool] custom 模式从表格抽取 ${result.length} 个词:`, result);
  } else {
    // mixed 模式：所有开启表的词混合池抽取
    const allWords: string[] = [];
    for (const words of tableWords.values()) {
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
 * 获取所有可用的词库表（用于 UI 配置）
 *
 * @returns 表信息数组
 */
export function getAvailableTables(): { id: string; name: string }[] {
  const tables = detectWordPoolTables();
  return tables.map(tableId => ({
    id: tableId,
    name: getTableDisplayName(tableId),
  }));
}

/**
 * @deprecated 使用 getAvailableTables 代替
 *
 * 获取所有可用的列名（旧版）
 */
export function getAvailableColumns(): string[] {
  return getAvailableTables().map(t => t.id);
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

  // 加载指定表（V2：按表分组）
  function loadTable(tableId: string): void {
    const data = getWordPoolTableData(tableId);
    const parsed = parseWordPoolByTable(tableId, data);

    // 检查是否已存在同 ID 的表
    const existingIndex = pools.value.findIndex(p => p.tableId === tableId);
    if (existingIndex >= 0) {
      // 更新现有词库
      pools.value[existingIndex] = parsed;
    } else {
      pools.value.push(parsed);
    }
  }

  // 加载所有词库表
  function loadAllTables(): void {
    loading.value = true;
    pools.value = [];

    try {
      const tableIds = detect();
      for (const tableId of tableIds) {
        const data = getWordPoolTableData(tableId);
        const parsed = parseWordPoolByTable(tableId, data);
        pools.value.push(parsed);
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
