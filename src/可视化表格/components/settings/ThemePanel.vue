<template>
  <div class="acu-theme-panel">
    <!-- 固定区域：预设管理 -->
    <div class="acu-preset-header">
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          预设管理
          <span class="hint">保存和加载主题配置</span>
        </div>
        <div class="acu-settings-control acu-preset-control">
          <!-- 自定义下拉选择框 -->
          <div class="acu-preset-dropdown" :class="{ open: isDropdownOpen }">
            <button class="acu-preset-dropdown-btn" @click.stop="toggleDropdown">
              <span class="acu-preset-selected-name">{{ selectedPresetName }}</span>
              <i class="fas fa-chevron-down"></i>
            </button>
            <div v-show="isDropdownOpen" class="acu-preset-dropdown-menu">
              <!-- 默认配置选项 -->
              <div
                class="acu-preset-option"
                :class="{ active: !getActivePresetId() }"
                @click.stop="selectDefaultPreset"
              >
                <span class="acu-preset-option-name">默认配置</span>
              </div>
              <!-- 用户预设选项 -->
              <div
                v-for="preset in getPresetList()"
                :key="preset.id"
                class="acu-preset-option"
                :class="{ active: getActivePresetId() === preset.id }"
                @click.stop="selectPreset(preset.id)"
              >
                <span class="acu-preset-option-name">{{ preset.name }}</span>
                <button class="acu-preset-delete-btn" title="删除" @click.stop="confirmDeletePreset(preset.id)">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
          </div>
          <!-- 保存按钮 -->
          <button class="acu-btn acu-btn-primary acu-btn-save" @click.stop="openSaveDialog">
            <i class="fas fa-save"></i>
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 可滚动区域 -->
    <div class="acu-theme-scroll-content">
      <!-- 主题风格选择 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-palette"></i>
          主题风格
        </div>
        <div class="acu-settings-group">
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              界面配色
              <span class="hint">选择界面配色方案</span>
            </div>
            <div class="acu-settings-control">
              <select v-model="selectedTheme" class="acu-select" @change="onThemeChange">
                <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">
                  {{ theme.name }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- 高亮颜色配置 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-highlighter"></i>
          高亮颜色
        </div>
        <div class="acu-settings-group">
          <!-- 手动修改高亮颜色 -->
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              手动修改高亮
              <span class="hint">手动编辑内容的标记颜色</span>
            </div>
            <div class="acu-settings-control acu-color-picker-inline">
              <input
                v-model="manualColorHex"
                type="text"
                class="acu-color-input"
                placeholder="#RRGGBB"
                @change="onManualColorChange"
              />
              <input v-model="manualColorHex" type="color" class="acu-color-swatch" @change="onManualColorChange" />
            </div>
          </div>

          <!-- AI 填表高亮颜色 -->
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              AI 填表高亮
              <span class="hint">AI 自动填写内容的标记颜色</span>
            </div>
            <div class="acu-settings-control acu-color-picker-inline">
              <input
                v-model="aiColorHex"
                type="text"
                class="acu-color-input"
                placeholder="#RRGGBB"
                @change="onAiColorChange"
              />
              <input v-model="aiColorHex" type="color" class="acu-color-swatch" @change="onAiColorChange" />
            </div>
          </div>

          <!-- 标题颜色 -->
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              标题颜色
              <span class="hint">表格标题的颜色</span>
            </div>
            <div class="acu-settings-control acu-color-picker-inline">
              <input
                v-model="titleColorHex"
                type="text"
                class="acu-color-input"
                placeholder="#RRGGBB"
                @change="onTitleColorChange"
              />
              <input v-model="titleColorHex" type="color" class="acu-color-swatch" @change="onTitleColorChange" />
            </div>
          </div>
        </div>
      </div>

      <!-- 主题变量自定义 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-paint-brush"></i>
          主题变量自定义
          <span class="hint" style="margin-left: auto; font-weight: normal">覆盖当前主题的 CSS 变量</span>
        </div>

        <!-- 连续的可折叠组 -->
        <div class="acu-var-groups-container">
          <div v-for="(group, index) in THEME_VAR_GROUPS" :key="group.id" class="acu-var-group" :class="{ first: index === 0, last: index === THEME_VAR_GROUPS.length - 1 }">
            <div class="acu-var-group-header" @click.stop="toggleGroup(group.id)">
              <i :class="['fas', group.icon]"></i>
              <span>{{ group.name }}</span>
              <span class="acu-var-count">{{ getGroupModifiedCount(group) }}/{{ group.vars.length }}</span>
              <i :class="['fas', expandedGroups.includes(group.id) ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
            </div>

            <div v-show="expandedGroups.includes(group.id)" class="acu-var-group-body">
              <div v-for="v in group.vars" :key="v.key" class="acu-var-row">
                <div class="acu-var-label">
                  {{ v.label }}
                </div>
                <div class="acu-var-control">
                  <button
                    v-if="hasThemeVar(v.key)"
                    class="acu-var-reset"
                    title="恢复默认"
                    @click.stop="resetVar(v.key)"
                  >
                    <i class="fas fa-undo"></i>
                  </button>
                  <input
                    :value="getVarValue(v.key)"
                    type="text"
                    class="acu-color-input"
                    placeholder="使用主题默认值"
                    @change="(e) => setVar(v.key, (e.target as HTMLInputElement).value)"
                  />
                  <input
                    :value="getVarColorValue(v.key)"
                    type="color"
                    class="acu-color-swatch"
                    @change="(e) => setVar(v.key, (e.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 自定义 CSS -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-code"></i>
          自定义 CSS
        </div>
        <div class="acu-settings-group">
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              CSS 代码
              <span class="hint">{{ customCSSText.length }} 字符</span>
            </div>
            <div class="acu-settings-control acu-css-actions">
              <button class="acu-tool-btn" @click.stop="exportCSS">
                <i class="fas fa-download"></i>
                导出
              </button>
              <button class="acu-tool-btn" @click.stop="importCSS">
                <i class="fas fa-upload"></i>
                导入
              </button>
              <button class="acu-tool-btn acu-btn-danger" @click.stop="clearCSS">
                <i class="fas fa-trash"></i>
                清空
              </button>
            </div>
          </div>
          <div class="acu-css-hint">
            <p>常用选择器：</p>
            <code>.acu-wrapper</code> <code>.acu-floating-ball</code> <code>.acu-main-panel</code>
            <code>.acu-modal</code> <code>.acu-tab-bar</code> <code>.acu-data-card</code>
          </div>
          <textarea
            v-model="customCSSText"
            class="acu-css-editor"
            placeholder="/* 在此输入自定义 CSS */"
            rows="8"
            @change="saveCSS"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- 保存预设弹窗 -->
    <div v-if="showSaveDialog" class="acu-preset-save-modal" @click.stop="closeSaveDialog">
      <div class="acu-preset-save-dialog" @click.stop>
        <div class="dialog-title">保存预设</div>
        <input
          ref="presetNameInputRef"
          v-model="newPresetName"
          type="text"
          class="dialog-input"
          placeholder="输入预设名称..."
          @keyup.enter="confirmSavePreset"
        />
        <div class="dialog-actions">
          <button class="btn-cancel" @click.stop="closeSaveDialog">取消</button>
          <button class="btn-confirm" :disabled="!newPresetName.trim()" @click.stop="confirmSavePreset">确定</button>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputRef" type="file" accept=".json,.css,.txt" style="display: none" @change="handleFileImport" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { THEMES, useConfigStore } from '../../stores/useConfigStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { THEME_VAR_GROUPS, type ThemeVariables, type ThemePreset, type HighlightConfig } from '../../types';

// ============================================================
// Stores
// ============================================================

const themeStore = useThemeStore();
const configStore = useConfigStore();

// ============================================================
// 类型安全的 Store 访问器
// ============================================================

// 由于 Pinia 类型推断问题，使用 getter 函数确保类型正确
function getPresetList(): ThemePreset[] {
  return (themeStore as unknown as { presets: ThemePreset[] }).presets || [];
}

function getActivePresetId(): string | null {
  return (themeStore as unknown as { activePresetId: string | null }).activePresetId;
}

function setActivePresetId(id: string | null): void {
  (themeStore as unknown as { activePresetId: string | null }).activePresetId = id;
}

function getCurrentThemeVars(): Partial<ThemeVariables> {
  return (themeStore as unknown as { currentThemeVars: Partial<ThemeVariables> }).currentThemeVars || {};
}

function getCurrentHighlight(): HighlightConfig {
  return (themeStore as unknown as { currentHighlight: HighlightConfig }).currentHighlight;
}

function getCustomCSS(): string {
  return (themeStore as unknown as { customCSS: string }).customCSS || '';
}

// ============================================================
// State
// ============================================================

/** 高亮颜色输入框 */
const manualColorHex = ref('#d35400');
const aiColorHex = ref('#3498db');
const titleColorHex = ref('#d35400');

/** 当前主题 */
const selectedTheme = ref('retro');

/** 展开的变量组 */
const expandedGroups = ref<string[]>([]);

/** 下拉框是否展开 */
const isDropdownOpen = ref(false);

/** 新预设名称 */
const newPresetName = ref('');

/** 是否显示保存弹窗 */
const showSaveDialog = ref(false);

/** 自定义 CSS 文本 */
const customCSSText = ref('');

/** 文件输入引用 */
const fileInputRef = ref<HTMLInputElement>();

/** 预设名称输入框引用 */
const presetNameInputRef = ref<HTMLInputElement>();

// ============================================================
// 计算属性
// ============================================================

/** 当前选中的预设名称 */
const selectedPresetName = computed(() => {
  const activeId = getActivePresetId();
  if (!activeId) return '默认配置';
  const preset = getPresetList().find(p => p.id === activeId);
  return preset?.name || '默认配置';
});

// ============================================================
// 初始化
// ============================================================

onMounted(() => {
  // 加载主题配置
  themeStore.loadFromStorage();

  // 同步高亮颜色
  syncColorInputs();

  // 同步主题选择
  selectedTheme.value = configStore.config.theme || 'retro';

  // 同步自定义 CSS
  customCSSText.value = getCustomCSS();

  // 点击外部关闭下拉框
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});

// 监听 store 变化同步输入框
watch(
  () => getCurrentHighlight(),
  () => syncColorInputs(),
  { deep: true },
);

watch(
  () => configStore.config.theme,
  newTheme => {
    selectedTheme.value = newTheme || 'retro';
  },
);

// ============================================================
// 辅助函数
// ============================================================

function syncColorInputs() {
  manualColorHex.value = themeStore.manualHighlightColor;
  aiColorHex.value = themeStore.aiHighlightColor;
  titleColorHex.value = themeStore.titleColor;
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.acu-preset-dropdown')) {
    isDropdownOpen.value = false;
  }
}

// ============================================================
// 预设下拉框
// ============================================================

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
}

function selectDefaultPreset() {
  setActivePresetId(null);
  // 恢复默认配置
  themeStore.clearThemeVars();
  syncColorInputs();
  customCSSText.value = '';
  themeStore.clearCustomCSS();
  isDropdownOpen.value = false;

  if (window.toastr) {
    window.toastr.success('已恢复默认配置');
  }
}

function selectPreset(presetId: string) {
  themeStore.applyPreset(presetId);
  syncColorInputs();
  customCSSText.value = getCustomCSS();
  selectedTheme.value = configStore.config.theme || 'retro';
  isDropdownOpen.value = false;

  if (window.toastr) {
    window.toastr.success('预设已应用');
  }
}

function confirmDeletePreset(presetId: string) {
  const preset = getPresetList().find(p => p.id === presetId);
  if (!preset) return;

  if (confirm(`确定要删除预设「${preset.name}」吗？`)) {
    themeStore.deletePreset(presetId);
    if (window.toastr) {
      window.toastr.info('预设已删除');
    }
  }
}

// ============================================================
// 保存预设弹窗
// ============================================================

function openSaveDialog() {
  showSaveDialog.value = true;
  newPresetName.value = '';
  nextTick(() => {
    presetNameInputRef.value?.focus();
  });
}

function closeSaveDialog() {
  showSaveDialog.value = false;
  newPresetName.value = '';
}

function confirmSavePreset() {
  const name = newPresetName.value.trim();
  if (!name) return;

  themeStore.saveCurrentToPreset(name);
  closeSaveDialog();

  if (window.toastr) {
    window.toastr.success(`预设「${name}」已保存`);
  }
}

// ============================================================
// 主题选择
// ============================================================

function onThemeChange() {
  configStore.setTheme(selectedTheme.value);
}

// ============================================================
// 高亮颜色
// ============================================================

function onManualColorChange() {
  themeStore.setManualHighlightColor('custom', manualColorHex.value);
}

function onAiColorChange() {
  themeStore.setAiHighlightColor('custom', aiColorHex.value);
}

function onTitleColorChange() {
  themeStore.setTitleColor('custom', titleColorHex.value);
}

// ============================================================
// 主题变量
// ============================================================

function toggleGroup(groupId: string) {
  const index = expandedGroups.value.indexOf(groupId);
  if (index > -1) {
    expandedGroups.value.splice(index, 1);
  } else {
    expandedGroups.value.push(groupId);
  }
}

function getGroupModifiedCount(group: (typeof THEME_VAR_GROUPS)[number]): number {
  const vars = getCurrentThemeVars();
  return group.vars.filter(v => vars[v.key]).length;
}

function hasThemeVar(key: keyof ThemeVariables): boolean {
  const vars = getCurrentThemeVars();
  return !!vars[key];
}

function getVarValue(key: keyof ThemeVariables): string {
  const vars = getCurrentThemeVars();
  return vars[key] || '';
}

function getVarColorValue(key: keyof ThemeVariables): string {
  const value = getVarValue(key);
  // 尝试解析为有效的 hex 颜色
  if (value && value.startsWith('#') && (value.length === 4 || value.length === 7)) {
    return value;
  }
  return '#888888'; // 默认灰色
}

function setVar(key: keyof ThemeVariables, value: string) {
  if (value.trim()) {
    themeStore.setThemeVar(key, value.trim());
  } else {
    themeStore.removeThemeVar(key);
  }
}

function resetVar(key: keyof ThemeVariables) {
  themeStore.removeThemeVar(key);
}

// ============================================================
// 自定义 CSS
// ============================================================

function saveCSS() {
  themeStore.setCustomCSS(customCSSText.value);
}

function clearCSS() {
  if (confirm('确定要清空自定义 CSS 吗？')) {
    customCSSText.value = '';
    themeStore.clearCustomCSS();
  }
}

function exportCSS() {
  const data = {
    type: 'acu_theme_config',
    version: '1.0',
    timestamp: new Date().toISOString(),
    theme: selectedTheme.value,
    highlight: getCurrentHighlight(),
    themeVars: getCurrentThemeVars(),
    customCSS: getCustomCSS(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acu-theme-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  if (window.toastr) {
    window.toastr.success('配置已导出');
  }
}

function importCSS() {
  fileInputRef.value?.click();
}

function handleFileImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const content = e.target?.result as string;

      // 尝试解析为 JSON
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(content);
        if (data.type === 'acu_theme_config') {
          // 导入主题
          if (data.theme) {
            selectedTheme.value = data.theme;
            configStore.setTheme(data.theme);
          }
          // 导入高亮配置
          if (data.highlight) {
            const highlight = getCurrentHighlight();
            highlight.manualColor = data.highlight.manualColor || 'custom';
            highlight.manualHex = data.highlight.manualHex;
            highlight.aiColor = data.highlight.aiColor || 'custom';
            highlight.aiHex = data.highlight.aiHex;
            highlight.titleColor = data.highlight.titleColor || 'custom';
            highlight.titleHex = data.highlight.titleHex;
          }
          if (data.themeVars) {
            const vars = getCurrentThemeVars();
            Object.assign(vars, data.themeVars);
          }
          if (data.customCSS) {
            customCSSText.value = data.customCSS;
            themeStore.setCustomCSS(data.customCSS);
          }
          syncColorInputs();
          if (window.toastr) {
            window.toastr.success('主题配置已导入');
          }
        } else {
          throw new Error('无效的配置文件格式');
        }
      } else {
        // 作为纯 CSS 导入
        customCSSText.value = content;
        themeStore.setCustomCSS(content);
        if (window.toastr) {
          window.toastr.success('CSS 已导入');
        }
      }
    } catch (err) {
      console.error('[ThemePanel] 导入失败:', err);
      if (window.toastr) {
        window.toastr.error('导入失败：无效的文件格式');
      }
    }
  };
  reader.readAsText(file);

  // 重置 input
  (event.target as HTMLInputElement).value = '';
}
</script>
