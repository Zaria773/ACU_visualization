<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div ref="dialogRef" class="acu-modal acu-manual-update-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <!-- 返回按钮 -->
        <button class="acu-modal-back" @click="handleClose">
          <i class="fas fa-arrow-left"></i>
        </button>
        <span class="acu-modal-title">手动更新配置</span>
        <!-- 胶囊式完成按钮 -->
        <button class="acu-close-pill" @click="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="acu-loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>加载配置中...</span>
        </div>

        <!-- 配置项 -->
        <template v-else>
          <!-- PC端并排布局 -->
          <div class="acu-update-layout">
            <!-- 左侧：参数设置 -->
            <div class="acu-update-left">
              <!-- 预设管理区域 -->
              <div class="acu-settings-section">
                <div class="acu-settings-title">
                  <i class="fas fa-bookmark"></i>
                  预设管理
                </div>

                <!-- 预设选择 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    选择预设
                    <span class="hint">快速应用保存的配置</span>
                  </div>
                  <div class="acu-settings-control acu-preset-control">
                    <select v-model="selectedPresetId" class="acu-config-select" @change="handlePresetChange">
                      <option value="">-- 当前配置 --</option>
                      <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                        {{ preset.name }}
                      </option>
                    </select>
                    <button class="acu-icon-btn" title="保存为新预设" @click="showSavePresetDialog = true">
                      <i class="fas fa-plus"></i>
                    </button>
                    <button
                      v-if="selectedPresetId"
                      class="acu-icon-btn acu-btn-danger"
                      title="删除预设"
                      @click="handleDeletePreset"
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>

                <!-- 自动修复预设 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    检测问题时使用
                    <span class="hint">检测到问题时自动应用此预设</span>
                  </div>
                  <div class="acu-settings-control">
                    <select v-model="autoFixPresetId" class="acu-config-select" @change="handleAutoFixPresetChange">
                      <option value="">-- 禁用 --</option>
                      <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                        {{ preset.name }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 参数设置区域 -->
              <div class="acu-settings-section">
                <div class="acu-settings-title">
                  <i class="fas fa-sliders-h"></i>
                  更新参数设置
                </div>

                <!-- AI读取上下文层数 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    AI读取上下文层数
                    <span class="hint">AI阅读最近多少层来理解剧情</span>
                  </div>
                  <div class="acu-settings-control">
                    <input
                      v-model.number="localSettings.autoUpdateThreshold"
                      type="number"
                      class="acu-config-input"
                      min="1"
                      max="500"
                      @change="handleSettingChange('autoUpdateThreshold', localSettings.autoUpdateThreshold)"
                    />
                  </div>
                </div>

                <!-- 每N层自动更新一次 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    每N层自动更新一次
                    <span class="hint">设置自动触发更新的楼层间隔</span>
                  </div>
                  <div class="acu-settings-control">
                    <input
                      v-model.number="localSettings.autoUpdateFrequency"
                      type="number"
                      class="acu-config-input"
                      min="1"
                      max="100"
                      @change="handleSettingChange('autoUpdateFrequency', localSettings.autoUpdateFrequency)"
                    />
                  </div>
                </div>

                <!-- 每批次更新楼层数 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    每批次更新楼层数
                    <span class="hint">单次更新处理的最大楼层数</span>
                  </div>
                  <div class="acu-settings-control">
                    <input
                      v-model.number="localSettings.updateBatchSize"
                      type="number"
                      class="acu-config-input"
                      min="1"
                      max="50"
                      @change="handleSettingChange('updateBatchSize', localSettings.updateBatchSize)"
                    />
                  </div>
                </div>

                <!-- 保留X层楼不更新 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    保留X层楼不更新
                    <span class="hint">最近的几层楼跳过更新</span>
                  </div>
                  <div class="acu-settings-control">
                    <input
                      v-model.number="localSettings.skipUpdateFloors"
                      type="number"
                      class="acu-config-input"
                      min="0"
                      max="20"
                      @change="handleSettingChange('skipUpdateFloors', localSettings.skipUpdateFloors)"
                    />
                  </div>
                </div>
              </div>

              <!-- 智能检测设置 -->
              <div class="acu-settings-section">
                <div class="acu-settings-title">
                  <i class="fas fa-magic"></i>
                  智能检测
                </div>

                <!-- 启用智能检测 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    启用问题检测提示
                    <span class="hint">检测编码索引断裂或空单元格时显示警告</span>
                  </div>
                  <div class="acu-settings-control">
                    <label class="acu-switch">
                      <input v-model="autoTriggerEnabled" type="checkbox" @change="handleAutoTriggerChange" />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>

                <!-- 自动执行修复 -->
                <div v-if="autoTriggerEnabled" class="acu-settings-row">
                  <div class="acu-settings-label">
                    检测到问题时自动执行
                    <span class="hint">自动按选定预设触发手动更新</span>
                  </div>
                  <div class="acu-settings-control">
                    <label class="acu-switch">
                      <input v-model="autoExecuteEnabled" type="checkbox" @change="handleAutoExecuteChange" />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- 移动端：折叠式表格选择 -->
              <div class="acu-settings-section acu-show-mobile-only">
                <div
                  class="acu-settings-title acu-collapsible"
                  :class="{ 'is-expanded': tableSelectorExpanded }"
                  @click="tableSelectorExpanded = !tableSelectorExpanded"
                >
                  <i class="fas fa-table"></i>
                  更新表格选择
                  <span class="acu-collapse-indicator">{{ tableSelectorExpanded ? '▲' : '▼' }}</span>
                </div>
                <div v-show="tableSelectorExpanded" class="acu-table-selector-mobile">
                  <!-- 表格选择器 -->
                  <div class="acu-table-selector">
                    <div class="acu-table-selector-header">
                      <button class="acu-quick-select-btn" :class="{ active: isAllSelected }" @click="handleSelectAll">
                        <i class="fas fa-check-double"></i>
                        全选
                      </button>
                      <button
                        class="acu-quick-select-btn"
                        :class="{ active: isOnlySummarySelected }"
                        @click="handleSelectSummaryOnly"
                      >
                        <i class="fas fa-star"></i>
                        仅总结/大纲
                      </button>
                    </div>
                    <div class="acu-table-selector-list">
                      <div
                        v-for="table in availableTables"
                        :key="table.key"
                        class="acu-table-selector-item"
                        :class="{
                          'is-summary-outline': table.isSummaryOrOutline,
                          'is-selected': selectedTableNames.includes(table.name),
                        }"
                        @click="toggleTableSelection(table.name)"
                      >
                        <input
                          type="checkbox"
                          :checked="selectedTableNames.includes(table.name)"
                          @click.stop
                          @change="toggleTableSelection(table.name)"
                        />
                        <span class="table-name">{{ table.name }}</span>
                      </div>
                      <div v-if="availableTables.length === 0" class="acu-table-selector-empty">
                        <i class="fas fa-inbox"></i>
                        暂无可用表格
                      </div>
                    </div>
                    <div class="acu-table-selector-footer">
                      已选择: {{ selectedTableNames.length }}/{{ availableTables.length }} 个表格
                      <span v-if="selectedTableNames.length === 0" style="color: var(--acu-title-color)"
                        >(更新全部)</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：表格选择 (PC端显示) -->
            <div class="acu-update-right acu-hide-mobile">
              <div class="acu-table-selector">
                <div class="acu-table-selector-header">
                  <button class="acu-quick-select-btn" :class="{ active: isAllSelected }" @click="handleSelectAll">
                    <i class="fas fa-check-double"></i>
                    全选
                  </button>
                  <button
                    class="acu-quick-select-btn"
                    :class="{ active: isOnlySummarySelected }"
                    @click="handleSelectSummaryOnly"
                  >
                    <i class="fas fa-star"></i>
                    仅总结/大纲
                  </button>
                </div>
                <div class="acu-table-selector-list">
                  <div
                    v-for="table in availableTables"
                    :key="table.key"
                    class="acu-table-selector-item"
                    :class="{
                      'is-summary-outline': table.isSummaryOrOutline,
                      'is-selected': selectedTableNames.includes(table.name),
                    }"
                    @click="toggleTableSelection(table.name)"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedTableNames.includes(table.name)"
                      @click.stop
                      @change="toggleTableSelection(table.name)"
                    />
                    <span class="table-name">{{ table.name }}</span>
                  </div>
                  <div v-if="availableTables.length === 0" class="acu-table-selector-empty">
                    <i class="fas fa-inbox"></i>
                    暂无可用表格
                  </div>
                </div>
                <div class="acu-table-selector-footer">
                  已选择: {{ selectedTableNames.length }}/{{ availableTables.length }} 个表格
                  <span v-if="selectedTableNames.length === 0" style="color: var(--acu-title-color)">(更新全部)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 问题提示 -->
          <div v-if="hasIntegrityIssues" class="acu-issue-alert">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ integritySummary }}</span>
          </div>

          <!-- 执行按钮 -->
          <div class="acu-update-action-group">
            <button
              class="acu-update-btn"
              :class="{ 'is-updating': isUpdating }"
              :disabled="isUpdating"
              @click="handleExecuteUpdate"
            >
              <i v-if="isUpdating" class="fas fa-spinner fa-spin"></i>
              <i v-else class="fas fa-hand-sparkles"></i>
              <span>{{ isUpdating ? '正在更新...' : '立即执行手动更新' }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- 保存预设对话框 -->
    <div v-if="showSavePresetDialog" class="acu-modal-overlay" @click.self="showSavePresetDialog = false">
      <div class="acu-mini-dialog acu-preset-save-dialog">
        <div class="acu-mini-dialog-header">
          <span>保存为预设</span>
          <button class="acu-mini-close" @click="showSavePresetDialog = false">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="acu-mini-dialog-body">
          <input
            v-model="newPresetName"
            type="text"
            class="acu-config-input acu-full-width"
            placeholder="输入预设名称"
            @keyup.enter="handleSaveNewPreset"
          />
          <!-- 重名提示 -->
          <div v-if="duplicatePresetWarning" class="acu-duplicate-warning">
            <i class="fas fa-exclamation-circle"></i>
            已存在同名预设，保存将覆盖原有配置
          </div>
          <!-- 保存内容摘要 -->
          <div class="acu-preset-summary">
            <div class="acu-preset-summary-title">将保存以下配置：</div>
            <ul class="acu-preset-summary-list">
              <li>上下文层数: {{ localSettings.autoUpdateThreshold }}</li>
              <li>更新频率: 每 {{ localSettings.autoUpdateFrequency }} 层</li>
              <li>批次大小: {{ localSettings.updateBatchSize }}</li>
              <li>跳过层数: {{ localSettings.skipUpdateFloors }}</li>
              <li>表格选择: {{ selectedTableNames.length ? selectedTableNames.join(', ') : '全部表格' }}</li>
            </ul>
          </div>
        </div>
        <div class="acu-mini-dialog-footer">
          <button class="acu-btn-secondary" @click="showSavePresetDialog = false">取消</button>
          <button class="acu-btn-primary" :disabled="!newPresetName.trim()" @click="handleSaveNewPreset">
            {{ duplicatePresetWarning ? '覆盖保存' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ManualUpdateDialog - 手动更新配置弹窗
 *
 * 功能说明:
 * - 显示和编辑4个核心配置项
 * - 预设管理（保存/加载/删除）
 * - 表格选择器（PC端并排，移动端折叠）
 * - 智能检测配置
 * - 配置修改后实时保存
 * - 提供手动更新执行按钮
 */

import { onClickOutside } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { useDbSettings, type DbSettings, type TableInfo } from '../../composables/useDbSettings';
import { toast } from '../../composables/useToast';
import { useUpdatePresets } from '../../composables/useUpdatePresets';
import { useDataStore } from '../../stores/useDataStore';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

// ============================================================
// Refs & State
// ============================================================

const dialogRef = ref<HTMLElement>();
const isLoading = ref(true);
const isUpdating = ref(false);

// 本地配置副本
const localSettings = reactive<DbSettings>({
  autoUpdateThreshold: undefined,
  autoUpdateFrequency: undefined,
  updateBatchSize: undefined,
  skipUpdateFloors: undefined,
});

// 预设相关状态
const selectedPresetId = ref<string>('');
const autoFixPresetId = ref<string>('');
const showSavePresetDialog = ref(false);
const newPresetName = ref('');

// 智能检测配置
const autoTriggerEnabled = ref(false);
const autoExecuteEnabled = ref(false);

// 表格选择相关
const availableTables = ref<TableInfo[]>([]);
const selectedTableNames = ref<string[]>([]);
const tableSelectorExpanded = ref(false);

// ============================================================
// Composables & Stores
// ============================================================

const { settings, loadSettings, saveSettings, executeManualUpdate, getTableList, executeWithPreset } = useDbSettings();
const presetsManager = useUpdatePresets();
const dataStore = useDataStore();

// ============================================================
// 计算属性
// ============================================================

/** 预设列表 */
const presets = computed(() => presetsManager.presets.value);

/** 是否有完整性问题 */
const hasIntegrityIssues = computed(() => dataStore.hasIntegrityIssues);

/** 完整性问题摘要 */
const integritySummary = computed(() => dataStore.getIntegritySummary());

/** 重名预设警告 */
const duplicatePresetWarning = computed(() => {
  const name = newPresetName.value.trim();
  if (!name) return false;
  return presetsManager.findPresetByName(name) !== null;
});

/** 是否全选了所有表格 */
const isAllSelected = computed(() => {
  if (availableTables.value.length === 0) return false;
  return selectedTableNames.value.length === availableTables.value.length;
});

/** 是否只选择了总结表/大纲表 */
const isOnlySummarySelected = computed(() => {
  const summaryTables = availableTables.value.filter(t => t.isSummaryOrOutline);
  if (summaryTables.length === 0) return false;
  if (selectedTableNames.value.length !== summaryTables.length) return false;
  return summaryTables.every(t => selectedTableNames.value.includes(t.name));
});

// ============================================================
// 生命周期 & 监听
// ============================================================

// 当弹窗打开时加载配置
watch(
  () => props.visible,
  async visible => {
    if (visible) {
      isLoading.value = true;
      try {
        await loadSettings();
        // 同步到本地状态
        Object.assign(localSettings, {
          autoUpdateThreshold: settings.value.autoUpdateThreshold,
          autoUpdateFrequency: settings.value.autoUpdateFrequency,
          updateBatchSize: settings.value.updateBatchSize,
          skipUpdateFloors: settings.value.skipUpdateFloors,
        });

        // 加载预设状态
        presetsManager.loadPresets();
        const autoFixId = presetsManager.autoFixPreset.value?.id;
        autoFixPresetId.value = autoFixId || '';

        // 加载智能检测配置（使用全局开关状态）
        autoTriggerEnabled.value = presetsManager.globalAutoTriggerEnabled.value;
        autoExecuteEnabled.value = presetsManager.globalAutoExecuteEnabled.value;

        // 加载已保存的表格选择（从当前预设加载）
        const activePreset = presetsManager.activePreset.value;
        if (activePreset) {
          selectedTableNames.value = activePreset.autoTrigger.updateTargetTables || [];
        }

        // 加载可用表格列表
        availableTables.value = getTableList();
      } catch (error) {
        console.error('[ACU] 加载配置失败:', error);
        toast.error('加载配置失败');
      } finally {
        isLoading.value = false;
      }
    }
  },
  { immediate: true },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleClose();
});

// ============================================================
// 事件处理
// ============================================================

/**
 * 关闭弹窗
 */
function handleClose() {
  showSavePresetDialog.value = false;
  emit('update:visible', false);
}

/**
 * 处理配置项变更（实时保存）
 */
async function handleSettingChange(key: keyof DbSettings, value: number | undefined) {
  if (value === undefined || isNaN(value)) return;

  try {
    await saveSettings({ [key]: value });
    console.info(`[ACU] 配置项 ${key} 已更新为:`, value);
  } catch (error) {
    console.error(`[ACU] 保存配置项 ${key} 失败:`, error);
    toast.error('保存配置失败');
  }
}

/**
 * 处理预设选择变更
 */
async function handlePresetChange() {
  if (!selectedPresetId.value) return;

  const preset = presets.value.find((p: { id: string }) => p.id === selectedPresetId.value);
  if (preset) {
    // 应用预设设置到本地
    Object.assign(localSettings, preset.settings);

    // 应用预设的表格选择
    selectedTableNames.value = preset.autoTrigger.updateTargetTables || [];

    // 保存到数据库设置
    await saveSettings(preset.settings);

    presetsManager.setActivePreset(selectedPresetId.value);
    toast.success('已应用预设配置');
  }
}

/**
 * 处理自动修复预设变更
 */
function handleAutoFixPresetChange() {
  presetsManager.setAutoFixPreset(autoFixPresetId.value || null);
  toast.info(autoFixPresetId.value ? '已设置自动修复预设' : '已禁用自动修复');
}

/**
 * 保存新预设（包含表格选择，支持重名覆盖）
 */
function handleSaveNewPreset() {
  const name = newPresetName.value.trim();
  if (!name) return;

  const { preset, isNew } = presetsManager.createOrUpdatePreset(
    name,
    {
      autoUpdateThreshold: localSettings.autoUpdateThreshold,
      updateBatchSize: localSettings.updateBatchSize,
      skipUpdateFloors: localSettings.skipUpdateFloors,
      autoUpdateFrequency: localSettings.autoUpdateFrequency,
    },
    {
      enabled: autoTriggerEnabled.value,
      onEmptyCell: true,
      onIndexGap: true,
      targetTables: ['总结表', '大纲表'],
      updateTargetTables: selectedTableNames.value,
    },
  );

  showSavePresetDialog.value = false;
  newPresetName.value = '';

  if (isNew) {
    toast.success(`预设"${name}"已创建`);
  } else {
    toast.success(`预设"${name}"已更新`);
  }
}

/**
 * 删除预设
 */
function handleDeletePreset() {
  if (!selectedPresetId.value) return;

  const targetId = selectedPresetId.value;
  const preset = presets.value.find((p: { id: string; name: string }) => p.id === targetId);
  if (!preset) return;

  if (confirm(`确定删除预设"${preset.name}"吗？`)) {
    presetsManager.deletePreset(selectedPresetId.value);
    selectedPresetId.value = '';
    toast.success('预设已删除');
  }
}

/**
 * 处理智能检测配置变更
 */
function handleAutoTriggerChange() {
  // 保存全局开关状态
  presetsManager.setGlobalAutoTrigger(autoTriggerEnabled.value);

  // 如果有选中的预设，同时更新预设配置
  if (selectedPresetId.value) {
    presetsManager.updatePreset(selectedPresetId.value, {
      autoTrigger: {
        enabled: autoTriggerEnabled.value,
        onEmptyCell: true,
        onIndexGap: true,
        targetTables: ['总结表', '大纲表'],
        updateTargetTables: selectedTableNames.value,
      },
    });
  }

  // 如果关闭了检测，同时关闭自动执行并清除所有警告
  if (!autoTriggerEnabled.value) {
    autoExecuteEnabled.value = false;
    presetsManager.setAutoFixPreset(null);
    // 清除所有完整性警告
    dataStore.clearIntegrityIssues();
  }
}

/**
 * 处理自动执行开关变更
 */
function handleAutoExecuteChange() {
  // 保存全局开关状态
  presetsManager.setGlobalAutoExecute(autoExecuteEnabled.value);

  if (autoExecuteEnabled.value) {
    // 开启自动执行：如果没有选择预设，提示用户
    if (!autoFixPresetId.value && presets.value.length > 0) {
      // 自动选择第一个预设
      autoFixPresetId.value = presets.value[0].id;
      presetsManager.setAutoFixPreset(autoFixPresetId.value);
      toast.info(`已自动选择预设"${presets.value[0].name}"用于自动修复`);
    } else if (presets.value.length === 0) {
      toast.warning('请先保存一个预设再启用自动执行');
      autoExecuteEnabled.value = false;
      presetsManager.setGlobalAutoExecute(false);
      return;
    } else {
      presetsManager.setAutoFixPreset(autoFixPresetId.value);
    }
  } else {
    // 关闭自动执行
    presetsManager.setAutoFixPreset(null);
    autoFixPresetId.value = '';
  }
}

/**
 * 切换表格选择
 */
function toggleTableSelection(tableName: string) {
  const index = selectedTableNames.value.indexOf(tableName);
  if (index === -1) {
    selectedTableNames.value.push(tableName);
  } else {
    selectedTableNames.value.splice(index, 1);
  }

  // 更新当前预设的表格选择
  if (selectedPresetId.value) {
    presetsManager.updatePreset(selectedPresetId.value, {
      autoTrigger: {
        enabled: autoTriggerEnabled.value,
        onEmptyCell: true,
        onIndexGap: true,
        targetTables: ['总结表', '大纲表'],
        updateTargetTables: selectedTableNames.value,
      },
    });
  }
}

/**
 * 全选所有表格
 */
function handleSelectAll() {
  if (isAllSelected.value) {
    // 取消全选
    selectedTableNames.value = [];
  } else {
    // 全选
    selectedTableNames.value = availableTables.value.map(t => t.name);
  }
}

/**
 * 仅选择总结表/大纲表
 */
function handleSelectSummaryOnly() {
  const summaryTables = availableTables.value.filter(t => t.isSummaryOrOutline);
  selectedTableNames.value = summaryTables.map(t => t.name);
}

/**
 * 执行手动更新（使用新 API，支持表格选择）
 */
async function handleExecuteUpdate() {
  if (isUpdating.value) return;

  isUpdating.value = true;

  try {
    // 使用新 API，传入四参数 + 表格列表
    const result = await executeWithPreset(
      {
        autoUpdateThreshold: localSettings.autoUpdateThreshold,
        updateBatchSize: localSettings.updateBatchSize,
        skipUpdateFloors: localSettings.skipUpdateFloors,
        autoUpdateFrequency: localSettings.autoUpdateFrequency,
      },
      selectedTableNames.value,
    );

    if (result.success) {
      toast.success('✅ 手动更新已执行');
    } else {
      toast.warning('⚠️ ' + (result.message || '更新执行完成，请检查结果'));
    }
  } catch (error) {
    console.error('[ACU] 手动更新执行失败:', error);
    toast.error('手动更新执行失败');
  } finally {
    isUpdating.value = false;
  }
}
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/dialogs.scss 和 styles/components/table-selector.scss */
</style>
