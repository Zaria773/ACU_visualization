# ACU 可视化表格 - 样式索引

> **目的**：统一管理可复用的通用样式类，避免重复定义，便于开发时快速查找。
> **原则**：新增 UI 前先查阅此文档，优先使用已有样式。

---

## 📁 文件结构

```
styles/
├── index.scss           # 入口，汇总导入所有模块
├── variables.scss       # CSS 变量（Design Tokens）
├── base.scss            # 基础重置样式
├── animations.scss      # 动画定义
├── fonts.scss           # 字体加载
│
├── layouts/             # 布局样式
│   ├── container.scss   # 容器布局
│   ├── panel.scss       # 面板布局
│   ├── responsive.scss  # 响应式断点
│   └── settings.scss    # ⭐ 设置面板通用布局
│
├── components/          # 组件样式
│   ├── buttons.scss     # 按钮
│   ├── inputs.scss      # ⭐ 输入控件（含 select、color、textarea）
│   ├── switch.scss      # ⭐ 开关控件
│   ├── switch-list.scss # ⭐ 开关列表
│   ├── badges.scss      # 徽章
│   ├── tabs.scss        # 标签页
│   ├── pagination.scss  # 分页器
│   ├── dashboard.scss   # 仪表盘
│   ├── data-card.scss   # 数据卡片
│   ├── data-table.scss  # 数据表格
│   ├── floating-ball.scss # 悬浮球
│   ├── navigation.scss  # 导航
│   ├── options-panel.scss # 选项面板
│   ├── relationship-graph.scss # 关系图
│   ├── settings-panel.scss # 设置面板
│   ├── sortable-list.scss # 排序列表
│   ├── table-selector.scss # 表格选择器
│   └── preset-header.scss # 预设管理头部
│
├── overlays/            # 弹窗/覆盖层样式
│   ├── dialogs.scss     # 弹窗基础（.acu-modal 等）
│   ├── dialogs-graph.scss    # 关系图弹窗
│   ├── dialogs-purge.scss    # 清除弹窗
│   ├── avatar-dialogs.scss   # 头像弹窗
│   ├── context-menu.scss     # 右键菜单
│   ├── dashboard-dialogs.scss # 仪表盘弹窗
│   ├── dialogs-ball.scss     # 悬浮球设置弹窗
│   ├── dialogs-font.scss     # 字体设置弹窗
│   ├── dialogs-history.scss  # 历史记录弹窗
│   ├── dialogs-preset.scss   # 预设弹窗
│   ├── dialogs-responsive.scss # 响应式弹窗调整
│   ├── dialogs-tag.scss      # 标签弹窗
│   ├── dialogs-theme.scss    # 主题设置弹窗
│   ├── dialogs-update.scss   # 更新弹窗
│   ├── dialogs-widget.scss   # 组件弹窗
│   ├── overlays.scss         # 通用覆盖层
│   ├── quick-view.scss       # 快速预览
│   └── tag-manager.scss      # 标签管理器
│
└── utilities/           # 工具样式
    ├── feedback.scss    # 加载/禁用状态
    └── helpers.scss     # 辅助类
```

---

## 🎨 CSS 变量 (Design Tokens)

> 来源：`variables.scss`

### 颜色

| 变量 | 用途 |
|------|------|
| `--acu-bg-panel` | 面板/弹窗背景 |
| `--acu-card-bg` | 卡片背景 |
| `--acu-table-head` | 表头/分组背景 |
| `--acu-table-hover` | 悬浮状态背景 |
| `--acu-text-main` | 主要文本 |
| `--acu-text-sub` | 次要文本/提示 |
| `--acu-border` | 通用边框 |
| `--acu-btn-bg` | 按钮默认背景 |
| `--acu-btn-hover` | 按钮悬浮背景 |
| `--acu-title-color` | 主题强调色 |
| `--acu-title-color-bg` | 主题色浅背景 |

### 尺寸

| 变量 | 值 | 用途 |
|------|-----|------|
| `--acu-radius-sm` | 4px | 小圆角 |
| `--acu-radius-md` | 8px | 中圆角 |
| `--acu-radius-lg` | 12px | 大圆角 |
| `--acu-font-size` | 13px | 默认字号 |

---

## 📐 布局类 (layouts/settings.scss)

### 设置分区

```html
<div class="acu-settings-section">
  <div class="acu-settings-title">
    <i class="fas fa-cog"></i>
    分组标题
  </div>
  <div class="acu-settings-group">
    <!-- 设置行 -->
  </div>
</div>
```

| 类名 | 说明 |
|------|------|
| `.acu-settings-section` | 设置分区容器 |
| `.acu-settings-title` | 分组标题（带图标） |
| `.acu-settings-group` | 设置分组（圆角容器） |

### 设置行

```html
<div class="acu-settings-row">
  <div class="acu-settings-label">
    标签名
    <span class="hint">提示文字</span>
  </div>
  <div class="acu-settings-control">
    <!-- 控件 -->
  </div>
</div>
```

| 类名 | 说明 |
|------|------|
| `.acu-settings-row` | 普通设置行 |
| `.acu-settings-label` | 标签（左侧） |
| `.acu-settings-label .hint` | 标签下方提示 |
| `.acu-settings-control` | 控件容器（右侧） |
| `.acu-nav-row` | 导航入口行（可点击，有箭头） |

### 弹窗元素

| 类名 | 说明 |
|------|------|
| `.acu-modal-back` | 返回按钮 |
| `.acu-modal-title` | 弹窗标题 |
| `.acu-bottom-spacer` | 底部留白（移动端安全区） |

### 预设管理头部 (components/preset-header.scss)

```html
<div class="acu-preset-header">
  <div class="acu-settings-row">
    <!-- 预设选择器 -->
  </div>
</div>
```

| 类名 | 说明 |
|------|------|
| `.acu-preset-header` | 固定在顶部的预设管理容器 (sticky) |
| `.acu-preset-control` | 预设控件包装器 |
| `.acu-preset-dropdown` | 预设下拉菜单容器 |
| `.acu-preset-dropdown-btn` | 下拉触发按钮 |
| `.acu-preset-dropdown-menu` | 下拉菜单列表 |
| `.acu-preset-option` | 下拉选项 |
| `.acu-preset-actions` | 操作按钮组（新建/保存等） |

---

## 🔘 表单控件 (components/inputs.scss)

### 下拉选择框

```html
<select class="acu-select">
  <option>选项1</option>
  <option>选项2</option>
</select>
```

| 类名 | 说明 |
|------|------|
| `.acu-select` | 通用下拉框（文字居中、宽度自适应） |

**特性**：
- 恢复原生下拉箭头
- 文字居中显示
- 宽度自适应内容
- 防御酒馆主题污染

### 颜色选择器

```html
<!-- 普通颜色选择器 -->
<input type="color" value="#ff6600">

<!-- 边框颜色选择器（虚线边框） -->
<input type="color" class="acu-dashed" value="#ff6600">
```

| 类名 | 说明 |
|------|------|
| `input[type='color']` | 基础样式自动应用（32×32px，2px 边框） |
| `.acu-dashed` | 虚线边框变体（用于边框颜色设置） |
| `.acu-sm` | 小尺寸（28×28px） |
| `.acu-lg` | 大尺寸（36×36px） |

**特性**：
- Hover 时边框高亮 + 放大
- 清除浏览器默认样式
- `.acu-dashed` 用于边框颜色选择器，区分普通颜色

### 文本域

```html
<textarea class=".acu-textarea-scrollable"></textarea>
```

| 类名 | 说明 |
|------|------|
| `.acu-textarea-scrollable` | 可滚动编辑文本区（用于多行输入） |

### 其他输入控件

| 类名 | 说明 |
|------|------|
| `.acu-search-input` | 搜索输入框 |
| `.acu-settings-input` | 设置项输入框 |
| `.acu-range-input` | 滑块 |
| `.acu-checkbox` | 复选框 |

---

## 🔀 开关控件 (components/switch.scss)

```html
<label class="acu-switch">
  <input type="checkbox">
  <span class="slider"></span>
</label>
```

| 类名 | 说明 |
|------|------|
| `.acu-switch` | iOS 风格开关（44×24px） |

**特性**：
- 无边框圆角设计
- 圆点垂直居中
- 支持传统用法（`.acu-switch.active`）

---

## 📋 开关列表 (components/switch-list.scss)

> 通用多选列表组件，使用开关（而非复选框）进行选择

```vue
<SwitchList
  v-model="selectedItems"
  :items="listItems"
  empty-text="暂无可用项"
  footer-template="已选择: {selected}/{total} 项"
  empty-hint="(全选模式)"
/>
```

**Props**:

| 属性 | 类型 | 说明 |
|------|------|------|
| `modelValue` | `string[]` | 已选择项的 id 数组（支持 v-model） |
| `items` | `SwitchListItem[]` | 列表项数组 |
| `emptyText` | `string` | 列表为空时显示的文字 |
| `footerTemplate` | `string` | 底部统计模板，支持 `{selected}` 和 `{total}` |
| `emptyHint` | `string` | 空选择时的提示文字 |

**SwitchListItem 类型**:

```typescript
interface SwitchListItem {
  key: string;      // 唯一标识
  label: string;    // 显示文本
  badge?: string;   // 可选徽章（如 ★）
  class?: string;   // 可选额外样式类
}
```

**样式类**:

| 类名 | 说明 |
|------|------|
| `.acu-switch-list` | 容器 |
| `.acu-switch-list-header` | 头部按钮区（全选/清空，靠右） |
| `.acu-switch-list-scroll` | 滚动容器（max-height: 200px） |
| `.acu-switch-list-item` | 列表项（flex 布局） |
| `.acu-switch-list-footer` | 底部统计 |
| `.acu-switch-list-empty` | 空状态提示 |

**使用场景**:
- 手动更新弹窗中的列选择、表格选择
- 高级清除弹窗中的表格选择
- 任何需要多选的列表场景

---

## 🔲 按钮 (components/buttons.scss)

### 4 个通用按钮

| 类名 | 说明 | 用途 |
|------|------|------|
| `.acu-modal-btn` | 弹窗底部按钮 | 弹窗确认/取消 |
| `.acu-action-btn` | 扁平按钮（flex:1） | 操作栏、横向按钮组 |
| `.acu-tool-btn` | 有边框工具按钮 | 万能小按钮 |
| `.acu-icon-btn` | 无背景图标按钮（28×28） | 小图标操作 |

### .acu-modal-btn 变体

```html
<button class="acu-modal-btn primary">确定</button>
<button class="acu-modal-btn secondary">取消</button>
<button class="acu-modal-btn danger">删除</button>
```

| 变体 | 说明 |
|------|------|
| `.primary` | 主色背景 |
| `.secondary` | 次要（灰色边框） |
| `.danger` | 危险（红色） |

### .acu-tool-btn 变体

```html
<button class="acu-tool-btn">普通</button>
<button class="acu-tool-btn small">小号</button>
```

| 变体 | 说明 |
|------|------|
| `.small` | 小号（padding 4px 10px，字号 11px） |

### .acu-icon-btn 变体

```html
<button class="acu-icon-btn"><i class="fas fa-edit"></i></button>
<button class="acu-icon-btn active"><i class="fas fa-check"></i></button>
```

| 变体 | 说明 |
|------|------|
| `.active` | 激活状态（主题色背景） |

---

## 🏷️ 徽章 (components/badges.scss)

| 类名 | 说明 |
|------|------|
| `.acu-badge` | 圆角矩形基础徽章 |
| `.acu-badge-pill` | 胶囊形徽章 |
| `.acu-badge-count` | 圆形计数 |


---

## 📦 弹窗 (overlays/dialogs.scss)

### 弹窗容器

```html
<div class="acu-modal-container" @click.self="close">
  <div class="acu-modal acu-xxx-modal">
    <div class="acu-modal-header">
      <span class="acu-modal-title">标题</span>
      <button class="acu-close-pill">完成</button>
    </div>
    <div class="acu-modal-body">
      <!-- 内容 -->
    </div>
  </div>
</div>
```

| 类名 | 说明 |
|------|------|
| `.acu-modal-container` | 弹窗遮罩层（居中） |
| `.acu-modal` | 弹窗主体 |
| `.acu-modal-header` | 弹窗头部 |
| `.acu-modal-body` | 弹窗内容区 |

---

## ⚠️ 使用规范

### ✅ 正确做法

```scss
// 使用 CSS 变量
color: var(--acu-text-main);
background: var(--acu-card-bg);

// 使用通用类
<select class="acu-select">
<input type="color" class="acu-color-swatch">
```

### ❌ 禁止做法

```scss
// 硬编码颜色
color: #333;
background: white;

// 重复定义控件样式
select {
  padding: 8px;
  border-radius: 6px;
  // ...又写一遍
}
```

---

## 📝 更新日志

| 日期 | 变更 |
|------|------|
| 2026-01-26 | 更新 `STYLE_INDEX.md`，添加 `.acu-edit-textarea` 和预设管理头部样式 |
| 2026-01-22 | 新增 `SwitchList` 通用开关列表组件及样式 |
| 2026-01-20 | 简化 Toast 为统一样式（移除 type 变体） |
| 2026-01-20 | 新增 `.acu-dashed` 虚线边框颜色选择器变体 |
| 2026-01-20 | 初始版本：含 settings 布局、switch、select、color-swatch |

---

## 🔗 相关文档

- [ACU_DEV_GUIDE.md](../../.kilocode/rules/ACU_DEV_GUIDE.md) - 开发规范
- [样式重构计划](../../../plans/样式重构计划.md) - 重构进度
