<template>
  <div class="acu-settings-section">
    <div class="acu-settings-title">
      <i class="fas fa-star"></i>
      抽签系统设置
    </div>
    <!-- 基础设置 -->
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
    </div>

    <!-- 外观设置 -->
    <div class="acu-settings-title" style="margin-top: 16px">
      <i class="fas fa-palette"></i>
      外观与行为
    </div>
    <div class="acu-settings-group">
      <!-- 卡面主题 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          卡面主题
          <span class="hint">选择塔罗牌的视觉风格</span>
        </div>
        <div class="acu-settings-control">
          <select v-model="config.themeId" class="acu-select">
            <option v-for="theme in themeList" :key="theme.id" :value="theme.id">
              {{ theme.name }}
            </option>
          </select>
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

      <!-- 偷看模式 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          偷看模式
          <span class="hint">模糊显示运势和内容</span>
        </div>
        <div class="acu-settings-control">
          <button
            class="acu-switch"
            :class="{ active: config.peepMode }"
            @click="config.peepMode = !config.peepMode"
          ></button>
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
            <input v-model="config.cardBackImage" type="text" class="acu-settings-input" placeholder="输入图片 URL" />

            <!-- 上传按钮 -->
            <button class="acu-tool-btn" title="上传图片" @click="triggerUpload">
              <i class="fas fa-upload"></i>
            </button>

            <!-- 隐藏的文件输入 -->
            <input ref="fileInput" type="file" accept="image/*" class="acu-hidden-input" @change="handleFileUpload" />
          </div>
        </div>
      </div>
    </div>

    <!-- 抽词设置 -->
    <div class="acu-settings-section" data-section="word-drawing">
      <div class="acu-settings-title" style="margin-top: 16px">
        <i class="fas fa-font"></i>
        抽词设置
      </div>
      <div class="acu-settings-group">
        <!-- 表格随机词 -->
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            表格随机词
            <span class="hint">从含"随机"的表格抽词</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: config.enableTableWords }"
              @click="config.enableTableWords = !config.enableTableWords"
            ></button>
          </div>
        </div>

        <!-- 世界书词库 -->
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            世界书词库
            <span class="hint">从同步的世界书抽词</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: config.enableWordPool }"
              @click="config.enableWordPool = !config.enableWordPool"
            ></button>
          </div>
        </div>

        <!-- 抽词模式（任一开启时显示） -->
        <template v-if="config.enableTableWords || config.enableWordPool">
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              抽词模式
              <span class="hint">{{ modeHintText }}</span>
            </div>
            <div class="acu-settings-control acu-mode-control">
              <select v-model="config.wordDrawMode" class="acu-select">
                <option value="perItem">每项抽 x 个</option>
                <option value="custom">自定义</option>
                <option value="mixed">混抽</option>
              </select>
              <!-- perItem 模式：拖动条在同一行 -->
              <template v-if="config.wordDrawMode === 'perItem'">
                <div class="acu-range-wrapper">
                  <input
                    v-model.number="config.wordsPerItem"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    class="acu-inline-range"
                  />
                  <span class="acu-range-value">{{ config.wordsPerItem }}</span>
                </div>
              </template>
            </div>
          </div>

          <!-- custom/mixed 模式：抽词总数（单独一行拖动条 1-20） -->
          <div v-if="config.wordDrawMode !== 'perItem'" class="acu-settings-row">
            <div class="acu-settings-label">
              抽词总数
              <span class="hint">最多抽取 {{ config.drawCount }} 个词</span>
            </div>
            <div class="acu-settings-control">
              <input v-model.number="config.drawCount" type="range" min="1" max="20" step="1" />
            </div>
          </div>

          <!-- 自动同步（仅当世界书词库开启时显示） -->
          <div v-if="config.enableWordPool" class="acu-settings-row">
            <div class="acu-settings-label">
              自动同步
              <span class="hint">表格变动时自动更新世界书</span>
            </div>
            <div class="acu-settings-control">
              <button
                class="acu-switch"
                :class="{ active: config.autoSync }"
                @click="config.autoSync = !config.autoSync"
              ></button>
            </div>
          </div>

          <!-- 词库管理入口 -->
          <div class="acu-settings-row acu-nav-row" @click="nav.navigateTo('divinationWordPool')">
            <div class="acu-settings-label">
              词库管理
              <span class="hint">配置每项的 limit 和开关</span>
            </div>
            <div class="acu-settings-control">
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, inject, ref } from 'vue';
import { useToast } from '../../../composables/useToast';
import { useDivinationStore } from '../../../stores/useDivinationStore';
import { getAllThemes } from '../../dialogs/divination/themes';

// 注入导航
const nav = inject<any>('settingsNavigation');

// Store
const store = useDivinationStore();
const { config } = storeToRefs(store) as any;
const { show } = useToast();

// 主题列表
const themeList = computed(() => getAllThemes());

// 抽词模式提示文本
const modeHintText = computed(() => {
  switch (config.value.wordDrawMode) {
    case 'perItem':
      return '每项固定抽取，不受总数限制';
    case 'custom':
      return '按 limit 控制，受总数限制';
    case 'mixed':
      return '所有开启项混合抽取';
    default:
      return '';
  }
});

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

