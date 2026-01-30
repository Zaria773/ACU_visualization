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
        <!-- 显示风格配置 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-paint-brush"></i>
            显示风格
          </div>
          <div class="acu-settings-group">
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                组件模板
                <span class="hint">选择组件的展示方式</span>
              </div>
              <div class="acu-settings-control">
                <select v-model="localConfig.displayStyle" class="acu-select">
                  <option v-for="opt in DISPLAY_STYLE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

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

        <!-- 互动标签配置入口 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-bolt"></i>
            互动标签
          </div>
          <div class="acu-settings-group">
            <!-- 导航行：点击打开标签管理器（含已配置预览） -->
            <div class="acu-settings-row acu-nav-row" @click.stop="openTagManager">
              <div class="acu-settings-label">
                管理互动标签
                <span v-if="displayedTagCount > 0 || displayedCategoryCount > 0" class="hint">
                  已配置 {{ displayedTagCount }} 个标签，{{ displayedCategoryCount }} 个分类
                </span>
                <span v-else class="hint">点击配置可点击的互动标签</span>
              </div>
              <div class="acu-settings-control">
                <i class="fas fa-chevron-right"></i>
              </div>
            </div>

            <!-- 自动存入互动标签 (全局设置) -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                自动存入互动标签
                <span class="hint">AI 生成交互表格后自动存入标签库 (全局生效)</span>
              </div>
              <div class="acu-settings-control">
                <button
                  class="acu-switch"
                  :class="{ active: configStore.config.autoImportInteractions }"
                  @click="configStore.config.autoImportInteractions = !configStore.config.autoImportInteractions"
                ></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useConfigStore } from '../../../stores/useConfigStore';
import { useDashboardStore } from '../../../stores/useDashboardStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { DashboardWidgetConfig, WidgetTagConfig, WidgetDisplayStyle } from '../../../types';
import { DISPLAY_STYLE_OPTIONS } from '../../../types';

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

const configStore = useConfigStore();
const dashboardStore = useDashboardStore();
const uiStore = useUIStore();

// ============================================================
// 互动标签配置
// ============================================================

/** 已展示的标签数量 */
const displayedTagCount = computed(() => {
  return localConfig.widgetTagConfig?.displayedTagIds?.length || 0;
});

/** 已展示的分类数量 */
const displayedCategoryCount = computed(() => {
  return localConfig.widgetTagConfig?.displayedCategoryIds?.length || 0;
});

/** 打开标签管理器 */
function openTagManager(): void {
  uiStore.openTagManagerDialog(
    {
      widgetId: props.widgetId,
      displayedTagIds: localConfig.widgetTagConfig?.displayedTagIds || [],
      displayedCategoryIds: localConfig.widgetTagConfig?.displayedCategoryIds || [],
    },
    (newTagIds, newCategoryIds) => {
      // 保存回调：更新本地配置
      localConfig.widgetTagConfig = {
        displayedTagIds: newTagIds,
        displayedCategoryIds: newCategoryIds,
      };
    },
  );
}

// ============================================================
// 展示标签列（旧有功能，保留）
// ============================================================

const selectedDisplayColumn = ref('');

/** 计算可选的展示标签列（排除已选） */
const availableDisplayColumns = computed(() => {
  return props.tableHeaders.filter(h => !localConfig.displayTagColumns.includes(h));
});

/** 选择展示标签列 */
function handleDisplayColumnSelect(): void {
  if (selectedDisplayColumn.value) {
    localConfig.displayTagColumns.push(selectedDisplayColumn.value);
    selectedDisplayColumn.value = '';
  }
}

/** 移除展示标签列 */
function removeDisplayColumn(col: string): void {
  const index = localConfig.displayTagColumns.indexOf(col);
  if (index > -1) {
    localConfig.displayTagColumns.splice(index, 1);
  }
}

// ============================================================
// 本地配置
// ============================================================

const localConfig = reactive<{
  titleColumn: string;
  displayTagColumns: string[];
  widgetTagConfig: WidgetTagConfig;
  displayStyle: WidgetDisplayStyle;
}>({
  titleColumn: '',
  displayTagColumns: [],
  widgetTagConfig: {
    displayedTagIds: [],
    displayedCategoryIds: [],
  },
  displayStyle: 'list',
});

/** 监听弹窗打开，同步配置 */
watch(
  () => props.visible,
  visible => {
    if (visible) {
      // 同步配置
      if (props.widgetConfig) {
        localConfig.titleColumn = props.widgetConfig.titleColumn || '';
        localConfig.displayTagColumns = [...(props.widgetConfig.displayTagColumns || [])];
        localConfig.displayStyle = props.widgetConfig.displayStyle || 'list';

        // 同步新的 widgetTagConfig
        localConfig.widgetTagConfig = {
          displayedTagIds: [...(props.widgetConfig.widgetTagConfig?.displayedTagIds || [])],
          displayedCategoryIds: [...(props.widgetConfig.widgetTagConfig?.displayedCategoryIds || [])],
        };
      } else {
        // 没有配置时重置为空
        localConfig.titleColumn = '';
        localConfig.displayTagColumns = [];
        localConfig.displayStyle = 'list';
        localConfig.widgetTagConfig = {
          displayedTagIds: [],
          displayedCategoryIds: [],
        };
      }
    }
  },
  { immediate: true },
);

/** 自动保存配置变化 */
watch(
  localConfig,
  () => {
    if (props.visible && props.widgetId) {
      saveConfig();
    }
  },
  { deep: true },
);

/** 保存配置到 store */
function saveConfig(): void {
  if (!props.widgetId) return;

  const hasTagConfig =
    (localConfig.widgetTagConfig.displayedTagIds?.length || 0) > 0 ||
    (localConfig.widgetTagConfig.displayedCategoryIds?.length || 0) > 0;

  dashboardStore.updateWidget(props.widgetId, {
    titleColumn: localConfig.titleColumn || undefined,
    displayTagColumns: localConfig.displayTagColumns.length > 0 ? localConfig.displayTagColumns : undefined,
    widgetTagConfig: hasTagConfig ? localConfig.widgetTagConfig : undefined,
    displayStyle: localConfig.displayStyle,
  });
}

/** 关闭弹窗 */
function handleClose(): void {
  emit('update:visible', false);
  emit('close');
}
</script>
