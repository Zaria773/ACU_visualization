<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div class="acu-modal acu-widget-actions-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-plus"></i>
          配置快捷按钮
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-bolt"></i>
            可用的快捷按钮
          </div>
          <div class="acu-settings-group">
            <!-- 按钮选择列表 - 使用标准设置行布局 -->
            <div v-for="action in availableActions" :key="action.id" class="acu-settings-row">
              <div class="acu-settings-label">
                <span>
                  <i :class="['fas', action.icon]" style="margin-right: 8px; color: var(--acu-title-color)"></i>
                  {{ action.label }}
                </span>
                <span class="hint">{{ action.tooltip }}</span>
              </div>
              <div class="acu-settings-control">
                <!-- 使用标准 acu-switch 开关 -->
                <label class="acu-switch">
                  <input type="checkbox" :checked="isActionSelected(action.id)" @change="toggleAction(action.id)" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 已选按钮预览 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-eye"></i>
            已选按钮 ({{ selectedActions.length }})
          </div>
          <div class="acu-settings-group">
            <div v-if="selectedActions.length === 0" class="acu-empty-hint">暂未选择任何快捷按钮</div>
            <div v-else class="acu-selected-actions-list">
              <div v-for="actionId in selectedActions" :key="actionId" class="acu-settings-row">
                <div class="acu-settings-label">
                  <span>
                    <i
                      :class="['fas', getActionIcon(actionId)]"
                      style="margin-right: 8px; color: var(--acu-title-color)"
                    ></i>
                    {{ getActionLabel(actionId) }}
                  </span>
                </div>
                <div class="acu-settings-control">
                  <button class="acu-icon-btn acu-btn-danger" @click.stop="removeAction(actionId)" title="移除">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { WidgetActionId } from '../../types';
import { WIDGET_ACTIONS } from '../../types';

interface Props {
  visible: boolean;
  widgetId: string;
  currentActions: WidgetActionId[];
}

const props = withDefaults(defineProps<Props>(), {
  currentActions: () => [],
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
}>();

const dashboardStore = useDashboardStore();

// 本地已选按钮列表
const selectedActions = ref<WidgetActionId[]>([]);

// 可用的按钮列表 (过滤掉 settings 和 goToTable)
const availableActions = computed(() => {
  return Object.values(WIDGET_ACTIONS).filter(action => action.id !== 'settings' && action.id !== 'goToTable');
});

// 监听弹窗打开，同步当前配置
watch(
  () => props.visible,
  visible => {
    if (visible) {
      // 过滤掉 settings 和 goToTable，只保留其他按钮
      selectedActions.value = props.currentActions.filter(id => id !== 'settings' && id !== 'goToTable');
    }
  },
  { immediate: true },
);

// 检查按钮是否已选中
function isActionSelected(actionId: WidgetActionId): boolean {
  return selectedActions.value.includes(actionId);
}

// 切换按钮选中状态
function toggleAction(actionId: WidgetActionId): void {
  const index = selectedActions.value.indexOf(actionId);
  if (index > -1) {
    selectedActions.value.splice(index, 1);
  } else {
    selectedActions.value.push(actionId);
  }
}

// 移除已选按钮
function removeAction(actionId: WidgetActionId): void {
  const index = selectedActions.value.indexOf(actionId);
  if (index > -1) {
    selectedActions.value.splice(index, 1);
  }
}

// 获取按钮图标
function getActionIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.icon || 'fa-question';
}

// 获取按钮标签
function getActionLabel(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.label || actionId;
}

// 关闭弹窗并保存
function handleClose(): void {
  // 保存配置到 store
  if (props.widgetId) {
    dashboardStore.updateWidget(props.widgetId, { actions: selectedActions.value });
  }
  emit('update:visible', false);
  emit('close');
}
</script>
