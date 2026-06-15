/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useTabShortcuts.ts - Tab+数字快捷键
 */

import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH, useUIStore } from '../stores/useUIStore';
import type { TabItem } from '../types';
import { toast } from './useToast';

export interface UseTabShortcutsOptions {
  getTabList: () => TabItem[];
  hasRelationshipData: Ref<boolean>;
  hasOptionsTabs: Ref<boolean>;
  handleTabChange: (tabId: string) => void;
}

const REGISTRY_KEY = '__acu_tab_shortcut_registry__';

export function useTabShortcuts(options: UseTabShortcutsOptions) {
  const uiStore = useUIStore();
  const isArmed = ref(false);
  const pressedKeys = ref<Set<string>>(new Set());
  const disarmTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const cleanupFns = ref<Array<() => void>>([]);
  const debugId = `acu-shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let eventSeq = 0;

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(el.closest('input, textarea, [contenteditable="true"], .acu-edit-textarea, .acu-inline-editor'));
  }

  function arm(ms = 1200): void {
    isArmed.value = true;
    if (disarmTimer.value) clearTimeout(disarmTimer.value);
    disarmTimer.value = setTimeout(() => {
      isArmed.value = false;
      disarmTimer.value = null;
    }, ms);
  }

  function getShortcutNavigableTabs(): string[] {
    const visibleTabs = uiStore.visibleTabs;
    const allTableTabs = options.getTabList();

    if (!visibleTabs || visibleTabs.length === 0) {
      const ids: string[] = [TAB_DASHBOARD, ...allTableTabs.map(tab => String(tab.id))];
      if (options.hasRelationshipData.value) ids.push(TAB_RELATIONSHIP_GRAPH);
      if (options.hasOptionsTabs.value) ids.push(TAB_OPTIONS);
      return ids;
    }

    const nameToId = new Map(allTableTabs.map(tab => [tab.name, String(tab.id)]));
    const ids: string[] = [];
    for (const item of visibleTabs) {
      if (item === TAB_DASHBOARD) {
        ids.push(TAB_DASHBOARD);
      } else if (item === TAB_RELATIONSHIP_GRAPH) {
        if (options.hasRelationshipData.value) ids.push(TAB_RELATIONSHIP_GRAPH);
      } else if (item === TAB_OPTIONS) {
        if (options.hasOptionsTabs.value) ids.push(TAB_OPTIONS);
      } else {
        const mappedId = nameToId.get(item);
        if (mappedId) ids.push(mappedId);
      }
    }
    return ids;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;

    const isTab = event.code === 'Tab';
    const isDigit1 = event.code === 'Digit1' || event.code === 'Numpad1' || event.key === '1';
    const isDigit2 = event.code === 'Digit2' || event.code === 'Numpad2' || event.key === '2';
    const isShortcutKey = isTab || isDigit1 || isDigit2;

    pressedKeys.value.add(event.code);

    if (isShortcutKey) {
      eventSeq += 1;
      console.info('[ACU Shortcut][keydown-enter]', {
        debugId,
        seq: eventSeq,
        key: event.key,
        code: event.code,
        activeTab: uiStore.activeTab,
        armed: isArmed.value,
        tabHeld: pressedKeys.value.has('Tab'),
      });
    }

    if (isTab) {
      arm();
      event.preventDefault();
      console.info('[ACU Shortcut][tab-armed]', { debugId, seq: eventSeq });
      return;
    }

    if (!isDigit1 && !isDigit2) return;

    const tabHeld = pressedKeys.value.has('Tab');
    if (!tabHeld && !isArmed.value) {
      console.info('[ACU Shortcut][digit-ignored-not-armed]', {
        debugId,
        seq: eventSeq,
        key: event.key,
        code: event.code,
      });
      return;
    }

    const navigableTabs = getShortcutNavigableTabs();
    if (navigableTabs.length === 0) {
      toast.warning('当前没有可切换的 Tab');
      console.info('[ACU Shortcut][digit-ignored-empty-tabs]', { debugId, seq: eventSeq });
      return;
    }

    const activeTabId = uiStore.activeTab == null ? '' : String(uiStore.activeTab);
    const currentIndex = navigableTabs.findIndex(id => id === activeTabId);
    const step = isDigit1 ? -1 : 1;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const targetIndex = (baseIndex + step + navigableTabs.length) % navigableTabs.length;

    console.info('[ACU Shortcut][digit-resolve]', {
      debugId,
      seq: eventSeq,
      key: event.key,
      code: event.code,
      step,
      activeTabId,
      currentIndex,
      baseIndex,
      targetIndex,
      targetTab: navigableTabs[targetIndex],
      navigableTabs,
    });

    event.preventDefault();
    options.handleTabChange(navigableTabs[targetIndex]);
    arm();
  }

  function handleKeyup(event: KeyboardEvent): void {
    pressedKeys.value.delete(event.code);
    if (event.code === 'Tab') arm();
  }

  function cleanupGlobalRegistry(): void {
    try {
      const host = (window.parent || window) as any;
      const registry = host[REGISTRY_KEY] as
        | { docs: Document[]; keydown: (e: KeyboardEvent) => void; keyup: (e: KeyboardEvent) => void }
        | undefined;
      if (registry) {
        for (const doc of registry.docs) {
          doc.removeEventListener('keydown', registry.keydown, true);
          doc.removeEventListener('keyup', registry.keyup, true);
        }
        delete host[REGISTRY_KEY];
        console.info('[ACU] 已清理旧版全局快捷键监听');
      }
    } catch (error) {
      console.warn('[ACU] 清理旧版全局快捷键监听失败:', error);
    }
  }

  onMounted(() => {
    cleanupGlobalRegistry();

    const shortcutDocs = new Set<Document>();
    shortcutDocs.add(document);
    try {
      if (window.parent?.document) shortcutDocs.add(window.parent.document);
    } catch (error) {
      console.warn('[ACU] 访问父文档失败，快捷键仅绑定当前文档:', error);
    }

    cleanupFns.value = [];
    const mountedDocs = Array.from(shortcutDocs);
    for (const shortcutDoc of mountedDocs) {
      shortcutDoc.addEventListener('keydown', handleKeydown, true);
      shortcutDoc.addEventListener('keyup', handleKeyup, true);
      cleanupFns.value.push(() => {
        shortcutDoc.removeEventListener('keydown', handleKeydown, true);
        shortcutDoc.removeEventListener('keyup', handleKeyup, true);
      });
    }

    try {
      const host = (window.parent || window) as any;
      host[REGISTRY_KEY] = { docs: mountedDocs, keydown: handleKeydown, keyup: handleKeyup };
    } catch (error) {
      console.warn('[ACU] 记录全局快捷键监听失败:', error);
    }
  });

  onUnmounted(() => {
    for (const cleanup of cleanupFns.value) cleanup();
    cleanupFns.value = [];
    try {
      const host = (window.parent || window) as any;
      delete host[REGISTRY_KEY];
    } catch (error) {
      console.warn('[ACU] 清理全局快捷键注册失败:', error);
    }
    if (disarmTimer.value) {
      clearTimeout(disarmTimer.value);
      disarmTimer.value = null;
    }
    isArmed.value = false;
    pressedKeys.value.clear();
  });
}
