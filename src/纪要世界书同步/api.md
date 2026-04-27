# 纪要世界书同步 - 外部 API

本脚本通过全局变量 `SummaryWorldbookSyncBridge` 向外部脚本暴露 API。

## 获取方式

```typescript
// 方式一：直接从 window 获取（推荐）
const bridge = (window.parent as any).SummaryWorldbookSyncBridge;

// 方式二：使用酒馆助手的 waitGlobalInitialized 等待初始化完成
const bridge = await waitGlobalInitialized('SummaryWorldbookSyncBridge');
```

---

## API 列表

### `getTargetWorldbookName()`

获取当前注入的目标世界书名称。

```typescript
getTargetWorldbookName(): string | null
```

**返回值：**
- `string` — 当前目标世界书名称（如 `"我的角色世界书"`）
- `null` — 尚未定位到目标世界书

**示例：**
```typescript
const name = bridge.getTargetWorldbookName();
if (name) {
  console.log('纪要同步目标世界书:', name);
}
```

---

### `getSummaryWorldbookSyncStatus()`

获取当前同步状态快照。

```typescript
getSummaryWorldbookSyncStatus(): SummaryWorldbookSyncStatus
```

**返回值：**
```typescript
interface SummaryWorldbookSyncStatus {
  /** 脚本启动时间戳 */
  startedAt: number;
  /** 当前命中的纪要表名 */
  currentSummarySheetName: string;
  /** 当前目标世界书名 */
  currentTargetWorldbookName: string;
  /** 是否正在执行同步 */
  syncInProgress: boolean;
  /** 最近一次同步触发原因 */
  lastReason: string;
}
```

**示例：**
```typescript
const status = bridge.getSummaryWorldbookSyncStatus();
console.log('纪要表:', status.currentSummarySheetName);
console.log('目标世界书:', status.currentTargetWorldbookName);
console.log('同步中:', status.syncInProgress);
```

---

### `requestSummaryWorldbookRefresh(reason)`

请求一次同步（受防抖控制）。

```typescript
requestSummaryWorldbookRefresh(reason: string): void
```

**参数：**
- `reason` — 触发原因（用于日志记录）

**说明：** 调用后会进入防抖队列，多次快速调用只会执行最后一次。

---

### `refreshSummaryWorldbookNow(reason)`

立即执行一次同步（跳过防抖）。

```typescript
refreshSummaryWorldbookNow(reason: string): Promise<void>
```

**参数：**
- `reason` — 触发原因

**说明：** 异步函数，返回的 Promise 在同步完成后 resolve。

---

### `triggerSummaryWorldbookResyncLikeUiButton()`

模拟设置弹窗中"立即重新注入世界书"按钮的行为。

```typescript
triggerSummaryWorldbookResyncLikeUiButton(): void
```

**说明：** 与 UI 按钮共用同一代码路径，确保行为一致。
