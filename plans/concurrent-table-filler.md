# 并发填表系统设计方案 v3

> **目标**：实现可视化表格的并发自动填表功能，基于预设组并发调用
> **状态**：设计阶段
> **更新**：明确保存逻辑复用，增加 forceTargetFloor 参数支持

---

## 1. 核心概念理解

### 1.1 现有预设结构 (`useUpdatePresets.ts`)

```typescript
/** 更新设置 - 4个核心参数 */
interface UpdateSettings {
  autoUpdateThreshold: number;   // AI读取上下文层数
  updateBatchSize: number;       // 每批次更新楼层数
  skipUpdateFloors: number;      // 保留X层楼不更新
  autoUpdateFrequency: number;   // 每N层自动更新一次
}

/** 自动触发配置 */
interface AutoTriggerConfig {
  enabled: boolean;
  updateTargetTables: string[];  // ★ 关键：参与更新的表格名称列表
  // ...
}

/** 完整预设 */
interface UpdatePreset {
  id: string;
  name: string;
  settings: UpdateSettings;
  autoTrigger: AutoTriggerConfig;
}
```

### 1.2 并发策略理解

**不是**单表并发，**而是**预设组并发：

```
预设A (4参数A + [表1, 表2, 表3])  ──┐
                                   ├── Promise.all ──▶ 合并结果 ──▶ 单次保存
预设B (4参数B + [表4, 表5])      ──┘
```

**为什么这样安全？**
- 每个预设更新的表列表不重叠
- 4参数不同的预设可以并发（不会互相干扰提示词构建）
- 保存阶段由我们统一管理

---

## 2. 并发安全性深度分析

### 2.1 全局变量 `currentJsonTableData_ACU` 的问题

**当前流程**：
```javascript
// processUpdates_ACU 内部
// 1. 读取全局变量构建基础数据
let mergedBatchData = buildGuidedBaseDataFromSheetGuide_ACU(...);

// 2. AI 返回后直接写入全局变量
currentJsonTableData_ACU[sheetKey] = parsedTableData;

// 3. 保存时读取全局变量
saveIndependentTableToChatHistory_ACU(..., currentJsonTableData_ACU, ...);
```

**并发场景的竞态条件**：
```
时间线 ──────────────────────────────────────────────────────▶

预设A: ─[读取全局]──[AI调用]──────────────────[写入表1,2,3]─▶
                            ↑
预设B: ─────────[读取全局]──[AI调用]──[写入表4,5]────────────▶
                  │              │
                  └──────────────┘
              预设B读取时，预设A可能还没写入，
              或者预设A刚写入了部分数据
```

**风险**：
1. 预设B 读取时可能读到预设A的中间状态
2. 两个预设几乎同时写入，虽然 key 不同，但 JavaScript 对象赋值在复杂操作时可能有问题

### 2.2 解决方案：局部变量隔离

**核心原则**：每个 API 调用在独立的局部副本上操作，不修改全局变量

```javascript
executePresetWithoutSave: async function(options) {
  // ★ 关键：深拷贝创建局部副本
  const localTableData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));

  // 所有操作在 localTableData 上进行
  await processUpdatesOnLocalData_ACU(..., { localDataRef: localTableData });

  // 只返回更新的表，不写回全局
  return { updatedTables: extractUpdatedTables(localTableData, targetSheetKeys) };
}
```

### 2.3 并发结束判断

**可视化表格端**：
```typescript
// Promise.all 天然知道什么时候全部完成
const results = await Promise.all(
  presets.map(preset => api.executePresetWithoutSave(preset))
);
// 执行到这里，所有并发已完成
```

**数据库端**：
- 不需要知道"并发全部完成"
- 每个 API 调用独立执行，独立返回
- 全局锁 `isAutoUpdatingCard_ACU` **不应该**在 API 内部修改（由调用者管理）

### 2.4 并发安全矩阵

| 场景 | 是否安全 | 需要的保障 |
|------|----------|-----------|
| **表列表不重叠** | ✅ | 每个API使用局部副本 |
| **同一表被多个预设更新** | ❌ | 调用者保证不发生 |
| **读取全局变量** | ⚠️ | 在调用开始时一次性深拷贝 |
| **写入全局变量** | ⚠️ | API不应写入，结果直接返回 |
| **保存到聊天记录** | ✅ | 由可视化表格统一管理 |

---

## 3. 需要作者新增的 API

### 3.1 核心需求：执行预设但不保存（使用局部变量）

```javascript
// mov1.2.js 新增暴露
window.AutoCardUpdaterAPI = {
  // ... 现有接口 ...

  /**
   * 执行预设更新（不保存到聊天记录）
   * ★★★ 并发安全：使用局部变量，不修改全局状态 ★★★
   *
   * @param options 执行选项
   * @param options.settings 4个核心参数
   * @param options.targetTableNames 目标表格名称列表
   * @param options.silent 是否静默模式
   *
   * @returns Promise<{
   *   success: boolean,
   *   message: string,
   *   updatedTables: { [sheetKey: string]: TableData } | null
   * }>
   */
  executePresetWithoutSave: async function(options = {}) {
    const {
      settings = {},
      targetTableNames = null,
      silent = true
    } = options;

    // ★★★ 注意：不检查 isAutoUpdatingCard_ACU ★★★
    // 因为并发场景下多个请求同时进行是正常的
    // 全局锁由调用者（可视化表格）在外部管理

    // 1. ★★★ 关键：创建数据的深拷贝，在局部副本上操作 ★★★
    const localTableData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));

    // 2. 创建临时设置副本（不修改全局 settings_ACU）
    const localSettings = {
      autoUpdateThreshold: settings.autoUpdateThreshold ?? settings_ACU.autoUpdateThreshold ?? 3,
      updateBatchSize: settings.updateBatchSize ?? settings_ACU.updateBatchSize ?? 3,
      skipUpdateFloors: settings.skipUpdateFloors ?? settings_ACU.skipUpdateFloors ?? 0,
      autoUpdateFrequency: settings.autoUpdateFrequency ?? settings_ACU.autoUpdateFrequency ?? 1,
    };

    try {
      // 3. 解析目标表格名称 → sheetKey（从局部副本读取）
      let resolvedSheetKeys = [];
      if (targetTableNames && targetTableNames.length > 0) {
        Object.keys(localTableData).forEach(k => {
          if (!k.startsWith('sheet_')) return;
          const table = localTableData[k];
          if (table && table.name && targetTableNames.includes(table.name)) {
            resolvedSheetKeys.push(k);
          }
        });

        if (resolvedSheetKeys.length === 0) {
          return { success: false, message: '未找到匹配的表格', updatedTables: null };
        }
      } else {
        // 未指定则更新全部表
        resolvedSheetKeys = Object.keys(localTableData).filter(k => k.startsWith('sheet_'));
      }

      // 4. 计算楼层索引
      const chat = SillyTavern_API_ACU?.chat || [];
      const allAiIndices = chat.map((m, i) => !m.is_user ? i : -1).filter(i => i !== -1);

      const effectiveIndices = localSettings.skipUpdateFloors > 0
        ? allAiIndices.slice(0, -localSettings.skipUpdateFloors)
        : allAiIndices;

      const contextIndices = localSettings.autoUpdateThreshold > 0
        ? effectiveIndices.slice(-localSettings.autoUpdateThreshold)
        : effectiveIndices;

      if (contextIndices.length === 0) {
        return { success: false, message: '没有找到可处理的AI消息', updatedTables: null };
      }

      // 5. ★★★ 核心：在局部副本上执行填表 ★★★
      const result = await processUpdatesOnLocalData_ACU(
        contextIndices,
        'manual_unified',
        {
          targetSheetKeys: resolvedSheetKeys,
          isSilentMode: silent,
          localDataRef: localTableData,     // ★ 传入局部副本
          localSettingsRef: localSettings   // ★ 传入局部设置
        }
      );

      // 6. 从局部副本提取更新后的表（不依赖全局变量）
      if (result.success) {
        const updatedTables = {};
        resolvedSheetKeys.forEach(key => {
          if (localTableData[key]) {
            updatedTables[key] = localTableData[key];  // 已经是副本，无需再拷贝
          }
        });
        return { success: true, message: '更新成功', updatedTables };
      } else {
        return { success: false, message: result.message || '更新失败', updatedTables: null };
      }

    } catch (e) {
      logError_ACU('executePresetWithoutSave failed:', e);
      return { success: false, message: e.message, updatedTables: null };
    }
    // ★ 注意：不需要 finally 恢复设置，因为我们使用的是局部副本
  },

  /**
   * 检查 API 是否可用
   */
  getApiStatus: function() {
    const apiIsConfigured = (
      settings_ACU.apiMode === 'custom' &&
      (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))
    ) || (
      settings_ACU.apiMode === 'tavern' &&
      settings_ACU.tavernProfile
    );

    return {
      isConfigured: apiIsConfigured,
      isUpdating: isAutoUpdatingCard_ACU,
      mode: settings_ACU.apiMode,
    };
  }
};
```

### 3.2 需要作者新增的内部函数

```javascript
/**
 * 在局部数据副本上执行填表（并发安全版本）
 *
 * 与 processUpdates_ACU 的关键区别：
 * 1. 使用传入的 localDataRef 而不是 currentJsonTableData_ACU
 * 2. 使用传入的 localSettingsRef 而不是 settings_ACU
 * 3. 不修改任何全局变量
 * 4. 不调用 saveIndependentTableToChatHistory_ACU
 * 5. 不修改 isAutoUpdatingCard_ACU
 */
async function processUpdatesOnLocalData_ACU(indicesToUpdate, mode, options = {}) {
  const {
    targetSheetKeys,
    isSilentMode,
    localDataRef,      // ★ 局部数据副本
    localSettingsRef   // ★ 局部设置副本
  } = options;

  // 1. 使用局部设置计算批次
  const batchSize = localSettingsRef.updateBatchSize || 3;
  const batches = [];
  for (let i = 0; i < indicesToUpdate.length; i += batchSize) {
    batches.push(indicesToUpdate.slice(i, i + batchSize));
  }

  // 2. 获取消息内容
  const chat = SillyTavern_API_ACU?.chat || [];
  const messagesToUse = indicesToUpdate.map(i => chat[i]).filter(Boolean);

  // 3. 构建提示词时，从 localDataRef 读取表格数据
  const dynamicContent = await prepareAIInputFromLocalData_ACU(
    messagesToUse,
    mode,
    targetSheetKeys,
    localDataRef  // ★ 传入局部副本
  );

  // 4. AI 调用（这里不涉及全局变量）
  const aiResponse = await callCustomOpenAI_ACU(dynamicContent, new AbortController(), {
    skipProfileSwitch: true  // 并发模式
  });

  // 5. 解析结果并写入 localDataRef（不是 currentJsonTableData_ACU）
  const parsedData = parseTableEditsFromResponse_ACU(aiResponse, targetSheetKeys);
  targetSheetKeys.forEach(key => {
    if (parsedData[key]) {
      localDataRef[key] = parsedData[key];
    }
  });

  // 6. 不保存！直接返回
  return { success: true };
}

/**
 * 从局部数据副本构建 AI 输入
 * （prepareAIInput_ACU 的并发安全版本）
 */
async function prepareAIInputFromLocalData_ACU(messages, mode, targetSheetKeys, localDataRef) {
  // 与 prepareAIInput_ACU 类似，但使用 localDataRef 而不是 currentJsonTableData_ACU
  let tableDataText = '';

  const tableIndexes = getSortedSheetKeys_ACU(localDataRef);  // ★ 使用局部数据
  tableIndexes.forEach((sheetKey, tableIndex) => {
    const table = localDataRef[sheetKey];  // ★ 从局部数据读取
    if (!table || !table.name || !table.content) return;

    if (targetSheetKeys && !targetSheetKeys.includes(sheetKey)) return;

    // ... 构建 tableDataText ...
  });

  // ... 其余逻辑相同 ...
  return { tableDataText, messagesText, worldbookContent };
}
```

### 3.3 改动量评估

| 函数 | 改动类型 | 预计行数 |
|------|----------|----------|
| `executePresetWithoutSave` | 新增 | ~80 行 |
| `processUpdatesOnLocalData_ACU` | 新增（复制+修改） | ~200 行 |
| `prepareAIInputFromLocalData_ACU` | 新增（复制+修改） | ~150 行 |

**总计**：约 430 行新代码

**替代方案（推荐）**：重构现有函数接受可选参数

```javascript
// 重构方案 - 改动更小
async function processUpdates_ACU(indices, mode, options = {}) {
  // 支持传入局部副本，兼容现有调用
  const dataRef = options.localDataRef || currentJsonTableData_ACU;
  const settingsRef = options.localSettingsRef || settings_ACU;
  const shouldSave = options.skipSave !== true;  // 默认保存

  // ... 后续都使用 dataRef 和 settingsRef ...

  if (shouldSave) {
    await saveIndependentTableToChatHistory_ACU(...);
  }
}
```

### 3.4 并发安全性保障

| 场景 | 是否安全 | 原因 |
|------|----------|------|
| **预设A和预设B并发** | ✅ 安全 | 各自使用独立的 localDataRef |
| **同一预设并发调用** | ✅ 安全 | 每次调用都创建新的局部副本 |
| **保存到聊天记录** | ✅ 安全 | 由可视化表格统一管理 |

---

## 4. 可视化表格端实现

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    可视化表格（Vue + Pinia）                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐      ┌────────────────────────────────┐   │
│  │ 触发判断模块         │      │  并发填表管理器                  │   │
│  │                     │      │  useConcurrentPresetFill       │   │
│  │ useTableUpdateStatus│─────▶│                                │   │
│  │ (计算每表未记录楼层) │      │  1. 按预设组织请求             │   │
│  │                     │      │  2. 检查表列表不重叠            │   │
│  │ useUpdatePresets    │      │  3. Promise.all 并发调用        │   │
│  │ (管理预设配置)       │      │                                │   │
│  └─────────────────────┘      └────────────────────────────────┘   │
│                                          │                          │
│                                          ▼                          │
│                               ┌────────────────────────────────┐   │
│                               │ 合并结果到 useDataStore        │   │
│                               │ (更新 Pinia 中的表格数据)      │   │
│                               └────────────────────────────────┘   │
│                                          │                          │
│                                          ▼                          │
│                               ┌────────────────────────────────┐   │
│                               │ executeFullSave (单次保存)      │   │
│                               │ (写入聊天历史)                  │   │
│                               └────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    数据库脚本 (mov1.2.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│  AutoCardUpdaterAPI.executePresetWithoutSave(options)               │
│                          │                                          │
│                          ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 深拷贝 → 局部操作 → AI调用 → 解析到局部副本 → 返回结果        │ │
│  │ （不修改全局变量，不保存到聊天记录）                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 新增 Composable: `useConcurrentPresetFill.ts`

(代码与之前相同，此处省略)

---

## 5. 实施步骤

### Phase 1: 与作者沟通 API 需求
- [ ] 整理技术规格文档
- [ ] 重点说明**局部变量隔离**的必要性
- [ ] 确认 `executePresetWithoutSave` API 设计
- [ ] 讨论是新增函数还是重构现有函数
- [ ] 作者实现并发布新版本

### Phase 2: 可视化表格端实现
- [ ] 新增 `useConcurrentPresetFill.ts`
- [ ] 增强 `useDataStore` 支持批量更新
- [ ] 实现 UI 进度显示

### Phase 3: 触发与集成
- [ ] 实现手动触发按钮（手动更新弹窗）
- [ ] 实现自动触发（监听消息事件）
- [ ] 添加设置选项（启用/禁用自动更新）

### Phase 4: 测试与优化
- [ ] 单预设测试
- [ ] 多预设并发测试
- [ ] 表格冲突检测测试
- [ ] 边界情况测试（API 失败、网络超时等）

---

## 6. 关键优化：一次 saveChat + 一次 syncWorldbook

### 6.1 现有 executeIncrementalSave 已支持多楼层写入

查看 `useDataPersistence.ts` 第638-713行，`executeIncrementalSave` 已经支持：
1. 在内存中向**多个楼层**写入数据
2. 最后只调用**一次** `saveChat()`
3. 然后调用**一次** `syncWorldbook()`

```typescript
// 按楼层批量处理 - 在内存中修改
for (const [floorIdx, tableIds] of floorMap.entries()) {
  const targetMsg = ST.chat[floorIdx];
  // ... 修改 targetMsg.TavernDB_ACU_IsolatedData ...
}

// 最后只调用一次
if (savedAny) {
  await ST.saveChat();
  await syncWorldbook();
}
```

### 6.2 并发填表的保存流程

```
并发填表 (Promise.all)
         │
         ▼
收到所有预设的结果
  - 预设A: { tables: [表1,表2,表3], saveTargetIndex: 12 }
  - 预设B: { tables: [表4,表5], saveTargetIndex: 14 }
         │
         ▼
按楼层分组写入内存（不调用 saveChat）
  - ST.chat[12].TavernDB_ACU_IsolatedData ← 表1,表2,表3
  - ST.chat[14].TavernDB_ACU_IsolatedData ← 表4,表5
         │
         ▼
saveChat() 一次（保存所有楼层）
         │
         ▼
syncWorldbook() 一次
```

### 6.3 改造 executeIncrementalSave

需要支持**预先分组好的楼层映射**：

```typescript
interface IncrementalSaveOptions {
  // AI 填表模式：传入预先计算好的 楼层 → 表列表 映射
  // 不使用 findFloorForTable 自动查找，而是按传入的映射保存
  preGroupedFloorMap?: Map<number, { tables: string[], data: Record<string, any> }>;
}
```

**两种保存模式**：

| 模式 | 楼层计算方式 | 使用场景 |
|------|-------------|----------|
| **默认模式** | `findFloorForTable()` 自动查找每个表最新有数据的楼层 | 手动编辑 |
| **预分组模式** | 使用传入的 `preGroupedFloorMap` | AI 填表 |

---

## 7. 核心问题：不同预设保存到不同楼层

### 6.1 问题分析

```
预设A: autoUpdateThreshold=5, skipUpdateFloors=2
  - 上下文范围: [8,9,10,11,12]
  - 保存位置: 12 (lastMessageIndexOfBatch)
  - 更新表: [表1, 表2, 表3]

预设B: autoUpdateThreshold=3, skipUpdateFloors=0
  - 上下文范围: [12,13,14]
  - 保存位置: 14 (lastMessageIndexOfBatch)
  - 更新表: [表4, 表5]

结果：
  - 楼层 12 需要存: [表1, 表2, 表3]
  - 楼层 14 需要存: [表4, 表5]
```

数据库源码确认（mov1.2.js 第17499行）：
```javascript
const finalSaveTargetIndex = lastMessageIndexOfBatch;
```

### 6.2 解决方案

**API 返回必须包含保存位置**：

```javascript
// 数据库 API 返回格式
{
  success: true,
  updatedTables: { sheet_0: {...}, sheet_1: {...} },
  saveTargetIndex: 12  // ★ 每个预设对应的保存楼层
}
```

**按楼层分组保存**：

```typescript
// 按楼层分组
const floorMap = new Map<number, { tables: string[], data: Record<string, any> }>();

results.forEach(result => {
  const floor = result.saveTargetIndex;
  if (!floorMap.has(floor)) {
    floorMap.set(floor, { tables: [], data: {} });
  }
  const group = floorMap.get(floor)!;
  Object.entries(result.updatedTables).forEach(([key, data]) => {
    group.tables.push(key);
    group.data[key] = data;
  });
});

// 对每个楼层单独保存
for (const [floor, group] of floorMap) {
  await executeIncrementalSave(
    group.data,
    false,
    group.tables,
    { forceTargetFloor: floor }
  );
}
```

---

## 8. 总流程梳理（最终版）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户触发并发填表                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. 并发调用数据库 API（每个预设返回更新后的表数据 + 保存位置）        │
│                                                                     │
│    const results = await Promise.all([                              │
│      api.executePresetWithoutSave({ settings: 预设A, tables: [...] }),│
│      api.executePresetWithoutSave({ settings: 预设B, tables: [...] }),│
│    ]);                                                              │
│                                                                     │
│    每个返回: {                                                      │
│      success: true,                                                 │
│      updatedTables: { sheet_X: {...} },                             │
│      saveTargetIndex: 12  // ★ 该预设对应的保存楼层                  │
│    }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 合并结果到 Pinia Store                                            │
│                                                                     │
│    results.forEach(r => {                                           │
│      Object.entries(r.updatedTables).forEach(([key, data]) => {     │
│        dataStore.updateTable(key, data);                            │
│      });                                                            │
│    });                                                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 按楼层分组                                                        │
│                                                                     │
│    const floorMap = new Map<number, { tables: [], data: {} }>();    │
│                                                                     │
│    结果:                                                            │
│    - 楼层 12: { tables: [表1,表2,表3], data: {...} }                │
│    - 楼层 14: { tables: [表4,表5], data: {...} }                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 按楼层分别保存（复用 executeIncrementalSave + forceTargetFloor）  │
│                                                                     │
│    for (const [floor, group] of floorMap) {                         │
│      await executeIncrementalSave(                                  │
│        group.data,                                                  │
│        false,                                                       │
│        group.tables,                                                │
│        { forceTargetFloor: floor }                                  │
│      );                                                             │
│    }                                                                │
│                                                                     │
│    注意：这里是串行保存，避免 saveChat 的并发问题                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. 数据库手动更新流程分析

### 8.1 现有手动更新函数 (handleManualUpdate_ACU)

源码位置：`mov1.2.js` 第 8876-8960 行

```
用户点击"手动更新"按钮
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. 前置检查                                                          │
│    - 检查 isAutoUpdatingCard_ACU 锁                                  │
│    - 检查 API 是否配置                                               │
│    - 刷新数据 loadAllChatMessages_ACU() + refreshMergedDataAndNotify │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 读取 UI 参数（全局 settings_ACU）                                  │
│    - uiThreshold = settings_ACU.autoUpdateThreshold || 3            │
│    - uiBatchSize = settings_ACU.updateBatchSize || 3                │
│    - uiSkip = settings_ACU.skipUpdateFloors || 0                    │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 计算上下文范围                                                    │
│    allAiIndices = [0, 2, 4, 6, 8, 10, 12, 14]  // 所有 AI 楼层       │
│    effectiveIndices = allAiIndices.slice(0, -uiSkip)  // 去掉跳过的   │
│    contextIndices = effectiveIndices.slice(-uiThreshold)  // 取最后N │
│                                                                     │
│    示例（threshold=5, skip=2）:                                      │
│    effectiveIndices = [0,2,4,6,8,10,12] (去掉14)                     │
│    contextIndices = [4,6,8,10,12] (取最后5个)                        │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 获取用户选择的表格 (getManualSelectionFromUI_ACU)                  │
│    targetKeys = ['sheet_0', 'sheet_2', 'sheet_5']                   │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. 调用 processUpdates_ACU(contextIndices, 'manual_independent', {   │
│      targetSheetKeys: targetKeys,                                   │
│      batchSize: uiBatchSize                                         │
│    })                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 processUpdates_ACU 流程

源码位置：`mov1.2.js` 第 17466-17705 行

```
processUpdates_ACU(indicesToUpdate, mode, options)
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. 分批：根据 batchSize 将 indicesToUpdate 分成多个批次              │
│    例: indices=[4,6,8,10,12], batchSize=3                            │
│    批次1: [4,6,8]                                                    │
│    批次2: [10,12]                                                    │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
   ┌───────────────────────────────┐
   │     对每个批次循环执行         │
   └───────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 计算保存目标楼层                                                  │
│    finalSaveTargetIndex = lastMessageIndexOfBatch                   │
│    例: 批次1=[4,6,8] → 保存到 8                                      │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 构建合并基础数据 (从聊天记录/模板)                                │
│    mergedBatchData = buildGuidedBaseDataFromSheetGuide_ACU(...)     │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 调用 proceedWithCardUpdate_ACU(...)                               │
│    - 构建 AI 提示词                                                  │
│    - 调用 AI 接口                                                    │
│    - 解析响应，更新 currentJsonTableData_ACU                         │
│    - 调用 saveIndependentTableToChatHistory_ACU(finalSaveTargetIndex)│
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 我们需要的 API

我们需要的是 `processUpdates_ACU` 的**无保存版本**：

```javascript
// 预期 API
executePresetWithoutSave({
  settings: { autoUpdateThreshold: 5, updateBatchSize: 3, skipUpdateFloors: 2, ... },
  targetTableNames: ['角色表', '物品表'],
  silent: true
})

// 返回
{
  success: true,
  message: '更新成功',
  updatedTables: { sheet_0: {...}, sheet_1: {...} }
  // 不需要返回 saveTargetIndex，我们自己算
}
```

**API 需要做的**：
1. 接收 settings + targetTableNames
2. 计算 contextIndices（使用 settings 参数，不依赖全局 settings_ACU）
3. 执行 AI 填表逻辑（构建提示词、调用 AI、解析结果）
4. 返回更新后的表数据

**API 不需要做的**：
1. 不保存（由可视化表格端处理）
2. 不修改全局变量 currentJsonTableData_ACU（使用局部副本）
3. 不检查全局锁 isAutoUpdatingCard_ACU（由调用者管理）

### 8.4 保存楼层由可视化表格端计算

我们可以自己计算每个预设的保存目标楼层：

```typescript
function calculateSaveTargetIndex(settings: UpdateSettings): number {
  const chat = SillyTavern.getContext().chat;
  const allAiIndices = chat
    .map((m, i) => !m.is_user ? i : -1)
    .filter(i => i !== -1);

  const effectiveIndices = settings.skipUpdateFloors > 0
    ? allAiIndices.slice(0, -settings.skipUpdateFloors)
    : allAiIndices;

  const contextIndices = settings.autoUpdateThreshold > 0
    ? effectiveIndices.slice(-settings.autoUpdateThreshold)
    : effectiveIndices;

  // 保存目标 = 上下文的最后一个索引
  return contextIndices[contextIndices.length - 1];
}
```

这样 API 可以不返回保存楼层，减少数据库端的改动！

---

## 10. 现有保存函数分析

### 7.1 executeIncrementalSave 核心逻辑

来源：`src/可视化表格/composables/useDataPersistence.ts` 第549-721行

```typescript
async function executeIncrementalSave(
  dataToUse: RawDatabaseData,
  commitDeletes: boolean,
  modifiedTableIds: string[],
): Promise<RawDatabaseData | null> {
  // ...

  // D. 分组：为每个表寻找目标楼层
  const floorMap = new Map<number, Set<string>>();
  const newTables = new Set<string>();

  for (const tableId of modifiedTableIds) {
    const floorIdx = findFloorForTable(ST, tableId, configKey);  // ← 每个表存到自己最新有数据的楼层
    if (floorIdx !== -1) {
      if (!floorMap.has(floorIdx)) floorMap.set(floorIdx, new Set());
      floorMap.get(floorIdx)!.add(tableId);
    } else {
      newTables.add(tableId);  // 新表归入最近的有数据 AI 楼层
    }
  }

  // ... 后续写入逻辑
}
```

### 7.2 findFloorForTable 逻辑

```typescript
function findFloorForTable(ST: any, tableId: string, configKey: string): number {
  // 倒序查找该表格最近一次出现的楼层
  for (let i = ST.chat.length - 1; i >= 0; i--) {
    const msg = ST.chat[i];
    if (msg.is_user) continue;

    // 检查 TavernDB_ACU_IsolatedData
    const tagData = msg.TavernDB_ACU_IsolatedData?.[configKey];
    if (tagData?.independentData?.[tableId]) {
      return i;  // 找到该表最近的楼层
    }
  }
  return -1;  // 未找到
}
```

### 7.3 保存策略对比

| 场景 | 当前逻辑 | AI 填表需要的逻辑 |
|------|----------|-------------------|
| **手动编辑** | 每个表存到自己最新有数据的楼层 | ✅ 正确 |
| **AI 填表** | 每个表存到自己最新有数据的楼层 | ❌ 应该存到每个预设 AI 回复那个楼层 |

---

## 11. 数据库端改动风险分析

### 11.1 风险评估

**如果修改 `processUpdates_ACU`**：

| 影响范围 | 风险 |
|----------|------|
| 手动更新 (`handleManualUpdate_ACU`) | ⚠️ 可能影响 |
| 自动更新 (`handleAutoUpdate_ACU`) | ⚠️ 可能影响 |
| 总结合并 (`performAutoMergeSummary_ACU`) | ⚠️ 可能影响 |
| 其他内部调用 | ⚠️ 可能影响 |

### 11.2 两种改动方案对比

| 方案 | 描述 | 风险 | 工作量 |
|------|------|------|--------|
| **A: 重构现有函数** | 给 `processUpdates_ACU` 增加 `localDataRef` 等可选参数 | ⚠️ 中 | 小 |
| **B: 新增独立函数** | 新增 `processUpdatesWithoutSave_ACU`，不修改现有代码 | ✅ 低 | 中 |

**推荐方案B**：新增独立函数，核心逻辑可以复制自现有函数，但：
1. 使用传入的 `localDataRef` 而不是 `currentJsonTableData_ACU`
2. 不调用 `saveIndependentTableToChatHistory_ACU`
3. 不修改 `isAutoUpdatingCard_ACU`

这样完全不影响现有功能！

### 11.3 作者需要做的最小改动

```javascript
// 新增到 AutoCardUpdaterAPI
executePresetWithoutSave: async function(options) {
  // 1. 深拷贝全局数据
  const localData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));

  // 2. 计算上下文（使用传入的 settings）
  // ...

  // 3. 调用 AI 填表核心逻辑（可能需要复制一些代码）
  // ...

  // 4. 返回结果，不保存
  return { success: true, updatedTables: ... };
}
```

关键是作者评估：**AI 填表核心逻辑**（构建提示词、调用 AI、解析结果）是否可以被提取成独立函数？

---

## 12. 可视化表格端改动

### 12.1 改动1：扩展 executeIncrementalSave

```typescript
// useDataPersistence.ts
interface IncrementalSaveOptions {
  // AI 填表模式：传入预先计算好的 楼层 → 表列表 映射
  preGroupedFloorMap?: Map<number, Set<string>>;
}

async function executeIncrementalSave(
  dataToUse: RawDatabaseData,
  commitDeletes: boolean,
  modifiedTableIds: string[],
  options: IncrementalSaveOptions = {}
): Promise<RawDatabaseData | null> {
  // ...

  // D. 分组：为每个表寻找目标楼层
  let floorMap: Map<number, Set<string>>;
  let newTables: Set<string>;

  if (options.preGroupedFloorMap) {
    // ★ AI 填表模式：使用预先分组好的映射
    floorMap = options.preGroupedFloorMap;
    newTables = new Set(); // 预分组模式不会有新表
  } else {
    // ★ 默认模式：每个表存到自己最新有数据的楼层
    floorMap = new Map();
    newTables = new Set();

    for (const tableId of modifiedTableIds) {
      const floorIdx = findFloorForTable(ST, tableId, configKey);
      if (floorIdx !== -1) {
        if (!floorMap.has(floorIdx)) floorMap.set(floorIdx, new Set());
        floorMap.get(floorIdx)!.add(tableId);
      } else {
        newTables.add(tableId);
      }
    }
  }

  // ... 后续逻辑不变（写入内存 → saveChat → syncWorldbook）
}
```

### 12.2 改动2：并发填表 Composable（最终版）

```typescript
// useConcurrentPresetFill.ts
interface PresetFillResult {
  success: boolean;
  updatedTables: Record<string, any>;
  // 注意：API 不返回 saveTargetIndex，我们自己算！
}

export function useConcurrentPresetFill() {
  const dataStore = useDataStore();
  const { executeIncrementalSave } = useDataPersistence();

  /**
   * 计算预设的保存目标楼层
   * 复制数据库的逻辑：contextIndices[contextIndices.length - 1]
   */
  function calculateSaveTargetIndex(settings: UpdateSettings): number {
    const chat = SillyTavern.getContext().chat;
    const allAiIndices = chat
      .map((m: any, i: number) => !m.is_user ? i : -1)
      .filter((i: number) => i !== -1);

    const effectiveIndices = settings.skipUpdateFloors > 0
      ? allAiIndices.slice(0, -settings.skipUpdateFloors)
      : allAiIndices;

    const contextIndices = settings.autoUpdateThreshold > 0
      ? effectiveIndices.slice(-settings.autoUpdateThreshold)
      : effectiveIndices;

    return contextIndices.length > 0
      ? contextIndices[contextIndices.length - 1]
      : -1;
  }

  async function executeConcurrentFill(presets: UpdatePreset[]): Promise<ConcurrentFillResult> {
    const api = getCore().getDB();
    if (!api?.executePresetWithoutSave) {
      return { success: false, message: 'API 不可用' };
    }

    // 1. 并发执行所有预设
    const results = await Promise.all(
      presets.map(async (preset) => {
        const result = await api.executePresetWithoutSave({
          settings: preset.settings,
          targetTableNames: preset.autoTrigger.updateTargetTables,
          silent: true
        });
        // 我们自己计算保存楼层
        const saveTargetIndex = calculateSaveTargetIndex(preset.settings);
        return { ...result, saveTargetIndex, preset };
      })
    );

    // 2. 合并结果到 Store
    for (const result of results) {
      if (!result.success || !result.updatedTables) continue;
      for (const [key, data] of Object.entries(result.updatedTables)) {
        dataStore.updateTable(key, data);
      }
    }

    // 3. ★ 按楼层分组（构建 preGroupedFloorMap）
    const floorMap = new Map<number, Set<string>>();
    const allData: Record<string, any> = {};

    for (const result of results) {
      if (!result.success || !result.updatedTables) continue;
      const floor = result.saveTargetIndex;
      if (floor === -1) continue;

      if (!floorMap.has(floor)) {
        floorMap.set(floor, new Set());
      }

      for (const [key, data] of Object.entries(result.updatedTables)) {
        floorMap.get(floor)!.add(key);
        allData[key] = data;
      }
    }

    if (floorMap.size === 0) {
      return { success: false, message: '没有表格被更新' };
    }

    // 4. ★ 一次保存（传入预分组映射）
    await executeIncrementalSave(
      allData,
      false,
      Object.keys(allData),
      { preGroupedFloorMap: floorMap }
    );

    return {
      success: true,
      message: `已更新 ${floorMap.size} 个楼层`,
      savedFloors: Array.from(floorMap.keys()),
    };
  }

  return { executeConcurrentFill, calculateSaveTargetIndex };
}
```

### 12.3 关键优化：只调用一次 saveChat + syncWorldbook

上面的实现中，我们只调用一次 `executeIncrementalSave`，传入 `preGroupedFloorMap`：
- 在内存中修改多个楼层的 `ST.chat[floor]`
- 最后只调用一次 `saveChat()`
- 然后调用一次 `syncWorldbook()`

这是最高效的方式！

---

## 13. 与作者沟通模板（精简版）

> **主题**：请求新增 `executePresetWithoutSave` API 以支持并发填表
>
> 你好！
>
> 我们在可视化表格中想实现**并发预设填表**功能。核心需求是一个**只负责 AI 填表、不保存**的 API。
>
> **核心需求**：
>
> ```javascript
> AutoCardUpdaterAPI.executePresetWithoutSave({
>   settings: { autoUpdateThreshold: 5, updateBatchSize: 3, skipUpdateFloors: 2, autoUpdateFrequency: 1 },
>   targetTableNames: ['角色表', '物品表'],
>   silent: true
> })
> // 返回: {
> //   success: true,
> //   message: '...',
> //   updatedTables: { sheet_0: {...}, sheet_1: {...} }
> // }
> ```
>
> **API 需要做的**（类似 handleManualUpdate_ACU 的核心逻辑）：
> 1. 使用传入的 `settings` 计算 contextIndices（不依赖全局 settings_ACU）
> 2. 执行 AI 填表逻辑（构建提示词、调用 AI、解析结果）
> 3. 返回更新后的表数据
>
> **关键点**：
> 1. **使用局部变量**：深拷贝 `currentJsonTableData_ACU`，在局部副本上操作，不修改全局
> 2. **不检查全局锁**：`isAutoUpdatingCard_ACU` 不应阻止并发调用（锁由我们管理）
> 3. **不保存**：不调用 `saveIndependentTableToChatHistory_ACU`（保存由我们处理）
>
> **保存楼层我们自己算**：
> 我们可以根据 settings 参数自己计算 `contextIndices[contextIndices.length - 1]`，不需要 API 返回。
>
> **保存由我们处理**：
> 我们的 `executeIncrementalSave` 函数已经实现了完整的保存逻辑，只需增加一个参数支持指定楼层。
>
> **建议实现方式**：
> 把 `processUpdates_ACU` 的核心逻辑提取出来：
> 1. 接收 `{ localDataRef, localSettings }` 参数
> 2. 所有操作在 `localDataRef` 上进行，不修改 `currentJsonTableData_ACU`
> 3. 跳过 `saveIndependentTableToChatHistory_ACU` 调用
> 4. 返回更新后的 `localDataRef` 中的表数据
>
> 这样的改动量应该不大。请问这个方案可行吗？谢谢！

---

## 14. 总结：我们需要验证的问题

### 14.1 数据库 API 能否如预期执行？

**核心问题**：`processUpdates_ACU` 能否被改造为支持局部变量？

目前 `processUpdates_ACU` 的问题：
1. 直接读写全局 `currentJsonTableData_ACU`
2. 调用 `saveIndependentTableToChatHistory_ACU` 保存
3. 依赖全局 `settings_ACU`

需要作者确认能否：
1. 接受 `localDataRef` 参数替代 `currentJsonTableData_ACU`
2. 接受 `skipSave: true` 参数跳过保存
3. 接受 `localSettings` 参数替代 `settings_ACU`

### 14.2 可视化表格端需要做什么？

1. **触发判断**：监听 AI 楼层结束事件，计算未更新楼层数
2. **预设检测**：检查需要更新的表所属预设，检测重叠
3. **并发调用**：Promise.all 调用 API
4. **计算保存楼层**：根据每个预设的 settings 计算 `saveTargetIndex`
5. **按楼层分组保存**：调用 `executeIncrementalSave` with `forceTargetFloor`

### 14.3 改动清单

| 模块 | 改动 | 工作量 |
|------|------|--------|
| **数据库** | 新增 `executePresetWithoutSave` API | 需要作者协助 |
| **可视化表格** | 新增 `calculateSaveTargetIndex` | 小 |
| **可视化表格** | 扩展 `executeIncrementalSave` | 小 |
| **可视化表格** | 新增 `useConcurrentPresetFill` | 中 |
| **可视化表格** | UI 集成（触发按钮、进度显示） | 中 |

---

## 15. 实施步骤（更新）

### Phase 1: 与作者沟通 API 需求
- [ ] 整理技术规格文档
- [ ] 重点说明**局部变量隔离**的必要性
- [ ] 确认 `executePresetWithoutSave` API 设计
- [ ] 作者实现并发布新版本

### Phase 2: 可视化表格端实现（改动量小）
- [ ] 扩展 `executeIncrementalSave` 增加 `forceTargetFloor` 参数
- [ ] 新增 `findLatestAiFloor()` 辅助函数
- [ ] 新增 `useConcurrentPresetFill.ts` Composable
- [ ] 增强 `useDataStore` 支持批量更新

### Phase 3: UI 集成
- [ ] 实现手动触发按钮（手动更新弹窗）
- [ ] 实现自动触发（监听消息事件）
- [ ] 添加进度显示

### Phase 4: 测试
- [ ] 单预设测试
- [ ] 多预设并发测试
- [ ] 表格冲突检测测试
