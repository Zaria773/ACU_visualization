<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleCancel">
      <div ref="dialogRef" class="acu-modal acu-settings-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <!-- 返回按钮（仅在子面板时显示） -->
          <button v-if="currentPanel !== 'main'" class="acu-modal-back" @click.stop="goBack">
            <i class="fas fa-arrow-left"></i>
          </button>
          <span class="acu-modal-title">{{ panelTitle }}</span>
          <!-- 胶囊式完成按钮 -->
          <button class="acu-close-pill" @click.stop="handleClose">完成</button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <!-- ============ 主设置面板 ============ -->
          <template v-if="currentPanel === 'main'">
            <!-- 外观与布局（合并）-->
            <div class="acu-settings-section">
              <div class="acu-settings-title">
                <i class="fas fa-palette"></i>
                外观与布局
              </div>
              <div class="acu-settings-group">
                <!-- 主题选择 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    主题风格
                    <span class="hint">选择界面配色方案</span>
                  </div>
                  <div class="acu-settings-control">
                    <select v-model="localConfig.theme">
                      <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">
                        {{ theme.name }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- 字体选择 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    显示字体
                    <span class="hint">选择界面字体</span>
                  </div>
                  <div class="acu-settings-control">
                    <select v-model="localConfig.fontFamily">
                      <option v-for="font in FONTS" :key="font.id" :value="font.id">
                        {{ font.name }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- 布局模式 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    布局模式
                    <span class="hint">卡片排列方向</span>
                  </div>
                  <div class="acu-settings-control">
                    <select v-model="localConfig.layout">
                      <option value="vertical">纵向布局</option>
                      <option value="horizontal">横向布局</option>
                    </select>
                  </div>
                </div>

                <!-- 字体大小 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    字体大小
                    <span class="hint">{{ localConfig.fontSize }}px</span>
                  </div>
                  <div class="acu-settings-control">
                    <input v-model.number="localConfig.fontSize" type="range" min="12" max="18" step="1" />
                  </div>
                </div>

                <!-- 卡片宽度 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    卡片宽度
                    <span class="hint">{{ localConfig.cardWidth }}px</span>
                  </div>
                  <div class="acu-settings-control">
                    <input v-model.number="localConfig.cardWidth" type="range" min="200" max="400" step="10" />
                  </div>
                </div>

                <!-- 表格按钮列数 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    表格按钮列数
                    <span class="hint">{{
                      localConfig.gridColumns === 0 ? '自适应' : `${localConfig.gridColumns} 列`
                    }}</span>
                  </div>
                  <div class="acu-settings-control">
                    <input v-model.number="localConfig.gridColumns" type="range" min="0" max="6" step="1" />
                  </div>
                </div>

                <!-- 每页显示数 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    每页显示条数
                    <span class="hint">{{ localConfig.itemsPerPage }} 条</span>
                  </div>
                  <div class="acu-settings-control">
                    <input v-model.number="localConfig.itemsPerPage" type="range" min="10" max="100" step="10" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 高亮设置 -->
            <div class="acu-settings-section">
              <div class="acu-settings-title">
                <i class="fas fa-highlighter"></i>
                高亮
              </div>
              <div class="acu-settings-group">
                <!-- 高亮新内容 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    高亮变动内容
                    <span class="hint">突出显示有变化的数据</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.highlightNew }"
                      @click="localConfig.highlightNew = !localConfig.highlightNew"
                    ></button>
                  </div>
                </div>

                <!-- 手动修改高亮颜色 - 圆点选择器 -->
                <div v-if="localConfig.highlightNew" class="acu-settings-row acu-color-picker-row">
                  <div class="acu-settings-label">
                    手动修改高亮
                    <span class="hint">手动编辑内容的标记颜色</span>
                  </div>
                  <div class="acu-settings-control">
                    <div class="acu-color-row">
                      <div
                        v-for="(color, key) in HIGHLIGHT_COLORS"
                        :key="key"
                        class="acu-color-circle"
                        :class="{ selected: localConfig.highlightManualColor === key }"
                        :style="{ backgroundColor: color.main }"
                        :title="color.name"
                        @click="localConfig.highlightManualColor = key as string"
                      ></div>
                    </div>
                  </div>
                </div>

                <!-- AI填表高亮颜色 - 圆点选择器 -->
                <div v-if="localConfig.highlightNew" class="acu-settings-row acu-color-picker-row">
                  <div class="acu-settings-label">
                    AI填表高亮
                    <span class="hint">AI自动填写内容的标记颜色</span>
                  </div>
                  <div class="acu-settings-control">
                    <div class="acu-color-row">
                      <div
                        v-for="(color, key) in HIGHLIGHT_COLORS"
                        :key="key"
                        class="acu-color-circle"
                        :class="{ selected: localConfig.highlightAiColor === key }"
                        :style="{ backgroundColor: color.main }"
                        :title="color.name"
                        @click="localConfig.highlightAiColor = key as string"
                      ></div>
                    </div>
                  </div>
                </div>

                <!-- 自定义标题颜色 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    自定义标题颜色
                    <span class="hint">使用独立的标题颜色</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.customTitleColor }"
                      @click="localConfig.customTitleColor = !localConfig.customTitleColor"
                    ></button>
                  </div>
                </div>

                <!-- 标题颜色 - 圆点选择器（仅当启用自定义时显示） -->
                <div v-if="localConfig.customTitleColor" class="acu-settings-row acu-color-picker-row">
                  <div class="acu-settings-label">
                    标题颜色
                    <span class="hint">表格标题的颜色</span>
                  </div>
                  <div class="acu-settings-control">
                    <div class="acu-color-row">
                      <div
                        v-for="(color, key) in HIGHLIGHT_COLORS"
                        :key="key"
                        class="acu-color-circle"
                        :class="{ selected: localConfig.titleColor === key }"
                        :style="{ backgroundColor: color.main }"
                        :title="color.name"
                        @click="localConfig.titleColor = key as string"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 界面配置入口（使用圆角容器）-->
            <div class="acu-settings-section">
              <div class="acu-settings-title">
                <i class="fas fa-columns"></i>
                界面配置
              </div>
              <div class="acu-settings-group">
                <!-- 表格展示选择入口 -->
                <div class="acu-settings-row acu-nav-row" @click="goToPanel('tabConfig')">
                  <div class="acu-settings-label">
                    表格自定义配置
                    <span class="hint">选择要显示的表格及排序</span>
                  </div>
                  <div class="acu-settings-control">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>

                <!-- 导航栏按钮配置入口 -->
                <div class="acu-settings-row acu-nav-row" @click="goToPanel('buttonConfig')">
                  <div class="acu-settings-label">
                    导航栏按钮自定义配置
                    <span class="hint">自定义导航栏显示的按钮</span>
                  </div>
                  <div class="acu-settings-control">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>
              </div>
            </div>

            <!-- 行为设置 -->
            <div class="acu-settings-section">
              <div class="acu-settings-title">
                <i class="fas fa-sliders-h"></i>
                行为
              </div>
              <div class="acu-settings-group">
                <!-- 显示分页 (移除了仪表盘开关) -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    显示分页器
                    <span class="hint">表格底部分页控件</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.showPagination }"
                      @click="localConfig.showPagination = !localConfig.showPagination"
                    ></button>
                  </div>
                </div>

                <!-- 限制长文本 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    限制长文本
                    <span class="hint">超长内容自动截断</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.limitLongText }"
                      @click="localConfig.limitLongText = !localConfig.limitLongText"
                    ></button>
                  </div>
                </div>

                <!-- 锁定面板位置 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    锁定面板位置
                    <span class="hint">禁止拖动面板</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.lockPanel }"
                      @click="localConfig.lockPanel = !localConfig.lockPanel"
                    ></button>
                  </div>
                </div>

                <!-- 清除确认 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    清除操作确认
                    <span class="hint">删除数据前需确认</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.purgeConfirmation }"
                      @click="localConfig.purgeConfirmation = !localConfig.purgeConfirmation"
                    ></button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ============ Tab 配置面板 ============ -->
          <TabConfigPanel v-else-if="currentPanel === 'tabConfig'" />

          <!-- ============ 导航栏按钮配置面板 ============ -->
          <NavButtonConfigPanel v-else-if="currentPanel === 'buttonConfig'" />
        </div>

        <!-- 底部留白适配移动端安全区 -->
        <div class="acu-bottom-spacer">—— ACU Visualizer 7.0.9 ——</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { FONTS, HIGHLIGHT_COLORS, THEMES, useConfigStore } from '../../stores/useConfigStore';
import type { ACUConfig } from '../../types';
import NavButtonConfigPanel from '../settings/NavButtonConfigPanel.vue';
import TabConfigPanel from '../settings/TabConfigPanel.vue';

// ============================================================
// 类型定义
// ============================================================

type PanelType = 'main' | 'tabConfig' | 'buttonConfig';

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
const configStore = useConfigStore();

/** 当前显示的面板 */
const currentPanel = ref<PanelType>('main');

// 本地配置副本 - 自动保存
const localConfig = reactive<ACUConfig>({ ...configStore.config });

// 即时保存：监听配置变化自动保存到 store
watch(
  localConfig,
  newConfig => {
    configStore.updateConfig(newConfig);
  },
  { deep: true },
);

// ============================================================
// 计算属性
// ============================================================

/** 当前面板标题 */
const panelTitle = computed(() => {
  switch (currentPanel.value) {
    case 'tabConfig':
      return '表格展示选择';
    case 'buttonConfig':
      return '导航栏按钮配置';
    default:
      return '设置';
  }
});

/** 当前面板图标 */
const panelIcon = computed(() => {
  switch (currentPanel.value) {
    case 'tabConfig':
      return 'fas fa-table';
    case 'buttonConfig':
      return 'fas fa-ellipsis-h';
    default:
      return 'fas fa-cog';
  }
});

// ============================================================
// 面板导航
// ============================================================

/** 跳转到指定面板 */
const goToPanel = (panel: PanelType) => {
  currentPanel.value = panel;
};

/** 返回主面板 */
const goBack = () => {
  currentPanel.value = 'main';
};

// ============================================================
// 生命周期 & 监听
// ============================================================

// 同步外部配置变化，并在打开时重置到主面板
watch(
  () => props.visible,
  visible => {
    if (visible) {
      Object.assign(localConfig, configStore.config);
      currentPanel.value = 'main'; // 每次打开都回到主面板
    }
  },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleCancel();
});

// ============================================================
// 事件处理
// ============================================================

// 关闭弹窗（点击完成按钮）
const handleClose = () => {
  emit('update:visible', false);
};

// 取消（点击遮罩层）
const handleCancel = () => {
  emit('update:visible', false);
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/dialogs.scss */
</style>
