# ACU 可视化表格架构优化计划

> 基于 2026-01-19 代码审查

## 一、当前架构问题分析

### 1.1 App.vue 臃肿 (1308行)

**问题清单：**

| 问题类型 | 行数占比 | 具体内容 |
|---------|---------|---------|
| 弹窗渲染 | 130+ 行 | 16 个弹窗组件平铺在模板中 |
| 事件处理 | 400+ 行 | 30+ 个 `handle*` 函数 |
| 计算属性 | 150+ 行 | 关系图相关数据计算混杂 |
| 弹窗状态 | 混乱 | 部分用独立 ref，部分用 uiStore |

**弹窗状态管理不一致：**
```typescript
// 模式A：独立 ref（旧风格）
const showSettingsDialog = ref(false);
const showInputFloorDialog = ref(false);

// 模式B：uiStore 管理（新风格）
uiStore.rowEditDialog.visible
uiStore.avatarCropDialog.visible
```

### 1.2 dialogs/ 目录膨胀 (6→16)

16 个弹窗混在一起，缺乏领域分类：

```
当前：
dialogs/
├── SettingsDialog.vue        # 通用
├── InputFloorDialog.vue      # 通用
├── HistoryDialog.vue         # 通用
├── RowEditDialog.vue         # 仪表盘
├── GraphSettingsDialog.vue   # 关系图
├── NodeConfigDialog.vue      # 关系图
├── AvatarManagerDialog.vue   # 关系图/头像
└── ... (8 more)
```

### 1.3 useGraphConfigStore 职责过重 (634行)

管理了 5 个完全不同的子领域：

| 子领域 | 行数 | 职责 |
|-------|------|------|
| 势力颜色 | ~100 | `factionColors`, `setFactionColor` |
| 势力头像 | ~80 | `factionAvatars`, `setFactionAvatar` |
| 节点样式 | ~60 | `nodeOverrides`, `setNodeStyleOverride` |
| 图例配置 | ~100 | `legendConfig`, `addLegendItem` |
| 背景图片 | ~60 | `backgroundConfig`, `setBackgroundConfig` |

### 1.4 关系图数据计算散落在 App.vue

```typescript
// App.vue 第 505-562 行
const relationshipTableData = computed(...);  // 关系表
const characterTablesData = computed(...);    // 角色表
const factionTableData = computed(...);       // 势力表
const factionList = computed(...);            // 势力列表
```

这些应该在专门的 Store 或 Composable 中。

---

## 二、优化方案

### 2.1 弹窗状态统一迁移到 useUIStore

**目标：** 消除独立 ref，统一使用 uiStore 管理弹窗

**执行步骤：**

1. 在 `useUIStore.ts` 中添加缺失的弹窗状态：
```typescript
// 旧弹窗（需迁移）
const settingsDialog = ref(false);
const inputFloorDialog = ref(false);
const purgeRangeDialog = ref(false);
const manualUpdateDialog = ref(false);
const historyDialog = reactive<{ visible: boolean; props: HistoryDialogProps }>({...});
const tabsPopup = ref(false);
```

2. App.vue 中删除独立 ref：
```typescript
// 删除这些
const showSettingsDialog = ref(false);
const showInputFloorDialog = ref(false);
// ...
```

3. 模板中改用 uiStore：
```vue
<SettingsDialog v-model:visible="uiStore.settingsDialog" />
```

### 2.2 事件处理提取到 Composables

**新建文件结构：**

```
composables/
├── useAppDialogs.ts         # 弹窗相关事件
├── useAppNavigation.ts      # Tab/导航事件
├── useAppDataActions.ts     # 数据操作事件
└── useAppContextMenu.ts     # 右键菜单事件
```

**示例 - useAppNavigation.ts：**
```typescript
export function useAppNavigation() {
  const uiStore = useUIStore();
  const mainPanelRef = ref<...>();

  function handleTabChange(tabId: string) {
    if (tabId && mainPanelRef.value) {
      mainPanelRef.value.exitCenteredMode();
    }
    uiStore.setActiveTab(tabId);
    // ...
  }

  function handleNavigateToTable(tableId: string) {
    uiStore.setActiveTab(tableId);
  }

  return {
    mainPanelRef,
    handleTabChange,
    handleNavigateToTable,
    // ...
  };
}
```

**App.vue 简化为：**
```typescript
const { handleTabChange, handleNavigateToTable } = useAppNavigation();
const { handleRefresh, handleSave } = useAppDataActions();
```

### 2.3 dialogs/ 目录按领域拆分

**目标结构：**

```
dialogs/
├── index.ts                  # 统一导出
│
├── common/                   # 通用弹窗（6个）
│   ├── SettingsDialog.vue
│   ├── InputFloorDialog.vue
│   ├── PurgeRangeDialog.vue
│   ├── AdvancedPurgeDialog.vue
│   ├── HistoryDialog.vue
│   └── ManualUpdateDialog.vue
│
├── graph/                    # 关系图弹窗（6个）
│   ├── GraphSettingsDialog.vue
│   ├── NodeConfigDialog.vue
│   ├── NodeLabelDialog.vue
│   ├── FactionSettingsDialog.vue
│   ├── AvatarManagerDialog.vue
│   └── AvatarCropDialog.vue
│
└── dashboard/                # 仪表盘弹窗（4个）
    ├── RowEditDialog.vue
    ├── WidgetSettingsDialog.vue
    ├── WidgetActionsDialog.vue
    └── DashboardWidgetManagerDialog.vue
```

### 2.4 拆分 useGraphConfigStore

**目标：** 将 634 行拆分为职责单一的小 Store

**新结构：**

```
stores/
├── graph/
│   ├── useGraphBaseStore.ts      # 基础配置（节点大小、边宽度）
│   ├── useFactionStyleStore.ts   # 势力样式（颜色、头像）
│   ├── useNodeStyleStore.ts      # 节点样式覆盖
│   ├── useLegendStore.ts         # 图例配置
│   └── useGraphBackgroundStore.ts # 背景图片
└── useGraphConfigStore.ts        # 保留为聚合入口（组合以上 Store）
```

**示例 - useFactionStyleStore.ts：**
```typescript
export const useFactionStyleStore = defineStore('graphFactionStyle', () => {
  const colors = ref<Record<string, FactionColorConfig>>({});
  const avatars = ref<Record<string, FactionAvatarConfig>>({});

  function setColor(name: string, config: FactionColorConfig) {...}
  function setAvatar(name: string, config: FactionAvatarConfig) {...}

  return { colors, avatars, setColor, setAvatar };
});
```

**聚合入口保留向后兼容：**
```typescript
export function useGraphConfigStore() {
  const base = useGraphBaseStore();
  const factionStyle = useFactionStyleStore();
  const nodeStyle = useNodeStyleStore();

  return {
    // 聚合所有子 Store 的方法
    ...base,
    ...factionStyle,
    ...nodeStyle,
  };
}
```

### 2.5 关系图数据计算提取

**新建 composables/useRelationshipData.ts：**

```typescript
export function useRelationshipData(processedTables: Ref<ProcessedTable[]>) {
  const relationshipTable = computed(() => {
    return processedTables.value.find(t =>
      t.name.toLowerCase().includes('关系')
    ) || null;
  });

  const characterTables = computed(() =>
    processedTables.value.filter(t => isCharacterTable(t.name, t.id))
  );

  const factionTable = computed(() => {...});
  const factionList = computed(() => {...});
  const hasRelationshipData = computed(() => characterTables.value.length > 0);

  return {
    relationshipTable,
    characterTables,
    factionTable,
    factionList,
    hasRelationshipData,
  };
}
```

**App.vue 简化：**
```typescript
const {
  relationshipTable,
  characterTables,
  hasRelationshipData
} = useRelationshipData(processedTables);
```

---

## 三、执行优先级

| 优先级 | 任务 | 影响范围 | 预计行数变化 |
|--------|------|---------|-------------|
| P0 | 弹窗状态统一到 uiStore | App.vue, useUIStore | -30 行 |
| P1 | 提取事件处理 Composables | App.vue | -300 行 |
| P1 | 提取关系图数据计算 | App.vue | -60 行 |
| P2 | 拆分 dialogs/ 目录 | 文件结构 | 无代码变化 |
| P2 | 拆分 useGraphConfigStore | stores/ | 重组织 |

---

## 四、预期效果

### App.vue 行数变化
| 阶段 | 行数 | 变化 |
|------|------|------|
| 当前 | 1308 | - |
| 弹窗状态统一 | 1278 | -30 |
| 事件处理提取 | 978 | -300 |
| 关系图数据提取 | 918 | -60 |
| **最终** | **~900** | **-408** |

### 架构评级变化
- 当前：⭐⭐⭐☆ (3.5/5)
- 优化后预期：⭐⭐⭐⭐ (4/5)

---

## 五、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 重构引入 Bug | 中 | 分步执行，每步单独测试 |
| 向后兼容问题 | 低 | useGraphConfigStore 保留聚合入口 |
| 开发体验变化 | 低 | 更新 ACU_DEV_GUIDE.md 同步文档 |
