/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useClickOutsidePanel.ts - 跨 iframe 点击外部收起面板
 */

import { onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../stores/useUIStore';

export function useClickOutsidePanel() {
  const uiStore = useUIStore();
  let parentDoc: Document | null = null;
  let cleanup: (() => void) | null = null;

  function isInsideACU(target: Element): boolean {
    const doc = parentDoc || window.parent?.document || document;

    if (doc.querySelector('.acu-inline-editor')) {
      console.info('[ACU] 检测到 InlineEditor 存在，阻止收起面板');
      return true;
    }

    if (doc.querySelector('.acu-editing-lock')) {
      console.info('[ACU] 检测到编辑锁定状态，阻止收起面板');
      return true;
    }

    const activeElement = doc.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      if (activeElement.closest('.acu-wrapper') || activeElement.closest('.acu-inline-editor')) {
        console.info('[ACU] 检测到 ACU 内的输入框活动，阻止收起面板');
        return true;
      }
    }

    if (
      uiStore.settingsDialog ||
      uiStore.inputFloorDialog.visible ||
      uiStore.purgeRangeDialog.visible ||
      uiStore.manualUpdateDialog ||
      uiStore.historyDialog.visible ||
      uiStore.presetSaveDialog.visible
    ) {
      return true;
    }

    return !!(
      target.closest('.acu-wrapper') ||
      target.closest('.acu-floating-ball-vue') ||
      target.closest('.acu-context-menu') ||
      target.closest('.acu-modal-overlay') ||
      target.closest('.acu-modal') ||
      target.closest('.acu-modal-container') ||
      target.closest('.acu-history-modal') ||
      target.closest('.acu-dialog') ||
      target.closest('[class*="acu-settings"]') ||
      target.closest('#acu_visualizer_vue-root') ||
      target.closest('.acu-inline-editor') ||
      target.closest('.acu-editing-lock') ||
      target.closest('.acu-edit-textarea')
    );
  }

  onMounted(() => {
    parentDoc = window.parent?.document || document;

    const handleClickOutside = (event: MouseEvent) => {
      if (!uiStore.isPanelVisible || uiStore.isPinned) return;

      const target = event.target as Element;
      if (isInsideACU(target)) return;

      uiStore.closePanel();
      console.info('[ACU] 点击外部，面板已收起');
    };

    parentDoc.addEventListener('click', handleClickOutside);
    cleanup = () => {
      parentDoc?.removeEventListener('click', handleClickOutside);
      cleanup = null;
      parentDoc = null;
    };
  });

  onUnmounted(() => {
    cleanup?.();
  });
}
