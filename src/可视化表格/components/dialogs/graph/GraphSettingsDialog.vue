<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
      <div class="acu-modal acu-graph-settings-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <span class="acu-modal-title">关系图设置</span>
          <button class="acu-close-pill" @click.stop="handleClose">完成</button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <!-- 显示设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-eye"></i>
              显示设置
            </div>
            <div class="acu-settings-group">
              <!-- 节点大小 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  节点大小
                  <span class="hint">{{ config.nodeSize }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="config.nodeSize" type="range" min="30" max="80" step="5" />
                </div>
              </div>

              <!-- 边宽度 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  边宽度
                  <span class="hint">{{ config.edgeWidth.toFixed(1) }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="config.edgeWidth" type="range" min="1" max="5" step="0.5" />
                </div>
              </div>

              <!-- 显示图例 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  显示图例
                  <span class="hint">关系颜色图例</span>
                </div>
                <div class="acu-settings-control">
                  <label class="acu-switch">
                    <input v-model="config.showLegend" type="checkbox" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>

              <!-- 头像管理入口 -->
              <div class="acu-settings-row acu-nav-row" @click.stop="handleOpenAvatarManager">
                <div class="acu-settings-label">
                  头像管理
                  <span class="hint">管理节点头像</span>
                </div>
                <div class="acu-settings-control">
                  <i class="fas fa-chevron-right"></i>
                </div>
              </div>
            </div>
          </div>

          <!-- 字体设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-font"></i>
              字体设置
            </div>
            <div class="acu-settings-group">
              <!-- 关系标签字体 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  关系标签
                  <span class="hint">{{ config.relationLabelFontSize }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="config.relationLabelFontSize" type="range" min="8" max="16" step="1" />
                </div>
              </div>

              <!-- 人名标签字体 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  人名标签
                  <span class="hint">{{ config.nameLabelFontSize }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="config.nameLabelFontSize" type="range" min="8" max="18" step="1" />
                </div>
              </div>

              <!-- 势力名标签字体 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  势力名标签
                  <span class="hint">{{ config.factionLabelFontSize }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="config.factionLabelFontSize" type="range" min="10" max="20" step="1" />
                </div>
              </div>
            </div>
          </div>

          <!-- 势力颜色设置 -->
          <div v-if="factions.length > 0" class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-palette"></i>
              势力颜色
              <span style="font-weight: 400; font-size: 11px; color: var(--acu-text-sub); margin-left: auto">
                {{ factions.length }} 个势力
              </span>
            </div>
            <!-- 颜色提示 -->
            <div class="acu-faction-color-hint">
              <span class="hint-item">
                <span class="hint-box dashed"></span>
                边框色
              </span>
              <span class="hint-item">
                <span class="hint-box solid"></span>
                背景色
              </span>
              <span class="hint-item">
                <i class="fas fa-adjust" style="font-size: 12px; margin-right: 2px"></i>
                透明度
              </span>
            </div>
            <!-- 可滚动的势力列表 -->
            <div class="acu-faction-color-group acu-faction-color-scrollable">
              <div v-for="faction in factions" :key="faction" class="acu-settings-row acu-faction-color-row">
                <div class="acu-settings-label">
                  {{ faction }}
                </div>
                <div class="acu-settings-control acu-faction-color-control">
                  <input
                    type="color"
                    class="acu-dashed"
                    :value="getFactionBorderColor(faction)"
                    title="边框颜色（虚线框）"
                    @input="handleFactionBorderChange(faction, $event)"
                  />
                  <input
                    type="color"
                    :value="getFactionBackgroundColor(faction)"
                    title="背景颜色"
                    @input="handleFactionBackgroundChange(faction, $event)"
                  />
                  <input
                    type="range"
                    class="acu-opacity-slider"
                    :value="getFactionOpacity(faction)"
                    min="0"
                    max="100"
                    step="5"
                    :title="`透明度: ${getFactionOpacity(faction)}%`"
                    @input="handleFactionOpacityChange(faction, $event)"
                  />
                  <span class="acu-opacity-value">{{ getFactionOpacity(faction) }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 背景配置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-image"></i>
              背景配置
            </div>
            <div class="acu-settings-group">
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  显示背景图片
                  <span class="hint">使用全局主题背景</span>
                </div>
                <div class="acu-settings-control">
                  <label class="acu-switch">
                    <input
                      :checked="config.showBackground"
                      type="checkbox"
                      @change="e => graphConfigStore.setShowBackground((e.target as HTMLInputElement).checked)"
                    />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
              <div class="acu-settings-row" style="justify-content: flex-start; padding-top: 0; padding-bottom: 8px">
                <span style="font-size: 11px; color: var(--acu-text-sub)">
                  <i class="fas fa-info-circle" style="margin-right: 4px"></i>
                  如需更换背景图片，请前往"设置 > 主题配置"
                </span>
              </div>
            </div>
          </div>

          <!-- 图例配置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-th-list"></i>
              图例配置
              <span style="font-weight: 400; font-size: 11px; color: var(--acu-text-sub); margin-left: auto">
                自定义关系颜色
              </span>
            </div>
            <div class="acu-settings-group">
              <!-- 启用自定义图例 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  启用自定义图例
                  <span class="hint">覆盖默认颜色规则</span>
                </div>
                <div class="acu-settings-control">
                  <label class="acu-switch">
                    <input v-model="legendConfig.enabled" type="checkbox" @change="handleLegendEnabledChange" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 图例项列表 -->
            <div v-if="legendConfig.enabled" class="acu-legend-items-section">
              <div class="acu-legend-items-header">
                <span>图例项</span>
                <button class="acu-action-btn acu-action-btn-small" @click.stop="handleAddLegendItem">
                  <i class="fas fa-plus"></i>
                  添加
                </button>
              </div>
              <div class="acu-legend-items-list">
                <div v-for="item in legendConfig.items" :key="item.id" class="acu-legend-item-row">
                  <!-- 编辑模式 -->
                  <template v-if="editingLegendId === item.id">
                    <div class="acu-legend-item-edit">
                      <div class="acu-legend-edit-row">
                        <input
                          v-model="editingLegendData.label"
                          type="text"
                          placeholder="名称"
                          class="acu-legend-input"
                        />
                        <input
                          v-model="editingLegendData.color"
                          type="color"
                          class="acu-legend-color-input"
                          title="颜色"
                        />
                        <input
                          v-model="editingLegendData.emoji"
                          type="text"
                          placeholder="Emoji"
                          class="acu-legend-emoji-input"
                          maxlength="4"
                        />
                      </div>
                      <div class="acu-legend-edit-row">
                        <input
                          v-model="editingLegendData.keywordsStr"
                          type="text"
                          placeholder="关键词（逗号分隔）"
                          class="acu-legend-keywords-input"
                        />
                      </div>
                      <div class="acu-legend-edit-actions">
                        <button
                          class="acu-action-btn acu-action-btn-small acu-action-btn-primary"
                          @click.stop="handleSaveLegendItem"
                        >
                          <i class="fas fa-check"></i>
                        </button>
                        <button class="acu-action-btn acu-action-btn-small" @click.stop="handleCancelEditLegendItem">
                          <i class="fas fa-times"></i>
                        </button>
                      </div>
                    </div>
                  </template>
                  <!-- 显示模式 -->
                  <template v-else>
                    <div class="acu-legend-item-display">
                      <span class="acu-legend-color-dot" :style="{ backgroundColor: item.color }"></span>
                      <span class="acu-legend-emoji">{{ item.emoji || '' }}</span>
                      <span class="acu-legend-label">{{ item.label }}</span>
                      <div class="acu-legend-keywords">
                        <span v-for="kw in item.keywords.slice(0, 3)" :key="kw" class="acu-legend-keyword-tag">
                          {{ kw }}
                        </span>
                        <span v-if="item.keywords.length > 3" class="acu-legend-keyword-more">
                          +{{ item.keywords.length - 3 }}
                        </span>
                      </div>
                    </div>
                    <div class="acu-legend-item-actions">
                      <button class="acu-legend-action-btn" title="编辑" @click.stop="handleEditLegendItem(item)">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button
                        class="acu-legend-action-btn acu-legend-action-btn-danger"
                        title="删除"
                        @click.stop="handleDeleteLegendItem(item.id)"
                      >
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  </template>
                </div>
                <div v-if="legendConfig.items.length === 0" class="acu-legend-empty">
                  <span>暂无图例项，点击上方"添加"按钮创建</span>
                </div>
              </div>
              <!-- 重置为默认图例 -->
              <div class="acu-legend-reset-wrapper">
                <button
                  class="acu-action-btn acu-action-btn-secondary acu-action-btn-small"
                  @click.stop="handleResetLegendConfig"
                >
                  <i class="fas fa-undo"></i>
                  重置为默认图例
                </button>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="acu-settings-section">
            <div class="acu-settings-group">
              <div class="acu-settings-row acu-action-row">
                <button class="acu-action-btn acu-action-btn-secondary" @click.stop="handleReset">
                  <i class="fas fa-undo"></i>
                  恢复默认
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * GraphSettingsDialog.vue - 关系图设置弹窗
 *
 * 用于配置关系图的显示参数，包括节点大小、边宽度、字体大小等
 */

import { computed, reactive, ref } from 'vue';

import {
  DEFAULT_FACTION_STYLE,
  FACTION_COLOR_PALETTE,
  type LegendItem,
  useGraphConfigStore,
} from '../../../stores/useGraphConfigStore';
import { useUIStore } from '../../../stores/useUIStore';

const props = defineProps<{
  visible: boolean;
  /** 当前解析出的势力列表 */
  factions?: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-avatar-manager'): void;
}>();

const graphConfigStore = useGraphConfigStore();
const uiStore = useUIStore();

// 直接使用 store 中的 config（响应式）
const config = computed(() => graphConfigStore.config);

// 势力列表（带默认值）
const factions = computed(() => props.factions || []);

// 图例配置（响应式）
const legendConfig = computed(() => graphConfigStore.getLegendConfig());

// 编辑状态
const editingLegendId = ref<string | null>(null);
const editingLegendData = reactive({
  label: '',
  color: '#888888',
  emoji: '',
  keywordsStr: '',
});

/**
 * 获取势力边框颜色
 */
function getFactionBorderColor(factionName: string): string {
  const colorConfig = graphConfigStore.config.factionColors[factionName];
  if (colorConfig) {
    return colorConfig.border;
  }
  // 使用默认调色板
  const index = factions.value.indexOf(factionName);
  if (index >= 0 && index < FACTION_COLOR_PALETTE.length) {
    return FACTION_COLOR_PALETTE[index].border;
  }
  // 超出调色板范围，使用默认灰色
  return DEFAULT_FACTION_STYLE.border;
}

/**
 * 获取势力背景颜色（转换 rgba 为 hex）
 */
function getFactionBackgroundColor(factionName: string): string {
  const colorConfig = graphConfigStore.config.factionColors[factionName];
  if (colorConfig) {
    // 尝试从 rgba 转换为 hex（取主色）
    const match = colorConfig.background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return colorConfig.background;
  }
  // 使用默认调色板
  const index = factions.value.indexOf(factionName);
  let defaultBg: string;
  if (index >= 0 && index < FACTION_COLOR_PALETTE.length) {
    defaultBg = FACTION_COLOR_PALETTE[index].background;
  } else {
    // 超出调色板范围，使用默认灰色
    defaultBg = DEFAULT_FACTION_STYLE.background;
  }
  const match = defaultBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return '#808080';
}

/**
 * 获取势力背景透明度
 */
function getFactionOpacity(factionName: string): number {
  const colorConfig = graphConfigStore.config.factionColors[factionName];
  if (colorConfig && colorConfig.opacity !== undefined) {
    return colorConfig.opacity;
  }
  // 使用默认调色板的透明度
  const index = factions.value.indexOf(factionName);
  if (index >= 0 && index < FACTION_COLOR_PALETTE.length) {
    return FACTION_COLOR_PALETTE[index].opacity;
  }
  // 默认 10%
  return DEFAULT_FACTION_STYLE.opacity ?? 10;
}

/**
 * 处理势力边框颜色变化
 */
function handleFactionBorderChange(factionName: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  const newBorderColor = target.value;
  const currentConfig = graphConfigStore.config.factionColors[factionName] || {
    border: getFactionBorderColor(factionName),
    background: hexToRgba(getFactionBackgroundColor(factionName), 0.1),
  };
  graphConfigStore.setFactionColor(factionName, {
    ...currentConfig,
    border: newBorderColor,
  });
}

/**
 * 处理势力背景颜色变化
 */
function handleFactionBackgroundChange(factionName: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  const hexColor = target.value;
  const currentOpacity = getFactionOpacity(factionName);
  const currentConfig = graphConfigStore.config.factionColors[factionName] || {
    border: getFactionBorderColor(factionName),
    background: hexToRgba(hexColor, currentOpacity / 100),
    opacity: currentOpacity,
  };
  graphConfigStore.setFactionColor(factionName, {
    ...currentConfig,
    background: hexToRgba(hexColor, currentOpacity / 100),
  });
}

/**
 * 处理势力透明度变化
 */
function handleFactionOpacityChange(factionName: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  const opacity = parseInt(target.value, 10);
  const hexColor = getFactionBackgroundColor(factionName);
  const currentConfig = graphConfigStore.config.factionColors[factionName] || {
    border: getFactionBorderColor(factionName),
    background: hexToRgba(hexColor, opacity / 100),
    opacity: opacity,
  };
  graphConfigStore.setFactionColor(factionName, {
    ...currentConfig,
    background: hexToRgba(hexColor, opacity / 100),
    opacity: opacity,
  });
}

/**
 * 将 hex 颜色转换为 rgba
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 打开头像管理器
 */
function handleOpenAvatarManager(): void {
  // 关闭当前弹窗
  emit('close');
  // 通知父组件打开头像管理器
  emit('open-avatar-manager');
}

/**
 * 关闭弹窗
 */
function handleClose(): void {
  // 配置会自动保存（watchEffect）
  emit('close');
}

/**
 * 恢复默认设置
 */
function handleReset(): void {
  graphConfigStore.resetToDefault();
}

// ============================================================
// 图例配置相关方法
// ============================================================

/**
 * 处理图例启用状态变化
 */
function handleLegendEnabledChange(): void {
  graphConfigStore.setLegendEnabled(legendConfig.value.enabled);
}

/**
 * 处理图例位置变化
 */
function handleLegendPositionChange(): void {
  graphConfigStore.setLegendPosition(legendConfig.value.position);
}

/**
 * 添加图例项
 */
function handleAddLegendItem(): void {
  const newItem = {
    label: '新图例',
    color: '#888888',
    emoji: '⚪',
    keywords: [],
  };
  graphConfigStore.addLegendItem(newItem);
  // 立即进入编辑模式
  const items = graphConfigStore.getLegendConfig().items;
  const addedItem = items[items.length - 1];
  if (addedItem) {
    handleEditLegendItem(addedItem);
  }
}

/**
 * 编辑图例项
 */
function handleEditLegendItem(item: LegendItem): void {
  editingLegendId.value = item.id;
  editingLegendData.label = item.label;
  editingLegendData.color = item.color;
  editingLegendData.emoji = item.emoji || '';
  editingLegendData.keywordsStr = item.keywords.join(', ');
}

/**
 * 保存图例项编辑
 */
function handleSaveLegendItem(): void {
  if (!editingLegendId.value) return;
  const keywords = editingLegendData.keywordsStr
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  graphConfigStore.updateLegendItem(editingLegendId.value, {
    label: editingLegendData.label,
    color: editingLegendData.color,
    emoji: editingLegendData.emoji || undefined,
    keywords,
  });
  editingLegendId.value = null;
}

/**
 * 取消图例项编辑
 */
function handleCancelEditLegendItem(): void {
  editingLegendId.value = null;
}

/**
 * 删除图例项
 */
function handleDeleteLegendItem(id: string): void {
  graphConfigStore.removeLegendItem(id);
}

/**
 * 重置图例配置为默认
 */
function handleResetLegendConfig(): void {
  graphConfigStore.resetLegendConfig();
}
</script>
