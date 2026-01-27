<template>
  <div class="acu-settings-section">
    <div class="acu-settings-title">
      <i class="fas fa-star"></i>
      抽签系统设置
    </div>
    <div class="acu-settings-group">
      <!-- 启用/禁用 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          启用抽签系统
          <span class="hint">开启后将在界面显示抽签入口</span>
        </div>
        <div class="acu-settings-control">
          <button
            class="acu-switch"
            :class="{ active: config.enabled }"
            @click="config.enabled = !config.enabled"
          ></button>
        </div>
      </div>

      <!-- 翻牌模式 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          翻牌模式
          <span class="hint">控制抽签时的动画表现</span>
        </div>
        <div class="acu-settings-control">
          <select v-model="config.flipMode" class="acu-select">
            <option value="auto">自动翻牌</option>
            <option value="manual">手动点击</option>
            <option value="skip">跳过动画</option>
          </select>
        </div>
      </div>

      <!-- 抽词数量 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          抽词数量
          <span class="hint">每次抽签生成的随机词数量: {{ config.drawCount }}</span>
        </div>
        <div class="acu-settings-control">
          <input v-model.number="config.drawCount" type="range" min="1" max="10" step="1" />
        </div>
      </div>

      <!-- 卡背图片 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          卡背图片
          <span class="hint">自定义塔罗牌背面图案</span>
        </div>
        <div class="acu-settings-control">
          <div class="acu-image-upload-container">
            <!-- URL 输入 -->
            <input
              v-model="config.cardBackImage"
              type="text"
              class="acu-settings-input"
              placeholder="输入图片 URL"
            />

            <!-- 上传按钮 -->
            <button class="acu-tool-btn" @click="triggerUpload" title="上传图片">
              <i class="fas fa-upload"></i>
            </button>

            <!-- 隐藏的文件输入 -->
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="acu-hidden-input"
              @change="handleFileUpload"
            />
          </div>
        </div>
      </div>

      <!-- 维度管理入口 -->
      <div class="acu-settings-row acu-nav-row" @click="nav.navigateTo('divinationDimensions')">
        <div class="acu-settings-label">
          维度管理
          <span class="hint">配置运势、扭曲度等维度</span>
        </div>
        <div class="acu-settings-control">
          <i class="fas fa-chevron-right"></i>
        </div>
      </div>

      <!-- 词库管理入口 -->
      <div class="acu-settings-row acu-nav-row" @click="nav.navigateTo('divinationWordPool')">
        <div class="acu-settings-label">
          词库管理
          <span class="hint">管理随机词条和世界书同步</span>
        </div>
        <div class="acu-settings-control">
          <i class="fas fa-chevron-right"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { inject, ref } from 'vue';
import { useToast } from '../../../composables/useToast';
import { useDivinationStore } from '../../../stores/useDivinationStore';

// 注入导航
const nav = inject<any>('settingsNavigation');

// Store
const store = useDivinationStore();
const { config } = storeToRefs(store) as any;
const { show } = useToast();

// 文件上传
const fileInput = ref<HTMLInputElement | null>(null);

const triggerUpload = () => {
  fileInput.value?.click();
};

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    try {
      await (store as any).uploadCardBack(input.files[0]);
      show('卡背图片上传成功', 'success');
    } catch (e) {
      show('上传失败', 'error');
    } finally {
      // 清空 input，允许重复上传同一文件
      input.value = '';
    }
  }
};
</script>

<style lang="scss">
/* 使用全局样式，不使用 scoped */
.acu-image-upload-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  flex-wrap: nowrap !important; /* 强制不换行 */

  .acu-settings-input {
    flex: 1;
    min-width: 50px; /* 允许缩小但保留最小宽度 */
    width: 0; /* 关键：配合 flex: 1 确保能缩小 */
  }

  /* 移动端适配 */
  @media (max-width: 600px) {
    gap: 4px;

    .acu-settings-input {
      font-size: 12px !important;
      padding: 6px 8px !important;
    }

    .acu-tool-btn {
      padding: 6px 8px;
    }
  }
}

.acu-hidden-input {
  display: none;
}
</style>
