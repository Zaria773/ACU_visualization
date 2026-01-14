<template>
  <div class="acu-button-config-panel">
    <!-- 长按直接执行开关 - 使用设置面板的行开关样式 -->
    <div class="acu-settings-row">
      <div class="acu-settings-label">
        长按直接执行
        <span class="hint">开启后，长按将跳过弹出按钮，直接执行附属功能</span>
      </div>
      <div class="acu-settings-control">
        <button
          class="acu-switch"
          :class="{ active: configStore.longPressDirectExec }"
          @click.stop="configStore.toggleLongPressDirectExec()"
        ></button>
      </div>
    </div>

    <!-- 展示区：网格布局，只显示图标 -->
    <div class="acu-config-section acu-visible-area">
      <h4>
        <i class="fas fa-th-large"></i>
        展示中 ({{ visibleButtonCards.length }})
        <button class="acu-btn-text acu-btn-reset" @click.stop="handleReset"><i class="fas fa-undo"></i> 重置</button>
      </h4>
      <div v-if="visibleButtonCards.length > 0" class="acu-btn-visible-grid">
        <div
          v-for="(card, index) in visibleButtonCards"
          :key="card.id"
          class="acu-btn-config-item"
          :class="{ 'is-required': card.id === 'settings' }"
          :title="card.label + (card.id === 'settings' ? ' (必选)' : ' (点击移除)')"
          draggable="true"
          @click.stop="handleHideButton(card.id)"
          @dragstart="handleDragStart($event, index)"
          @dragover.prevent="handleDragOver($event, index)"
          @drop="handleDrop($event, index)"
          @dragend="handleDragEnd"
        >
          <!-- 主按钮图标 -->
          <i :class="['fas', card.icon]" class="btn-icon"></i>
          <!-- 必选标记 -->
          <span v-if="card.id === 'settings'" class="required-dot"></span>
          <!-- 附属按钮指示器/添加按钮 -->
          <div
            v-if="card.secondaryId"
            class="attachment-indicator"
            :title="'长按附属: ' + getButtonLabel(card.secondaryId) + ' (点击移除)'"
            @click.stop="handleRemoveSecondary(card.id)"
          >
            <i :class="['fas', getButtonIcon(card.secondaryId)]"></i>
          </div>
          <button v-else class="attachment-add-btn" :title="'添加长按附属'" @click.stop="openAttachmentPicker(card.id)">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
      <div v-else class="acu-empty-hint">
        <i class="fas fa-exclamation-triangle"></i>
        <span>请至少保留一个按钮</span>
      </div>
    </div>

    <!-- 隐藏区：可用按钮 -->
    <div class="acu-config-section acu-hidden-area">
      <h4>
        <i class="fas fa-eye-slash"></i>
        未展示 ({{ hiddenButtons.length }})
      </h4>
      <div v-if="hiddenButtons.length > 0" class="acu-btn-hidden-grid">
        <button
          v-for="btn in hiddenButtons"
          :key="btn.id"
          class="acu-btn-hidden-item"
          :title="btn.label + ' (点击添加)'"
          @click.stop="handleShowButton(btn.id)"
        >
          <i :class="['fas', btn.icon]"></i>
        </button>
      </div>
      <div v-else class="acu-empty-hint">
        <i class="fas fa-check-circle"></i>
        <span>所有按钮都已展示</span>
      </div>
    </div>

    <!-- 附属按钮选择弹窗 -->
    <div v-if="attachmentPickerVisible" class="acu-attachment-picker-overlay" @click.self="closeAttachmentPicker">
      <div class="acu-attachment-picker" @click.stop>
        <div class="picker-header">
          <h4>选择长按附属按钮</h4>
          <button class="btn-close" @click.stop="closeAttachmentPicker">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="picker-content">
          <p class="picker-hint">选择一个按钮作为 "{{ getButtonLabel(currentPickerTarget) }}" 的长按附属功能：</p>
          <div class="picker-options">
            <button
              v-for="btn in availableSecondaryButtons"
              :key="btn.id"
              class="picker-option"
              @click.stop="handleSelectSecondary(btn.id)"
            >
              <i :class="['fas', btn.icon]"></i>
              <span>{{ btn.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示信息（固定在底部） -->
    <div class="acu-config-hint acu-config-hint-fixed">
      <i class="fas fa-info-circle"></i>
      <span>拖动排序 · 点击移除 · +号添加长按附属</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NavButtonConfigPanel - 导航栏按钮配置面板（卡片式收纳方案）
 *
 * 功能说明:
 * - 双区域布局：展示区（卡片式）和隐藏区
 * - 卡片式 UI：每个主按钮是一张卡片，可以添加附属按钮
 * - 附属按钮以徽章形式显示，点击可移除
 * - 长按直接执行全局开关
 * - 设置按钮不可隐藏
 *
 * 用于:
 * - 设置弹窗中的"导航栏按钮配置"功能
 */

import { computed, ref } from 'vue';
import { NAV_BUTTONS, useConfigStore } from '../../stores/useConfigStore';

const configStore = useConfigStore();

/** 卡片数据结构 */
interface ButtonCard {
  id: string;
  icon: string;
  label: string;
  secondaryId: string | null;
}

/**
 * 获取按钮图标
 */
const getButtonIcon = (btnId: string): string => {
  const btn = NAV_BUTTONS.find(b => b.id === btnId);
  return btn?.icon || 'fa-circle';
};

/**
 * 获取按钮标签
 */
const getButtonLabel = (btnId: string): string => {
  const btn = NAV_BUTTONS.find(b => b.id === btnId);
  return btn?.label || btnId;
};

/**
 * 展示区的按钮卡片列表
 */
const visibleButtonCards = computed<ButtonCard[]>(() => {
  const order = configStore.config.buttonOrder;
  const visible = configStore.config.visibleButtons;
  const groups = configStore.config.buttonGroups || [];

  // 按顺序过滤出可见按钮
  const sortedVisible = order.filter(id => visible.includes(id));

  return sortedVisible.map(id => {
    const btn = NAV_BUTTONS.find(b => b.id === id);
    const group = groups.find(g => g.primaryId === id);
    return {
      id,
      icon: btn?.icon || 'fa-circle',
      label: btn?.label || id,
      secondaryId: group?.secondaryId || null,
    };
  });
});

/**
 * 隐藏区的按钮列表
 * - 排除已显示的按钮
 * - 排除已作为附属按钮的按钮
 */
const hiddenButtons = computed(() => {
  const visible = configStore.config.visibleButtons;
  const groups = configStore.config.buttonGroups || [];
  const usedSecondaries = groups.map(g => g.secondaryId).filter(Boolean);

  return NAV_BUTTONS.filter(btn => !btn.hidden && !visible.includes(btn.id) && !usedSecondaries.includes(btn.id));
});

/**
 * 可作为附属按钮的选项
 * - 排除已被使用的附属按钮
 * - 排除当前选择器目标按钮
 */
const availableSecondaryButtons = computed(() => {
  const groups = configStore.config.buttonGroups || [];
  const usedSecondaries = groups.map(g => g.secondaryId).filter(Boolean);

  return NAV_BUTTONS.filter(btn => {
    // 排除当前目标
    if (btn.id === currentPickerTarget.value) return false;
    // 排除已被使用的附属按钮
    if (usedSecondaries.includes(btn.id)) return false;
    return true;
  });
});

// ============================================================
// 拖拽排序逻辑
// ============================================================

const draggedIndex = ref<number | null>(null);

const handleDragStart = (e: DragEvent, index: number) => {
  draggedIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
  (e.target as HTMLElement).classList.add('dragging');
};

const handleDragOver = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) return;

  const items = document.querySelectorAll('.acu-button-card');
  items.forEach(item => item.classList.remove('drop-target'));
  (e.currentTarget as HTMLElement).classList.add('drop-target');
};

const handleDrop = (e: DragEvent, targetIndex: number) => {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return;

  // 重新排序 buttonOrder 中的可见按钮
  const currentOrder = [...configStore.config.buttonOrder];
  const visibleIds = configStore.config.visibleButtons;

  // 获取当前可见按钮在 order 中的索引
  const visibleInOrder = currentOrder.filter(id => visibleIds.includes(id));
  const [removed] = visibleInOrder.splice(draggedIndex.value, 1);
  visibleInOrder.splice(targetIndex, 0, removed);

  // 重建完整顺序：可见按钮按新顺序 + 不可见按钮保持原位
  const hiddenInOrder = currentOrder.filter(id => !visibleIds.includes(id));
  configStore.setButtonOrder([...visibleInOrder, ...hiddenInOrder]);

  // 清理
  const items = document.querySelectorAll('.acu-button-card');
  items.forEach(item => item.classList.remove('drop-target'));
  draggedIndex.value = null;
};

const handleDragEnd = (e: DragEvent) => {
  (e.target as HTMLElement).classList.remove('dragging');
  const items = document.querySelectorAll('.acu-button-card');
  items.forEach(item => item.classList.remove('drop-target'));
  draggedIndex.value = null;
};

// ============================================================
// 显示/隐藏按钮操作
// ============================================================

const handleShowButton = (btnId: string) => {
  const currentVisible = [...configStore.config.visibleButtons];
  const currentOrder = [...configStore.config.buttonOrder];

  // 添加到 visibleButtons
  if (!currentVisible.includes(btnId)) {
    currentVisible.push(btnId);
    configStore.setVisibleButtons(currentVisible);
  }

  // 确保按钮在 buttonOrder 中（兼容新添加的按钮）
  if (!currentOrder.includes(btnId)) {
    // 添加到 settings 之前
    const settingsIndex = currentOrder.indexOf('settings');
    if (settingsIndex >= 0) {
      currentOrder.splice(settingsIndex, 0, btnId);
    } else {
      currentOrder.push(btnId);
    }
    configStore.setButtonOrder(currentOrder);
  }
};

const handleHideButton = (btnId: string) => {
  if (btnId === 'settings') return; // 设置按钮不可隐藏
  const current = [...configStore.config.visibleButtons];
  const index = current.indexOf(btnId);
  if (index > -1) {
    current.splice(index, 1);
    configStore.setVisibleButtons(current);
  }
};

// ============================================================
// 附属按钮选择器
// ============================================================

const attachmentPickerVisible = ref(false);
const currentPickerTarget = ref('');

const openAttachmentPicker = (primaryId: string) => {
  currentPickerTarget.value = primaryId;
  attachmentPickerVisible.value = true;
};

const closeAttachmentPicker = () => {
  attachmentPickerVisible.value = false;
  currentPickerTarget.value = '';
};

const handleSelectSecondary = (secondaryId: string) => {
  configStore.addButtonGroup(currentPickerTarget.value, secondaryId);
  closeAttachmentPicker();
};

const handleRemoveSecondary = (primaryId: string) => {
  configStore.removeButtonGroupSecondary(primaryId);
};

// ============================================================
// 重置
// ============================================================

const handleReset = () => {
  configStore.resetButtonConfig();
};
</script>

<style scoped lang="scss">
/* 样式已迁移到 styles/components/settings-panel.scss */
</style>
