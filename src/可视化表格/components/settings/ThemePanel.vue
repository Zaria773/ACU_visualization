 <template>
  <div class="acu-theme-panel">
    <!-- 固定区域：预设管理 -->
    <PresetManagerHeader
      :presets="getPresetList()"
      :active-preset-id="getActivePresetId()"
      title="预设管理"
      hint="保存和加载主题配置"
      @select="selectPreset"
      @restore-default="selectDefaultPreset"
      @delete="confirmDeletePreset"
      @save="handleQuickSave"
      @save-as="openSaveDialog"
    />

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

      <!-- 背景配置 -->
      <BackgroundConfigPanel
        :storage-key="GLOBAL_THEME_BG_KEY"
        :model-value="getBackgroundConfig()"
        @update:model-value="val => themeStore.setBackgroundConfig(val)"
      />

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
          <div
            v-for="(group, index) in THEME_VAR_GROUPS"
            :key="group.id"
            class="acu-var-group"
            :class="{ first: index === 0, last: index === THEME_VAR_GROUPS.length - 1 }"
          >
            <div class="acu-var-group-header" @click.stop="toggleGroup(group.id)">
              <i :class="['fas', group.icon]"></i>
              <span>{{ group.name }}</span>
              <span class="acu-var-count">{{ getGroupModifiedCount(group) }}/{{ group.vars.length }}</span>
              <i :class="['fas', expandedGroups.includes(group.id) ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
            </div>

            <div v-show="expandedGroups.includes(group.id)" class="acu-var-group-body">
              <div v-for="v in group.vars" :key="v.key" class="acu-var-row acu-var-row-tall">
                <!-- 第一行：标签 + 颜色控件 -->
                <div class="acu-var-line-primary">
                  <div class="acu-var-label">{{ v.label }}</div>
                  <div class="acu-var-color-row">
                    <button
                      v-if="hasThemeVar(v.key) || hasVarOpacity(v.key)"
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
                      @change="e => setVar(v.key, (e.target as HTMLInputElement).value)"
                    />
                    <input
                      :value="getVarColorValue(v.key)"
                      type="color"
                      class="acu-color-swatch"
                      @change="e => setVar(v.key, (e.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>

                <!-- 第二行：变量名 + 透明度滑块 -->
                <div class="acu-var-line-secondary">
                  <code class="acu-var-name">{{ THEME_VAR_CSS_MAP[v.key] }}</code>
                  <div class="acu-var-opacity-row">
                    <input
                      type="range"
                      class="acu-range-input"
                      min="0"
                      max="100"
                      :value="getVarOpacity(v.key)"
                      @input="e => setVarOpacity(v.key, Number((e.target as HTMLInputElement).value))"
                    />
                    <span class="acu-opacity-value">{{ getVarOpacity(v.key) }}</span>
                  </div>
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
              <button
                class="acu-tool-btn"
                title="将 CSS 中的变量提取到滑块设置中，并从 CSS 中移除"
                @click.stop="syncCssToSliders"
              >
                <i class="fas fa-magic"></i>
                转为滑块
              </button>
              <button class="acu-tool-btn acu-btn-danger" @click.stop="clearCSS">
                <i class="fas fa-trash"></i>
                清空
              </button>
            </div>
          </div>
          <div class="acu-css-hint">
            <p>常用选择器：</p>
            <code>.acu-app, .acu-wrapper</code> <code>.acu-floating-ball</code>
            <code>.acu-data-card</code>
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

    <!-- 预设保存弹窗已迁移到全局 App.vue 中 -->

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputRef" type="file" accept=".json,.css,.txt" style="display: none" @change="handleFileImport" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { GLOBAL_THEME_BG_KEY } from '../../composables/useBackgroundStorage';
import { useToast } from '../../composables/useToast';
import { THEMES, useConfigStore } from '../../stores/useConfigStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useUIStore } from '../../stores/useUIStore';
import { THEME_VAR_CSS_MAP, THEME_VAR_GROUPS, type BackgroundConfig, type HighlightConfig, type ThemePreset, type ThemeVariables, type ThemeVarOpacities } from '../../types';
import BackgroundConfigPanel from './BackgroundConfigPanel.vue';
import PresetManagerHeader from './PresetManagerHeader.vue';

// ============================================================
// Stores
// ============================================================

const themeStore = useThemeStore();
const configStore = useConfigStore();
const uiStore = useUIStore();
const toast = useToast();

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

function getCurrentThemeVarOpacities(): ThemeVarOpacities {
  return (themeStore as unknown as { currentThemeVarOpacities: ThemeVarOpacities }).currentThemeVarOpacities || {};
}

function getBackgroundConfig(): BackgroundConfig {
  return (themeStore as unknown as { getBackgroundConfig: () => BackgroundConfig }).getBackgroundConfig();
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

/** 自定义 CSS 文本 */
const customCSSText = ref('');

/** 文件输入引用 */
const fileInputRef = ref<HTMLInputElement>();

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

// ============================================================
// 预设下拉框
// ============================================================

function selectDefaultPreset() {
  setActivePresetId(null);
  // 恢复默认配置
  themeStore.clearThemeVars();
  themeStore.clearThemeVarOpacities();
  syncColorInputs();
  customCSSText.value = '';
  themeStore.clearCustomCSS();

  toast.success('已恢复默认配置');
}

function selectPreset(presetId: string) {
  themeStore.applyPreset(presetId);
  syncColorInputs();
  customCSSText.value = getCustomCSS();
  selectedTheme.value = configStore.config.theme || 'retro';

  toast.success('预设已应用');
}

function confirmDeletePreset(presetId: string) {
  const preset = getPresetList().find(p => p.id === presetId);
  if (!preset) return;

  if (confirm(`确定要删除预设「${preset.name}」吗？`)) {
    themeStore.deletePreset(presetId);
    toast.info('预设已删除');
  }
}

// ============================================================
// 保存预设弹窗
// ============================================================

function handleQuickSave() {
  try {
    const activeId = getActivePresetId();
    if (activeId) {
      // 更新现有预设
      const preset = getPresetList().find(p => p.id === activeId);
      if (preset) {
        themeStore.saveCurrentToPreset(preset.name);
        toast.success(`预设「${preset.name}」已更新`);
        return;
      }
    }
    // 没有激活预设，回退到新建
    openSaveDialog();
  } catch (error) {
    console.error('保存失败:', error);
    toast.error('保存失败，请查看控制台');
  }
}

function openSaveDialog() {
  uiStore.openPresetSaveDialog(
    {
      presetType: 'theme',
      summaryItems: [], // 主题预设不需要摘要
      initialName: '',
      checkDuplicate: (name: string) => getPresetList().some(p => p.name === name),
    },
    {
      onSave: (name: string) => {
        themeStore.saveCurrentToPreset(name);
        toast.success(`预设「${name}」已保存`);
      },
    },
  );
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
  themeStore.removeThemeVarOpacity(key);
}

// ============================================================
// 主题变量透明度
// ============================================================

function hasVarOpacity(key: keyof ThemeVariables): boolean {
  const opacities = getCurrentThemeVarOpacities();
  return opacities[key] !== undefined && opacities[key] !== 100;
}

function getVarOpacity(key: keyof ThemeVariables): number {
  const opacities = getCurrentThemeVarOpacities();
  return opacities[key] ?? 100;
}

function setVarOpacity(key: keyof ThemeVariables, opacity: number) {
  themeStore.setThemeVarOpacity(key, opacity);
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
  version: '1.1',
  timestamp: new Date().toISOString(),
  theme: selectedTheme.value,
  highlight: getCurrentHighlight(),
  themeVars: getCurrentThemeVars(),
  themeVarOpacities: getCurrentThemeVarOpacities(),
  backgroundConfig: getBackgroundConfig(), // 修复：添加背景配置
  customCSS: getCustomCSS(),
};

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acu-theme-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast.success('配置已导出');
}

function importCSS() {
  fileInputRef.value?.click();
}

/**
 * 解析颜色值，支持 rgba 和 hex8
 */
function parseColorValue(value: string): { hex: string; opacity: number } | null {
  // 1. 尝试解析 rgba(r, g, b, a)
  const rgbaMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

    // 转换为 hex
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    return { hex, opacity: Math.round(a * 100) };
  }

  // 2. 尝试解析 Hex8 (#RRGGBBAA)
  if (value.startsWith('#') && value.length === 9) {
    const hex = value.slice(0, 7);
    const alphaHex = value.slice(7, 9);
    const alpha = parseInt(alphaHex, 16) / 255;
    return { hex, opacity: Math.round(alpha * 100) };
  }

  return null;
}

/**
 * 将 CSS 中的变量同步到滑块设置
 */
function syncCssToSliders() {
  if (!customCSSText.value.trim()) {
    toast.info('CSS 内容为空');
    return;
  }

  // 1. 创建反向映射表 (cssVar -> key)
  const cssVarToKey: Record<string, keyof ThemeVariables> = {};
  for (const [k, v] of Object.entries(THEME_VAR_CSS_MAP)) {
    cssVarToKey[v] = k as keyof ThemeVariables;
  }

  // 2. 逐行解析
  const lines = customCSSText.value.split('\n');
  const remainingLines: string[] = [];
  let convertedCount = 0;

  for (const line of lines) {
    // 匹配 CSS 变量定义: --acu-xxx: value;
    // 允许前导空白，捕获变量名和值
    const match = line.match(/^\s*(--acu-[a-z0-9-]+)\s*:\s*([^;]+);/);

    if (match) {
      const cssVar = match[1];
      const value = match[2].trim();
      const key = cssVarToKey[cssVar];

      if (key) {
        // 是已知的主题变量，同步到 store
        // 如果值包含 !important，清理它
        const cleanValue = value.replace(/\s*!important\s*$/, '').trim();

        // 尝试解析颜色和透明度 (支持 rgba 和 hex8)
        const parsed = parseColorValue(cleanValue);
        if (parsed) {
          themeStore.setThemeVar(key, parsed.hex);
          themeStore.setThemeVarOpacity(key, parsed.opacity);
        } else {
          themeStore.setThemeVar(key, cleanValue);
          // 如果是普通颜色，重置透明度为 100 (默认)
          themeStore.setThemeVarOpacity(key, 100);
        }

        convertedCount++;
        continue; // 从 CSS 中移除此行
      }
    }

    // 未匹配或是未知变量，保留
    remainingLines.push(line);
  }

  if (convertedCount > 0) {
    // 3. 更新 Custom CSS (移除已同步的行)
    // 过滤掉可能的空行块（可选，这里简单处理）
    let newCss = remainingLines.join('\n');
    // 清理多余的空行
    newCss = newCss.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    customCSSText.value = newCss;
    themeStore.setCustomCSS(newCss);

    // 4. 更新 UI
    syncColorInputs(); // 如果涉及高亮色（虽然高亮色不在 ThemeVariables 中，但以防万一）

    toast.success(`成功提取 ${convertedCount} 个变量到滑块设置`);
  } else {
    toast.info('未找到可同步的主题变量 (格式需为 --acu-xxx: val;)');
  }
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
          // 导入透明度配置（v1.1+）
          if (data.themeVarOpacities) {
            const opacities = getCurrentThemeVarOpacities();
            Object.assign(opacities, data.themeVarOpacities);
          }
          // 导入背景配置
          if (data.backgroundConfig) {
            themeStore.setBackgroundConfig(data.backgroundConfig);
          }
          if (data.customCSS) {
            customCSSText.value = data.customCSS;
            themeStore.setCustomCSS(data.customCSS);
          }
          syncColorInputs();
          toast.success('主题配置已导入');
        } else {
          throw new Error('无效的配置文件格式');
        }
      } else {
        // 作为纯 CSS 导入
        customCSSText.value = content;
        themeStore.setCustomCSS(content);
        toast.success('CSS 已导入');
      }
    } catch (err) {
      console.error('[ThemePanel] 导入失败:', err);
      toast.error('导入失败：无效的文件格式');
    }
  };
  reader.readAsText(file);

  // 重置 input
  (event.target as HTMLInputElement).value = '';
}
</script>
