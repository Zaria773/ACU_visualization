<template>
  <Transition name="modal">
    <div
      v-if="visible"
      class="acu-modal-container"
      :class="{ 'acu-center-modal': uiStore.isMobile }"
      @click.self="handleClose"
    >
      <div class="acu-modal acu-prompt-editor-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <span class="acu-modal-title">
            <i class="fas fa-eye-slash"></i>
            隐藏提示词
          </span>
          <button class="acu-close-pill" @click.stop="handleClose">关闭</button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-edit"></i>
              编辑提示词
            </div>
            <div class="acu-settings-group">
              <div class="acu-settings-row" style="flex-direction: column; align-items: flex-start">
                <div class="acu-settings-label" style="margin-bottom: 8px">
                  提示词内容
                  <span class="hint">发送消息时会自动注入到用户输入之前</span>
                </div>
                <textarea
                  v-model="localPrompt"
                  class="acu-textarea-scrollable"
                  style="width: 100%; height: 150px"
                  placeholder="输入要隐藏的提示词..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="acu-modal-footer">
          <button class="acu-modal-btn secondary" @click.stop="handleClear">清空</button>
          <button class="acu-modal-btn primary" @click.stop="handleSave">保存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToast } from '../../../composables/useToast';
import { useUIStore } from '../../../stores/useUIStore';

interface Props {
  visible: boolean;
  prompt: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', prompt: string): void;
}>();

const uiStore = useUIStore();
const toast = useToast();
const localPrompt = ref('');

// 监听 visible 和 prompt 变化，同步本地状态
watch(
  () => [props.visible, props.prompt],
  ([visible, prompt]) => {
    if (visible) {
      localPrompt.value = (prompt as string) || '';
    }
  },
  { immediate: true },
);

function handleClose() {
  emit('close');
}

function handleClear() {
  localPrompt.value = '';
  toast.info('提示词已清空（需点击保存生效）');
}

function handleSave() {
  emit('save', localPrompt.value);
  toast.success('隐藏提示词已保存');
  handleClose();
}
</script>
