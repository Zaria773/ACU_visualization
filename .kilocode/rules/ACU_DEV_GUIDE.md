# ACU 可视化表格开发规则

> **路径**: `src/可视化表格/`
> **技术栈**: Vue 3 + Pinia + VueUse + SCSS
> **架构**: 跨 iframe 脚本（iframe 运行逻辑，UI 渲染到父窗口）
> **调试**: 使用pnpm watch实时热重载监听，界面、脚本代码到酒馆网页的实时同步已经建立好了: 在代码变更后, 酒馆网页上将热重载新的脚本或界面代码, 因此你不需要刷新酒馆网页, 也不需要自己运行 `pnpm build` 来更新代码打包结果, 直接查看网页即可.



---

## 核心约束

### 1. 样式规则（最重要）
**禁止在 Vue 文件中使用 `<style>` 或 `<style scoped>`**，完全失效，因为：
- Vue 将样式注入到 iframe 的 `<head>`
- 实际 DOM 渲染在 `window.parent.document`（通过 Teleport 或 jQuery 挂载）
- 父窗口无法读取 iframe 中的样式定义
- 两个 document 不同，选择器无法匹配

**正确做法**：
1. **所有样式必须写在 `styles/` 目录下的 SCSS 文件中**
2. 组件样式 → `styles/components/*.scss`
3. 弹窗样式 → `styles/overlays/*.scss`
4. 系统会自动通过 `useParentStyleInjection` 将这些全局样式注入到父窗口

**Vue 其他功能正常**：响应式、组件化、模板语法、Pinia、VueUse 均不受影响。

---

### 2. 文件结构

> **架构评级**: ⭐⭐⭐⭐ (4/5)
>
> **2026-01-19 优化后**：
> - ✅ dialogs/ 目录按领域拆分为 common/graph/dashboard/tag-manager
> - ✅ 弹窗状态统一迁移到 useUIStore
> - ✅ App.vue 逻辑提取为独立 composables（渐进式集成）
> - ✅ 新增全局标签库系统 (useTagLibraryStore)
> - ⚠️ useGraphConfigStore 职责仍偏重（634行，后续可拆分）

```
src/可视化表格/
├── index.ts                 # 入口：等待 API → 挂载 Vue
├── App.vue                  # 根组件：组装所有子组件
├── types.ts                 # TypeScript 类型定义
│
├── components/              # Vue 单文件组件
│   ├── index.ts             # 统一导出
│   │
│   │  # 核心交互
│   ├── FloatingBall.vue     # 悬浮球：拖拽、吸附、点击展开
│   ├── MainPanel.vue        # 主面板：Header + 内容区
│   ├── TabBar.vue           # 标签栏：Tab 切换、拖拽排序
│   ├── ActionBar.vue        # 操作栏：刷新、保存等按钮
│   │
│   │  # 数据展示
│   ├── DataTable.vue        # 数据表：搜索、排序、分页、视图切换
│   ├── DataCard.vue         # 数据卡片：单行数据展示与编辑
│   ├── Dashboard.vue        # 仪表盘：聚合视图（主角/NPC/任务/物品）
│   ├── OptionsPanel.vue     # 选项面板：矩阵式选项展示
│   ├── RelationshipGraph.vue # 关系图：Cytoscape 可视化
│   │
│   │  # UI 辅助
│   ├── InlineEditor.vue     # 原地编辑器：textarea 编辑
│   ├── Badge.vue            # 徽章：值的样式化展示
│   ├── ContextMenu.vue      # 右键菜单
│   ├── Pagination.vue       # 分页器
│   ├── SearchBox.vue        # 搜索框
│   ├── Toast.vue            # 通知提示
│   ├── HiddenButtonsPopup.vue   # 隐藏按钮浮窗
│   └── TabsPopup.vue            # Tab 收纳浮窗
│   │
│   ├── dashboard/           # 仪表盘子组件
│   │   ├── index.ts
│   │   ├── DashboardWidget.vue      # 看板卡片组件
│   │   ├── EmbeddedOptionsPanel.vue # 嵌入式选项面板
│   │   ├── TableStatusBoard.vue     # 表格更新状态看板
│   │   └── InteractionTableWidget.vue # 交互表格组件
│   │
│   ├── dialogs/             # 弹窗组件 (按领域拆分)
│   │   ├── index.ts
│   │   │
│   │   ├── common/          # 通用弹窗
│   │   │   ├── SettingsDialog.vue       # 设置弹窗（主题/字体/布局/行为）
│   │   │   ├── InputFloorDialog.vue     # 输入楼层弹窗
│   │   │   ├── PurgeRangeDialog.vue     # 清除范围弹窗
│   │   │   ├── AdvancedPurgeDialog.vue  # 高级清除弹窗
│   │   │   ├── HistoryDialog.vue        # 历史记录弹窗
│   │   │   ├── ManualUpdateDialog.vue   # 手动更新弹窗
│   │   │   ├── IconSelectDialog.vue     # 图标选择弹窗
│   │   │   └── PresetSaveDialog.vue     # 预设保存弹窗
│   │   │
│   │   ├── dashboard/       # 仪表盘弹窗
│   │   │   ├── WidgetSettingsDialog.vue # 看板设置弹窗
│   │   │   ├── WidgetActionsDialog.vue  # 看板操作弹窗
│   │   │   └── RowEditDialog.vue        # 行编辑弹窗
│   │   │
│   │   ├── graph/           # 关系图弹窗
│   │   │   ├── GraphSettingsDialog.vue  # 关系图设置弹窗
│   │   │   ├── NodeConfigDialog.vue     # 节点配置弹窗
│   │   │   ├── NodeLabelDialog.vue      # 节点标签选择弹窗
│   │   │   ├── FactionSettingsDialog.vue # 势力设置弹窗
│   │   │   ├── AvatarManagerDialog.vue  # 头像管理弹窗
│   │   │   └── AvatarCropDialog.vue     # 头像裁剪弹窗
│   │   │
│   │   ├── tag-manager/     # 标签管理弹窗
│   │   │   ├── index.ts
│   │   │   ├── TagManagerDialog.vue     # 标签管理主弹窗
│   │   │   ├── TagCategoryTree.vue      # 分类目录树组件
│   │   │   ├── TagBadgeGrid.vue         # 标签网格组件
│   │   │   ├── TagEditDialog.vue        # 标签编辑弹窗
│   │   │   ├── TagImportDialog.vue      # 标签导入弹窗
│   │   │   ├── CategorySelectPopup.vue  # 分类选择弹窗（仪表盘用）
│   │   │   └── TagPreEditDialog.vue     # 标签预编辑弹窗
│   │   │
│   │   └── divination/      # 抽签系统
│   │       ├── index.ts
│   │       ├── types.ts                 # 卡面显示数据类型
│   │       ├── DivinationOverlay.vue    # 抽签主界面（全屏覆盖层）
│   │       ├── TarotCard.vue            # 塔罗牌容器（动态加载主题）
│   │       ├── PromptEditorDialog.vue   # 提示词编辑器
│   │       │
│   │       └── themes/                  # 🆕 卡面主题系统
│   │           ├── index.ts             # 主题注册表（getTheme/getAllThemes）
│   │           ├── types.ts             # 主题接口定义（CardTheme）
│   │           │
│   │           ├── wafuku/              # 和风御札主题
│   │           │   ├── index.ts
│   │           │   ├── CardFront.vue    # 牌面（素雅纸质风格）
│   │           │   ├── CardBack.vue     # 牌背
│   │           │   └── CornerOrnament.vue # 四角装饰
│   │           │
│   │           └── mystic/              # 🆕 神秘塔罗主题
│   │               ├── index.ts
│   │               ├── CardFront.vue    # 牌面（深蓝金边风格）
│   │               └── CardBack.vue     # 牌背
│   │
│   ├── settings/            # 设置面板子组件
│   │   ├── TabConfigPanel.vue       # Tab 配置面板
│   │   ├── NavButtonConfigPanel.vue # 导航按钮配置
│   │   ├── BallAppearancePanel.vue  # 悬浮球外观配置
│   │   ├── ThemePanel.vue           # 主题配置面板
│   │   │
│   │   └── divination/              # 🆕 抽签设置子组件
│   │       └── DivinationPanel.vue  # 抽签配置面板
│   │
│   └── ui/                  # 通用 UI 组件
│       ├── index.ts
│       ├── SortableList.vue # 可排序列表
│       └── SwitchList.vue   # [新增] 开关列表
│
├── composables/             # 组合式函数（逻辑剥离层）
│   ├── index.ts             # 统一导出 + 迁移说明
│   │
│   │  # 跨 iframe 基础设施
│   ├── useParentStyleInjection.ts  # 样式注入到父窗口
│   ├── useTouchScrollFix.ts        # 触摸滚动穿透修复
│   ├── useVueUseIntegration.ts     # VueUse 封装（拖拽/事件/防抖等）
│   │
│   │  # 移动端适配
│   ├── useMobileGesturesNew.ts     # 移动端手势系统
│   │
│   │  # 核心业务逻辑
│   ├── useCoreActions.ts           # 核心操作（插入/删除/复制行）
│   ├── useDataPersistence.ts       # 数据保存到数据库
│   ├── useDbSettings.ts            # 数据库配置管理
│   ├── useApiCallbacks.ts          # API 回调管理
│   │
│   │  # 数据增强
│   ├── useTableIntegrityCheck.ts   # 表格完整性检测
│   ├── useRowHistory.ts            # 行历史记录（IndexedDB）
│   ├── useIndexedDB.ts             # IndexedDB 底层操作
│   ├── useSwipeEnhancement.ts      # Swipe 增强功能
│   ├── useUpdatePresets.ts         # 更新预设管理
│   ├── useCellLock.ts              # 单元格锁定管理
│   ├── useTableUpdateStatus.ts     # 表格更新状态（仪表盘看板）
│   │
│   │  # 媒体资源管理
│   ├── useAvatarManager.ts         # 头像管理（IndexedDB 存储）
│   ├── useBackgroundStorage.ts     # 背景图片存储（IndexedDB）
│   │
│   │  # UI 辅助
│   ├── useToast.ts                 # Toast 通知
│   │
│   │  # App.vue 逻辑提取（渐进式集成）
│   ├── useAppDataActions.ts        # 数据操作（加载/保存/撤销）
│   ├── useAppNavigation.ts         # 导航操作（Tab切换/高度拖拽）
│   ├── useAppContextMenu.ts        # 右键菜单操作
│   └── useRelationshipData.ts      # 关系图数据计算
│   │
│   │  # 抽签与交互
│   ├── useDraw.ts                  # 抽签逻辑（运势权重计算）
│   ├── useHiddenPrompt.ts          # 隐藏提示词
│   ├── usePromptBuild.ts           # 提示词构建
│   ├── useWordPool.ts              # 词池管理（从最新行抽词）
│   └── useInteractionImporter.ts   # 交互表格导入
│
├── stores/                  # Pinia 状态管理
│   ├── index.ts
│   ├── useConfigStore.ts    # 配置状态：主题、字体、布局偏好
│   ├── useDataStore.ts      # 数据状态：表格数据、diff、pendingDeletes
│   ├── useUIStore.ts        # UI 状态：折叠、activeTab、弹窗可见性
│   ├── useDashboardStore.ts # 仪表盘配置：看板列表、布局
│   ├── useGraphConfigStore.ts # 关系图配置：节点/边/图例/背景
│   ├── useTagLibraryStore.ts # 全局标签库：分类树、标签、导入导出
│   ├── useThemeStore.ts     # 主题美化：预设、高亮色、自定义CSS
│   └── useDivinationStore.ts # 🆕 抽签配置：维度、词库、主题ID、预设
│
├── styles/                  # SCSS 样式文件（Design Tokens 架构）
│   ├── index.scss           # 入口：导入所有子模块
│   ├── variables.scss       # CSS 变量定义（Design Tokens）
│   ├── base.scss            # 基础样式
│   ├── animations.scss      # 动画定义
│   ├── fonts.scss           # 字体加载
│   │
│   ├── components/          # 组件样式（与 components/ 一一对应）
│   │   ├── badges.scss
│   │   ├── buttons.scss
│   │   ├── dashboard.scss
│   │   ├── data-card.scss
│   │   ├── data-table.scss
│   │   ├── floating-ball.scss
│   │   ├── inputs.scss
│   │   ├── navigation.scss
│   │   ├── options-panel.scss
│   │   ├── pagination.scss
│   │   ├── relationship-graph.scss
│   │   ├── settings-panel.scss
│   │   ├── sortable-list.scss
│   │   ├── table-selector.scss
│   │   ├── tabs.scss
│   │   ├── switch.scss
│   │   ├── switch-list.scss
│   │   └── interaction-widget.scss # [新增] 交互组件样式
│   │
│   ├── layouts/             # 布局样式
│   │   ├── container.scss
│   │   ├── panel.scss
│   │   ├── responsive.scss
│   │   └── settings.scss
│   │
│   ├── overlays/            # 覆盖层样式
│   │   ├── context-menu.scss
│   │   ├── dialogs.scss
│   │   ├── overlays.scss
│   │   ├── quick-view.scss
│   │   ├── avatar-dialogs.scss
│   │   ├── dashboard-dialogs.scss
│   │   ├── tag-manager.scss
│   │   ├── dialogs-ball.scss
│   │   ├── dialogs-font.scss
│   │   ├── dialogs-graph.scss
│   │   ├── dialogs-history.scss
│   │   ├── dialogs-preset.scss
│   │   ├── dialogs-purge.scss
│   │   ├── dialogs-responsive.scss
│   │   ├── dialogs-tag.scss
│   │   ├── dialogs-theme.scss
│   │   ├── dialogs-update.scss
│   │   ├── dialogs-icon.scss
│   │   ├── dialogs-pre-edit.scss
│   │   ├── dialogs-prompt-editor.scss
│   │   ├── divination.scss              # 抽签系统公共样式
│   │   │
│   │   └── divination-themes/           # 🆕 卡面主题样式
│   │       ├── _index.scss              # 统一导入
│   │       ├── _wafuku.scss             # 和风主题（现有样式重构）
│   │       └── _mystic.scss             # 神秘塔罗主题
│   │
│   └── utilities/           # 工具样式
│       ├── feedback.scss
│       └── helpers.scss
│
└── utils/                   # 纯函数工具
    ├── index.ts             # getCore, getTableData 等
    ├── relationshipColors.ts
    ├── relationshipParser.ts
    └── imageUpload.ts       # 图片上传工具
```

#### 架构设计说明

**分层策略**（传统技术分层，当前规模适用）：
| 层级 | 职责 | 依赖规则 |
|------|------|---------|
| `components/` | UI 渲染 | 可调用 composables、stores |
| `composables/` | 可复用逻辑 | 可调用 stores、utils |
| `stores/` | 状态管理 | 可调用 utils |
| `utils/` | 纯函数 | 无依赖 |
| `styles/` | 样式 | 独立于代码 |

**逻辑剥离原则**：
- Vue 组件只负责模板和基础交互
- 复杂逻辑（保存、手势、历史）全部抽到 composables
- 共享状态统一由 Pinia stores 管理

**样式隔离**：
- 所有样式在 `styles/` 目录，通过 `useParentStyleInjection` 注入父窗口
- CSS 变量作为 Design Tokens，支持主题切换


---

### 3. UI 样式规范（必读）

**核心原则**：
1.**风格统一**：所有新增 UI 必须使用项目已定义的 CSS 变量和现有组件样式，禁止硬编码颜色/字体/尺寸。关于新增的开关、行布局等必须参照设置面板ui的行设计。颜色使用主题样式。
2.**控件在右**：没有特殊说明的话所有输入框、选择器、拖动条、按钮等等控件全部在行右侧


#### 3.1 必须使用的 CSS 变量

所有颜色、背景、边框必须使用 `variables.scss` 中定义的变量：

| 用途 | 变量名 | 说明 |
|------|--------|------|
| **背景** | `--acu-bg-panel` | 面板/弹窗背景 |
| | `--acu-card-bg` | 卡片背景 |
| | `--acu-table-head` | 表头/分组背景 |
| | `--acu-table-hover` | 悬浮状态背景 |
| **文本** | `--acu-text-main` | 主要文本 |
| | `--acu-text-sub` | 次要文本/提示 |
| **边框** | `--acu-border` | 通用边框 |
| **按钮** | `--acu-btn-bg` | 按钮默认背景 |
| | `--acu-btn-hover` | 按钮悬浮背景 |
| **强调色** | `--acu-title-color` | 标题/主题色 |
| | `--acu-title-color-bg` | 主题色浅背景 |
| | `--acu-highlight-manual` | 手动修改高亮 |
| | `--acu-highlight-ai` | ai填表高亮 |

#### 3.2 禁止的写法

```scss
// ❌ 禁止：硬编码颜色
color: #333;
background: white;
border: 1px solid #ccc;

// ✅ 正确：使用变量
color: var(--acu-text-main);
background: var(--acu-card-bg);
border: 1px solid var(--acu-border);
```

#### 3.3 样式复用原则（核心）

**复用 = 在 Vue 模板中直接使用现有 CSS 类，而非复制 SCSS 代码**

已有通用样式定义在 `styles/` 目录的 SCSS 文件中，完整列表见 [`STYLE_INDEX.md`](../../src/可视化表格/styles/STYLE_INDEX.md)。开发时：

1. **查阅 STYLE_INDEX.md** 找到需要的样式类
2. **在 Vue template 中直接写类名**（这些类已全局可用）
3. **禁止复制 SCSS** 到新文件中"造轮子"

**示例**：创建一个设置行

```vue
<!-- ✅ 正确：直接在 template 中使用现有类 -->
<template>
  <div class="acu-settings-row">
    <div class="acu-settings-label">
      标签名
      <span class="hint">提示</span>
    </div>
    <div class="acu-settings-control">
      <select class="acu-select">...</select>
    </div>
  </div>
</template>

<!-- 不需要写任何 SCSS！这些类已在 layouts/settings.scss 和 components/inputs.scss 中定义 -->
```

```scss
// ❌ 错误：把现有样式复制到新文件
.my-custom-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;  // 这是在重复 .acu-settings-row
}
```

**常用可复用类**（完整列表见 STYLE_INDEX.md）：

| 组件类型 | 直接使用的类名 | 定义位置 |
|----------|---------------|----------|
| **弹窗结构** | `.acu-modal-container`, `.acu-modal`, `.acu-modal-header`, `.acu-modal-body` | `overlays/dialogs.scss` |
| **设置布局** | `.acu-settings-section`, `.acu-settings-title`, `.acu-settings-group`, `.acu-settings-row`, `.acu-settings-label`, `.acu-settings-control` | `layouts/settings.scss` |
| **导航行** | `.acu-nav-row` | `layouts/settings.scss` |
| **按钮** | `.acu-modal-btn`, `.acu-action-btn`, `.acu-tool-btn`, `.acu-icon-btn` | `components/buttons.scss` |
| **表单控件** | `.acu-select`, `.acu-switch`, `input[type="color"]` | `components/inputs.scss`, `components/switch.scss` |
| **提示** | `.hint`（在 `.acu-settings-label` 内）, `.acu-empty-hint` | `layouts/settings.scss` |

#### 3.4 设计规范速查

| 属性 | 规范值 |
|------|--------|
| **圆角** | 小: 6px, 中: 12px, 大: 16px |
| **间距** | 紧凑: 8px, 标准: 12px, 宽松: 16px |
| **字号** | 标题: 16px, 正文: 13px, 提示: 11-12px |
| **过渡** | 快: 0.15s, 标准: 0.2s, 慢: 0.3s |
| **阴影** | 小: `0 2px 8px rgba(0,0,0,0.1)`, 大: `0 15px 50px rgba(0,0,0,0.3)` |

#### 3.5 新增弹窗/面板的标准模板

**重点：直接使用现有类，只在必要时添加极少量定制样式**

```vue
<template>
  <!-- 所有类名都是现有的，直接用 -->
  <div class="acu-modal-container" @click.self="handleClose">
    <div class="acu-modal acu-xxx-modal">
      <!-- 头部：使用现有 .acu-modal-header -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">标题</span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容：使用现有 .acu-modal-body + 设置布局类 -->
      <div class="acu-modal-body">
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-xxx"></i>
            分组标题
          </div>
          <div class="acu-settings-group">
            <!-- 设置行：全部使用现有类 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                标签
                <span class="hint">提示文字</span>
              </div>
              <div class="acu-settings-control">
                <!-- 控件也用现有类：.acu-select, .acu-switch 等 -->
                <select class="acu-select">...</select>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮：使用现有按钮类 -->
        <div class="acu-modal-footer">
          <button class="acu-modal-btn secondary" @click.stop="handleClose">取消</button>
          <button class="acu-modal-btn primary" @click.stop="handleConfirm">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

**新弹窗只需添加的 SCSS**：

```scss
// styles/overlays/dialogs-xxx.scss（或在现有文件中添加）
// 只需设置尺寸，其他全部复用通用样式
.acu-xxx-modal {
  max-width: 400px;  // 唯一需要定制的：弹窗宽度
}
```

**禁止**：为弹窗的头部、按钮、设置行等重新写样式
#### 3.6 全局弹窗开发规范（重要）

**核心原则**：所有弹窗都必须在 `App.vue` 中统一渲染，通过 `useUIStore` 管理状态。**禁止在子组件中使用嵌套弹窗或 Teleport**。

---

##### 3.6.1 新增弹窗的完整步骤

**步骤 1：在 useUIStore.ts 中定义弹窗状态**

```typescript
// 1. 定义弹窗 Props 类型
export interface MyDialogProps {
  title: string;
  data: SomeData | null;
}

// 2. 在 store 中添加状态
const myDialog = reactive<{
  visible: boolean;
  props: MyDialogProps;
}>({
  visible: false,
  props: {
    title: '',
    data: null,
  },
});

// 3. 添加打开/关闭方法
function openMyDialog(props: MyDialogProps): void {
  myDialog.props = { ...props };
  myDialog.visible = true;
}

function closeMyDialog(): void {
  myDialog.visible = false;
}

// 4. 在 return 中导出
return {
  // ...其他
  myDialog,
  openMyDialog,
  closeMyDialog,
};
```

**步骤 2：在 App.vue 中添加弹窗组件**

```vue
<template>
  <!-- 其他内容... -->

  <!-- 新弹窗 -->
  <MyDialog
    v-model:visible="uiStore.myDialog.visible"
    :title="uiStore.myDialog.props.title"
    :data="uiStore.myDialog.props.data"
    @close="uiStore.closeMyDialog"
  />
</template>

<script setup lang="ts">
import { MyDialog } from './components/dialogs';
</script>
```

**步骤 3：在子组件中调用弹窗**

```typescript
// 在任意组件中
const uiStore = useUIStore();

function handleOpenDialog() {
  uiStore.openMyDialog({
    title: '标题',
    data: someData,
  });
}
```

---

##### 3.6.2 弹窗样式规范

弹窗样式写在 `styles/overlays/dialogs.scss` 中，所有弹窗居中显示：

```scss
// 标准弹窗容器样式
.acu-modal-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;       // 居中
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  padding: 20px;
  box-sizing: border-box;
}

.acu-modal {
  background: var(--acu-bg-panel);
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
```

---

##### 3.6.3 禁止的做法

```vue
<!-- ❌ 禁止：在子组件中直接渲染弹窗 -->
<template>
  <div class="my-component">
    <MyDialog v-if="showDialog" />  <!-- 错误！ -->
  </div>
</template>

<!-- ❌ 禁止：使用 Teleport 字符串选择器（只搜索 iframe 内部） -->
<template>
  <Teleport to="body">
    <MyDialog />  <!-- 错误！to="body" 只搜索 iframe 的 body -->
  </Teleport>
</template>

<!-- ❌ 禁止：在弹窗内部再打开另一个弹窗组件 -->
<template>
  <div class="acu-modal">
    <NestedDialog v-if="showNested" />  <!-- 错误！ -->
  </div>
</template>
```

---

##### 3.6.4 跨 iframe Teleport 正确写法（如确实需要）

**问题**：本项目 Vue 运行在 iframe 内，但 UI 渲染到父窗口。`<Teleport to="body">` 传入字符串时，Vue 会在**当前 document（即 iframe）**中搜索 `body`，而不是父窗口。

**解决方案**：传入实际 DOM 对象而非字符串选择器。

```vue
<script setup lang="ts">
// ✅ 正确：获取父窗口 body 的 DOM 对象
const parentBody = window.parent.document.body;
</script>

<template>
  <!-- ✅ 正确：使用 :to 绑定 DOM 对象 -->
  <Teleport :to="parentBody">
    <div class="my-overlay">...</div>
  </Teleport>
</template>
```

**注意事项**：
- 必须使用 `:to="parentBody"`（v-bind），不能用 `to="parentBody"`（字符串）
- Teleport 内容脱离 `.acu-wrapper`，**不会继承主题类**
- 需要手动添加主题类包裹：

```vue
<Teleport :to="parentBody">
  <div :class="`acu-theme-${configStore.config.theme}`">
    <MyDialog />
  </div>
</Teleport>
```

**推荐做法**：对于弹窗，优先使用全局弹窗管理（3.6.1），而非 Teleport。Teleport 适合非弹窗场景，如向父窗口插入悬浮工具栏。

---

##### 3.6.5 弹窗间切换

如需从一个弹窗切换到另一个弹窗，在 store 中添加切换方法：

```typescript
function switchFromDialogAToDialogB(): void {
  // 复制需要的参数
  dialogB.props = {
    ...dialogA.props,
    // 额外参数
  };
  // 关闭 A，打开 B
  dialogA.visible = false;
  dialogB.visible = true;
}
```

---

##### 3.6.6 现有全局弹窗列表

| 弹窗 | Store 状态 | 用途 |
|------|------------|------|
| SettingsDialog | `showSettingsDialog` (ref) | 设置 |
| InputFloorDialog | `showInputFloorDialog` (ref) | 输入楼层 |
| PurgeRangeDialog | `showPurgeRangeDialog` (ref) | 清除范围 |
| ManualUpdateDialog | `showManualUpdateDialog` (ref) | 手动更新 |
| HistoryDialog | `showHistoryDialog` (ref) | 历史记录 (DataTable) |
| RowEditDialog | `uiStore.rowEditDialog` | 行编辑 (Dashboard) |
| HistoryDialog | `uiStore.dashboardHistoryDialog` | 历史记录 (Dashboard) |

#### 3.7 响应式布局切换
使用 CSS @media (max-width: 768px) 媒体查询来实现响应式布局切换，不用v-if
#### 3.8 按钮事件处理（重要）

**问题**：弹窗内的按钮点击事件可能冒泡到 Cytoscape 等 Canvas 组件，导致意外行为（如界面变成球形）。

**解决方案**：所有弹窗、覆盖层内的按钮必须使用 `@click.stop` 阻止事件冒泡：

```vue
<!-- ✅ 正确：使用 .stop 阻止冒泡 -->
<button @click.stop="handleClose">关闭</button>
<button @click.stop="handleConfirm">确定</button>

<!-- ❌ 错误：没有阻止冒泡 -->
<button @click="handleClose">关闭</button>
```

**适用场景**：
- 弹窗/对话框中的所有按钮
- 覆盖层中的交互元素
- 与 Canvas/WebGL 组件共存的 UI

#### 3.9 检查清单

新增 UI 前请确认：
- [ ] **查阅了 STYLE_INDEX.md**，确认没有可复用的现有类
- [ ] **Vue template 中直接使用现有类名**（如 `.acu-settings-row`, `.acu-modal-btn`）
- [ ] **没有复制 SCSS 代码创建重复样式**
- [ ] 只有特定于该组件的样式才写新 SCSS（如弹窗宽度 `max-width`）
- [ ] 所有颜色使用 `var(--acu-xxx)` 变量
- [ ] 移动端适配
- [ ] 支持主题切换（不同 `.acu-theme-xxx` 下样式正确，主题 class 是在 .acu-wrapper 容器）
- [ ] 弹窗按钮使用 `@click.stop` 阻止冒泡
- [ ] **弹窗在 App.vue 中渲染，通过 useUIStore 管理状态**

---


### 4. 开发规范

1. **新增组件时**：样式写在 `styles/` 目录，不要写 `<style scoped>`
2. **使用 VueUse**：优先使用 `useVueUseIntegration.ts` 中封装的函数，如 `useDraggableWithSnap`（支持跨 iframe 拖拽）
3. **状态管理**：通过 Pinia stores 管理，避免组件间直接传递复杂状态
4. **状态初始化必须有默认值**：任何控制 UI 显示的函数（如 `openPanel()`）必须确保依赖的状态有值。例如 `isPanelVisible` 依赖 `activeTab !== null`，则 `openPanel()` 必须确保 `activeTab` 有值

---



### 5. 层级与 ID 规范

1. **Z-Index 策略**：悬浮球 (9999) < 弹窗 (10000) < 右键菜单 (10001)<toast
2. **排序列表**：使用稳定 ID（如 `tableId`、`tabId`），不要依赖数组索引


---

## 待办功能

### P2 - 长期
- [ ] 仪表盘自由配置

---

## 6. 仪表盘组件开发指引 (Dashboard Widget Guide)

> **目的**：确保所有仪表盘子组件 (DashboardWidget) 的行为、样式和交互一致。

### 6.1 必须实现的 Props

每个 Widget 组件必须接收以下 Props：

```typescript
interface Props {
  // 1. 基础配置 (必须)
  config: DashboardWidgetConfig;

  // 2. 编辑状态 (必须) - 控制拖拽、Resize 按钮显示
  isEditing: boolean;

  // 3. 数据 (可选) - 依赖数据的组件需要
  tableData?: ProcessedTable | null;

  // 4. 高亮支持 (可选) - 支持 AI 更新高亮
  aiDiffMap?: Set<string>;

  // 5. 搜索支持 (可选) - 支持全局搜索过滤
  searchTerm?: string;
}
```

### 6.2 必须实现的 Emits

组件必须向上传递以下事件，由父组件 (`Dashboard.vue`) 统一处理：

```typescript
const emit = defineEmits<{
  // 1. 基础操作
  remove: [widgetId: string];
  resize: [widgetId: string, colSpan: 1 | 2];
  action: [actionId: WidgetActionId, tableId: string];

  // 2. 拖拽支持 (必须实现)
  'drag-start': [widgetId: string];
  'drag-end': [];
  drop: [widgetId: string];

  // 3. 数据交互 (如有)
  navigate: [tableId: string];
  'row-click': [tableId: string, row: TableRow];
  'row-edit': [tableId: string, row: TableRow];
}>();
```

### 6.3 根元素绑定规范 (易错点)

根 `div` **必须** 绑定以下 Class 和属性，否则会导致布局错乱或交互失效：

```vue
<template>
  <div
    class="acu-dash-widget" <!-- 基础类 -->
    :class="{
      'acu-dash-widget-wide': config.colSpan === 2,  <!-- 关键：控制单双栏宽度 -->
      'acu-dash-widget-editing': isEditing,          <!-- 关键：编辑模式样式 -->
      'acu-highlight-ai-table': hasAiUpdate && !searchTerm, <!-- 可选：AI 高亮 -->
    }"
    :draggable="isEditing" <!-- 关键：只在编辑模式可拖拽 -->
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @dragover.prevent      <!-- 关键：允许 Drop -->
    @drop="handleDrop"
  >
    <!-- 内容 -->
  </div>
</template>
```

### 6.4 必须包含的编辑控件

在 `v-if="isEditing"` 块中，必须包含以下三个按钮：

1.  **移除按钮** (`.acu-widget-remove`)
2.  **配置按钮** (`.acu-widget-config`)
3.  **Resize 手柄** (`.acu-widget-resize`) - 需绑定 `@mousedown.stop` 和 `@touchstart.stop`

```vue
<template v-if="isEditing">
  <button class="acu-widget-remove" @click.stop="emit('remove', config.id)">...</button>
  <button class="acu-widget-config" @click.stop="handleConfigActions">...</button>
  <div class="acu-widget-resize" @mousedown.stop="startResize" @touchstart.stop="startResize">...</div>
</template>
```

### 6.5 交互细节 CheckList

- [ ] **阻止冒泡**：所有内部按钮点击必须使用 `@click.stop`，防止触发展开/折叠。
- [ ] **拖拽保护**：`startResize` 等操作必须调用 `e.preventDefault()` 防止触发组件拖拽。
- [ ] **折叠状态**：进入编辑模式时应自动折叠 (`isCollapsed = true`)，退出时恢复。
- [ ] **空状态**：当数据为空时，显示标准的 `.acu-dash-empty` 提示。
- [ ] **AI 高亮**：如果组件展示数据，必须支持 `acu-highlight-ai` 类。
