<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleCancel">
      <div ref="dialogRef" class="acu-modal acu-settings-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <!-- 返回按钮（仅在子面板时显示） -->
          <button v-if="panelHistory.length > 0" class="acu-modal-back" @click.stop="handleBack">
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
                <!-- 字体选择 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    显示字体
                    <span class="hint">选择界面字体</span>
                  </div>
                  <div class="acu-settings-control acu-font-control">
                    <select v-model="localConfig.fontFamily">
                      <option v-for="font in allFonts" :key="font.id" :value="font.id">
                        {{ font.name }}
                      </option>
                    </select>
                    <button class="acu-add-font-btn" title="添加自定义字体" @click.stop="showAddFontDialog = true">
                      <i class="fas fa-plus"></i>
                    </button>
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

            <!-- 界面配置入口（使用圆角容器）-->
            <div class="acu-settings-section">
              <div class="acu-settings-title">
                <i class="fas fa-columns"></i>
                界面配置
              </div>
              <div class="acu-settings-group">
                <!-- 主题美化与高亮配置入口 -->
                <div class="acu-settings-row acu-nav-row" @click="goToPanel('themeConfig')">
                  <div class="acu-settings-label">
                    主题美化与高亮配置
                    <span class="hint">自定义主题变量、高亮颜色、CSS</span>
                  </div>
                  <div class="acu-settings-control">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>

                <!-- 悬浮球外观配置入口 -->
                <div class="acu-settings-row acu-nav-row" @click="goToPanel('ballAppearance')">
                  <div class="acu-settings-label">
                    悬浮球外观
                    <span class="hint">自定义悬浮球样式和AI填表通知动画</span>
                  </div>
                  <div class="acu-settings-control">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>

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

                <!-- 抽签系统配置入口 -->
                <div class="acu-settings-row acu-nav-row" @click="goToPanel('divination')">
                  <div class="acu-settings-label">
                    抽签系统配置
                    <span class="hint">配置运势、维度和随机词库</span>
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

                <!-- 收纳Tab栏 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    收纳Tab栏
                    <span class="hint">将Tab栏收纳到导航按钮中</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.collapseTabBar }"
                      @click="localConfig.collapseTabBar = !localConfig.collapseTabBar"
                    ></button>
                  </div>
                </div>

                <!-- 移动端底部安全区（仅移动端显示） -->
                <div v-if="uiStore.isMobile" class="acu-settings-row">
                  <div class="acu-settings-label">
                    移动端底部安全区
                    <span class="hint">{{ localConfig.mobileSafeAreaBottom ?? 50 }}px</span>
                  </div>
                  <div class="acu-settings-control">
                    <input v-model.number="localConfig.mobileSafeAreaBottom" type="range" min="0" max="150" step="10" />
                  </div>
                </div>

                <!-- 锁定单元格入口 -->
                <div class="acu-settings-row acu-nav-row" @click="handleEnterLockMode">
                  <div class="acu-settings-label">
                    锁定单元格
                    <span class="hint">点击单元格，保护数据不被 AI 修改</span>
                  </div>
                  <div class="acu-settings-control">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>

                <!-- Swipe 时清除表格 -->
                <div class="acu-settings-row">
                  <div class="acu-settings-label">
                    Swipe 清除表格
                    <span class="hint">重 roll 时若最后一楼有表格数据则自动清除</span>
                  </div>
                  <div class="acu-settings-control">
                    <button
                      class="acu-switch"
                      :class="{ active: localConfig.clearTableOnSwipe }"
                      @click="localConfig.clearTableOnSwipe = !localConfig.clearTableOnSwipe"
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

          <!-- ============ 悬浮球外观配置面板 ============ -->
          <BallAppearancePanel v-else-if="currentPanel === 'ballAppearance'" />

          <!-- ============ 主题美化与高亮配置面板 ============ -->
          <ThemePanel v-else-if="currentPanel === 'themeConfig'" />

          <!-- ============ 抽签系统配置面板 ============ -->
          <DivinationPanel v-else-if="currentPanel === 'divination'" />

          <!-- ============ 维度管理面板 ============ -->
          <DimensionManagerPanel v-else-if="currentPanel === 'divinationDimensions'" />

          <!-- ============ 词库管理面板 ============ -->
          <WordPoolPanel v-else-if="currentPanel === 'divinationWordPool'" />
        </div>

        <!-- ============ 添加自定义字体弹窗（直接渲染，不使用 Teleport） ============ -->
        <Transition name="modal">
          <div v-if="showAddFontDialog" class="acu-font-dialog-overlay" @click.self="showAddFontDialog = false">
            <div class="acu-mini-dialog acu-add-font-dialog" @click.stop>
              <div class="acu-mini-dialog-header">
                <span>添加自定义字体</span>
                <button class="acu-icon-btn" @click.stop="showAddFontDialog = false">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div class="acu-mini-dialog-body">
                <div class="acu-font-form">
                  <div class="acu-form-row">
                    <label>字体名称</label>
                    <input v-model="newFontName" type="text" placeholder="例如：霞鹜文楷" />
                  </div>
                  <div class="acu-form-row">
                    <label>字体链接</label>
                    <input v-model="newFontUrl" type="text" placeholder="@import URL 或 CDN 链接" />
                  </div>
                </div>
              </div>
              <div class="acu-mini-dialog-footer">
                <button class="acu-modal-btn secondary" @click.stop="showAddFontDialog = false">取消</button>
                <button class="acu-modal-btn primary" :disabled="!canAddFont" @click.stop="handleAddFont">添加</button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- 底部留白适配移动端安全区 -->
        <div class="acu-bottom-spacer">—— ACU Visualizer 8.1.1 ——</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { computed, provide, reactive, ref, watch } from 'vue';
import { useCellLock } from '../../../composables';
import { useBallAppearanceStore, useConfigStore } from '../../../stores/useConfigStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { ACUConfig } from '../../../types';
import BallAppearancePanel from '../../settings/BallAppearancePanel.vue';
import NavButtonConfigPanel from '../../settings/NavButtonConfigPanel.vue';
import TabConfigPanel from '../../settings/TabConfigPanel.vue';
import ThemePanel from '../../settings/ThemePanel.vue';
import DimensionManagerPanel from '../../settings/divination/DimensionManagerPanel.vue';
import DivinationPanel from '../../settings/divination/DivinationPanel.vue';
import WordPoolPanel from '../../settings/divination/WordPoolPanel.vue';

// ============================================================
// 类型定义
// ============================================================

type PanelType = 'main' | 'tabConfig' | 'buttonConfig' | 'ballAppearance' | 'themeConfig' | string;

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
const ballStore = useBallAppearanceStore();
const uiStore = useUIStore();
const cellLock = useCellLock();

// 自定义字体弹窗状态
const showAddFontDialog = ref(false);
const newFontName = ref('');
const newFontUrl = ref('');

/** 当前显示的面板 */
const currentPanel = ref<PanelType>('main');
/** 面板历史栈 */
const panelHistory = ref<PanelType[]>([]);
/** 自定义标题映射 */
const customTitles = ref<Record<string, string>>({});

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
  // 优先使用自定义标题
  if (customTitles.value[currentPanel.value]) {
    return customTitles.value[currentPanel.value];
  }

  switch (currentPanel.value) {
    case 'tabConfig':
      return '表格展示选择';
    case 'buttonConfig':
      return '导航栏按钮配置';
    case 'ballAppearance':
      return '悬浮球外观';
    case 'themeConfig':
      return '主题美化与高亮配置';
    case 'divination':
      return '抽签系统配置';
    case 'divinationDimensions':
      return '维度管理';
    case 'divinationWordPool':
      return '随机词库管理';
    default:
      return '设置';
  }
});

// ============================================================
// 面板导航
// ============================================================

/** 导航到指定面板 */
const navigateTo = (panel: PanelType, title?: string) => {
  if (title) {
    customTitles.value[panel] = title;
  }
  panelHistory.value.push(currentPanel.value);
  currentPanel.value = panel;
};

/** 返回上一级 */
const handleBack = () => {
  const prevPanel = panelHistory.value.pop();
  if (prevPanel) {
    currentPanel.value = prevPanel;
  } else {
    currentPanel.value = 'main';
  }
};

/** 重置导航状态 */
const resetNavigation = () => {
  panelHistory.value = [];
  currentPanel.value = 'main';
  customTitles.value = {};
};

/** 跳转到指定面板 (兼容旧代码) */
const goToPanel = (panel: PanelType) => {
  navigateTo(panel);
};

// 提供给子组件使用
provide('settingsNavigation', {
  navigateTo,
  goBack: handleBack,
});

// ============================================================
// 锁定模式
// ============================================================

/** 进入锁定编辑模式 */
const handleEnterLockMode = () => {
  // 初始化临时锁定状态
  cellLock.initPendingLocks();
  // 设置锁定编辑模式
  uiStore.isLockEditMode = true;
  // 关闭设置弹窗
  emit('update:visible', false);
};

// 移除了 openDivinationSettings 函数，因为现在直接在 SettingsDialog 中导航

// ============================================================
// 生命周期 & 监听
// ============================================================

// 同步外部配置变化，并在打开时重置到主面板
watch(
  () => props.visible,
  visible => {
    if (visible) {
      Object.assign(localConfig, configStore.config);

      // 检查是否有指定的初始面板
      if (uiStore.initialSettingsPanel) {
        resetNavigation();
        navigateTo(uiStore.initialSettingsPanel);
        uiStore.initialSettingsPanel = null; // 重置
      } else {
        resetNavigation(); // 重置导航状态
      }
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

// ============================================================
// 高度切换功能
// ============================================================

// ============================================================
// 自定义字体功能
// ============================================================

/** 合并内置字体和自定义字体 */
const allFonts = computed(() => ballStore.allFonts);

/** 是否可以添加字体 */
const canAddFont = computed(() => {
  return newFontName.value.trim() && newFontUrl.value.trim();
});

/** 添加自定义字体 */
const handleAddFont = () => {
  if (!canAddFont.value) return;

  const fontName = newFontName.value.trim();
  // 使用字体名称作为 CSS font-family 值，加上通用 fallback
  const fontFamily = `'${fontName}', sans-serif`;

  ballStore.addFont({
    name: fontName,
    fontFamily: fontFamily,
    importUrl: newFontUrl.value.trim(),
  });

  // 清空表单并关闭弹窗
  newFontName.value = '';
  newFontUrl.value = '';
  showAddFontDialog.value = false;
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/dialogs.scss */
</style>
