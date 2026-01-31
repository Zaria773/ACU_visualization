<template>
  <div class="acu-dimension-manager">
    <!-- 预设管理头部 -->
    <PresetManagerHeader
      :presets="divinationStore.presets"
      :active-preset-id="divinationStore.activePresetId"
      :show-toolbar="true"
      :is-migrating="isMigrating"
      :selected-count="selectedDimensionIds.size"
      title="维度预设"
      hint="保存和加载维度配置"
      @select="handleSelectPreset"
      @restore-default="handleRestoreDefault"
      @delete="handleDeletePreset"
      @save="handleQuickSave"
      @save-as="openSaveDialog"
      @collapse-all="collapseAll"
      @expand-all="expandAll"
      @import="triggerImport"
      @export-current="handleExportCurrentPreset"
      @export-all="handleExportPresets"
      @toggle-migrate="toggleMigrateMode"
      @migrate-to="handleMigrateTo"
    />

    <!-- 维度列表 -->
    <div
      v-for="(dim, dimIndex) in divinationStore.config.dimensions"
      :key="dim.id"
      class="acu-settings-section dimension-container"
      :class="{
        'is-collapsed': collapsedDimensions[dim.id],
        'is-selected': isMigrating && selectedDimensionIds.has(dim.id),
      }"
      @click="isMigrating ? toggleDimensionSelection(dim.id) : null"
    >
      <!-- 维度标题行 -->
      <div class="acu-settings-title dimension-header" @click="!isMigrating && toggleCollapse(dim.id)">
        <div class="header-left">
          <i class="fas fa-chevron-right collapse-icon" :class="{ 'is-expanded': !collapsedDimensions[dim.id] }"></i>
          <input v-model="dim.name" class="acu-input-minimal dimension-name-input" placeholder="维度名称" @click.stop />
        </div>
        <div class="header-right">
          <label class="acu-switch" @click.stop>
            <input v-model="dim.enabled" type="checkbox" />
            <span class="slider"></span>
          </label>
          <button
            class="acu-icon-btn danger"
            :disabled="dim.id === 'luck'"
            :title="dim.id === 'luck' ? '运势维度不可删除' : '删除维度'"
            @click.stop="handleRemoveDimension(dimIndex)"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>

      <!-- 档位列表 (展开区域) -->
      <div v-show="!collapsedDimensions[dim.id]" class="dimension-content">
        <div class="tier-list">
          <div v-for="(tier, tierIndex) in dim.tiers" :key="tier.id" class="tier-item">
            <!-- 第一行: 基本信息 -->
            <div class="tier-row basic-info">
              <div class="tier-name-wrapper">
                <input v-model="tier.name" class="acu-input-minimal tier-name-input" placeholder="档位名称" />
                <!-- 颜色选择器 (仅运势维度显示) -->
                <input
                  v-if="dim.id === 'luck'"
                  v-model="tier.color"
                  type="color"
                  class="acu-color-picker-mini"
                  title="档位颜色"
                />
              </div>
              <button class="acu-icon-btn small danger" title="删除档位" @click="removeTier(dimIndex, tierIndex)">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <!-- 第二行: 权重调节 -->
            <div class="tier-row weight-control">
              <span class="label">权重</span>
              <input v-model.number="tier.weight" type="range" min="0" max="100" step="1" class="acu-range-input" />
              <span class="acu-badge">{{ tier.weight }}</span>
            </div>

            <!-- 第三行: 提示词 -->
            <div class="tier-row prompt-editor">
              <textarea
                v-model="tier.prompt"
                class="acu-edit-textarea compact"
                placeholder="在此输入该档位的提示词..."
                rows="2"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 添加档位按钮 -->
        <button class="acu-btn-dashed full-width" @click="addTier(dimIndex)">
          <i class="fas fa-plus"></i> 添加新档位
        </button>
      </div>
    </div>

    <!-- 新建维度按钮 -->
    <button class="acu-btn-dashed full-width add-dimension-btn" @click="handleAddDimension">
      <i class="fas fa-layer-group"></i> 新建维度
    </button>

    <!-- 高级设置：自定义模板 -->
    <div class="acu-settings-section advanced-settings">
      <div class="acu-settings-title">
        <div class="header-left">
          <i class="fas fa-file-alt"></i>
          提示词模板
        </div>
      </div>
      <div class="acu-settings-group template-settings-group">
        <!-- 1. 快捷按钮行 -->
        <div class="template-shortcuts-row">
          <span class="hint">快捷插入:</span>
          <button class="acu-wildcard-btn" @click="insertTemplatePlaceholder('{{luck}}')">
            <code>{{ '\{\{luck\}\}' }}</code>
          </button>
          <button class="acu-wildcard-btn" @click="insertTemplatePlaceholder('{{words}}')">
            <code>{{ '\{\{words\}\}' }}</code>
          </button>
          <button class="acu-wildcard-btn" @click="insertTemplatePlaceholder('{{dimensions}}')">
            <code>{{ '\{\{dimensions\}\}' }}</code>
          </button>
        </div>

        <!-- 2. 文本框行 -->
        <div class="template-editor-row">
          <textarea
            ref="templateInputRef"
            v-model="divinationStore.config.customTemplate"
            class="acu-edit-textarea template-textarea"
            placeholder="在此输入自定义模板..."
            rows="6"
          ></textarea>
        </div>

        <!-- 3. 说明行 -->
        <div class="template-help-row">
          <div class="acu-wildcard-help">
            <div class="acu-help-header" @click="toggleHelp">
              <i class="fas fa-lightbulb"></i>
              <strong>通配符说明</strong>
              <i class="fas" :class="showHelp ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </div>
            <ul v-show="showHelp">
              <li>
                <code>{{ '\{\{luck\}\}' }}</code> - 运势结果（如：大吉...）
              </li>
              <li>
                <code>{{ '\{\{words\}\}' }}</code> - 随机词列表（如：苹果、香蕉）
              </li>
              <li>
                <code>{{ '\{\{dimensions\}\}' }}</code> - 其他维度结果拼接
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputRef" type="file" accept=".json" style="display: none" @change="handleImportPresets" />
  </div>
</template>

<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core';
import { v4 as uuidv4 } from 'uuid';
import { onMounted, ref, toRef } from 'vue';
import { TEMPLATE_WITH_DIMENSIONS } from '../../../composables/usePromptBuild';
import { useToast } from '../../../composables/useToast';
import { useDivinationStore } from '../../../stores/useDivinationStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { Dimension, DimensionTier, DivinationPreset } from '../../../types';
import PresetManagerHeader from '../PresetManagerHeader.vue';

const divinationStore = useDivinationStore() as any;
const uiStore = useUIStore();
const toast = useToast();

// 折叠状态管理
const collapsedDimensions = ref<Record<string, boolean>>({});
const fileInputRef = ref<HTMLInputElement | null>(null);
const templateInputRef = ref<HTMLTextAreaElement | null>(null);
const showHelp = ref(true);

// 迁移模式状态
const isMigrating = ref(false);
const selectedDimensionIds = ref<Set<string>>(new Set());

// 自动调整高度
const customTemplateRef = toRef(divinationStore.config, 'customTemplate');
useTextareaAutosize({ element: templateInputRef, input: customTemplateRef });

const toggleHelp = () => {
  showHelp.value = !showHelp.value;
};

// 初始化：如果自定义模板为空，填充默认模板
onMounted(() => {
  if (!divinationStore.config.customTemplate) {
    divinationStore.config.customTemplate = TEMPLATE_WITH_DIMENSIONS;
  }
});

// ============================================================
// 预设管理
// ============================================================

function handleSelectPreset(id: string) {
  divinationStore.applyPreset(id);
  toast.success('已应用维度预设');
}

function handleRestoreDefault() {
  if (confirm('确定要恢复默认维度配置吗？当前未保存的修改将丢失。')) {
    divinationStore.restoreDefaultDimensions();
    toast.success('已恢复默认维度配置');
  }
}

function handleDeletePreset(id: string) {
  const preset = divinationStore.presets.find(p => p.id === id);
  if (!preset) return;

  if (confirm(`确定要删除预设「${preset.name}」吗？`)) {
    divinationStore.deletePreset(id);
    toast.info('预设已删除');
  }
}

function handleQuickSave() {
  const activeId = divinationStore.activePresetId;
  if (activeId) {
    const preset = divinationStore.presets.find(p => p.id === activeId);
    if (preset) {
      divinationStore.saveCurrentToPreset(preset.name);
      toast.success(`预设「${preset.name}」已更新`);
      return;
    }
  }
  // 如果没有激活的预设，则打开另存为对话框
  openSaveDialog();
}

function openSaveDialog() {
  uiStore.openPresetSaveDialog(
    {
      presetType: 'divination', // 使用自定义类型或通用类型
      summaryItems: [],
      initialName: '',
      checkDuplicate: (name: string) => divinationStore.presets.some(p => p.name === name),
    },
    {
      onSave: (name: string) => {
        divinationStore.saveCurrentToPreset(name);
        toast.success(`预设「${name}」已保存`);
      },
    },
  );
}

// 导出当前预设
function handleExportCurrentPreset() {
  const activeId = divinationStore.activePresetId;
  if (!activeId) {
    toast.warning('请先选择一个预设');
    return;
  }
  const preset = divinationStore.presets.find(p => p.id === activeId);
  if (!preset) return;

  const data = {
    type: 'acu_divination_presets',
    version: '1.0',
    timestamp: new Date().toISOString(),
    presets: [preset], // 仅导出当前预设
  };

  downloadJson(data, `acu-preset-${preset.name}-${Date.now()}.json`);
  toast.success(`预设「${preset.name}」已导出`);
}

// 备份所有预设
function handleExportPresets() {
  const data = {
    type: 'acu_divination_presets',
    version: '1.0',
    timestamp: new Date().toISOString(),
    presets: divinationStore.presets,
  };

  downloadJson(data, `acu-divination-backup-${Date.now()}.json`);
  toast.success('所有预设已备份');
}

function downloadJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 触发导入
function triggerImport() {
  fileInputRef.value?.click();
}

// 导入预设
function handleImportPresets(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);

      if (data.type === 'acu_divination_presets' && Array.isArray(data.presets)) {
        let importedCount = 0;
        data.presets.forEach((importedPreset: DivinationPreset) => {
          // 检查 ID 冲突，如果有冲突则重新生成 ID
          const existing = divinationStore.presets.find(p => p.id === importedPreset.id);
          if (existing) {
            // 如果 ID 冲突但内容不同，或者只是想合并，这里简单处理为追加并重命名
            // 实际策略可以是：覆盖、跳过或重命名。这里采用：如果 ID 相同则覆盖
            const index = divinationStore.presets.findIndex(p => p.id === importedPreset.id);
            divinationStore.presets[index] = importedPreset;
          } else {
            divinationStore.presets.push(importedPreset);
          }
          importedCount++;
        });

        // 强制保存一次
        divinationStore.saveConfig();
        toast.success(`成功导入 ${importedCount} 个预设`);
      } else {
        toast.error('无效的预设文件格式');
      }
    } catch (err) {
      console.error('导入失败:', err);
      toast.error('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  // 重置 input
  (event.target as HTMLInputElement).value = '';
}

// 切换折叠
const toggleCollapse = (id: string) => {
  collapsedDimensions.value[id] = !collapsedDimensions.value[id];
};

// 全部折叠
function collapseAll() {
  divinationStore.config.dimensions.forEach((dim: any) => {
    collapsedDimensions.value[dim.id] = true;
  });
}

// 全部展开
function expandAll() {
  divinationStore.config.dimensions.forEach((dim: any) => {
    collapsedDimensions.value[dim.id] = false;
  });
}

// 切换迁移模式
function toggleMigrateMode() {
  isMigrating.value = !isMigrating.value;
  if (isMigrating.value) {
    selectedDimensionIds.value.clear();
    toast.info('迁移模式：点击选中要迁移的维度，然后选择目标预设');
  } else {
    selectedDimensionIds.value.clear();
  }
}

// 切换维度选中
function toggleDimensionSelection(dimId: string) {
  if (selectedDimensionIds.value.has(dimId)) {
    selectedDimensionIds.value.delete(dimId);
  } else {
    selectedDimensionIds.value.add(dimId);
  }
  // 强制触发响应式更新
  selectedDimensionIds.value = new Set(selectedDimensionIds.value);
}

// 迁移到目标预设
function handleMigrateTo(targetPresetId: string) {
  if (selectedDimensionIds.value.size === 0) {
    toast.warning('请先选中要迁移的维度');
    return;
  }

  const targetPreset = divinationStore.presets.find((p: any) => p.id === targetPresetId);
  if (!targetPreset) return;

  // 执行迁移
  const selectedDims = divinationStore.config.dimensions.filter((d: any) => selectedDimensionIds.value.has(d.id));

  divinationStore.migrateDimensionsToPreset(selectedDims, targetPresetId);

  toast.success(`已迁移 ${selectedDims.length} 个维度到「${targetPreset.name}」`);

  // 退出迁移模式
  isMigrating.value = false;
  selectedDimensionIds.value.clear();
}

// 添加新维度
const handleAddDimension = () => {
  const newDim: Dimension = {
    id: uuidv4(),
    name: '新维度',
    enabled: true,
    tiers: [
      {
        id: uuidv4(),
        name: '默认档位',
        weight: 50,
        prompt: '',
      },
    ],
  };
  divinationStore.addDimension(newDim);
  // 自动展开新维度
  collapsedDimensions.value[newDim.id] = false;
};

// 删除维度
const handleRemoveDimension = (index: any) => {
  if (confirm('确定要删除这个维度吗？此操作不可撤销。')) {
    divinationStore.removeDimension(index);
  }
};

// 添加档位
const addTier = (dimIndex: any) => {
  const newTier: DimensionTier = {
    id: uuidv4(),
    name: '新档位',
    weight: 10,
    prompt: '',
    color: '#808080',
  };
  divinationStore.config.dimensions[dimIndex].tiers.push(newTier);
};

// 删除档位
const removeTier = (dimIndex: any, tierIndex: any) => {
  divinationStore.config.dimensions[dimIndex].tiers.splice(tierIndex, 1);
};

// 插入模板占位符 (追加到末尾)
const insertTemplatePlaceholder = (placeholder: string) => {
  const current = divinationStore.config.customTemplate || '';
  divinationStore.config.customTemplate = current + placeholder;

  // 滚动到底部并聚焦
  const textarea = templateInputRef.value;
  if (textarea) {
    setTimeout(() => {
      textarea.focus();
      textarea.scrollTop = textarea.scrollHeight;
      // 移动光标到末尾
      const len = divinationStore.config.customTemplate.length;
      textarea.setSelectionRange(len, len);
    }, 0);
  }
};
</script>

<style scoped>
/*
  注意：由于样式隔离限制，主要样式应写在 src/可视化表格/styles/components/settings-panel.scss
  或 src/可视化表格/styles/components/divination-settings.scss 中。
  这里只保留极少量无法提取的样式或临时样式。
*/
.template-settings-group {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-shortcuts-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.template-shortcuts-row .hint {
  font-size: 12px;
  color: var(--acu-text-sub);
}

.acu-wildcard-btn {
  background: var(--acu-bg-panel);
  border: 1px solid var(--acu-border);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--acu-title-color);
  transition: all 0.2s;
}

.acu-wildcard-btn:hover {
  background: var(--acu-btn-hover);
  border-color: var(--acu-title-color);
}

.acu-wildcard-btn code {
  font-family: monospace;
}

.template-textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.5;
  font-family: monospace;
  width: 100%;
  pointer-events: auto !important; /* 强制可点击 */
}

.acu-wildcard-help {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 8px 12px;
}

.acu-help-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--acu-text-sub);
  user-select: none;
}

.acu-help-header strong {
  flex: 1;
}

.acu-wildcard-help ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
  list-style-type: disc;
  font-size: 12px;
  color: var(--acu-text-sub);
}

.acu-wildcard-help li {
  margin-bottom: 4px;
}

.acu-wildcard-help code {
  background: rgba(0, 0, 0, 0.1);
  padding: 0 4px;
  border-radius: 3px;
  font-family: monospace;
  color: var(--acu-text-main);
}
</style>
