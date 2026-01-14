/**
 * 更新预设管理 Composable
 * 用于管理手动更新的参数预设
 *
 * 存储位置：脚本变量（绑定在脚本上）
 */

import { klona } from 'klona';
import { computed, ref } from 'vue';
import { z } from 'zod';

// ============================================================
// Schema 定义
// ============================================================

/** 更新设置 Schema */
export const UpdateSettingsSchema = z.object({
  /** AI读取上下文层数 */
  autoUpdateThreshold: z.number().min(1).max(500).default(3),
  /** 每批次更新楼层数 */
  updateBatchSize: z.number().min(1).max(50).default(3),
  /** 保留X层楼不更新 */
  skipUpdateFloors: z.number().min(0).max(20).default(0),
  /** 每N层自动更新一次 */
  autoUpdateFrequency: z.number().min(1).max(100).default(1),
});

/** 自动触发配置 Schema */
export const AutoTriggerConfigSchema = z.object({
  /** 是否启用自动触发 */
  enabled: z.boolean().default(false),
  /** 检测空单元格 */
  onEmptyCell: z.boolean().default(true),
  /** 检测编码索引断裂 */
  onIndexGap: z.boolean().default(true),
  /** 监控的表格名称列表 (用于智能检测) */
  targetTables: z.array(z.string()).default(['总结表', '大纲表']),
  /** 更新时指定的表格名称列表 (为空数组=更新全部表格) */
  updateTargetTables: z.array(z.string()).default([]),
});

/** 预设 Schema */
export const UpdatePresetSchema = z.object({
  /** 预设 ID */
  id: z.string(),
  /** 预设名称 */
  name: z.string().min(1).max(50),
  /** 创建时间 */
  createdAt: z.number(),
  /** 更新设置 */
  settings: UpdateSettingsSchema,
  /** 自动触发配置 */
  autoTrigger: AutoTriggerConfigSchema.optional().transform(v => AutoTriggerConfigSchema.parse(v ?? {})),
});

/** 预设存储 Schema */
export const PresetStorageSchema = z.object({
  /** 预设列表 */
  presets: z.array(UpdatePresetSchema).default([]),
  /** 当前选中的预设 ID */
  activePresetId: z.string().nullable().default(null),
  /** 自动修复时使用的预设 ID */
  autoFixPresetId: z.string().nullable().default(null),
  /** 全局开关：是否启用问题检测提示（独立于预设） */
  globalAutoTriggerEnabled: z.boolean().default(false),
  /** 全局开关：检测到问题时是否自动执行（独立于预设） */
  globalAutoExecuteEnabled: z.boolean().default(false),
});

// ============================================================
// 类型导出
// ============================================================

export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;
export type AutoTriggerConfig = z.infer<typeof AutoTriggerConfigSchema>;
export type UpdatePreset = z.infer<typeof UpdatePresetSchema>;
export type PresetStorage = z.infer<typeof PresetStorageSchema>;

// ============================================================
// 常量
// ============================================================

/** 脚本 ID（用于脚本变量存储） */
const SCRIPT_ID = 'acu-visualizer';

/** 存储键名 */
const STORAGE_KEY = 'updatePresets';

/** 默认预设 */
const DEFAULT_PRESET: Omit<UpdatePreset, 'id' | 'createdAt'> = {
  name: '默认配置',
  settings: {
    autoUpdateThreshold: 3,
    updateBatchSize: 3,
    skipUpdateFloors: 0,
    autoUpdateFrequency: 1,
  },
  autoTrigger: {
    enabled: false,
    onEmptyCell: true,
    onIndexGap: true,
    targetTables: ['总结表', '大纲表'],
    updateTargetTables: [], // 空数组表示更新全部表格
  },
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取脚本变量
 */
function getScriptVariables(): Record<string, unknown> {
  try {
    // 尝试使用酒馆助手 API
    if (typeof getVariables === 'function') {
      return getVariables({ type: 'script', script_id: SCRIPT_ID }) || {};
    }
  } catch (e) {
    console.warn('[ACU Presets] getVariables 不可用，使用 localStorage 回退');
  }

  // 回退到 localStorage
  try {
    const data = localStorage.getItem(`acu_${STORAGE_KEY}`);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/**
 * 保存脚本变量
 */
function saveScriptVariables(data: Record<string, unknown>): void {
  try {
    // 尝试使用酒馆助手 API
    if (typeof replaceVariables === 'function') {
      replaceVariables(klona(data), { type: 'script', script_id: SCRIPT_ID });
      return;
    }
  } catch (e) {
    console.warn('[ACU Presets] replaceVariables 不可用，使用 localStorage 回退');
  }

  // 回退到 localStorage
  try {
    localStorage.setItem(`acu_${STORAGE_KEY}`, JSON.stringify(data));
  } catch (e) {
    console.error('[ACU Presets] 保存到 localStorage 失败:', e);
  }
}

// ============================================================
// Composable
// ============================================================

export function useUpdatePresets() {
  /** 存储数据 */
  const storage = ref<PresetStorage>({
    presets: [],
    activePresetId: null,
    autoFixPresetId: null,
    globalAutoTriggerEnabled: false,
    globalAutoExecuteEnabled: false,
  });

  /** 是否已加载 */
  const isLoaded = ref(false);

  // ============================================================
  // 计算属性
  // ============================================================

  /** 预设列表 */
  const presets = computed(() => storage.value.presets);

  /** 当前选中的预设 */
  const activePreset = computed(() => {
    const id = storage.value.activePresetId;
    return id ? storage.value.presets.find(p => p.id === id) || null : null;
  });

  /** 自动修复预设 */
  const autoFixPreset = computed(() => {
    const id = storage.value.autoFixPresetId;
    return id ? storage.value.presets.find(p => p.id === id) || null : null;
  });

  /** 是否有预设 */
  const hasPresets = computed(() => storage.value.presets.length > 0);

  // ============================================================
  // 方法
  // ============================================================

  /**
   * 加载预设
   */
  function loadPresets(): void {
    try {
      const data = getScriptVariables();
      const raw = data[STORAGE_KEY];

      if (raw) {
        const parsed = PresetStorageSchema.safeParse(raw);
        if (parsed.success) {
          storage.value = parsed.data;
          console.info('[ACU Presets] 加载预设成功，数量:', parsed.data.presets.length);
        } else {
          console.warn('[ACU Presets] 预设数据格式无效，使用默认值');
          storage.value = PresetStorageSchema.parse({});
        }
      } else {
        storage.value = PresetStorageSchema.parse({});
      }

      isLoaded.value = true;
    } catch (e) {
      console.error('[ACU Presets] 加载预设失败:', e);
      storage.value = PresetStorageSchema.parse({});
      isLoaded.value = true;
    }
  }

  /**
   * 保存预设
   */
  function savePresets(): void {
    try {
      const data = getScriptVariables();
      data[STORAGE_KEY] = klona(storage.value);
      saveScriptVariables(data);
      console.info('[ACU Presets] 保存预设成功');
    } catch (e) {
      console.error('[ACU Presets] 保存预设失败:', e);
    }
  }

  /**
   * 检查是否存在同名预设
   * @param name 预设名称
   * @returns 同名预设或 null
   */
  function findPresetByName(name: string): UpdatePreset | null {
    const trimmedName = name.trim();
    return storage.value.presets.find(p => p.name.trim() === trimmedName) || null;
  }

  /**
   * 创建新预设
   * @param name 预设名称
   * @param settings 更新设置
   * @param autoTrigger 自动触发配置
   */
  function createPreset(
    name: string,
    settings: Partial<UpdateSettings> = {},
    autoTrigger: Partial<AutoTriggerConfig> = {},
  ): UpdatePreset {
    const preset: UpdatePreset = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      settings: UpdateSettingsSchema.parse({ ...DEFAULT_PRESET.settings, ...settings }),
      autoTrigger: AutoTriggerConfigSchema.parse({ ...DEFAULT_PRESET.autoTrigger, ...autoTrigger }),
    };

    storage.value.presets.push(preset);
    savePresets();

    console.info('[ACU Presets] 创建预设:', preset.name);
    return preset;
  }

  /**
   * 创建或更新预设（重名时覆盖）
   * @param name 预设名称
   * @param settings 更新设置
   * @param autoTrigger 自动触发配置
   * @returns { preset, isNew } 返回预设和是否为新建
   */
  function createOrUpdatePreset(
    name: string,
    settings: Partial<UpdateSettings> = {},
    autoTrigger: Partial<AutoTriggerConfig> = {},
  ): { preset: UpdatePreset; isNew: boolean } {
    const existing = findPresetByName(name);

    if (existing) {
      // 更新现有预设
      updatePreset(existing.id, {
        settings: UpdateSettingsSchema.parse({ ...DEFAULT_PRESET.settings, ...settings }),
        autoTrigger: AutoTriggerConfigSchema.parse({ ...DEFAULT_PRESET.autoTrigger, ...autoTrigger }),
      });
      console.info('[ACU Presets] 更新预设:', name);
      return { preset: existing, isNew: false };
    } else {
      // 创建新预设
      const preset = createPreset(name, settings, autoTrigger);
      return { preset, isNew: true };
    }
  }

  /**
   * 更新预设
   * @param id 预设 ID
   * @param updates 更新内容
   */
  function updatePreset(id: string, updates: Partial<Omit<UpdatePreset, 'id' | 'createdAt'>>): boolean {
    const index = storage.value.presets.findIndex(p => p.id === id);
    if (index === -1) {
      console.warn('[ACU Presets] 预设不存在:', id);
      return false;
    }

    const preset = storage.value.presets[index];

    if (updates.name !== undefined) {
      preset.name = updates.name;
    }
    if (updates.settings !== undefined) {
      preset.settings = UpdateSettingsSchema.parse({ ...preset.settings, ...updates.settings });
    }
    if (updates.autoTrigger !== undefined) {
      preset.autoTrigger = AutoTriggerConfigSchema.parse({ ...preset.autoTrigger, ...updates.autoTrigger });
    }

    savePresets();
    console.info('[ACU Presets] 更新预设:', preset.name);
    return true;
  }

  /**
   * 删除预设
   * @param id 预设 ID
   */
  function deletePreset(id: string): boolean {
    const index = storage.value.presets.findIndex(p => p.id === id);
    if (index === -1) {
      console.warn('[ACU Presets] 预设不存在:', id);
      return false;
    }

    const preset = storage.value.presets[index];
    storage.value.presets.splice(index, 1);

    // 如果删除的是当前选中的预设，清除选中状态
    if (storage.value.activePresetId === id) {
      storage.value.activePresetId = null;
    }
    if (storage.value.autoFixPresetId === id) {
      storage.value.autoFixPresetId = null;
    }

    savePresets();
    console.info('[ACU Presets] 删除预设:', preset.name);
    return true;
  }

  /**
   * 设置当前选中的预设
   * @param id 预设 ID（null 表示取消选中）
   */
  function setActivePreset(id: string | null): void {
    storage.value.activePresetId = id;
    savePresets();
  }

  /**
   * 设置自动修复预设
   * @param id 预设 ID（null 表示禁用自动修复）
   */
  function setAutoFixPreset(id: string | null): void {
    storage.value.autoFixPresetId = id;
    savePresets();
  }

  /**
   * 复制预设
   * @param id 源预设 ID
   * @param newName 新名称
   */
  function duplicatePreset(id: string, newName?: string): UpdatePreset | null {
    const source = storage.value.presets.find(p => p.id === id);
    if (!source) {
      console.warn('[ACU Presets] 源预设不存在:', id);
      return null;
    }

    return createPreset(newName || `${source.name} (副本)`, klona(source.settings), klona(source.autoTrigger));
  }

  /**
   * 从当前设置创建预设
   * @param name 预设名称
   * @param currentSettings 当前设置
   */
  function createFromCurrent(name: string, currentSettings: Partial<UpdateSettings>): UpdatePreset {
    return createPreset(name, currentSettings);
  }

  /**
   * 获取预设的设置
   * @param id 预设 ID
   */
  function getPresetSettings(id: string): UpdateSettings | null {
    const preset = storage.value.presets.find(p => p.id === id);
    return preset ? klona(preset.settings) : null;
  }

  // ============================================================
  // 全局开关管理
  // ============================================================

  /** 全局问题检测提示开关 */
  const globalAutoTriggerEnabled = computed(() => storage.value.globalAutoTriggerEnabled);

  /** 全局自动执行修复开关 */
  const globalAutoExecuteEnabled = computed(() => storage.value.globalAutoExecuteEnabled);

  /**
   * 设置全局问题检测提示开关
   */
  function setGlobalAutoTrigger(enabled: boolean): void {
    storage.value.globalAutoTriggerEnabled = enabled;
    // 如果关闭检测，同时关闭自动执行
    if (!enabled) {
      storage.value.globalAutoExecuteEnabled = false;
    }
    savePresets();
    console.info('[ACU Presets] 全局问题检测提示:', enabled);
  }

  /**
   * 设置全局自动执行修复开关
   */
  function setGlobalAutoExecute(enabled: boolean): void {
    storage.value.globalAutoExecuteEnabled = enabled;
    savePresets();
    console.info('[ACU Presets] 全局自动执行修复:', enabled);
  }

  // ============================================================
  // 初始化
  // ============================================================

  // 首次加载
  if (!isLoaded.value) {
    loadPresets();
  }

  return {
    // 状态
    storage,
    presets,
    activePreset,
    autoFixPreset,
    hasPresets,
    isLoaded,
    globalAutoTriggerEnabled,
    globalAutoExecuteEnabled,

    // 方法
    loadPresets,
    savePresets,
    createPreset,
    createOrUpdatePreset,
    findPresetByName,
    updatePreset,
    deletePreset,
    setActivePreset,
    setAutoFixPreset,
    duplicatePreset,
    createFromCurrent,
    getPresetSettings,
    setGlobalAutoTrigger,
    setGlobalAutoExecute,

    // Schema（供外部使用）
    UpdateSettingsSchema,
    AutoTriggerConfigSchema,
    UpdatePresetSchema,
  };
}
