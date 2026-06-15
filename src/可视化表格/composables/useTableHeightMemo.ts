/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useTableHeightMemo.ts - 表格/仪表盘高度记忆
 */

import type { Ref } from 'vue';
import { useUIStore } from '../stores/useUIStore';

export interface UseTableHeightMemoOptions {
  mainPanelRef: Ref<
    | {
        getDataAreaElement: () => HTMLElement | null;
        resetHeight: () => void;
      }
    | undefined
  >;
}

export function useTableHeightMemo(options: UseTableHeightMemoOptions) {
  const { mainPanelRef } = options;
  const uiStore = useUIStore();

  function restoreTableHeight(tabId: string): void {
    const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
    if (!dataAreaEl) return;

    const savedHeight = uiStore.getTableHeight(tabId);
    if (savedHeight) {
      dataAreaEl.style.height = `${savedHeight}px`;
      console.info(`[ACU] 恢复高度: ${tabId} = ${savedHeight}px`);
    } else {
      mainPanelRef.value?.resetHeight();
    }
  }

  function handleHeightDragStart(event: PointerEvent, handleEl: HTMLElement | null): void {
    const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
    if (!dataAreaEl || !handleEl) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    handleEl.setPointerCapture(event.pointerId);

    const startY = event.clientY;
    const startHeight = dataAreaEl.offsetHeight;

    const handlePointerMove = (moveE: PointerEvent) => {
      const dy = startY - moveE.clientY;
      const newHeight = Math.max(200, startHeight + dy);
      dataAreaEl.style.height = `${newHeight}px`;
    };

    const handlePointerUp = (upE: PointerEvent) => {
      handleEl.releasePointerCapture(upE.pointerId);
      handleEl.removeEventListener('pointermove', handlePointerMove);
      handleEl.removeEventListener('pointerup', handlePointerUp);

      const currentTabName = uiStore.activeTab;
      if (currentTabName && dataAreaEl) {
        const finalHeight = dataAreaEl.offsetHeight;
        uiStore.setTableHeight(currentTabName, finalHeight);
        console.info(`[ACU] 保存高度: ${currentTabName} = ${finalHeight}px`);
      }
    };

    handleEl.addEventListener('pointermove', handlePointerMove);
    handleEl.addEventListener('pointerup', handlePointerUp);
  }

  function handleHeightReset(): void {
    const currentTabName = uiStore.activeTab;
    if (currentTabName) {
      uiStore.resetTableHeight(currentTabName);
      console.info(`[ACU] 清除高度记忆: ${currentTabName}`);
    }

    mainPanelRef.value?.resetHeight();
    console.info('[ACU] 高度已重置为自适应');
  }

  return {
    restoreTableHeight,
    handleHeightDragStart,
    handleHeightReset,
  };
}
