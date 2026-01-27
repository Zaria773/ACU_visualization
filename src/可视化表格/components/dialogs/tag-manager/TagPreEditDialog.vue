<!-- TagPreEditDialog.vue - 标签二次编辑弹窗 -->
<!-- 交互流程：
  - 用户点击标签，标签的 allowPreEdit=true
  - 弹出此弹窗，显示解析后的提示词模板
  - 用户可以修改
  - 点击"追加"按钮将内容追加到酒馆输入框
-->
<template>
  <div
    v-if="visible"
    class="acu-modal-container acu-center-modal"
    @click.self="handleClose"
  >
    <div class="acu-modal acu-pre-edit-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-edit"></i>
          编辑提示词
        </span>
        <div class="acu-header-actions">
          <button class="acu-modal-btn secondary small" @click.stop="handleClose">取消</button>
          <button class="acu-modal-btn primary small" :disabled="!editedPrompt.trim()" @click.stop="handleConfirm">
            <i class="fas fa-paper-plane"></i> 追加
          </button>
        </div>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <div class="acu-pre-edit-content">
          <!-- 标签信息 -->
          <div class="acu-pre-edit-info-row">
            <div class="acu-pre-edit-label">
              标签：{{ tagLabel }}
            </div>
          </div>

          <!-- 编辑区 -->
          <textarea
            ref="textareaRef"
            v-model="editedPrompt"
            class="acu-pre-edit-textarea"
            placeholder="输入要追加的内容..."
            @keydown.ctrl.enter="handleConfirm"
            @keydown.meta.enter="handleConfirm"
          ></textarea>

          <!-- 同伴选择器 -->
          <div v-if="showCompanions" class="acu-companion-selector">
            <div class="acu-companion-header">
              <i class="fas fa-user-friends"></i>
              选择同伴 (点击插入)
            </div>
            <div class="acu-avatar-list">
              <div
                v-for="avatar in avatars"
                :key="avatar.name"
                class="acu-avatar-item"
                @click="handleAvatarClick(avatar)"
              >
                <div class="acu-avatar-img-wrapper" :class="{ 'no-img': !avatar.displayUrl }">
                  <img v-if="avatar.displayUrl" :src="avatar.displayUrl" :alt="avatar.name" loading="lazy" />
                  <span v-else class="acu-avatar-text-icon">{{ avatar.textAvatar }}</span>
                </div>
                <span class="acu-avatar-name">{{ avatar.name }}</span>
              </div>
              <div v-if="avatars.length === 0 && !isLoadingAvatars" class="acu-avatar-empty">
                暂无头像数据
              </div>
            </div>
          </div>

          <!-- 提示 -->
          <div class="acu-pre-edit-hint">
            <i class="fas fa-lightbulb"></i>
            <span>按 Ctrl+Enter 快速追加</span>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, nextTick, ref, watch } from 'vue';
import { useAvatarManager } from '../../../composables/useAvatarManager';
import { useCoreActions } from '../../../composables/useCoreActions';
import { useUIStore } from '../../../stores/useUIStore';
import type { ProcessedTable } from '../../../types';
import { isCharacterTable } from '../../../utils';

// Local interface for display
interface AvatarDisplay {
  name: string;
  displayUrl: string;
  textAvatar: string;
}

// Props
interface Props {
  visible: boolean;
  /** 标签文本 */
  tagLabel: string;
  /** 已解析的提示词模板（通配符已替换） */
  resolvedPrompt: string;
  /** 是否显示同伴选择器 */
  showCompanions?: boolean;
  /** 来源组件 ID (用于管理标签) */
  widgetId?: string;
}
const props = withDefaults(defineProps<Props>(), {
  tagLabel: '',
  resolvedPrompt: '',
  showCompanions: false,
  widgetId: '',
});

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', prompt: string): void;
  (e: 'close'): void;
}>();

// Core actions
const { setInput } = useCoreActions();
const { getAvatarUrl } = useAvatarManager();
const uiStore = useUIStore();
const getAllTables = inject<() => ProcessedTable[]>('allTables');

// 状态
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const editedPrompt = ref('');
const avatars = ref<AvatarDisplay[]>([]);
const isLoadingAvatars = ref(false);

// 监听弹窗打开
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      // 初始化编辑内容
      editedPrompt.value = props.resolvedPrompt;

      // 如果需要显示同伴选择器，加载头像
      if (props.showCompanions) {
        loadAvatars();
      }

      // 聚焦输入框
      await nextTick();
      textareaRef.value?.focus();
      // 光标移到末尾
      textareaRef.value?.setSelectionRange(
        editedPrompt.value.length,
        editedPrompt.value.length
      );
    }
  }
);

async function loadAvatars() {
  isLoadingAvatars.value = true;
  try {
    // 1. 获取所有人物表中的角色名
    const charNames = new Set<string>();
    const tables = getAllTables ? getAllTables() : [];

    if (!getAllTables) {
      console.warn('[TagPreEditDialog] getAllTables injection failed');
    }
    console.log('[TagPreEditDialog] Loading avatars. Tables:', tables.length);

    if (tables.length > 0) {
      tables.forEach(table => {
        if (isCharacterTable(table.name, table.id)) {
          console.log('[TagPreEditDialog] Found character table:', table.name);
          // 查找名称列：优先找 "Name"/"名称"/"姓名"，否则用第二列(index 1)
          const nameColIndex = table.headers.findIndex(h =>
            ['name', '名称', '姓名', '角色'].includes(h.toLowerCase())
          );

          // 确定目标列：优先用找到的列，否则如果有第2列用第2列，否则用第1列
          let targetColIndex = nameColIndex;
          if (targetColIndex === -1) {
            targetColIndex = table.headers.length > 1 ? 1 : 0;
          }

          table.rows.forEach(row => {
            const cell = row.cells.find(c => c.colIndex === targetColIndex);
            if (cell && cell.value && String(cell.value).trim()) {
              charNames.add(String(cell.value).trim());
            }
          });
        }
      });
    }

    // 2. 获取配置和头像记录
    const chatVars = typeof getVariables !== 'undefined' ? getVariables({ type: 'chat' }) : {};
    const graphConfig = (chatVars['acu_graph_config'] as any) || {};
    const labelsConfig = graphConfig.labels || {};

    // 3. 构建显示列表
    const displayAvatars = await Promise.all(
      Array.from(charNames).map(async (name) => {
        const url = await getAvatarUrl(name);
        const config = labelsConfig[name];

        // 文字头像逻辑：优先使用配置的选定字符，否则使用显示名/原名的首字
        let textAvatar = '';
        if (config?.selectedIndices && config.selectedIndices.length > 0) {
          textAvatar = config.selectedIndices.map((i: number) => name[i]).join('');
        } else {
          const label = config?.displayLabel || name;
          textAvatar = label.charAt(0);
        }

        return {
          name,
          displayUrl: url || '',
          textAvatar,
        };
      })
    );

    avatars.value = displayAvatars;
  } catch (e) {
    console.error('Failed to load avatars:', e);
  } finally {
    isLoadingAvatars.value = false;
  }
}

// 方法
function handleClose() {
  emit('update:visible', false);
  emit('close');
}

function handleConfirm() {
  const prompt = editedPrompt.value.trim();
  if (!prompt) return;

  // 追加到酒馆输入框
  setInput(prompt);

  // 触发确认事件
  emit('confirm', prompt);

  // 关闭弹窗
  handleClose();
}

function handleAvatarClick(avatar: AvatarDisplay) {
  const companionText = `和${avatar.name}`;
  const currentText = editedPrompt.value;

  // 插入逻辑：优先插入在 {{user}} 之后，否则插入在最前面
  if (currentText.includes('{{user}}')) {
    // 找到最后一个 {{user}} 的位置
    const lastIndex = currentText.lastIndexOf('{{user}}');
    const insertPos = lastIndex + '{{user}}'.length;
    editedPrompt.value =
      currentText.slice(0, insertPos) +
      companionText +
      currentText.slice(insertPos);
  } else {
    // 插入在最前面
    editedPrompt.value = companionText + currentText;
  }

  // 聚焦并选中插入的文本
  nextTick(() => {
    textareaRef.value?.focus();
  });
}
</script>
