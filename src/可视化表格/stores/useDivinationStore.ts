/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 抽签系统 Store
 * 管理抽签逻辑、配置、世界书同步
 */

import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { DEFAULT_LUCK_TIERS } from '../composables/useDraw';
import { drawFromLatestRowWithConfig, shuffleArray, type TableConfig } from '../composables/useWordPool';
import type {
  BiasType,
  Dimension,
  DimensionTier,
  DivinationCategory,
  DivinationConfig,
  DivinationPreset,
  DivinationResult,
} from '../types';
import { getTableData } from '../utils';
import { compressImage, fileToBase64 } from '../utils/imageUpload';

/** 世界书名称 */
const WORLDBOOK_NAME = 'ACU_Divination';

/** 默认运势维度 */
const DEFAULT_LUCK_DIMENSION: Dimension = {
  id: 'luck',
  name: '运势',
  enabled: true,
  tiers: DEFAULT_LUCK_TIERS,
};

/** 默认扭曲度维度 (原时间维度) */
const DEFAULT_SANITY_DIMENSION: Dimension = {
  id: 'sanity',
  name: '扭曲度',
  enabled: false,
  tiers: [
    { id: 'normal', name: '正常逻辑', weight: 50, prompt: '' },
    {
      id: 'absurd',
      name: '“天然合理”',
      weight: 50,
      prompt:
        '特别要求：若需要融合非日常要素，场景中的所有角色必须将其视为日常生活中理所当然的一部分，绝不要有特殊反应。',
    },
  ],
};

/** 默认随机误会维度 */
const DEFAULT_MISUNDERSTANDING_DIMENSION: Dimension = {
  id: 'misunderstanding',
  name: '误会机制',
  enabled: false,
  tiers: [
    {
      id: 'semantic',
      name: '语义歧义',
      weight: 1,
      prompt:
        '请设计一段对话，让角色A在谈论某物品或事件时省略关键主语，导致角色B误以为A在谈论B自己或两人的关系，从而产生强烈的情绪错位。',
    },
    {
      id: 'projection',
      name: '预设偏见',
      weight: 1,
      prompt:
        '请基于角色B当前的心理阴影或秘密（如自卑、愧疚、暗恋），强行将角色A的一个善意或无心的举动，解读为负面，从而产生低落情绪。',
    },
    {
      id: 'fragment',
      name: '断章取义',
      weight: 1,
      prompt:
        '请构建一个场景，安排角色B在‘最容易引起误解的时间点’闯入或路过，只目击到事件的‘结果’而完全错过了‘起因’，导致B通过逻辑补全推导出偏差认知。',
    },
    {
      id: 'pronoun',
      name: '代词混淆',
      weight: 1,
      prompt: '请安排一段关于‘他人/物品’的激烈讨论，利用模糊的代词，让偷听者误会两人的对话核心，产生持续性误会。',
    },
    {
      id: 'glitch',
      name: '过度脑补（online版）',
      weight: 1,
      prompt:
        '请加入一个‘数字媒介干扰’要素（如：手滑误发表情包、关键时刻断网、撤回了一条其实很正常的消息、自动纠错成了糟糕的词），让接收方基于这个技术失误产生过度解读。',
    },
    {
      id: 'jargon',
      name: '电波接错',
      weight: 1,
      prompt:
        '请让角色A使用其专业术语、特定圈子黑话或网络梗进行表达，而角色B完全按字面意思理解，导致一场从‘鸡同鸭讲’到‘事态升级’的严肃误会。',
    },
  ],
};

/** 默认配置 */
const DEFAULT_CONFIG: DivinationConfig = {
  enabled: true,
  drawCount: 4,
  enableBias: true,
  autoSync: true,
  cardBackImage: '',
  themeColor: '#6b4c9a',
  themeId: 'wafuku', // 默认使用和风御札主题
  flipMode: 'auto',
  peepMode: false, // 偷看模式
  dimensions: [DEFAULT_LUCK_DIMENSION, DEFAULT_SANITY_DIMENSION, DEFAULT_MISUNDERSTANDING_DIMENSION],
  customTemplate: '',
  // 词库设置
  enableWordDrawing: true, // @deprecated
  enableTableWords: true, // 默认启用表格随机词
  enableWordPool: false, // 默认关闭世界书词库
  wordDrawMode: 'perItem', // 默认每项抽1个
  wordsPerItem: 1,
  tableColumnConfig: undefined, // @deprecated
  tablePoolConfig: {}, // 表词库配置（表ID -> 配置）
  categoryConfig: {},
  tableSyncConfig: {}, // 表格同步配置
};

export const useDivinationStore = defineStore('acu-divination', () => {
  // ============================================================
  // State
  // ============================================================

  const config = ref<DivinationConfig>({ ...DEFAULT_CONFIG });
  const categories = ref<DivinationCategory[]>([]);
  const isLoaded = ref(false);

  /** 预设列表 */
  const presets = ref<DivinationPreset[]>([]);
  /** 当前激活的预设 ID */
  const activePresetId = ref<string | null>(null);

  // ============================================================
  // Persistence (Global Variables)
  // ============================================================

  /**
   * 加载配置
   * 优先读取 global
   */
  function loadConfig() {
    try {
      if (typeof getVariables !== 'function') {
        console.warn('[Divination] getVariables API unavailable');
        isLoaded.value = true;
        return;
      }

      // 1. 尝试读取全局变量
      const globalVars = getVariables({ type: 'global' }) as any;

      if (globalVars) {
        // 加载预设
        if (globalVars.divinationPresets) {
          presets.value = globalVars.divinationPresets;
        }
        if (globalVars.activeDivinationPresetId) {
          activePresetId.value = globalVars.activeDivinationPresetId;
        }

        // 加载配置
        if (globalVars.divinationConfig) {
          // 合并配置
          config.value = {
            ...DEFAULT_CONFIG,
            ...globalVars.divinationConfig,
            // 确保 dimensions 存在
            dimensions: globalVars.divinationConfig.dimensions || DEFAULT_CONFIG.dimensions,
            // 确保 tablePoolConfig 存在
            tablePoolConfig: globalVars.divinationConfig.tablePoolConfig || {},
            // 确保 tableSyncConfig 存在
            tableSyncConfig: globalVars.divinationConfig.tableSyncConfig || {},
          };

          // 迁移旧配置：tableColumnConfig → tablePoolConfig
          if (
            globalVars.divinationConfig.tableColumnConfig &&
            Object.keys(globalVars.divinationConfig.tableColumnConfig).length > 0 &&
            Object.keys(config.value.tablePoolConfig).length === 0
          ) {
            config.value.tablePoolConfig = { ...globalVars.divinationConfig.tableColumnConfig };
            config.value.tableColumnConfig = undefined;
            console.info('[Divination] Migrated tableColumnConfig → tablePoolConfig');
          }

          console.info('[Divination] Config loaded from global variables');
        }
      }

      isLoaded.value = true;
    } catch (e) {
      console.error('[Divination] Failed to load config:', e);
      isLoaded.value = true;
    }
  }

  /**
   * 保存配置到全局变量
   */
  function saveConfig() {
    try {
      if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') {
        return;
      }

      const globalVars = getVariables({ type: 'global' }) as any;
      const newVars = {
        ...globalVars,
        divinationConfig: config.value,
        divinationPresets: presets.value,
        activeDivinationPresetId: activePresetId.value,
      };

      replaceVariables(newVars, { type: 'global' });
      console.info('[Divination] Config saved to global variables');
    } catch (e) {
      console.error('[Divination] Failed to save config:', e);
    }
  }

  // 监听配置变化自动保存
  watch(
    [config, presets, activePresetId],
    () => {
      if (isLoaded.value) {
        saveConfig();
      }
    },
    { deep: true },
  );

  // ============================================================
  // Preset Management
  // ============================================================

  /**
   * 创建预设
   */
  function createPreset(name: string): DivinationPreset {
    const preset: DivinationPreset = {
      id: `preset_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      dimensions: JSON.parse(JSON.stringify(config.value.dimensions)),
    };
    presets.value.push(preset);
    activePresetId.value = preset.id;
    return preset;
  }

  /**
   * 保存当前配置到预设
   */
  function saveCurrentToPreset(name: string): DivinationPreset {
    const existingIndex = presets.value.findIndex(p => p.name === name);
    if (existingIndex > -1) {
      // 更新现有预设
      const existing = presets.value[existingIndex];
      const updated: DivinationPreset = {
        ...existing,
        dimensions: JSON.parse(JSON.stringify(config.value.dimensions)),
      };
      presets.value[existingIndex] = updated;
      activePresetId.value = existing.id;
      return updated;
    } else {
      // 创建新预设
      return createPreset(name);
    }
  }

  /**
   * 删除预设
   */
  function deletePreset(presetId: string) {
    const index = presets.value.findIndex(p => p.id === presetId);
    if (index > -1) {
      presets.value.splice(index, 1);
      if (activePresetId.value === presetId) {
        activePresetId.value = null;
      }
    }
  }

  /**
   * 应用预设
   */
  function applyPreset(presetId: string) {
    const preset = presets.value.find(p => p.id === presetId);
    if (preset) {
      config.value.dimensions = JSON.parse(JSON.stringify(preset.dimensions));
      activePresetId.value = presetId;
    }
  }

  /**
   * 恢复默认维度配置
   */
  function restoreDefaultDimensions() {
    config.value.dimensions = [
      JSON.parse(JSON.stringify(DEFAULT_LUCK_DIMENSION)),
      JSON.parse(JSON.stringify(DEFAULT_SANITY_DIMENSION)),
      JSON.parse(JSON.stringify(DEFAULT_MISUNDERSTANDING_DIMENSION)),
    ];
    activePresetId.value = null;
  }

  // ============================================================
  // Dimension Management
  // ============================================================

  function addDimension(dimension: Dimension) {
    config.value.dimensions.push(dimension);
  }

  function updateDimension(index: number, dimension: Dimension) {
    if (index >= 0 && index < config.value.dimensions.length) {
      config.value.dimensions[index] = dimension;
    }
  }

  function removeDimension(index: number) {
    if (index >= 0 && index < config.value.dimensions.length) {
      // 保护运势维度不被删除 (通常是第一个)
      if (config.value.dimensions[index].id === 'luck') {
        console.warn('[Divination] Cannot remove luck dimension');
        return;
      }
      config.value.dimensions.splice(index, 1);
    }
  }

  /**
   * 更新分类 (保存到世界书)
   */
  async function updateCategory(category: DivinationCategory) {
    try {
      // 1. 更新本地状态
      const index = categories.value.findIndex(c => c.id === category.id);
      if (index !== -1) {
        categories.value[index] = category;
      }

      // 2. 准备世界书数据
      // 我们需要获取当前所有的 Worldbook 条目，并更新目标条目
      let allEntries: any[] = [];
      try {
        allEntries = await getWorldbook(WORLDBOOK_NAME);
      } catch {
        console.warn('[Divination] Worldbook not found, creating new...');
      }

      // 找到对应的 entry
      const entryIndex = allEntries.findIndex(e => e.uid === category.id);

      // 构建 content 字符串（用换行符分隔，支持句子或段落作为词条）
      const content = category.words.join('\n');

      if (entryIndex !== -1) {
        // 更新现有条目
        allEntries[entryIndex] = {
          ...allEntries[entryIndex],
          content,
          enabled: category.enabled,
          // 如果名称/偏好/限制也变了，也需要更新 name 字段
          // name: `${category.name}|${category.bias}|${category.limit}`
          // 暂时假设 WordPoolPanel 只修改内容和开关
        };
      } else {
        // 如果找不到 ID (可能世界书被删了)，尝试按 Name 匹配或新建
        // 这里简单处理：如果找不到就不存了，或者提示错误
        console.warn(`[Divination] Entry with uid ${category.id} not found in worldbook`);
        return;
      }

      // 3. 保存到世界书
      if (typeof createOrReplaceWorldbook === 'function') {
        // @ts-ignore
        await createOrReplaceWorldbook(WORLDBOOK_NAME, allEntries, { render: 'debounced' });
        console.info('[Divination] Category updated in worldbook');
      }
    } catch (e) {
      console.error('[Divination] Failed to update category:', e);
    }
  }

  /**
   * 上传卡背图片
   */
  async function uploadCardBack(file: File) {
    try {
      // 1. 转 Base64
      const base64 = await fileToBase64(file);

      // 2. 压缩 (提高画质限制：宽度 1024px，质量 0.9)
      const compressed = await compressImage(base64, 1024, 0.9);

      // 3. 更新配置
      config.value.cardBackImage = compressed;
      console.info('[Divination] Card back image uploaded');
    } catch (e) {
      console.error('[Divination] Failed to upload card back:', e);
      throw e;
    }
  }

  // ============================================================
  // Worldbook Integration
  // ============================================================

  /**
   * 解析世界书条目名称
   * 格式: Name|Bias|Limit 或 Name
   */
  function parseEntryName(entryName: string): { name: string; bias: BiasType; limit: number } {
    const parts = entryName.split('|');
    const name = parts[0];
    let bias: BiasType = 'neutral';
    let limit = 0;

    if (parts.length > 1) {
      const biasStr = parts[1];
      if (biasStr === '正' || biasStr === 'positive') bias = 'positive';
      else if (biasStr === '负' || biasStr === 'negative') bias = 'negative';
      else bias = 'neutral';
    }

    if (parts.length > 2) {
      limit = parseInt(parts[2], 10) || 0;
    }

    return { name, bias, limit };
  }

  /**
   * 从世界书加载词库
   */
  async function loadFromWorldbook() {
    try {
      if (typeof getWorldbook !== 'function') {
        console.warn('[Divination] getWorldbook API unavailable');
        return;
      }

      // 检查世界书是否存在
      const names = (await getWorldbookNames?.()) || []; // 安全调用
      // 实际上 getWorldbook 会抛出错误如果不存在，所以直接 try-catch 即可
      // 但这里我们假设如果 names 列表里没有就不尝试获取了
      // 注意: worldbook.d.ts 定义了 getWorldbookNames, 但不一定总是可用，需防御性编程

      const entries = await getWorldbook(WORLDBOOK_NAME);

      categories.value = entries.map(entry => {
        const { name, bias, limit } = parseEntryName(entry.name);
        const words = entry.content
          .split(/[,，、\n]/)
          .map(w => w.trim())
          .filter(w => w);

        return {
          id: entry.uid,
          name,
          bias,
          limit,
          path: [...entry.strategy.keys, name],
          words,
          enabled: entry.enabled,
          rawEntry: entry,
        };
      });

      console.info(`[Divination] Loaded ${categories.value.length} categories from worldbook`);
    } catch (e) {
      console.warn('[Divination] Failed to load worldbook (it might not exist yet):', e);
      // 如果读取失败（例如世界书不存在），清空分类列表
      categories.value = [];
    }
  }

  /**
   * 从 ACU 表格同步数据到世界书
   */
  async function syncFromACU() {
    console.info('[Divination] Starting sync from ACU...');
    try {
      const tables = getTableData();
      if (!tables) {
        console.warn('[Divination] No ACU table data found');
        return;
      }

      // 1. 筛选 "Random" 或 "随机" 表格
      // 并且检查配置是否允许同步 (如果在配置中存在，则必须为 true；如果不存在，则默认允许)
      const randomTables: any[] = [];
      const syncConfig = config.value.tableSyncConfig || {};

      for (const key in tables) {
        const table = tables[key];
        // @ts-ignore
        if (table.name && (table.name.includes('Random') || table.name.includes('随机'))) {
          const tableId = table.id || key;
          // 检查同步配置：显式禁用则跳过，否则默认同步
          if (syncConfig[tableId] === false) {
            console.info(`[Divination] Table ${table.name} (${tableId}) sync disabled by config`);
            continue;
          }
          randomTables.push(table);
        }
      }

      if (randomTables.length === 0) {
        console.info('[Divination] No tables found to sync (or all disabled)');
        return;
      }

      // 2. 解析表格内容并构建新的条目列表
      // 规则变更: 表名即一级分类 (Keys), 列名为二级分类 (Name)
      const newEntriesMap = new Map<
        string,
        {
          name: string;
          bias: BiasType;
          limit: number;
          words: Set<string>;
          keys: string[];
        }
      >();

      for (const table of randomTables) {
        // 获取列头 (第一行)
        const headers = table.content?.[0] || [];
        const rows = table.content?.slice(1) || [];
        // 表名作为分类名 (Keys)
        const tableName = table.name || 'Random';

        headers.forEach((header: string | number, colIndex: number) => {
          const headerStr = String(header).trim();
          if (!headerStr) return;

          // 解析列名作为条目名
          // 假设列名格式: "物品|正|1" 或 "天气"
          // 这里我们通过关键词智能打标 Bias
          let { name, bias, limit } = parseEntryName(headerStr);

          // 智能打标 (如果列名没有显式指定 Bias)
          if (headerStr.indexOf('|') === -1) {
            if (name.includes('吉') || name.includes('好') || name.includes('正') || name.includes('赏')) {
              bias = 'positive';
            } else if (name.includes('凶') || name.includes('坏') || name.includes('负') || name.includes('罚')) {
              bias = 'negative';
            }
          }

          // 组合唯一键: 为了避免不同表同列名冲突，可以考虑把 keys 加入唯一键
          // 但原逻辑是 Name|Bias|Limit，如果不同表有相同列名，会合并到同一个世界书条目中
          // 这通常是期望的行为（多个表的同类数据汇聚），但也可能导致 keys 混乱
          // 这里我们暂时保持原有的条目 Key 逻辑，但在 keys 数组中添加所有来源表名

          const entryKey = `${name}|${bias}|${limit}`;

          if (!newEntriesMap.has(entryKey)) {
            newEntriesMap.set(entryKey, {
              name,
              bias,
              limit,
              words: new Set(),
              keys: [tableName], // 初始 Key 为当前表名
            });
          } else {
            // 如果已存在，追加当前表名为 Key (去重)
            const entry = newEntriesMap.get(entryKey)!;
            if (!entry.keys.includes(tableName)) {
              entry.keys.push(tableName);
            }
          }

          // 收集该列的所有词汇
          rows.forEach((row: any[]) => {
            const cellVal = row[colIndex];
            if (cellVal) {
              const word = String(cellVal).trim();
              if (word) {
                newEntriesMap.get(entryKey)!.words.add(word);
              }
            }
          });
        });
      }

      // 3. 读取现有世界书（用于保留 enabled 状态和其他设置）
      let existingEntries: any[] = [];
      try {
        existingEntries = await getWorldbook(WORLDBOOK_NAME);
      } catch {
        // 世界书可能不存在
      }

      // 4. 合并数据
      const finalEntries: any[] = [];

      // 遍历新解析的数据
      for (const [key, data] of newEntriesMap) {
        // 查找是否已存在同名条目 (Name|Bias|Limit 完全匹配)
        // 注意：这里 worldbook entry name 是完整的 "Name|Bias|Limit"
        const fullEntryName = `${data.name}|${data.bias}|${data.limit}`;
        const existingEntry = existingEntries.find(e => e.name === fullEntryName);

        // 增量合并逻辑：
        // 1. 获取现有词汇
        const existingWords = existingEntry
          ? existingEntry.content
              .split(/[,，、\n]/)
              .map((w: string) => w.trim())
              .filter((w: string) => w)
          : [];

        // 2. 合并新词汇 (Set 去重)
        const mergedWords = new Set([...existingWords, ...data.words]);
        // 用换行符分隔，支持句子或段落作为词条
        const content = Array.from(mergedWords).join('\n');

        if (existingEntry) {
          // 更新现有条目
          // 合并 Keys: 现有 Keys + 新 Keys (去重)
          const existingKeys = existingEntry.strategy?.keys || [];
          // @ts-ignore
          const mergedKeys = Array.from(new Set([...existingKeys, ...data.keys]));

          finalEntries.push({
            ...existingEntry,
            content, // 更新词汇
            strategy: {
              ...existingEntry.strategy,
              keys: mergedKeys, // 更新 Keys，使其包含所有来源表名
            },
          });
        } else {
          // 创建新条目
          finalEntries.push({
            name: fullEntryName,
            enabled: true,
            strategy: {
              type: 'constant', // 默认为常量，不自动激活，只作为数据库
              keys: data.keys,
              keys_secondary: { logic: 'not_all', keys: [] },
              scan_depth: 'same_as_global',
            },
            position: {
              type: 'before_character_definition',
              role: 'system',
              depth: 0,
              order: 0,
            },
            content,
            probability: 100,
            recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
            effect: { sticky: null, cooldown: null, delay: null },
          });
        }
      }

      // 保留那些在 ACU 表格中没有但在世界书中有的条目吗？
      // 策略：保留，因为用户可能手动在世界书中添加了条目
      const newEntryNames = new Set(finalEntries.map(e => e.name));
      const orphanEntries = existingEntries.filter(e => !newEntryNames.has(e.name));
      finalEntries.push(...orphanEntries);

      // 5. 保存到世界书
      if (typeof createOrReplaceWorldbook === 'function') {
        // @ts-ignore - PartialDeep 类型兼容性问题
        await createOrReplaceWorldbook(WORLDBOOK_NAME, finalEntries, { render: 'debounced' });
        console.info('[Divination] Synced to worldbook successfully');

        // 重新加载以更新 Store
        await loadFromWorldbook();
      } else {
        console.warn('[Divination] createOrReplaceWorldbook API unavailable');
      }
    } catch (e) {
      console.error('[Divination] Sync failed:', e);
    }
  }

  // ============================================================
  // Divination Logic
  // ============================================================

  /**
   * 从世界书词库抽词（带配置）
   *
   * @param mode 抽词模式
   * @param wordsPerItem perItem 模式下每项抽取数量
   * @param maxCount 最大抽取数量（custom/mixed 模式）
   * @param cats 分类列表
   * @param categoryConfig 分类配置
   * @param selectedLuck 当前运势（用于权重计算）
   * @returns 抽取的词数组
   */
  function drawFromWorldbookWithConfig(
    mode: 'perItem' | 'custom' | 'mixed',
    wordsPerItem: number,
    maxCount: number,
    cats: DivinationCategory[],
    categoryConfig: Record<string, { enabled: boolean; limit: number }>,
    selectedLuck: DimensionTier | null,
  ): string[] {
    const result: string[] = [];

    // 过滤已启用的分类
    const enabledCats = cats.filter(c => {
      // 如果有配置，使用配置的 enabled 状态
      const catConfig = categoryConfig[c.id];
      const isEnabled = catConfig ? catConfig.enabled : c.enabled;
      return isEnabled && c.words.length > 0;
    });

    if (enabledCats.length === 0) {
      return result;
    }

    if (mode === 'perItem') {
      // perItem 模式：每个开启的分类抽 wordsPerItem 个（不受总数限制）
      for (const cat of enabledCats) {
        const count = Math.min(wordsPerItem, cat.words.length);
        const shuffled = shuffleArray([...cat.words]);
        result.push(...shuffled.slice(0, count));
      }
      console.info(`[Divination] perItem 模式从世界书抽取 ${result.length} 个词:`, result);
    } else if (mode === 'custom') {
      // custom 模式：每分类最多抽 limit 个，总数不超过 maxCount
      let remaining = maxCount;

      for (const cat of enabledCats) {
        if (remaining <= 0) break;

        const catConfig = categoryConfig[cat.id];
        // 优先使用配置的 limit，否则使用分类自身的 limit
        const limit = catConfig?.limit ?? cat.limit ?? 0;
        // limit 为 0 表示不限制，使用 wordsPerItem 作为默认值
        const maxFromThisCat = limit > 0 ? Math.min(limit, remaining) : Math.min(wordsPerItem, remaining);
        const count = Math.min(maxFromThisCat, cat.words.length);

        const shuffled = shuffleArray([...cat.words]);
        result.push(...shuffled.slice(0, count));
        remaining -= count;
      }
      console.info(`[Divination] custom 模式从世界书抽取 ${result.length} 个词:`, result);
    } else {
      // mixed 模式：加权随机抽取
      // 构建加权池
      const catWeights = enabledCats.map(c => {
        if (config.value.enableBias && selectedLuck) {
          return getWeight(selectedLuck, c.bias);
        }
        return 1.0;
      });

      let remaining = maxCount;
      while (remaining > 0) {
        const selectedCat = weightedRandom(enabledCats, catWeights);
        if (!selectedCat) break;

        const word = selectedCat.words[Math.floor(Math.random() * selectedCat.words.length)];
        result.push(word);
        remaining--;
      }
      console.info(`[Divination] mixed 模式从世界书抽取 ${result.length} 个词:`, result);
    }

    return result;
  }

  /**
   * 获取加权随机权重
   */
  function getWeight(luckTier: DimensionTier, bias: BiasType): number {
    // 权重配置表
    // 运势 | 正向权重 | 中性权重 | 负向权重
    // 超吉/大吉 | 3.0 | 1.0 | 1.0
    // 小吉 | 2.0 | 1.0 | 1.0
    // 平 | 1.0 | 1.0 | 1.0
    // 小凶 | 1.0 | 2.0 | 2.0
    // 大凶/超凶 | 1.0 | 2.0 | 3.0

    const luckId = luckTier.id;

    // 超吉/大吉
    if (luckId === 'superLucky' || luckId === 'lucky') {
      if (bias === 'positive') return 3.0;
      return 1.0;
    }
    // 小吉 (末吉)
    if (luckId === 'slightlyLucky') {
      if (bias === 'positive') return 2.0;
      return 1.0;
    }
    // 平
    if (luckId === 'neutral') {
      return 1.0;
    }
    // 小凶
    if (luckId === 'slightlyUnlucky') {
      if (bias === 'negative' || bias === 'neutral') return 2.0; // 稍微倾向负面/中性
      return 1.0;
    }
    // 大凶/超凶
    if (luckId === 'unlucky' || luckId === 'superUnlucky') {
      if (bias === 'negative') return 3.0;
      if (bias === 'neutral') return 2.0;
      return 1.0;
    }

    return 1.0;
  }

  /**
   * 加权随机抽取
   */
  function weightedRandom<T>(items: T[], weights: number[]): T | null {
    if (items.length === 0 || items.length !== weights.length) return null;

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    return items[items.length - 1];
  }

  /**
   * 执行抽签
   */
  function performDivination(): DivinationResult | null {
    // 1. 抽取维度 (包括运势)
    const dimensionResults: { dimension: Dimension; tier: DimensionTier }[] = [];
    let selectedLuck: DimensionTier | null = null;

    for (const dim of config.value.dimensions) {
      if (dim.enabled && dim.tiers.length > 0) {
        const tierWeights = dim.tiers.map(t => t.weight);
        const selectedTier = weightedRandom(dim.tiers, tierWeights);
        if (selectedTier) {
          dimensionResults.push({ dimension: dim, tier: selectedTier });

          // 记录运势结果，用于后续词条权重计算
          if (dim.id === 'luck') {
            selectedLuck = selectedTier;
          }
        }
      }
    }

    // 如果没有抽到运势，且存在运势维度，则无法进行倾向计算 (或者默认平运)
    // 这里我们假设如果运势维度被禁用，则 selectedLuck 为 null，后续权重计算会 fallback

    // 2. 抽取随机词
    let drawnWords: string[] = [];

    // ========== 1. 表格随机词 ==========
    if (config.value.enableTableWords) {
      const tableWords = drawFromLatestRowWithConfig(
        config.value.wordDrawMode,
        config.value.wordsPerItem,
        config.value.drawCount,
        config.value.tablePoolConfig as Record<string, TableConfig>,
      );
      drawnWords.push(...tableWords);
      console.info(`[Divination] 从表格抽词，模式: ${config.value.wordDrawMode}，结果:`, tableWords);
    }

    // ========== 2. 世界书词库 ==========
    if (config.value.enableWordPool) {
      // 计算剩余抽词名额
      const remainingCount =
        config.value.wordDrawMode === 'perItem'
          ? config.value.wordsPerItem // perItem 模式每项抽固定数，不受已抽数量影响
          : Math.max(0, config.value.drawCount - drawnWords.length); // 其他模式用剩余名额

      const poolWords = drawFromWorldbookWithConfig(
        config.value.wordDrawMode,
        config.value.wordsPerItem,
        remainingCount,
        categories.value,
        config.value.categoryConfig,
        selectedLuck,
      );
      drawnWords.push(...poolWords);
      console.info(`[Divination] 从世界书抽词，模式: ${config.value.wordDrawMode}，结果:`, poolWords);
    }

    // ========== 3. 混合模式下打乱顺序 ==========
    if (config.value.enableTableWords && config.value.enableWordPool && drawnWords.length > 0) {
      drawnWords = shuffleArray(drawnWords);
      console.info(`[Divination] 混合抽词后打乱顺序:`, drawnWords);
    }

    // 3. 构建结果
    // 查找运势结果用于显示
    const luckResult = dimensionResults.find(r => r.dimension.id === 'luck');

    // 其他维度结果
    const otherDimensions = dimensionResults
      .filter(r => r.dimension.id !== 'luck')
      .map(r => ({
        name: r.dimension.name,
        value: r.tier.name,
        prompt: r.tier.prompt,
      }));

    return {
      luck: luckResult
        ? {
            name: luckResult.tier.name,
            color: luckResult.tier.color || '#808080',
            prompt: luckResult.tier.prompt,
          }
        : {
            name: '未知',
            color: '#808080',
            prompt: '',
          },
      dimensions: otherDimensions,
      words: drawnWords,
      timestamp: Date.now(),
    };
  }

  /**
   * 迁移维度到指定预设
   * @param dimensions 要迁移的维度数组
   * @param targetPresetId 目标预设 ID
   */
  function migrateDimensionsToPreset(dimensions: Dimension[], targetPresetId: string) {
    const targetIndex = presets.value.findIndex(p => p.id === targetPresetId);
    if (targetIndex === -1) {
      console.warn('[Divination] Target preset not found:', targetPresetId);
      return;
    }

    const target = presets.value[targetIndex];

    // 深拷贝要迁移的维度
    const clonedDimensions = dimensions.map(d => JSON.parse(JSON.stringify(d)));

    // 检查重复并合并
    clonedDimensions.forEach(newDim => {
      const existingIndex = target.dimensions.findIndex(d => d.id === newDim.id);
      if (existingIndex > -1) {
        // 已存在则覆盖
        target.dimensions[existingIndex] = newDim;
      } else {
        // 不存在则追加
        target.dimensions.push(newDim);
      }
    });

    // 触发保存
    presets.value[targetIndex] = { ...target };
  }

  return {
    config,
    categories,
    isLoaded,
    loadConfig,
    saveConfig,
    loadFromWorldbook,
    syncFromACU,
    performDivination,
    addDimension,
    updateDimension,
    removeDimension,
    uploadCardBack,
    updateCategory,
    // Preset
    presets,
    activePresetId,
    createPreset,
    saveCurrentToPreset,
    deletePreset,
    applyPreset,
    restoreDefaultDimensions,
    migrateDimensionsToPreset,
  };
});
