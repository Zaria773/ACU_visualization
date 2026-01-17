<template>
  <div v-if="visible" class="acu-modal-container acu-avatar-manager-overlay" @click.self="handleClose">
    <div class="acu-modal acu-avatar-manager-dialog">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-user-circle"></i>
          头像管理
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 搜索框 -->
      <div class="acu-avatar-search-bar">
        <i class="fas fa-search"></i>
        <input v-model="searchQuery" type="text" class="acu-avatar-search-input" placeholder="搜索角色名称或别名..." />
        <button v-if="searchQuery" class="acu-search-clear" @click.stop="searchQuery = ''">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- 内容区 - 可滚动 -->
      <div class="acu-modal-body acu-avatar-list">
        <!-- 加载中 -->
        <div v-if="isLoading" class="acu-avatar-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <span>加载中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="filteredAvatarList.length === 0" class="acu-avatar-empty">
          <i class="fas fa-user-slash"></i>
          <p>{{ searchQuery ? '未找到匹配的角色' : '暂无角色数据' }}</p>
        </div>

        <!-- 头像列表 -->
        <div v-else class="acu-avatar-items">
          <div
            v-for="item in filteredAvatarList"
            :key="item.id"
            class="acu-avatar-item"
            :class="{ selected: selectedForDelete.has(item.id) }"
          >
            <!-- 批量删除选择框 -->
            <div v-if="isDeleteMode" class="acu-avatar-checkbox" @click.stop="toggleDeleteSelection(item.id)">
              <i :class="selectedForDelete.has(item.id) ? 'fas fa-check-square' : 'far fa-square'"></i>
            </div>

            <!-- 头像区：头像 + 来源标签 -->
            <div class="acu-avatar-column">
              <!-- 头像预览 -->
              <div
                class="acu-avatar-preview"
                :class="{ 'has-image': !!item.avatarUrl }"
                :style="getAvatarStyle(item)"
                @click.stop="openCropDialog(item)"
              >
                <span v-if="!item.avatarUrl" class="acu-avatar-initial">{{ item.label }}</span>
                <i v-if="!item.avatarUrl" class="fas fa-camera acu-avatar-camera-hint"></i>
              </div>
              <!-- 来源标签 -->
              <span v-if="item.source" class="acu-avatar-source" :class="'acu-source-' + item.source">
                {{ getSourceLabel(item.source) }}
              </span>
            </div>

            <!-- 信息区 -->
            <div class="acu-avatar-info">
              <!-- 名称行 -->
              <div class="acu-avatar-name-row">
                <!-- 左侧：全名 + 标签预览 -->
                <div class="acu-avatar-name-left">
                  <span class="acu-avatar-name">{{ item.name }}</span>
                  <span v-if="item.displayLabel" class="acu-avatar-label-preview">({{ item.displayLabel }})</span>
                </div>
                <!-- 右侧：按钮区 -->
                <div class="acu-avatar-name-right">
                  <!-- 名字配置按钮 -->
                  <button class="acu-avatar-name-btn" title="配置头像显示名称" @click.stop="openLabelDialog(item)">
                    姓名显示
                  </button>
                  <!-- 导入下拉 -->
                  <div class="acu-import-dropdown">
                    <button class="acu-avatar-import-btn" title="导入头像" @click.stop="toggleImportMenu(item.id)">
                      导入 <i class="fas fa-caret-down"></i>
                    </button>
                    <div v-if="activeImportMenu === item.id" class="acu-dropdown-menu">
                      <div class="acu-dropdown-item" @click.stop="importLocal(item)">
                        <i class="fas fa-upload"></i> 本地导入
                      </div>
                      <div
                        class="acu-dropdown-item"
                        :class="{ disabled: !canImportFromTavern(item) }"
                        @click.stop="importFromTavern(item)"
                      >
                        <i class="fas fa-globe"></i> 酒馆导入
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- URL 输入 -->
              <div class="acu-avatar-url-row">
                <span class="acu-url-label">URL:</span>
                <input
                  type="text"
                  class="acu-avatar-url-input"
                  placeholder="粘贴图片URL..."
                  :value="item.url || ''"
                  @change="updateUrl(item, ($event.target as HTMLInputElement).value)"
                  @blur="updateUrl(item, ($event.target as HTMLInputElement).value)"
                />
              </div>

              <!-- 别名输入 -->
              <div class="acu-avatar-alias-row">
                <span class="acu-alias-label">别名:</span>
                <input
                  type="text"
                  class="acu-avatar-alias-input"
                  placeholder="输入别名，用逗号分隔..."
                  :value="item.aliasesText || ''"
                  @change="updateAliases(item, ($event.target as HTMLInputElement).value)"
                  @blur="updateAliases(item, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部固定栏 -->
      <div class="acu-avatar-footer">
        <div class="acu-footer-left">
          <button v-if="!isDeleteMode" class="acu-modal-btn secondary" @click.stop="enterDeleteMode">
            <i class="fas fa-trash-alt"></i> 批量删除
          </button>
          <template v-else>
            <button class="acu-modal-btn secondary" @click.stop="exitDeleteMode">取消</button>
            <button class="acu-modal-btn danger" :disabled="selectedForDelete.size === 0" @click.stop="confirmDelete">
              删除 ({{ selectedForDelete.size }})
            </button>
          </template>
        </div>
        <div class="acu-footer-right">
          <button class="acu-modal-btn primary" :disabled="!hasChanges" @click.stop="saveAll">
            <i class="fas fa-save"></i> 保存
          </button>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="handleFileSelect" />

    <!-- 姓名选择弹窗 -->
    <NodeLabelDialog
      :visible="showLabelDialog"
      :full-name="currentLabelItem?.name || ''"
      :initial-indices="currentLabelItem?.labelIndices || []"
      @close="closeLabelDialog"
      @apply="applyLabel"
      @reset="resetLabel"
    />

    <!-- 裁剪弹窗 -->
    <AvatarCropDialog
      v-if="showCropDialog"
      :visible="showCropDialog"
      :image-url="currentCropItem?.avatarUrl || ''"
      :name="currentCropItem?.name || ''"
      :initial-offset-x="currentCropItem?.offsetX ?? 50"
      :initial-offset-y="currentCropItem?.offsetY ?? 50"
      :initial-scale="currentCropItem?.scale ?? 150"
      @close="closeCropDialog"
      @apply="applyCrop"
      @upload="handleCropUpload"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AvatarManagerDialog.vue - 头像管理弹窗
 *
 * 功能：
 * - 显示所有节点的头像配置
 * - 支持本地上传和 URL 输入
 * - 点击名字打开姓名选择弹窗
 * - 点击头像打开裁剪弹窗
 * - 批量删除模式
 * - 导入下拉菜单（本地/酒馆）
 */

import { computed, onMounted, ref, toRaw, watch } from 'vue';

import { type AvatarRecord, useAvatarManager } from '../../composables/useAvatarManager';
import { useToast } from '../../composables/useToast';
import { compressImageSquare, fileToBase64 } from '../../utils';
import AvatarCropDialog from './AvatarCropDialog.vue';
import NodeLabelDialog from './NodeLabelDialog.vue';

// 聊天变量配置 key（与 RelationshipGraph 保持一致）
const CHAT_VAR_GRAPH_CONFIG = 'acu_graph_config';

/** 标签配置类型 */
interface LabelConfig {
  displayLabel: string;
  selectedIndices: number[];
}

/** 关系图配置类型 */
interface GraphConfig {
  layoutPositions?: Record<string, Record<string, { x: number; y: number }>>;
  labels?: Record<string, LabelConfig>;
}

/** 获取关系图配置 */
function getGraphConfig(): GraphConfig {
  try {
    const chatVars = getVariables({ type: 'chat' });
    return (chatVars[CHAT_VAR_GRAPH_CONFIG] as GraphConfig) || {};
  } catch (e) {
    console.warn('[AvatarManager] 获取聊天变量失败:', e);
    return {};
  }
}

/** 保存关系图配置 */
function saveGraphConfig(config: GraphConfig) {
  try {
    insertOrAssignVariables({ [CHAT_VAR_GRAPH_CONFIG]: config }, { type: 'chat' });
  } catch (e) {
    console.warn('[AvatarManager] 保存聊天变量失败:', e);
  }
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 是否显示 */
  visible: boolean;
  /** 节点列表（从关系图传入） */
  nodes: Array<{ id: string; name: string; label?: string; type: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  nodes: () => [],
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update'): void;
  /** 标签变更 - 轻量级更新，不需要重新加载头像 */
  (e: 'label-change'): void;
}>();

// ============================================================
// 状态
// ============================================================

interface AvatarListItem {
  id: string;
  name: string;
  /** 当前显示标签（可能是简称） */
  label: string;
  type: string;
  avatarUrl: string | null;
  url?: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  labelIndices?: number[];
  displayLabel?: string;
  source: 'local' | 'url' | 'auto' | null;
  hasLocalBlob: boolean;
  /** 别名列表 */
  aliases: string[];
  /** 别名文本（逗号分隔，用于显示） */
  aliasesText: string;
}

const avatarManager = useAvatarManager();
const toast = useToast();

const isLoading = ref(true);
const avatarList = ref<AvatarListItem[]>([]);
const pendingChanges = ref<Map<string, Partial<AvatarRecord>>>(new Map());
const hasChanges = computed(() => pendingChanges.value.size > 0);

// 搜索
const searchQuery = ref('');

/** 过滤后的头像列表 */
const filteredAvatarList = computed(() => {
  if (!searchQuery.value.trim()) {
    return avatarList.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return avatarList.value.filter(item => {
    // 匹配名称
    if (item.name.toLowerCase().includes(query)) return true;
    // 匹配别名
    if (item.aliases.some(alias => alias.toLowerCase().includes(query))) return true;
    // 匹配显示标签
    if (item.displayLabel?.toLowerCase().includes(query)) return true;
    return false;
  });
});

// 删除模式
const isDeleteMode = ref(false);
const selectedForDelete = ref<Set<string>>(new Set());

// 导入菜单
const activeImportMenu = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const currentUploadItem = ref<AvatarListItem | null>(null);

// 姓名选择弹窗
const showLabelDialog = ref(false);
const currentLabelItem = ref<AvatarListItem | null>(null);

// 裁剪弹窗
const showCropDialog = ref(false);
const currentCropItem = ref<AvatarListItem | null>(null);

// ============================================================
// 加载数据
// ============================================================

async function loadAvatarList() {
  isLoading.value = true;

  try {
    const list: AvatarListItem[] = [];

    // 从聊天变量读取标签配置（统一数据源）
    const graphConfig = getGraphConfig();
    const labelsConfig = graphConfig.labels || {};

    for (const node of props.nodes) {
      const record = await avatarManager.getAvatar(node.name);
      const avatarUrl = await avatarManager.getAvatarUrl(node.name);
      const hasLocalBlob = record?.blob ? true : false;

      // 确定来源
      let source: 'local' | 'url' | 'auto' | null = null;
      if (hasLocalBlob) {
        source = 'local';
      } else if (record?.url) {
        source = 'url';
      } else if (avatarUrl && avatarManager.isPlayerNode(node.name)) {
        source = 'auto';
      }

      // 从聊天变量获取显示标签配置
      const labelConfig = labelsConfig[node.name];
      const displayLabel = labelConfig?.displayLabel;
      const labelIndices = labelConfig?.selectedIndices;

      // 获取别名列表
      const aliases = record?.aliases || [];

      list.push({
        id: node.id,
        name: node.name,
        // label 来自聊天变量配置，如果没有则用全名
        label: displayLabel || node.name,
        type: node.type,
        avatarUrl,
        url: record?.url,
        offsetX: record?.offsetX ?? 50,
        offsetY: record?.offsetY ?? 50,
        scale: record?.scale ?? 150,
        labelIndices: labelIndices,
        displayLabel: displayLabel,
        source,
        hasLocalBlob,
        aliases,
        aliasesText: aliases.join(', '),
      });
    }

    avatarList.value = list;
  } catch (e) {
    console.error('[AvatarManager] 加载头像列表失败:', e);
  } finally {
    isLoading.value = false;
  }
}

// ============================================================
// 事件处理
// ============================================================

function handleClose() {
  if (hasChanges.value) {
    if (!confirm('有未保存的更改，确定要关闭吗？')) {
      return;
    }
  }
  pendingChanges.value.clear();
  emit('close');
}

function getInitial(name: string): string {
  return name ? name.charAt(0) : '?';
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'local':
      return '本地';
    case 'url':
      return 'URL';
    case 'auto':
      return '酒馆';
    default:
      return '';
  }
}

function getAvatarStyle(item: AvatarListItem): Record<string, string> {
  if (!item.avatarUrl) return {};

  return {
    backgroundImage: `url('${item.avatarUrl}')`,
    backgroundPosition: `${item.offsetX}% ${item.offsetY}%`,
    backgroundSize: `${item.scale}%`,
  };
}

// ============================================================
// 导入菜单
// ============================================================

function toggleImportMenu(itemId: string) {
  activeImportMenu.value = activeImportMenu.value === itemId ? null : itemId;
}

function closeImportMenu() {
  activeImportMenu.value = null;
}

function importLocal(item: AvatarListItem) {
  closeImportMenu();
  currentUploadItem.value = item;
  fileInputRef.value?.click();
}

function canImportFromTavern(item: AvatarListItem): boolean {
  // 主角导入用户头像，其他角色导入角色卡头像
  if (avatarManager.isPlayerNode(item.name)) {
    return !!avatarManager.getSillyTavernUserAvatar();
  }
  // NPC/角色导入角色卡头像（当前聊天的角色卡）
  return !!avatarManager.getSillyTavernCharacterAvatar();
}

function importFromTavern(item: AvatarListItem) {
  closeImportMenu();

  let tavernUrl: string | null = null;

  if (avatarManager.isPlayerNode(item.name)) {
    // 主角导入用户头像
    tavernUrl = avatarManager.getSillyTavernUserAvatar();
  } else {
    // NPC 导入角色卡头像
    tavernUrl = avatarManager.getSillyTavernCharacterAvatar();
  }

  if (tavernUrl) {
    // 更新到 pending changes
    addPendingChange(item.name, { url: tavernUrl });
    // 更新列表项
    const idx = avatarList.value.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      avatarList.value[idx] = {
        ...avatarList.value[idx],
        url: tavernUrl,
        avatarUrl: tavernUrl,
        source: 'url',
      };
    }
  } else {
    alert(avatarManager.isPlayerNode(item.name) ? '未找到用户头像' : '未找到角色卡头像');
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file || !currentUploadItem.value) {
    input.value = '';
    return;
  }

  const item = currentUploadItem.value;

  try {
    // 将图片预处理为正方形（解决 Cytoscape 比例失调问题）
    const base64 = await fileToBase64(file);
    const squareBase64 = await compressImageSquare(base64, 150, 0.85);

    // 将 base64 转换回 Blob
    const response = await fetch(squareBase64);
    const squareBlob = await response.blob();

    // 保存到 IndexedDB（labelIndices 已迁移到聊天变量，不再保存到 IndexedDB）
    await avatarManager.saveAvatar({
      name: item.name,
      blob: squareBlob,
      offsetX: item.offsetX,
      offsetY: item.offsetY,
      scale: item.scale,
      aliases: [],
      updatedAt: Date.now(),
    });

    // 刷新列表
    await loadAvatarList();
    emit('update');
  } catch (e) {
    console.error('[AvatarManager] 上传失败:', e);
    alert('上传失败');
  }

  input.value = '';
  currentUploadItem.value = null;
}

// ============================================================
// URL 输入
// ============================================================

function updateUrl(item: AvatarListItem, url: string) {
  const trimmedUrl = url.trim();

  // 更新到 pending changes
  addPendingChange(item.name, { url: trimmedUrl || undefined });

  // 更新列表项
  const idx = avatarList.value.findIndex(i => i.id === item.id);
  if (idx !== -1) {
    avatarList.value[idx] = {
      ...avatarList.value[idx],
      url: trimmedUrl || undefined,
      avatarUrl: trimmedUrl || avatarList.value[idx].avatarUrl,
      source: trimmedUrl ? 'url' : avatarList.value[idx].source,
    };
  }
}

// ============================================================
// 别名输入
// ============================================================

function updateAliases(item: AvatarListItem, aliasesText: string) {
  // 解析别名列表（逗号、顿号、空格分隔）
  const aliases = aliasesText
    .split(/[,，、\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

  // 更新到 pending changes
  addPendingChange(item.name, { aliases });

  // 更新列表项
  const idx = avatarList.value.findIndex(i => i.id === item.id);
  if (idx !== -1) {
    avatarList.value[idx] = {
      ...avatarList.value[idx],
      aliases,
      aliasesText: aliases.join(', '),
    };
  }
}

// ============================================================
// 姓名选择
// ============================================================

function openLabelDialog(item: AvatarListItem) {
  // 从聊天变量读取最新的标签配置
  const graphConfig = getGraphConfig();
  const labelConfig = graphConfig.labels?.[item.name];

  // 使用最新配置更新 item
  const updatedItem = {
    ...item,
    labelIndices: labelConfig?.selectedIndices || [],
    displayLabel: labelConfig?.displayLabel,
    label: labelConfig?.displayLabel || item.name,
  };

  currentLabelItem.value = updatedItem;
  showLabelDialog.value = true;
}

function closeLabelDialog() {
  showLabelDialog.value = false;
  currentLabelItem.value = null;
}

function applyLabel(data: { displayLabel: string; selectedIndices: number[] }) {
  if (!currentLabelItem.value) {
    console.warn('[AvatarManager] applyLabel: currentLabelItem 为空');
    return;
  }

  const item = currentLabelItem.value;
  console.log('[AvatarManager] applyLabel 被调用:', item.name, '->', data.displayLabel);

  // 保存到聊天变量（统一数据源）- 先保存再更新 UI
  const config = getGraphConfig();
  if (!config.labels) config.labels = {};
  config.labels[item.name] = {
    displayLabel: data.displayLabel,
    selectedIndices: data.selectedIndices,
  };
  saveGraphConfig(config);
  console.log('[AvatarManager] 标签已保存到聊天变量:', item.name, '->', data.displayLabel);

  // 更新列表项（视觉反馈）
  const idx = avatarList.value.findIndex(i => i.id === item.id);
  if (idx !== -1) {
    const updatedItem = {
      ...avatarList.value[idx],
      displayLabel: data.displayLabel,
      labelIndices: data.selectedIndices,
      label: data.displayLabel, // 更新列表中显示的标签
    };
    avatarList.value[idx] = updatedItem;
  }

  // 关闭弹窗
  closeLabelDialog();

  // 触发轻量级标签更新事件
  console.log('[AvatarManager] 发送 label-change 事件');
  emit('label-change');
}

function resetLabel() {
  if (!currentLabelItem.value) {
    console.warn('[AvatarManager] resetLabel: currentLabelItem 为空');
    return;
  }

  const item = currentLabelItem.value;
  console.log('[AvatarManager] resetLabel 被调用:', item.name);

  // 从聊天变量删除标签配置
  const config = getGraphConfig();
  if (config.labels && config.labels[item.name]) {
    delete config.labels[item.name];
    saveGraphConfig(config);
    console.log('[AvatarManager] 标签已重置为全名:', item.name);
  }

  // 更新列表项
  const idx = avatarList.value.findIndex(i => i.id === item.id);
  if (idx !== -1) {
    const updatedItem = {
      ...avatarList.value[idx],
      displayLabel: undefined,
      labelIndices: undefined,
      label: item.name, // 恢复为全名
    };
    avatarList.value[idx] = updatedItem;
  }

  // 关闭弹窗
  closeLabelDialog();

  // 触发轻量级标签更新事件
  console.log('[AvatarManager] 发送 label-change 事件');
  emit('label-change');
}

// ============================================================
// 裁剪弹窗
// ============================================================

function openCropDialog(item: AvatarListItem) {
  if (!item.avatarUrl) {
    // 没有头像时触发上传
    currentUploadItem.value = item;
    fileInputRef.value?.click();
    return;
  }

  currentCropItem.value = item;
  showCropDialog.value = true;
}

function closeCropDialog() {
  showCropDialog.value = false;
  currentCropItem.value = null;
}

function applyCrop(data: { offsetX: number; offsetY: number; scale: number }) {
  if (!currentCropItem.value) return;

  const item = currentCropItem.value;

  // 更新到 pending changes
  addPendingChange(item.name, {
    offsetX: data.offsetX,
    offsetY: data.offsetY,
    scale: data.scale,
  });

  // 更新列表项
  const idx = avatarList.value.findIndex(i => i.id === item.id);
  if (idx !== -1) {
    const updatedItem = {
      ...avatarList.value[idx],
      offsetX: data.offsetX,
      offsetY: data.offsetY,
      scale: data.scale,
    };
    avatarList.value[idx] = updatedItem;

    // 同步更新 currentCropItem，确保预览区也能看到变化
    currentCropItem.value = updatedItem;
  }

  closeCropDialog();
}

async function handleCropUpload(file: File) {
  if (!currentCropItem.value) return;

  const item = currentCropItem.value;

  try {
    // 将图片预处理为正方形（解决 Cytoscape 比例失调问题）
    const base64 = await fileToBase64(file);
    const squareBase64 = await compressImageSquare(base64, 150, 0.85);

    // 将 base64 转换回 Blob
    const response = await fetch(squareBase64);
    const squareBlob = await response.blob();

    await avatarManager.saveAvatar({
      name: item.name,
      blob: squareBlob,
      offsetX: 50,
      offsetY: 50,
      scale: 150,
      aliases: [],
      // labelIndices 已迁移到聊天变量，不再保存到 IndexedDB
      updatedAt: Date.now(),
    });

    await loadAvatarList();
    closeCropDialog();
    emit('update');
  } catch (e) {
    console.error('[AvatarManager] 上传失败:', e);
    alert('上传失败');
  }
}

// ============================================================
// 删除模式
// ============================================================

function enterDeleteMode() {
  isDeleteMode.value = true;
  selectedForDelete.value.clear();
}

function exitDeleteMode() {
  isDeleteMode.value = false;
  selectedForDelete.value.clear();
}

function toggleDeleteSelection(itemId: string) {
  const newSet = new Set(selectedForDelete.value);
  if (newSet.has(itemId)) {
    newSet.delete(itemId);
  } else {
    newSet.add(itemId);
  }
  selectedForDelete.value = newSet;
}

async function confirmDelete() {
  if (selectedForDelete.value.size === 0) return;

  const names = avatarList.value.filter(i => selectedForDelete.value.has(i.id)).map(i => i.name);

  if (!confirm(`确定要删除 ${names.length} 个头像配置吗？\n\n这将从 IndexedDB 中永久删除图片数据。`)) {
    return;
  }

  try {
    await avatarManager.deleteAvatars(names);
    await loadAvatarList();
    exitDeleteMode();
    emit('update');
  } catch (e) {
    console.error('[AvatarManager] 删除失败:', e);
    alert('删除失败');
  }
}

// ============================================================
// Pending Changes 管理
// ============================================================

function addPendingChange(name: string, changes: Partial<AvatarRecord>) {
  const existing = pendingChanges.value.get(name) || {};
  pendingChanges.value.set(name, { ...existing, ...changes });
}

async function saveAll() {
  if (pendingChanges.value.size === 0) return;

  try {
    for (const [name, changes] of pendingChanges.value) {
      const existing = await avatarManager.getAvatar(name);

      // 安全获取别名：优先使用 changes 中的，否则使用 existing 中的
      // 使用 toRaw 和展开运算符确保是普通数组，避免 Vue 代理导致 IndexedDB 无法克隆
      let aliases: string[] = [];
      if (changes.aliases !== undefined) {
        aliases = [...toRaw(changes.aliases)];
      } else if (existing?.aliases) {
        aliases = [...existing.aliases];
      }

      const record: AvatarRecord = {
        name,
        blob: existing?.blob,
        url: changes.url !== undefined ? changes.url : existing?.url,
        offsetX: changes.offsetX ?? existing?.offsetX ?? 50,
        offsetY: changes.offsetY ?? existing?.offsetY ?? 50,
        scale: changes.scale ?? existing?.scale ?? 150,
        aliases,
        // labelIndices 已迁移到聊天变量，不再保存到 IndexedDB
        updatedAt: Date.now(),
      };

      await avatarManager.saveAvatar(record);
    }

    pendingChanges.value.clear();
    toast.success('头像配置已保存');
    emit('update');
  } catch (e) {
    console.error('[AvatarManager] 保存失败:', e);
    toast.error('保存失败: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  if (props.visible) {
    loadAvatarList();
  }
});

watch(
  () => props.visible,
  visible => {
    if (visible) {
      loadAvatarList();
    } else {
      // 关闭时重置状态
      isDeleteMode.value = false;
      selectedForDelete.value.clear();
      activeImportMenu.value = null;
    }
  },
);

// 点击外部关闭导入菜单
watch(activeImportMenu, val => {
  if (val) {
    const handleClick = () => {
      activeImportMenu.value = null;
      document.removeEventListener('click', handleClick);
    };
    setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
  }
});
</script>
