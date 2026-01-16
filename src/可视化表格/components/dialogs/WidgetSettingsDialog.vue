<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div ref="dialogRef" class="acu-modal acu-widget-settings-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-cog"></i>
          组件设置
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 行标题配置 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-heading"></i>
            行标题列
          </div>
          <div class="acu-settings-group">
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                标题来源列
                <span class="hint">每行显示的主标题取自哪一列</span>
              </div>
              <div class="acu-settings-control">
                <select v-model="localConfig.titleColumn" class="acu-select">
                  <option value="">默认（第一列）</option>
                  <option v-for="header in tableHeaders" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 展示标签配置 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-tags"></i>
            展示标签
          </div>
          <div class="acu-settings-group">
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                标签来源列
                <span class="hint">选中的列值将作为徽章显示在行上（纯展示）</span>
              </div>
              <div class="acu-settings-control">
                <select v-model="selectedDisplayColumn" class="acu-select" @change="handleDisplayColumnSelect">
                  <option value="">选择要添加的列...</option>
                  <option v-for="header in availableDisplayColumns" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>
            </div>
            <!-- 已选择的列标签 -->
            <div v-if="localConfig.displayTagColumns.length > 0" class="acu-selected-tags">
              <span v-for="col in localConfig.displayTagColumns" :key="col" class="acu-selected-tag">
                {{ col }}
                <button class="acu-tag-remove" @click.stop="removeDisplayColumn(col)">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- 互动标签配置 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-hand-pointer"></i>
            互动标签
          </div>
          <div class="acu-settings-group">
            <!-- 标签来源列 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                标签来源列
                <span class="hint">点击后会将对应提示词追加到输入框</span>
              </div>
              <div class="acu-settings-control">
                <select v-model="selectedInteractiveColumn" class="acu-select" @change="handleInteractiveColumnSelect">
                  <option value="">选择要添加的列...</option>
                  <option v-for="header in availableInteractiveColumns" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>
            </div>
            <!-- 已选择的列标签 -->
            <div v-if="localConfig.interactiveTagConfig.sourceColumns.length > 0" class="acu-selected-tags">
              <span v-for="col in localConfig.interactiveTagConfig.sourceColumns" :key="col" class="acu-selected-tag">
                {{ col }}
                <button class="acu-tag-remove" @click.stop="removeInteractiveColumn(col)">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            </div>

            <!-- 标签定义库 - 预设管理 -->
            <div class="acu-settings-row column">
              <div class="acu-settings-label">
                标签定义预设
                <span class="hint">保存和应用标签定义模板</span>
              </div>
              <div class="acu-preset-control">
                <select v-model="selectedTagPresetId" class="acu-select" @change="handleTagPresetChange">
                  <option value="">-- 当前配置 --</option>
                  <option v-for="preset in tagPresets" :key="preset.id" :value="preset.id">
                    {{ preset.name }}
                  </option>
                </select>
                <button class="acu-icon-btn" title="保存为新预设" @click.stop="showSavePresetDialog = true">
                  <i class="fas fa-plus"></i>
                </button>
                <button
                  v-if="selectedTagPresetId"
                  class="acu-icon-btn acu-btn-danger"
                  title="删除预设"
                  @click.stop="handleDeleteTagPreset"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>

            <!-- 标签定义库 -->
            <div class="acu-settings-row column">
              <div class="acu-settings-label">
                标签定义库
                <span class="hint">定义标签的匹配文本和提示词模板</span>
              </div>
              <div class="acu-tag-definitions">
                <div
                  v-for="(tag, index) in localConfig.interactiveTagConfig?.tagDefinitions || []"
                  :key="tag.id"
                  class="acu-tag-definition-item"
                >
                  <div class="acu-tag-definition-row">
                    <input v-model="tag.label" type="text" class="acu-input tag-label" placeholder="标签文本" />
                    <label class="acu-checkbox-inline">
                      <input v-model="tag.isFixed" type="checkbox" />
                      <span>固定</span>
                    </label>
                    <button class="acu-btn-icon danger" title="删除" @click.stop="removeTagDefinition(index)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <textarea
                    v-model="tag.promptTemplate"
                    class="acu-textarea prompt-template"
                    placeholder="提示词模板，支持通配符：{{value}}, {{rowTitle}}, {{playerName}}"
                    rows="2"
                  ></textarea>
                </div>
                <button class="acu-btn-add" @click.stop="addTagDefinition">
                  <i class="fas fa-plus"></i>
                  添加标签定义
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 通配符说明 -->
        <div class="acu-config-hint">
          <i class="fas fa-lightbulb"></i>
          <div>
            <strong>提示词通配符说明：</strong>
            <ul>
              <li><code v-text="'{{value}}'"></code> - 标签本身的值</li>
              <li><code v-text="'{{rowTitle}}'"></code> - 当前行标题</li>
              <li><code v-text="'{{playerName}}'"></code> - 主角名</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 保存预设弹窗 -->
    <div
      v-if="showSavePresetDialog"
      class="acu-modal-container acu-center-modal"
      @click.self="showSavePresetDialog = false"
    >
      <div class="acu-modal acu-small-modal">
        <div class="acu-modal-header">
          <span class="acu-modal-title">保存标签预设</span>
          <button class="acu-close-pill" @click.stop="showSavePresetDialog = false">取消</button>
        </div>
        <div class="acu-modal-body">
          <div class="acu-settings-row">
            <div class="acu-settings-label">预设名称</div>
            <div class="acu-settings-control">
              <input
                v-model="newPresetName"
                type="text"
                class="acu-input"
                placeholder="输入预设名称"
                @keyup.enter="handleSaveTagPreset"
              />
            </div>
          </div>
          <div class="acu-modal-actions">
            <button class="acu-modal-btn secondary" @click.stop="showSavePresetDialog = false">取消</button>
            <button class="acu-modal-btn primary" :disabled="!newPresetName.trim()" @click.stop="handleSaveTagPreset">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { DashboardWidgetConfig, InteractiveTagConfig, TagDefinition } from '../../types';

interface Props {
  visible: boolean;
  widgetId: string;
  widgetConfig: DashboardWidgetConfig | null;
  tableHeaders: string[];
}

const props = withDefaults(defineProps<Props>(), {
  widgetConfig: null,
  tableHeaders: () => [],
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
}>();

const dashboardStore = useDashboardStore();

// ============ 预设管理 ============
const PRESET_STORAGE_KEY = 'acu_tag_definition_presets';

interface TagPreset {
  id: string;
  name: string;
  tagDefinitions: TagDefinition[];
}

const tagPresets = ref<TagPreset[]>([]);
const selectedTagPresetId = ref('');
const showSavePresetDialog = ref(false);
const newPresetName = ref('');

// 加载预设
function loadTagPresets() {
  try {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    if (stored) {
      tagPresets.value = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('加载标签预设失败:', e);
  }
}

// 保存预设到 localStorage
function saveTagPresetsToStorage() {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(tagPresets.value));
  } catch (e) {
    console.warn('保存标签预设失败:', e);
  }
}

// 应用预设
function handleTagPresetChange() {
  if (!selectedTagPresetId.value) return;

  const preset = tagPresets.value.find(p => p.id === selectedTagPresetId.value);
  if (preset) {
    // 深拷贝预设的标签定义
    localConfig.interactiveTagConfig.tagDefinitions = preset.tagDefinitions.map(t => ({
      ...t,
      id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 新ID避免冲突
    }));
  }
}

// 保存当前配置为预设
function handleSaveTagPreset() {
  if (!newPresetName.value.trim()) return;

  const newPreset: TagPreset = {
    id: `preset_${Date.now()}`,
    name: newPresetName.value.trim(),
    tagDefinitions: localConfig.interactiveTagConfig.tagDefinitions.map(t => ({ ...t })),
  };

  tagPresets.value.push(newPreset);
  saveTagPresetsToStorage();

  selectedTagPresetId.value = newPreset.id;
  showSavePresetDialog.value = false;
  newPresetName.value = '';
}

// 删除预设
function handleDeleteTagPreset() {
  if (!selectedTagPresetId.value) return;

  const index = tagPresets.value.findIndex(p => p.id === selectedTagPresetId.value);
  if (index > -1) {
    tagPresets.value.splice(index, 1);
    saveTagPresetsToStorage();
    selectedTagPresetId.value = '';
  }
}

// ============ 下拉多选 ============
const selectedDisplayColumn = ref('');
const selectedInteractiveColumn = ref('');

// 计算可选的展示标签列（排除已选）
const availableDisplayColumns = computed(() => {
  return props.tableHeaders.filter(h => !localConfig.displayTagColumns.includes(h));
});

// 计算可选的互动标签列（排除已选）
const availableInteractiveColumns = computed(() => {
  return props.tableHeaders.filter(h => !localConfig.interactiveTagConfig.sourceColumns.includes(h));
});

// 选择展示标签列
function handleDisplayColumnSelect() {
  if (selectedDisplayColumn.value) {
    localConfig.displayTagColumns.push(selectedDisplayColumn.value);
    selectedDisplayColumn.value = '';
  }
}

// 移除展示标签列
function removeDisplayColumn(col: string) {
  const index = localConfig.displayTagColumns.indexOf(col);
  if (index > -1) {
    localConfig.displayTagColumns.splice(index, 1);
  }
}

// 选择互动标签列
function handleInteractiveColumnSelect() {
  if (selectedInteractiveColumn.value) {
    localConfig.interactiveTagConfig.sourceColumns.push(selectedInteractiveColumn.value);
    selectedInteractiveColumn.value = '';
  }
}

// 移除互动标签列
function removeInteractiveColumn(col: string) {
  const index = localConfig.interactiveTagConfig.sourceColumns.indexOf(col);
  if (index > -1) {
    localConfig.interactiveTagConfig.sourceColumns.splice(index, 1);
  }
}

// ============ 本地配置 ============
const localConfig = reactive<{
  titleColumn: string;
  displayTagColumns: string[];
  interactiveTagConfig: InteractiveTagConfig;
}>({
  titleColumn: '',
  displayTagColumns: [],
  interactiveTagConfig: {
    sourceColumns: [],
    tagDefinitions: [],
  },
});

// 监听弹窗打开，同步配置
watch(
  () => props.visible,
  visible => {
    if (visible && props.widgetConfig) {
      loadTagPresets(); // 加载预设
      selectedTagPresetId.value = '';
      localConfig.titleColumn = props.widgetConfig.titleColumn || '';
      localConfig.displayTagColumns = [...(props.widgetConfig.displayTagColumns || [])];
      localConfig.interactiveTagConfig = {
        sourceColumns: [...(props.widgetConfig.interactiveTagConfig?.sourceColumns || [])],
        tagDefinitions: (props.widgetConfig.interactiveTagConfig?.tagDefinitions || []).map(t => ({ ...t })),
      };
    }
  },
  { immediate: true },
);

// 自动保存配置变化
watch(
  localConfig,
  () => {
    if (props.visible && props.widgetId) {
      saveConfig();
    }
  },
  { deep: true },
);

/** 添加标签定义 */
function addTagDefinition() {
  const newTag: TagDefinition = {
    id: `tag_${Date.now()}`,
    label: '',
    promptTemplate: '',
    isFixed: false,
  };
  localConfig.interactiveTagConfig.tagDefinitions.push(newTag);
}

/** 删除标签定义 */
function removeTagDefinition(index: number) {
  localConfig.interactiveTagConfig.tagDefinitions.splice(index, 1);
}

/** 保存配置到 store */
function saveConfig() {
  if (!props.widgetId) return;

  dashboardStore.updateWidget(props.widgetId, {
    titleColumn: localConfig.titleColumn || undefined,
    displayTagColumns: localConfig.displayTagColumns.length > 0 ? localConfig.displayTagColumns : undefined,
    interactiveTagConfig:
      localConfig.interactiveTagConfig.sourceColumns.length > 0 ||
      localConfig.interactiveTagConfig.tagDefinitions.length > 0
        ? localConfig.interactiveTagConfig
        : undefined,
  });
}

/** 关闭弹窗 */
function handleClose() {
  emit('update:visible', false);
  emit('close');
}
</script>
