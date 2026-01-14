# 关系图独立 Tab 重构计划

## 一、背景与动机

### 当前架构问题

```
MainPanel
└── DataTable (表格视图)
    ├── 工具栏（含关系图按钮）
    ├── showRelationshipGraph 状态切换
    └── RelationshipGraph (嵌入视图)
        ├── AvatarManagerDialog (弹窗1)
        ├── AvatarCropDialog (弹窗2)
        └── NodeConfigDialog (弹窗3)
```

**问题**：
1. **弹窗层级管理复杂**：z-index 需要层层调整，容易冲突
2. **状态同步困难**：图表状态混在表格组件内
3. **样式隔离差**：父组件的滚动、高度限制影响关系图
4. **代码耦合度高**：关系图的逻辑混在表格组件里

### 目标架构

```
MainPanel
├── TabBar (包含 "关系图" Tab)
├── Dashboard (仪表盘)
├── OptionsPanel (选项面板)
├── DataTable (表格视图) ← 不再包含关系图
└── RelationshipGraph (关系图 - 独立顶层视图!)
    ├── 工具栏
    ├── 图形区域
    └── 弹窗们（在这个组件内部独立管理）
```

**优势**：
1. **独立渲染区域**：不受 DataTable 的滚动、高度限制
2. **弹窗层级简单**：只需在组件内部管理
3. **状态管理清晰**：关系图的所有状态都在自己组件内
4. **符合现有模式**：和 Dashboard、OptionsPanel 是同类虚拟 Tab

---

## 二、变更范围分析

### 需要修改的文件

| 文件 | 变更类型 | 变更内容 |
|------|----------|----------|
| `stores/useUIStore.ts` | 新增 | 添加 `TAB_RELATIONSHIP_GRAPH` 常量 |
| `App.vue` | 修改 | 添加关系图视图渲染分支 |
| `components/TabBar.vue` | 修改 | 添加关系图 Tab 按钮逻辑 |
| `components/DataTable.vue` | 修改 | 移除关系图相关代码 |
| `components/RelationshipGraph.vue` | 修改 | 适配独立 Tab 模式（数据获取方式变更） |

### 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `AvatarManagerDialog.vue` | 弹窗逻辑与父组件解耦，无需变更 |
| `AvatarCropDialog.vue` | 同上 |
| `composables/useAvatarManager.ts` | IndexedDB 逻辑独立，无需变更 |
| 样式文件 `relationship-graph.scss` | 样式无需大改 |

---

## 三、详细重构步骤

### Step 1: useUIStore 添加常量

**文件**: `src/可视化表格/stores/useUIStore.ts`

```typescript
// 在现有常量后添加
export const TAB_DASHBOARD = 'acu_tab_dashboard_home';
export const TAB_OPTIONS = 'acu_tab_options_panel';
export const TAB_RELATIONSHIP_GRAPH = 'acu_tab_relationship_graph'; // 新增
```

**风险**: 无

---

### Step 2: App.vue 添加渲染分支

**文件**: `src/可视化表格/App.vue`

**变更点**：
1. 导入 `TAB_RELATIONSHIP_GRAPH` 常量
2. 在 `<template>` 中添加条件渲染

```vue
<!-- 新增：关系图视图 -->
<RelationshipGraph
  v-else-if="uiStore.activeTab === TAB_RELATIONSHIP_GRAPH"
  :relationship-table="relationshipTableData"
  :character-tables="characterTablesData"
  :faction-table="factionTableData"
  :show-legend="true"
/>
```

**数据来源问题**：
- 原来 DataTable 通过 props 传递表格数据
- 现在需要在 App.vue 中计算这些数据

**解决方案**：在 App.vue 中添加 computed 属性：

```typescript
const relationshipTableData = computed(() => {
  return processedTables.value.find(t =>
    t.name === '重要人物表' || t.name.includes('人物')
  );
});

const characterTablesData = computed(() => {
  return processedTables.value.filter(t =>
    t.name === '重要人物表' || t.name === '主角信息'
  );
});

const factionTableData = computed(() => {
  return processedTables.value.find(t => t.name === '势力');
});
```

**风险**: 低 - 数据已在 App.vue 中存在，只是需要提取

---

### Step 3: TabBar.vue 添加关系图 Tab

**文件**: `src/可视化表格/components/TabBar.vue`

**变更点**：
1. 导入 `TAB_RELATIONSHIP_GRAPH` 常量
2. 在 `allVisibleTabs` 计算属性中添加关系图 Tab

```typescript
// 在 allVisibleTabs computed 中
const allVisibleTabs = computed<TabItem[]>(() => {
  // ... 现有逻辑

  // 添加关系图 Tab（在选项面板之前）
  if (props.showRelationshipGraph) {
    tabs.push({
      id: TAB_RELATIONSHIP_GRAPH,
      name: '关系图',
      icon: 'fas fa-project-diagram'
    });
  }

  // 选项面板
  if (props.hasOptionsTabs) {
    tabs.push({ id: TAB_OPTIONS, name: '选项', icon: 'fas fa-sliders-h' });
  }

  return tabs;
});
```

**Props 变更**：
- 添加 `showRelationshipGraph?: boolean` 属性

**风险**: 低 - 遵循现有模式

---

### Step 4: DataTable.vue 移除关系图代码

**文件**: `src/可视化表格/components/DataTable.vue`

**移除内容**：
1. `showRelationshipGraph` 状态
2. `toggleRelationshipGraph` 方法
3. 工具栏中的关系图按钮
4. `<RelationshipGraph>` 组件引用
5. `isCharacterRelatedTable` 判断逻辑
6. 相关的 props 和 computed（`relationshipTableData`, `characterTablesData`, `factionTableData`）

**保留内容**：
- 所有表格相关功能不变

**风险**: 中 - 需要仔细清理，避免遗漏引用

---

### Step 5: RelationshipGraph.vue 适配独立模式

**文件**: `src/可视化表格/components/RelationshipGraph.vue`

**变更点**：
1. 移除 `@back` 事件（不再需要返回表格）
2. 可选：添加表格选择下拉框（从多个角色相关表中选择）

**风险**: 低 - 组件逻辑大部分保持不变

---

## 四、风险评估与规避

### 风险 1: 数据传递链断裂

**场景**: 原来 DataTable 直接传递表格数据，现在需要从 App.vue 获取

**规避**:
- 在 App.vue 中提取数据计算逻辑
- 使用相同的 props 接口

### 风险 2: Tab 可见性配置兼容性

**场景**: 用户已有的 visibleTabs 配置不包含新 Tab

**规避**:
- 新 Tab 默认显示（类似仪表盘）
- 在 `syncNewTables` 中自动添加新 Tab

### 风险 3: 历史布局数据丢失

**场景**: 关系图的节点位置保存在 Chat Variables 中

**规避**:
- 存储逻辑不变，使用相同的 `acu_graph_positions` 和 `acu_graph_config` 键
- 无需迁移数据

### 风险 4: 移动端适配

**场景**: 关系图作为独立 Tab 的触控交互

**规避**:
- 保留现有的触控事件处理
- 无需额外适配

---

## 五、测试清单

### 功能测试

- [ ] 关系图 Tab 在导航栏正常显示
- [ ] 点击关系图 Tab 正确切换视图
- [ ] 图表数据正确加载（节点、边）
- [ ] 缩放/平移/布局切换正常
- [ ] 头像管理弹窗正常工作
- [ ] 节点标签配置弹窗正常工作
- [ ] 布局保存/重置正常

### 回归测试

- [ ] DataTable 不再显示关系图按钮
- [ ] 表格视图功能不受影响
- [ ] 仪表盘、选项面板正常
- [ ] Tab 可见性配置正常

### 移动端测试

- [ ] Tab 切换正常
- [ ] 图表触控交互正常
- [ ] 弹窗正确显示

---

## 六、实施顺序

```
1. useUIStore.ts - 添加常量 (1min)
   ↓
2. App.vue - 添加数据计算和渲染分支 (10min)
   ↓
3. TabBar.vue - 添加 Tab 按钮 (5min)
   ↓
4. DataTable.vue - 移除关系图代码 (15min)
   ↓
5. RelationshipGraph.vue - 移除返回按钮 (2min)
   ↓
6. 测试验证 (10min)
```

**预计总工时**: 约 45 分钟

---

## 七、回滚方案

如果重构出现严重问题，可通过 git 回退：

```bash
git checkout HEAD -- src/可视化表格/
```

建议在开始前创建分支：

```bash
git checkout -b feature/relationship-graph-tab
