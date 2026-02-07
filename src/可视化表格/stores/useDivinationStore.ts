
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 抽签系统 Store
 * 管理抽签逻辑、配置、世界书同步
 * 使用 ConfigManager 统一管理配置
 */

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getACUConfigManager } from '../composables/useACUConfigManager';
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
      name: '"天然合理"',
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
        '请设计一段对话，让角色A在谈论某物品或事件时省略关键主语，导致角色B误会谈论对象，产生错误联想而导致的误会。',
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
        '请构建一个场景，安排角色B在「最容易引起误解的时间点」闯入或路过，只目击到事件的「结果」而完全错过了「起因」，导致B通过逻辑补全推导出偏差认知。',
    },
    {
      id: 'jargon',
      name: '电波接错',
      weight: 1,
      prompt:
        '请让角色A使用意有所指的话、圈子黑话或网络梗进行表达，而角色B完全按字面意思理解，产生有趣或严肃的持续性误会。',
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
  // 使用 ConfigManager 统一管理配置
  // ============================================================
  const configManager = getACUConfigManager();

  /** 加载存储的配置 */
  function loadStoredConfig(): DivinationConfig {
    const stored = configManager.config.divination.config;
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      dimensions: stored?.dimensions?.length > 0 ? stored.dimensions : DEFAULT_CONFIG.dimensions,
      tablePoolConfig: stored?.tablePoolConfig || {},
      tableSyncConfig: stored?.tableSyncConfig || {},
    } as DivinationConfig;
  }

  /** 配置 - 使用 ref + watch 实现响应式双向同步 */
  const config = ref<DivinationConfig>(loadStoredConfig());

  // 监听配置变化，自动保存到 ConfigManager
  let isFirstWatch = true;
  watch(
    config,
    (newValue) => {
      if (isFirstWatch) {
        isFirstWatch = false;
        return;
      }
      configManager.config.divination.config = newValue;
      configManager.saveConfig();
    },
    { deep: true }
  );

  /** 预设列表 - 从 ConfigManager 读取 */
  const presets = computed({
    get: () => configManager.config.divination.presets || [],
    set: (value: DivinationPreset[]) => {
      configManager.config.divination.presets = value;
      configManager.saveConfig();
    },
  });

  /** 当前激活的预设 ID */
  const activePresetId = computed({
    get: () => configManager.config.divination.activePresetId,
    set: (value: string | null) => {
      configManager.config.divination.activePresetId = value;
      configManager.saveConfig();
    },
  });

  /** 世界书分类 (从世界书加载) */
  const categories = ref<DivinationCategory[]>([]);

  /** 是否已加载 (ConfigManager 在初始化时已加载) */
  const isLoaded = computed(() => configManager.isLoaded.value);

  // ============================================================
  // 持久化 - 使用 ConfigManager
  // ============================================================

  /**
   * 加载配置 - ConfigManager 已在初始化时加载
   */
  function loadConfig() {
    console.info('[Divination] 配置已就绪');
  }

  /**
   * 保存配置 - 使用 ConfigManager
   */
  function saveConfig() {
    configManager.saveConfig();
    console.info('[Divination] 已保存配置');
  }

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
    const newPresets = [...presets.value, preset];
    configManager.config.divination.presets = newPresets;
    configManager.config.divination.activePresetId = preset.id;
    configManager.saveConfig();
    return preset;
  }

  /**
   * 保存当前配置到预设
   */
  function saveCurrentToPreset(name: string): DivinationPreset {
    const currentPresets = [...presets.value];
    const existingIndex = currentPresets.findIndex(p => p.name === name);
    if (existingIndex > -1) {
      // 更新现有预设
      const existing = currentPresets[existingIndex];
      const updated: DivinationPreset = {
        ...existing,
        dimensions: JSON.parse(JSON.stringify(config.value.dimensions)),
      };
      currentPresets[existingIndex] = updated;
      configManager.config.divination.presets = currentPresets;
      configManager.config.divination.activePresetId = existing.id;
      configManager.saveConfig();
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
    const currentPresets = [...presets.value];
    const index = currentPresets.findIndex(p => p.id === presetId);
    if (index > -1) {
      currentPresets.splice(index, 1);
      configManager.config.divination.presets = currentPresets;
      if (activePresetId.value === presetId) {
        configManager.config.divination.activePresetId = null;
      }
      configManager.saveConfig();
    }
  }

  /**
   * 应用预设
   */
  function applyPreset(presetId: string) {
    const preset = presets.value.find(p => p.id === presetId);
    if (preset) {
      configManager.config.divination.config = {
        ...config.value,
        dimensions: JSON.parse(JSON.stringify(preset.dimensions)),
      };
      configManager.config.divination.activePresetId = presetId;
      configManager.saveConfig();
    }
  }

  /**
   * 恢复默认维度配置
   */
  function restoreDefaultDimensions() {
    configManager.config.divination.config = {
      ...DEFAULT_CONFIG,
      // 保留用户的资产与映射配置
      cardBackImage: config.value.cardBackImage,
      tablePoolConfig: config.value.tablePoolConfig || {},
      tableSyncConfig: config.value.tableSyncConfig || {},
      categoryConfig: config.value.categoryConfig || {},
      // 保留用户的外观设置
      themeColor: config.value.themeColor,
      themeId: config.value.themeId,

      // 强制重置维度
      dimensions: [
        JSON.parse(JSON.stringify(DEFAULT_LUCK_DIMENSION)),
        JSON.parse(JSON.stringify(DEFAULT_SANITY_DIMENSION)),
        JSON.parse(JSON.stringify(DEFAULT_MISUNDERSTANDING_DIMENSION)),
      ],
    };
    configManager.config.divination.activePresetId = null;
    configManager.saveConfig();
  }

  // ============================================================
  // Dimension Management
  // ============================================================

  function addDimension(dimension: Dimension) {
    const newConfig = { ...config.value };
    newConfig.dimensions = [...newConfig.dimensions, dimension];
    configManager.config.divination.config = newConfig;
    configManager.saveConfig();
  }

  function updateDimension(index: number, dimension: Dimension) {
    const newConfig = { ...config.value };
    if (index >= 0 && index < newConfig.dimensions.length) {
      newConfig.dimensions = [...newConfig.dimensions];
      newConfig.dimensions[index] = dimension;
      configManager.config.divination.config = newConfig;
      configManager.saveConfig();
    }
  }

  function removeDimension(index: number) {
    const newConfig = { ...config.value };
    if (index >= 0 && index < newConfig.dimensions.length) {
      // 保护运势维度不被删除 (通常是第一个)
      if (newConfig.dimensions[index].id === 'luck') {
        console.warn('[Divination] Cannot remove luck dimension');
        return;
      }
      newConfig.dimensions = [...newConfig.dimensions];
      newConfig.dimensions.splice(index, 1);
      configManager.config.divination.config = newConfig;
      configManager.saveConfig();
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
        };
      } else {
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
      const newConfig = { ...config.value, cardBackImage: compressed };
      configManager.config.divination.config = newConfig;
      configManager.saveConfig();
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

      const entries = await getWorldbook(WORLDBOOK_NAME);

      categories.value = entries.map(entry => {
        const { name, bias, limit } = parseEntryName(entry.name);
        // 只按换行符分割，保持每个单元格内容完整
        const words = entry.content
          .split('\n')
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
      const randomTables: any[] = [];
      const syncConfig = config.value.tableSyncConfig || {};

      for (const key in tables) {
        const table = tables[key];
        // @ts-ignore
        if (table.name && (table.name.includes('Random') || table.name.includes('随机'))) {
          const tableId = table.id || key;
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
        const headers = table.content?.[0] || [];
        const rows = table.content?.slice(1) || [];
        const tableName = table.name || 'Random';

        headers.forEach((header: string | number, colIndex: number) => {
          const headerStr = String(header).trim();
          if (!headerStr) return;

          const isDefaultColumnName = /^(列\d+|Column\s*\d+|Col\s*\d+|[A-Z])$/i.test(headerStr);
          const categoryName = isDefaultColumnName ? tableName : headerStr;

          let { name, bias, limit } = parseEntryName(categoryName);

          if (headerStr.indexOf('|') === -1) {
            if (name.includes('吉') || name.includes('好') || name.includes('正') || name.includes('赏')) {
              bias = 'positive';
            } else if (name.includes('凶') || name.includes('坏') || name.includes('负') || name.includes('罚')) {
              bias = 'negative';
            }
          }

          const entryKey = `${name}|${bias}|${limit}`;

          if (!newEntriesMap.has(entryKey)) {
            newEntriesMap.set(entryKey, {
              name,
              bias,
              limit,
              words: new Set(),
              keys: [tableName],
            });
          } else {
            const entry = newEntriesMap.get(entryKey)!;
            if (!entry.keys.includes(tableName)) {
              entry.keys.push(tableName);
            }
          }

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

      // 3. 读取现有世界书
      let existingEntries: any[] = [];
      try {
        existingEntries = await getWorldbook(WORLDBOOK_NAME);
      } catch {
        // 世界书可能不存在
      }

      // 4. 合并数据
      const finalEntries: any[] = [];

      for (const [key, data] of newEntriesMap) {
        const fullEntryName = `${data.name}|${data.bias}|${data.limit}`;
        const existingEntry = existingEntries.find(e => e.name === fullEntryName);

        const existingWords = existingEntry
          ? existingEntry.content
              .split('\n')
              .map((w: string) => w.trim())
              .filter((w: string) => w)
          : [];

        const mergedWords = new Set([...existingWords, ...data.words]);
        const content = Array.from(mergedWords).join('\n');

        if (existingEntry) {
          const existingKeys = existingEntry.strategy?.keys || [];
          // @ts-ignore
          const mergedKeys = Array.from(new Set([...existingKeys, ...data.keys]));

          finalEntries.push({
            ...existingEntry,
            content,
            strategy: {
              ...existingEntry.strategy,
              keys: mergedKeys,
            },
          });
        } else {
          finalEntries.push({
            name: fullEntryName,
            enabled: true,
            strategy: {
              type: 'constant',
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

      const newEntryNames = new Set(finalEntries.map(e => e.name));
      const orphanEntries = existingEntries.filter(e => !newEntryNames.has(e.name));
      finalEntries.push(...orphanEntries);

      // 5. 保存到世界书
      if (typeof createOrReplaceWorldbook === 'function') {
        // @ts-ignore
        await createOrReplaceWorldbook(WORLDBOOK_NAME, finalEntries, { render: 'debounced' });
        console.info('[Divination] Synced to worldbook successfully');

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

    const enabledCats = cats.filter(c => {
      const catConfig = categoryConfig[c.id];
      const isEnabled = catConfig ? catConfig.enabled : c.enabled;
      return isEnabled && c.words.length > 0;
    });

    if (enabledCats.length === 0) {
      return result;
    }

    if (mode === 'perItem') {
      for (const cat of enabledCats) {
        const count = Math.min(wordsPerItem, cat.words.length);
        const shuffled = shuffleArray([...cat.words]);
        result.push(...shuffled.slice(0, count));
      }
      console.info(`[Divination] perItem 模式从世界书抽取 ${result.length} 个词:`, result);
    } else if (mode === 'custom') {
      let remaining = maxCount;

      for (const cat of enabledCats) {
        if (remaining <= 0) break;

        const catConfig = categoryConfig[cat.id];
        const limit = catConfig?.limit ?? cat.limit ?? 0;
        const maxFromThisCat = limit > 0 ? Math.min(limit, remaining) : Math.min(wordsPerItem, remaining);
        const count = Math.min(maxFromThisCat, cat.words.length);

        const shuffled = shuffleArray([...cat.words]);
        result.push(...shuffled.slice(0, count));
        remaining -= count;
      }
      console.info(`[Divination] custom 模式从世界书抽取 ${result.length} 个词:`, result);
    } else {
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
    const luckId = luckTier.id;

    if (luckId === 'superLucky' || luckId === 'lucky') {
      if (bias === 'positive') return 3.0;
      return 1.0;
    }
    if (luckId === 'slightlyLucky') {
      if (bias === 'positive') return 2.0;
      return 1.0;
    }
    if (luckId === 'neutral') {
      return 1.0;
    }
    if (luckId === 'slightlyUnlucky') {
      if (bias === 'negative' || bias === 'neutral') return 2.0;
      return 1.0;
    }
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
    const dimensionResults: { dimension: Dimension; tier: DimensionTier }[] = [];
    let selectedLuck: DimensionTier | null = null;

    for (const dim of config.value.dimensions) {
      if (dim.enabled && dim.tiers.length > 0) {
        const tierWeights = dim.tiers.map(t => t.weight);
        const selectedTier = weightedRandom(dim.tiers, tierWeights);
        if (selectedTier) {
          dimensionResults.push({ dimension: dim, tier: selectedTier });

          if (dim.id === 'luck') {
            selectedLuck = selectedTier;
          }
        }
      }
    }

    let drawnWords: string[] = [];

    // 1. 表格随机词
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

    // 2. 世界书词库
    if (config.value.enableWordPool) {
      const remainingCount =
        config.value.wordDrawMode === 'perItem'
          ? config.value.wordsPerItem
          : Math.max(0, config.value.drawCount - drawnWords.length);

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

    // 3. 混合模式下打乱顺序
    if (config.value.enableTableWords && config.value.enableWordPool && drawnWords.length > 0) {
      drawnWords = shuffleArray(drawnWords);
      console.info('[Divination] 混合抽词后打乱顺序:', drawnWords);
    }

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
   */
  function migrateDimensionsToPreset(dimensions: Dimension[], targetPresetId: string) {
    const currentPresets = [...presets.value];
    const targetIndex = currentPresets.findIndex(p => p.id === targetPresetId);
    if (targetIndex === -1) {
      console.warn('[Divination] Target preset not found:', targetPresetId);
      return;
    }

    const target = currentPresets[targetIndex];
    const clonedDimensions = dimensions.map(d => JSON.parse(JSON.stringify(d)));

    clonedDimensions.forEach(newDim => {
      const existingIndex = target.dimensions.findIndex(d => d.id === newDim.id);
      if (existingIndex > -1) {
        target.dimensions[existingIndex] = newDim;
      } else {
        target.dimensions.push(newDim);
      }
    });

    currentPresets[targetIndex] = { ...target };
    configManager.config.divination.presets = currentPresets;
    configManager.saveConfig();
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
