# ACU 可视化表格开发规则

> **路径**: `src/可视化表格/`
> **技术栈**: Vue 3 + Pinia + VueUse + SCSS
> **架构**: 跨 iframe 脚本（iframe 运行逻辑，UI 渲染到父窗口）
> **调试**: 使用pnpm watch实时热重载，每一次代码改动的效果都在Silly Tavern前端可见
> **推送github**:每次推送之前更改版本号：src\可视化表格\components\dialogs\SettingsDialog.vue:330-331
```
        <div class="acu-bottom-spacer">—— ACU Visualizer 版本号 ——</div>

```


---

## 核心约束

### 1. 样式规则（最重要）

**Vue `<style scoped>` 完全失效**，因为：
- Vue 将样式注入到 iframe 的 `<head>`
- 实际 DOM 渲染在 `window.parent.document`
- 两个 document 不同，选择器无法匹配

**正确做法**：
```
组件样式 → styles/components/*.scss
弹窗样式 → styles/overlays/*.scss
通过 useParentStyleInjection 注入到父窗口
```

**Vue 其他功能正常**：响应式、组件化、模板语法、Pinia 均不受影响。

### 1.5 Vue 响应式绑定在跨 iframe 生产构建中失效（重要）

**问题**：Vue 3 的响应式绑定（`:style`、`v-show`）在跨 iframe + 生产构建场景下可能无法正确更新 DOM。
- 脚本在 iframe 中运行
- Vue 挂载到 `window.parent.document`
- 生产构建的代码优化可能破坏跨文档的 DOM 更新调度

**症状**：
- 热重载时功能正常
- 完全刷新后响应式绑定控制的样式不响应状态变化
- 事件触发正常（有日志），但 DOM 样式属性不更新
- 拖拽、滑动等需要实时更新位置/尺寸的功能失效

**Vue 功能可用性表**（2025-01-06 更新，参考 src/手机界面 验证）：
| 绑定类型 | 状态 | 说明 |
|----------|------|------|
| `v-show` | ✅ 可用 | 正常工作 |
| `:style` | ✅ 可用 | 正常工作 |
| `:class` | ✅ 可用 | 正常工作 |
| `@click` | ✅ 可用 | 正常工作 |
| `@pointerdown` | ✅ 可用 | 启动拖拽可用 |
| `emit()` | ✅ 可用 | 子→父通信正常 |
| 响应式数据 | ✅ 可用 | Pinia Store、ref 正常 |
| VueUse `useDraggable` | ❌ 失效 | 完全不工作，必须手动实现 |
| `parentDoc.addEventListener` | ⚠️ 不推荐 | 可能失效，使用 jQuery 替代 |

**关键发现**：真正的问题不是 Vue 响应式失效，而是 **VueUse useDraggable** 和 **原生 addEventListener 绑定到 parentDoc** 失效！

**解决方案：使用 jQuery $('body').on() 绑定拖拽事件**

参考实现：[`src/手机界面/index.vue:462-466`](src/手机界面/index.vue:462-466)

```vue
<script setup>
import { ref } from 'vue';

const ballRef = ref<HTMLElement>();
const x = ref(100);
const y = ref(100);

// 关键：脚本项目中 $ 已指向 window.parent.$
// 所以 $('body') 会选中父窗口的 body

function handlePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const initialLeft = x.value;
  const initialTop = y.value;

  const handlePointerMove = (moveE: JQuery.TriggeredEvent) => {
    const originalEvent = moveE.originalEvent as PointerEvent;
    const dx = originalEvent.clientX - startX;
    const dy = originalEvent.clientY - startY;

    x.value = initialLeft + dx;
    y.value = initialTop + dy;
  };

  const handlePointerUp = () => {
    // 关键：使用 jQuery 移除事件
    $('body').off('pointermove', handlePointerMove);
    $('body').off('pointerup', handlePointerUp);
  };

  // 关键：使用 jQuery 绑定到父窗口 body
  // 脚本项目中 $ 已指向 window.parent.$
  $('body').on('pointermove', handlePointerMove);
  $('body').on('pointerup', handlePointerUp);
}
</script>

<template>
  <!-- @pointerdown 可以正常使用 -->
  <div ref="ballRef" class="floating-ball" @pointerdown="handlePointerDown"></div>
</template>
```

**禁止使用 VueUse useDraggable**：在跨 iframe 生产构建中完全失效，必须手动实现拖拽逻辑。

**已修复的组件**（2025-01-06）：
- `FloatingBall.vue` - 使用 jQuery $('body').on() 绑定拖拽事件
- `MainPanel.vue` - 使用 jQuery $('body').on() 绑定面板拖拽和宽度调节事件

---

### 2. 文件结构

```
src/可视化表格/
├── index.ts                 # 入口文件：等待 API、挂载 Vue
├── App.vue                  # 根组件：组装所有子组件
├── types.ts                 # TypeScript 类型定义
│
├── components/              # Vue 单文件组件
│   ├── FloatingBall.vue     # 悬浮球：拖拽、点击展开
│   ├── MainPanel.vue        # 主面板：包含 Header 和内容区
│   ├── TabBar.vue           # 标签栏：Tab 切换、排序
│   ├── DataTable.vue        # 数据表：搜索、分页、卡片列表
│   ├── DataCard.vue         # 数据卡片：单行数据的展示与编辑
│   ├── Dashboard.vue        # 仪表盘：聚合视图
│   ├── OptionsPanel.vue     # 选项面板：矩阵式选项展示
│   ├── ActionBar.vue        # 操作栏：刷新、保存等按钮
│   ├── InlineEditor.vue     # 原地编辑器：textarea 编辑框
│   ├── Badge.vue            # 徽章：值的样式化展示
│   ├── ContextMenu.vue      # 右键菜单
│   ├── Pagination.vue       # 分页器
│   ├── SearchBox.vue        # 搜索框
│   │
│   ├── dialogs/             # 弹窗组件
│   │   ├── SettingsDialog.vue       # 设置弹窗
│   │   ├── InputFloorDialog.vue     # 输入楼层弹窗
│   │   └── PurgeRangeDialog.vue     # 清除范围弹窗
│   │
│   ├── settings/            # 设置面板子组件
│   │   ├── TabConfigPanel.vue       # Tab 配置面板
│   │   └── NavButtonConfigPanel.vue # 导航按钮配置
│   │
│   └── ui/                  # 通用 UI 组件
│       └── SortableList.vue # 可排序列表
│
├── composables/             # 组合式函数（可复用逻辑）
│   ├── useParentStyleInjection.ts  # 样式注入到父窗口
│   ├── useVueUseIntegration.ts     # VueUse 封装
│   ├── useMobileGesturesNew.ts     # 移动端手势
│   ├── useDataPersistence.ts       # 数据保存逻辑
│   └── useCoreActions.ts           # 核心操作（插入/删除行等）
│
├── stores/                  # Pinia 状态管理
│   ├── useConfigStore.ts    # 配置状态（主题、字体等）
│   ├── useDataStore.ts      # 数据状态（表格数据、diff 等）
│   └── useUIStore.ts        # UI 状态（折叠、当前 Tab 等）
│
└── styles/                  # SCSS 样式文件
    ├── index.scss           # 入口：导入所有子模块
    ├── variables.scss       # CSS 变量定义
    ├── base.scss            # 基础样式
    ├── components/          # 组件样式
    │   ├── buttons.scss
    │   ├── sortable-list.scss
    │   └── settings-panel.scss
    └── overlays/            # 弹窗样式
        └── dialogs.scss
```


---

### 3. 交互规格

| 操作 | 移动端横向 | 移动端竖向 | PC端 |
|------|-----------|-----------|------|
| **新增行** | 下拉超阈值 | 右滑超阈值 | 右键菜单 |
| **删除行** | 上划到底后继续拉 | 左滑到边缘后继续滑 | 右键菜单 |
| **编辑** | 点按单元格 | 点按单元格 | 点击单元格 |
| **复制** | 长按（系统原生） | 长按（系统原生） | 右键菜单 |

---

### 4. 开发规范

1. **新增组件时**：样式写在 `styles/` 目录，不要写 `<style scoped>`
2. **使用 VueUse**：优先使用 `useVueUseIntegration.ts` 中封装的函数
3. **状态管理**：通过 Pinia stores 管理，避免组件间直接传递复杂状态
4. **jQuery 残留**：`useUIStore.ts` 和 `useCoreActions.ts` 仍有少量 jQuery 操作待清理
5. **状态初始化必须有默认值**：任何控制 UI 显示的函数（如 `openPanel()`）必须确保依赖的状态有值。例如 `isPanelVisible` 依赖 `activeTab !== null`，则 `openPanel()` 必须确保 `activeTab` 有值

---



### 5. 层级与 ID 规范

1. **Z-Index 策略**：悬浮球 (9999) < 弹窗 (10000) < 右键菜单 (10001)
2. **排序列表**：使用稳定 ID（如 `tableId`、`tabId`），不要依赖数组索引

---

### 6. 热重载 vs 生产构建差异（调试陷阱）

**关键区别**：
| 场景 | Pinia Store 状态 | localStorage | DOM 更新 |
|------|------------------|--------------|----------|
| 热重载 | 保留内存中的状态 | 保持不变 | 正常 |
| 完全刷新 | 从 localStorage 重新读取 | 重新解析 | 可能异常 |

**调试建议**：
1. 修复 BUG 后，必须**完全刷新页面**测试，不能只靠热重载
2. 清除 localStorage 测试初始化逻辑：
   ```javascript
   Object.keys(localStorage).filter(k => k.startsWith('acu_')).forEach(k => localStorage.removeItem(k));
   location.reload();
   ```
3. 使用 `cdn.jsdelivr.net`（主服务器）测试，而非 `testingcf.jsdelivr.net`（镜像服务器，purge 不会刷新它）

---

### 7. CDN 缓存刷新

| 域名 | 类型 | purge 是否生效 |
|------|------|---------------|
| `cdn.jsdelivr.net` | 主服务器 | ✅ 生效 |
| `testingcf.jsdelivr.net` | 镜像服务器 | ❌ 不生效（需等待自动同步） |

**开发时使用主服务器链接**，发布后再切换到镜像服务器。

---

## 待办功能

### P0 - 紧急
- [ ] 原地编辑框滚动问题
- [ ] 导航栏按钮自选配置

### P1 - 短期
- [ ] 表格展示与顺序调整（设置面板内）
- [ ] 行动选项直接发送开关

### P2 - 长期
- [ ] 仪表盘自由配置
- [ ] 清理所有 jQuery 残留
