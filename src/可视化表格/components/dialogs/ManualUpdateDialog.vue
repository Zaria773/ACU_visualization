<template>
  <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
    <div ref="dialogRef" class="acu-modal acu-manual-update-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <!-- 返回按钮 -->
        <button class="acu-modal-back" @click="handleClose">
          <i class="fas fa-arrow-left"></i>
        </button>
        <span class="acu-modal-title">手动更新配置</span>
        <!-- 胶囊式完成按钮 -->
        <button class="acu-close-pill" @click="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="acu-loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>加载配置中...</span>
        </div>

        <!-- 配置项 -->
        <template v-else>
          <div class="acu-settings-group">
            <div class="acu-settings-title">
              <i class="fas fa-sliders-h"></i>
              更新参数设置
            </div>

            <!-- AI读取上下文层数 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                AI读取上下文层数
                <span class="hint">AI阅读最近多少层来理解剧情</span>
              </div>
              <div class="acu-settings-control">
                <input
                  v-model.number="localSettings.autoUpdateThreshold"
                  type="number"
                  class="acu-config-input"
                  min="1"
                  max="500"
                  @change="handleSettingChange('autoUpdateThreshold', localSettings.autoUpdateThreshold)"
                />
              </div>
            </div>

            <!-- 每N层自动更新一次 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                每N层自动更新一次
                <span class="hint">设置自动触发更新的楼层间隔</span>
              </div>
              <div class="acu-settings-control">
                <input
                  v-model.number="localSettings.autoUpdateFrequency"
                  type="number"
                  class="acu-config-input"
                  min="1"
                  max="100"
                  @change="handleSettingChange('autoUpdateFrequency', localSettings.autoUpdateFrequency)"
                />
              </div>
            </div>

            <!-- 每批次更新楼层数 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                每批次更新楼层数
                <span class="hint">单次更新处理的最大楼层数</span>
              </div>
              <div class="acu-settings-control">
                <input
                  v-model.number="localSettings.updateBatchSize"
                  type="number"
                  class="acu-config-input"
                  min="1"
                  max="50"
                  @change="handleSettingChange('updateBatchSize', localSettings.updateBatchSize)"
                />
              </div>
            </div>

            <!-- 保留X层楼不更新 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                保留X层楼不更新
                <span class="hint">最近的几层楼跳过更新</span>
              </div>
              <div class="acu-settings-control">
                <input
                  v-model.number="localSettings.skipUpdateFloors"
                  type="number"
                  class="acu-config-input"
                  min="0"
                  max="20"
                  @change="handleSettingChange('skipUpdateFloors', localSettings.skipUpdateFloors)"
                />
              </div>
            </div>
          </div>

          <!-- 执行按钮 -->
          <div class="acu-update-action-group">
            <button
              class="acu-update-btn"
              :class="{ 'is-updating': isUpdating }"
              :disabled="isUpdating"
              @click="handleExecuteUpdate"
            >
              <i v-if="isUpdating" class="fas fa-spinner fa-spin"></i>
              <i v-else class="fas fa-hand-sparkles"></i>
              <span>{{ isUpdating ? '正在更新...' : '立即执行手动更新' }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ManualUpdateDialog - 手动更新配置弹窗
 *
 * 功能说明:
 * - 显示和编辑4个核心配置项
 * - 配置修改后实时保存
 * - 提供手动更新执行按钮
 */

import { onClickOutside } from '@vueuse/core';
import { reactive, ref, watch } from 'vue';
import { useDbSettings, type DbSettings } from '../../composables/useDbSettings';
import { toast } from '../../composables/useToast';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

// ============================================================
// Refs & State
// ============================================================

const dialogRef = ref<HTMLElement>();
const isLoading = ref(true);
const isUpdating = ref(false);

// 本地配置副本
const localSettings = reactive<DbSettings>({
  autoUpdateThreshold: undefined,
  autoUpdateFrequency: undefined,
  updateBatchSize: undefined,
  skipUpdateFloors: undefined,
});

// ============================================================
// Composables
// ============================================================

const { settings, loadSettings, saveSettings, executeManualUpdate } = useDbSettings();

// ============================================================
// 生命周期 & 监听
// ============================================================

// 当弹窗打开时加载配置
watch(
  () => props.visible,
  async visible => {
    if (visible) {
      isLoading.value = true;
      try {
        await loadSettings();
        // 同步到本地状态
        Object.assign(localSettings, {
          autoUpdateThreshold: settings.value.autoUpdateThreshold,
          autoUpdateFrequency: settings.value.autoUpdateFrequency,
          updateBatchSize: settings.value.updateBatchSize,
          skipUpdateFloors: settings.value.skipUpdateFloors,
        });
      } catch (error) {
        console.error('[ACU] 加载配置失败:', error);
        toast.error('加载配置失败');
      } finally {
        isLoading.value = false;
      }
    }
  },
  { immediate: true },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleClose();
});

// ============================================================
// 事件处理
// ============================================================

/**
 * 关闭弹窗
 */
function handleClose() {
  emit('update:visible', false);
}

/**
 * 处理配置项变更（实时保存）
 */
async function handleSettingChange(key: keyof DbSettings, value: number | undefined) {
  if (value === undefined || isNaN(value)) return;

  try {
    await saveSettings({ [key]: value });
    console.info(`[ACU] 配置项 ${key} 已更新为:`, value);
  } catch (error) {
    console.error(`[ACU] 保存配置项 ${key} 失败:`, error);
    toast.error('保存配置失败');
  }
}

/**
 * 执行手动更新
 */
async function handleExecuteUpdate() {
  if (isUpdating.value) return;

  isUpdating.value = true;

  try {
    const success = await executeManualUpdate();

    if (success) {
      toast.success('手动更新已执行');
    } else {
      toast.warning('更新执行完成，请检查结果');
    }
  } catch (error) {
    console.error('[ACU] 手动更新执行失败:', error);
    toast.error('手动更新执行失败');
  } finally {
    isUpdating.value = false;
  }
}
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/dialogs.scss */
</style>
