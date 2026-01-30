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

      <!-- Tab 切换栏 -->
      <div class="acu-avatar-tab-bar">
        <button
          class="acu-avatar-tab-btn"
          :class="{ active: activeTab === 'character' }"
          @click.stop="switchTab('character')"
        >
          <i class="fas fa-user"></i>
          人物头像
        </button>
        <button
          class="acu-avatar-tab-btn"
          :class="{ active: activeTab === 'faction' }"
          @click.stop="switchTab('faction')"
        >
          <i class="fas fa-users"></i>
          势力头像
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="acu-avatar-search-bar">
        <i class="fas fa-search"></i>
        <input
          v-model="searchQuery"
          type="text"
          class="acu-avatar-search-input"
          :placeholder="activeTab === 'character' ? '搜索角色名称或别名...' : '搜索势力名称...'"
        />
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
        <div v-else-if="filteredList.length === 0" class="acu-avatar-empty">
          <i :class="activeTab === 'character' ? 'fas fa-user-slash' : 'fas fa-users-slash'"></i>
          <p>{{ searchQuery ? '未找到匹配的数据' : activeTab === 'character' ? '暂无角色数据' : '暂无势力数据' }}</p>
        </div>

        <!-- 统一头像列表 -->
        <div v-else class="acu-avatar-items">
          <div
            v-for="item in filteredList"
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
                <span v-if="!item.avatarUrl" class="acu-avatar-initial">{{
                  item.displayLabel || getInitial(item.name)
                }}</span>
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
                      <!-- 仅人物头像显示酒馆导入选项 -->
                      <template v-if="activeTab === 'character'">
                        <div
                          class="acu-dropdown-item"
                          :class="{ disabled: !hasTavernCharacterAvatar }"
                          @click.stop="importCharacterAvatar(item)"
                        >
                          <i class="fas fa-user-circle"></i> 角色卡头像
                        </div>
                        <div
                          class="acu-dropdown-item"
                          :class="{ disabled: !hasTavernUserAvatar }"
                          @click.stop="importUserAvatar(item)"
                        >
                          <i class="fas fa-user"></i> 用户头像
                        </div>
                      </template>
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
 * AvatarManagerDialog.vue - 头像管理弹窗 (重构版)
 *
 * 功能：
 * - 统一管理人物和势力头像
 * - 支持本地上传、URL 输入、酒馆头像导入
 * - 支持姓名显示配置、头像裁剪、别名设置
 * - 批量删除
 */

import { computed, onMounted, ref, toRaw, watch } from 'vue';

import { useAvatarManager, type AvatarRecord } from '../../../composables/useAvatarManager';
import { useToast } from '../../../composables/useToast';
import { useUIStore } from '../../../stores/useUIStore';
import { compressImage, fileToBase64 } from '../../../utils';
import AvatarCropDialog from './AvatarCropDialog.vue';

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
  /** 势力列表（从关系图传入） */
  factions: Array<{ id: string; name: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  nodes: () => [],
  factions: () => [],
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update'): void;
  /** 标签变更 - 轻量级更新，不需要重新加载头像 */
  (e: 'label-change'): void;
}>();

// ============================================================
// 状态定义
// ============================================================

/** 统一的头像列表项接口 */
interface AvatarItem {
  id: string;
  name: string;
  /** 当前显示标签（可能是简称） */
  label: string;
  type: string; // 'character' | 'faction' | 其他
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
const uiStore = useUIStore();

// Tab 切换
type TabType = 'character' | 'faction';
const activeTab = ref<TabType>('character');

const isLoading = ref(true);
const avatarList = ref<AvatarItem[]>([]);
const factionList = ref<AvatarItem[]>([]);
const pendingChanges = ref<Map<string, Partial<AvatarRecord> & { displayLabel?: string; labelIndices?: number[] }>>(
  new Map(),
);

const hasChanges = computed(() => pendingChanges.value.size > 0);

// 搜索
const searchQuery = ref('');

// 删除模式
const isDeleteMode = ref(false);
const selectedForDelete = ref<Set<string>>(new Set());

// 导入菜单
const activeImportMenu = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const currentUploadItem = ref<AvatarItem | null>(null);

// 姓名选择弹窗 (已迁移至全局)
const currentLabelItem = ref<AvatarItem | null>(null);

// 裁剪弹窗
const showCropDialog = ref(false);
const currentCropItem = ref<AvatarItem | null>(null);

// ============================================================
// 计算属性
// ============================================================

/** 当前显示的列表（根据 Tab） */
const currentList = computed(() => {
  return activeTab.value === 'character' ? avatarList.value : factionList.value;
});

/** 过滤后的列表 */
const filteredList = computed(() => {
  if (!searchQuery.value.trim()) {
    return currentList.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return currentList.value.filter(item => {
    // 匹配名称
    if (item.name.toLowerCase().includes(query)) return true;
    // 匹配别名
    if (item.aliases.some(alias => alias.toLowerCase().includes(query))) return true;
    // 匹配显示标签
    if (item.displayLabel?.toLowerCase().includes(query)) return true;
    return false;
  });
});

// 计算属性 - 判断酒馆头像是否可用
const hasTavernCharacterAvatar = computed(() => !!avatarManager.getSillyTavernCharacterAvatar());
const hasTavernUserAvatar = computed(() => !!avatarManager.getSillyTavernUserAvatar());

// ============================================================
// 数据加载
// ============================================================

/** 创建头像列表项的通用函数 */
async function createAvatarItem(
  id: string,
  name: string,
  type: string,
  labelsConfig: Record<string, LabelConfig>,
): Promise<AvatarItem> {
  const record = await avatarManager.getAvatar(name);
  const avatarUrl = await avatarManager.getAvatarUrl(name);
  const hasLocalBlob = record?.blob ? true : false;

  // 确定来源
  let source: 'local' | 'url' | 'auto' | null = null;
  if (hasLocalBlob) {
    source = 'local';
  } else if (record?.url) {
    source = 'url';
  } else if (avatarUrl && avatarManager.isPlayerNode(name)) {
    source = 'auto';
  } else if (type === 'faction' && !avatarUrl) {
    // 势力默认没有 auto 来源，除非有图片
    source = null;
  } else if (type === 'faction' && avatarUrl) {
    // 势力如果有图片但不是 local/url，也可以视为 auto (虽然目前势力没有自动头像逻辑)
    source = 'auto';
  }

  // 从聊天变量获取显示标签配置
  const labelConfig = labelsConfig[name];
  const displayLabel = labelConfig?.displayLabel;
  const labelIndices = labelConfig?.selectedIndices;

  // 获取别名列表
  const aliases = record?.aliases || [];

  return {
    id,
    name,
    label: displayLabel || name,
    type,
    avatarUrl,
    url: record?.url,
    offsetX: record?.offsetX ?? 50,
    offsetY: record?.offsetY ?? 50,
    scale: record?.scale ?? 150,
    labelIndices,
    displayLabel,
    source,
    hasLocalBlob,
    aliases,
    aliasesText: aliases.join(', '),
  };
}

async function loadData() {
  isLoading.value = true;

  try {
    const avatars: AvatarItem[] = [];
    const factions: AvatarItem[] = [];

    // 获取所有势力名称集合（用于过滤重复节点）
    const factionNames = new Set(props.factions.map(f => f.name));

    // 从聊天变量读取标签配置（统一数据源）
    const graphConfig = getGraphConfig();
    const labelsConfig = graphConfig.labels || {};

    // 1. 加载人物节点
    for (const node of props.nodes) {
      // 跳过与势力名重复的节点（这些节点应该在势力头像 Tab 中管理）
      if (factionNames.has(node.name)) {
        continue;
      }
      const item = await createAvatarItem(node.id, node.name, node.type, labelsConfig);
      avatars.push(item);
    }

    // 2. 加载势力节点
    for (const faction of props.factions) {
      // 势力节点的 ID 使用传入的 ID，类型标记为 faction
      const item = await createAvatarItem(faction.id, faction.name, 'faction', labelsConfig);
      factions.push(item);
    }

    // 3. 应用未保存的变更 (pendingChanges)
    // 确保在上传图片刷新列表后，之前修改但未保存的裁剪参数不会丢失
    if (pendingChanges.value.size > 0) {
      for (const [name, changes] of pendingChanges.value) {
        // 更新人物列表
        const avatarIdx = avatars.findIndex(i => i.name === name);
        if (avatarIdx !== -1) {
          // 使用 Object.assign 确保类型安全，虽然 changes 可能包含 extra 字段
          const item = avatars[avatarIdx];
          avatars[avatarIdx] = {
            ...item,
            offsetX: changes.offsetX ?? item.offsetX,
            offsetY: changes.offsetY ?? item.offsetY,
            scale: changes.scale ?? item.scale,
            url: changes.url ?? item.url,
            // 注意：avatarUrl 也会被 url 更新影响，这里简化处理
            avatarUrl: changes.url ?? item.avatarUrl,
            source: changes.url ? 'url' : item.source,
            displayLabel: changes.displayLabel ?? item.displayLabel,
            labelIndices: changes.labelIndices ?? item.labelIndices,
            label: changes.displayLabel ?? item.label,
            aliases: changes.aliases ?? item.aliases,
            aliasesText: changes.aliases ? changes.aliases.join(', ') : item.aliasesText,
          };
        }

        // 更新势力列表
        const factionIdx = factions.findIndex(i => i.name === name);
        if (factionIdx !== -1) {
          const item = factions[factionIdx];
          factions[factionIdx] = {
            ...item,
            offsetX: changes.offsetX ?? item.offsetX,
            offsetY: changes.offsetY ?? item.offsetY,
            scale: changes.scale ?? item.scale,
            url: changes.url ?? item.url,
            avatarUrl: changes.url ?? item.avatarUrl,
            source: changes.url ? 'url' : item.source,
            displayLabel: changes.displayLabel ?? item.displayLabel,
            labelIndices: changes.labelIndices ?? item.labelIndices,
            label: changes.displayLabel ?? item.label,
            aliases: changes.aliases ?? item.aliases,
            aliasesText: changes.aliases ? changes.aliases.join(', ') : item.aliasesText,
          };
        }
      }
    }

    avatarList.value = avatars;
    factionList.value = factions;
  } catch (e) {
    console.error('[AvatarManager] 加载数据失败:', e);
    toast.error('加载数据失败');
  } finally {
    isLoading.value = false;
  }
}

// ============================================================
// 事件处理
// ============================================================

function switchTab(tab: TabType) {
  activeTab.value = tab;
  searchQuery.value = '';
  exitDeleteMode();
}

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
  if (!name) return '?';
  // 检测是否为英文名（包含空格且全英文）
  const isEnglish = /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
  if (isEnglish) {
    // 英文名：取第一个单词（名字而非姓氏）
    const firstName = name.split(' ')[0];
    return firstName.length > 6 ? firstName.slice(0, 6) : firstName;
  }
  // 中文名：取最后一个字
  return name[name.length - 1];
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'local':
      return '本地';
    case 'url':
      return 'URL';
    case 'auto':
      return '酒馆'; // 对于势力，这里显示"酒馆"可能不太准确，但逻辑上是一致的
    default:
      return '';
  }
}

function getAvatarStyle(item: AvatarItem): Record<string, string> {
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

function importLocal(item: AvatarItem) {
  closeImportMenu();
  currentUploadItem.value = item;
  fileInputRef.value?.click();
}

// 导入角色卡头像
function importCharacterAvatar(item: AvatarItem) {
  closeImportMenu();
  const tavernUrl = avatarManager.getSillyTavernCharacterAvatar();

  if (tavernUrl) {
    addPendingChange(item.name, { url: tavernUrl });
    updateListItem(item.id, {
      url: tavernUrl,
      avatarUrl: tavernUrl,
      source: 'url',
    });
  } else {
    alert('未找到角色卡头像');
  }
}

// 导入用户头像
function importUserAvatar(item: AvatarItem) {
  closeImportMenu();
  const tavernUrl = avatarManager.getSillyTavernUserAvatar();

  if (tavernUrl) {
    addPendingChange(item.name, { url: tavernUrl });
    updateListItem(item.id, {
      url: tavernUrl,
      avatarUrl: tavernUrl,
      source: 'url',
    });
  } else {
    alert('未找到用户头像');
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
    // 将图片转换为 Base64 并压缩（保留原比例，不裁剪）
    const base64 = await fileToBase64(file);
    // 限制最大宽度为 300px，质量 0.85
    const compressedBase64 = await compressImage(base64, 300, 0.85);

    // 将 base64 转换回 Blob
    const response = await fetch(compressedBase64);
    const blob = await response.blob();

    // 直接保存到 IndexedDB
    await avatarManager.saveAvatar({
      name: item.name,
      blob: blob,
      offsetX: item.offsetX,
      offsetY: item.offsetY,
      scale: item.scale,
      aliases: [...toRaw(item.aliases)], // 保留原有别名，确保不是 Proxy
      updatedAt: Date.now(),
    });

    // 刷新列表
    await loadData();
    emit('update');
    toast.success('头像已上传');
  } catch (e) {
    console.error('[AvatarManager] 上传失败:', e);
    alert('上传失败');
  }

  input.value = '';
  currentUploadItem.value = null;
}

// ============================================================
// URL & 别名输入
// ============================================================

function updateUrl(item: AvatarItem, url: string) {
  const trimmedUrl = url.trim();
  addPendingChange(item.name, { url: trimmedUrl || undefined });
  updateListItem(item.id, {
    url: trimmedUrl || undefined,
    avatarUrl: trimmedUrl || item.avatarUrl, // 乐观更新预览
    source: trimmedUrl ? 'url' : item.source,
  });
}

function updateAliases(item: AvatarItem, aliasesText: string) {
  const aliases = aliasesText
    .split(/[,，、\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

  addPendingChange(item.name, { aliases });
  updateListItem(item.id, {
    aliases,
    aliasesText: aliases.join(', '),
  });
}

// ============================================================
// 姓名选择
// ============================================================

function openLabelDialog(item: AvatarItem) {
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

  // 打开全局弹窗
  uiStore.openNodeLabelDialog(
    {
      fullName: updatedItem.name,
      initialIndices: updatedItem.labelIndices || [],
    },
    {
      onApply: (indices: number[]) => {
        // 根据 indices 生成 displayLabel
        const displayLabel = indices
          .sort((a, b) => a - b)
          .map(i => updatedItem.name[i])
          .join('');

        applyLabel(updatedItem, { displayLabel, selectedIndices: indices });
      },
      onReset: () => {
        resetLabel(updatedItem);
      },
    },
  );
}

function applyLabel(item: AvatarItem, data: { displayLabel: string; selectedIndices: number[] }) {
  // 添加到 pending changes
  addPendingChange(item.name, {
    displayLabel: data.displayLabel,
    labelIndices: data.selectedIndices,
  });

  // 更新列表项（视觉反馈）
  updateListItem(item.id, {
    displayLabel: data.displayLabel,
    labelIndices: data.selectedIndices,
    label: data.displayLabel,
  });
}

function resetLabel(item: AvatarItem) {
  // 添加到 pending changes (undefined 表示删除)
  addPendingChange(item.name, {
    displayLabel: undefined,
    labelIndices: undefined,
  });

  // 更新列表项
  updateListItem(item.id, {
    displayLabel: undefined,
    labelIndices: undefined,
    label: item.name,
  });
}

// ============================================================
// 裁剪弹窗
// ============================================================

function openCropDialog(item: AvatarItem) {
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

  addPendingChange(item.name, {
    offsetX: data.offsetX,
    offsetY: data.offsetY,
    scale: data.scale,
  });

  updateListItem(item.id, {
    offsetX: data.offsetX,
    offsetY: data.offsetY,
    scale: data.scale,
  });

  // 同步更新 currentCropItem
  currentCropItem.value = {
    ...item,
    offsetX: data.offsetX,
    offsetY: data.offsetY,
    scale: data.scale,
  };

  closeCropDialog();
}

async function handleCropUpload(file: File) {
  if (!currentCropItem.value) return;
  // 复用 handleFileSelect 的逻辑，但需要设置 currentUploadItem
  currentUploadItem.value = currentCropItem.value;
  // 构造一个伪造的 event 对象
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  const event = { target: { files: dataTransfer.files, value: '' } } as unknown as Event;
  await handleFileSelect(event);
  closeCropDialog();
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

  const itemsToDelete = currentList.value.filter(i => selectedForDelete.value.has(i.id));
  const names = itemsToDelete.map(i => i.name);

  if (!confirm(`确定要删除 ${names.length} 个头像配置吗？\n\n这将从 IndexedDB 中永久删除图片数据。`)) {
    return;
  }

  try {
    // 从 IndexedDB 删除
    await avatarManager.deleteAvatars(names);

    // 从聊天变量删除标签配置
    const config = getGraphConfig();
    if (config.labels) {
      let configChanged = false;
      for (const name of names) {
        if (config.labels[name]) {
          delete config.labels[name];
          configChanged = true;
        }
      }
      if (configChanged) {
        saveGraphConfig(config);
      }
    }

    await loadData();
    exitDeleteMode();
    emit('update');
    toast.success('删除成功');
  } catch (e) {
    console.error('[AvatarManager] 删除失败:', e);
    toast.error('删除失败');
  }
}

// ============================================================
// Pending Changes & Save
// ============================================================

function addPendingChange(
  name: string,
  changes: Partial<AvatarRecord> & { displayLabel?: string; labelIndices?: number[] },
) {
  const existing = pendingChanges.value.get(name) || {};
  pendingChanges.value.set(name, { ...existing, ...changes });
}

/** 辅助函数：更新列表中的项（同时更新 avatarList 和 factionList） */
function updateListItem(id: string, changes: Partial<AvatarItem>) {
  // 尝试在 avatarList 中查找
  const avatarIdx = avatarList.value.findIndex(i => i.id === id);
  if (avatarIdx !== -1) {
    avatarList.value[avatarIdx] = { ...avatarList.value[avatarIdx], ...changes };
  }

  // 尝试在 factionList 中查找
  const factionIdx = factionList.value.findIndex(i => i.id === id);
  if (factionIdx !== -1) {
    factionList.value[factionIdx] = { ...factionList.value[factionIdx], ...changes };
  }
}

async function saveAll() {
  if (pendingChanges.value.size === 0) return;

  try {
    const config = getGraphConfig();
    if (!config.labels) config.labels = {};
    let configChanged = false;

    for (const [name, changes] of pendingChanges.value) {
      // 1. 处理标签配置 (保存到聊天变量)
      if (changes.displayLabel !== undefined || changes.labelIndices !== undefined) {
        if (changes.displayLabel) {
          config.labels[name] = {
            displayLabel: changes.displayLabel,
            selectedIndices: changes.labelIndices || [],
          };
        } else if (changes.displayLabel === undefined && changes.labelIndices === undefined) {
          // 显式设置为 undefined 表示删除
          delete config.labels[name];
        }
        configChanged = true;
      }

      // 2. 处理头像数据 (保存到 IndexedDB)
      // 只有当有头像相关属性变更时才调用 saveAvatar
      if (
        changes.url !== undefined ||
        changes.offsetX !== undefined ||
        changes.offsetY !== undefined ||
        changes.scale !== undefined ||
        changes.aliases !== undefined
      ) {
        const existing = await avatarManager.getAvatar(name);

        // 安全获取别名
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
          updatedAt: Date.now(),
        };

        await avatarManager.saveAvatar(record);
      }
    }

    if (configChanged) {
      saveGraphConfig(config);
    }

    pendingChanges.value.clear();
    toast.success('保存成功');
    emit('update');
    // 如果有标签变更，触发 label-change
    emit('label-change');
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
    loadData();
  }
});

watch(
  () => props.visible,
  visible => {
    if (visible) {
      loadData();
    } else {
      // 关闭时重置状态
      isDeleteMode.value = false;
      selectedForDelete.value.clear();
      activeImportMenu.value = null;
      activeTab.value = 'character';
      pendingChanges.value.clear();
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
