# 可视化表格 - 并发 AI 填表功能

> 状态：计划中
> 难度：⭐⭐⭐ (中等)
> 预计工作量：4-5 个任务周期

## 0. 前置知识：存储架构对比

### mov1.2.js (旧脚本) 的存储方式
| 数据类型 | 存储位置 | Key 格式 |
|----------|----------|----------|
| 设置 (API配置等) | 酒馆扩展设置 | `shujuku_v{版本}__userscript_settings_v1` |
| 设置 (旧版本) | LocalStorage | `shujuku_v{版本}_allSettings_v2` |
| 表格数据 | 聊天记录 | `TavernDB_ACU_IsolatedData` 字段 |
| 临时导入 | IndexedDB | 自定义 key |

### 可视化表格 (新项目) 的存储方式
| 数据类型 | 存储位置 | Key 格式 |
|----------|----------|----------|
| UI配置 | LocalStorage (via Pinia) | `acu_ui_config_v18` |
| API配置 | LocalStorage (via Pinia) | `acu_api_config_v1` (待新增) |
| 表格数据 | 聊天记录 | `TavernDB_ACU_IsolatedData` (复用) |

## 1. 功能目标

在可视化表格中实现**并发 AI 填表**功能，允许用户一次性让 AI 填充多张表格，同时发送多个请求以加快速度。

### 当前问题
- mov1.2.js 的填表逻辑是串行的，每个批次等待完成后才处理下一个
- 并发调用会导致数据竞态（全局变量污染 + 文件写入冲突）

### 目标方案
```
┌─────────────────────────────────────────────────────────────┐
│                     并发 AI 填表流程                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐                  │
│   │ Request │   │ Request │   │ Request │  ... (并发)      │
│   │  表1-3  │   │  表4-6  │   │  表7-9  │                  │
│   └────┬────┘   └────┬────┘   └────┬────┘                  │
│        │             │             │                        │
│        └──────────┬──┴─────────────┘                        │
│                   ▼                                          │
│            ┌────────────┐                                    │
│            │ Promise.all│  (等待所有完成)                    │
│            └──────┬─────┘                                    │
│                   ▼                                          │
│   ┌─────────────────────────────────────┐                   │
│   │          内存合并 (Pinia Store)       │  (顺序应用)       │
│   │   表1 ← 表2 ← 表3 ← 表4 ← ...        │                   │
│   └─────────────────┬───────────────────┘                   │
│                     ▼                                        │
│            ┌────────────────┐                                │
│            │  executeFullSave │  (单次落盘)                  │
│            └────────────────┘                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 2. 技术方案

### 2.1 需要新增的文件

```
src/可视化表格/
├── composables/
│   ├── useTableFiller.ts      # 新增：并发填表调度器
│   └── useLegacyMigration.ts  # 新增：旧配置迁移
├── stores/
│   └── useApiStore.ts         # 新增：API 配置管理
├── utils/
│   └── tableEditParser.ts     # 新增：从 mov1.2.js 移植的解析逻辑
└── components/
    └── dialogs/
        └── TableFillerDialog.vue  # 新增：填表配置弹窗
```

### 2.2 模块设计

#### A. tableEditParser.ts - 解析层

从 mov1.2.js 移植以下功能：

| 函数 | 原位置 | 作用 |
|------|--------|------|
| `extractTableEditBlock` | ~17051行 | 从 AI 响应中提取 `<tableEdit>` 块 |
| `parseCommandLine` | ~17154行 | 解析 `insertRow/updateRow/deleteRow` 指令 |
| `sanitizeJsonString` | ~17177行 | 修复 AI 生成的不规范 JSON |

#### B. useApiStore.ts - 配置层 (新增)

存储 API 配置：

```typescript
interface ApiConfig {
  mode: 'tavern' | 'custom';        // 模式
  url: string;                       // 自定义 API 地址
  key: string;                       // API Key
  model: string;                     // 模型名称
  maxTokens: number;                 // 最大 token
  temperature: number;               // 温度
  concurrencyLimit: number;          // 并发数限制 (1-5)
}
```

核心方法：
- `fetchAi(prompt)`: 统一调用接口，根据 mode 选择 `generateRaw` 或 `fetch`
- `tryMigrateLegacyConfig()`: 自动迁移旧配置

#### C. useLegacyMigration.ts - 配置迁移 (新增)

从 mov1.2.js 的存储位置自动迁移 API 配置：

```typescript
function tryMigrateLegacyApiConfig(): ApiConfig | null {
  // 1. 尝试从 LocalStorage 读取
  //    Key: shujuku_v{版本}_allSettings_v2
  //    匹配: /shujuku_v\d+_allSettings_v2/

  // 2. 尝试从酒馆扩展设置读取
  //    Path: window.parent.SillyTavern.extensionSettings
  //    Key: shujuku_v{版本}__userscript_settings_v1

  // 3. 提取 apiConfig 对象
  //    { url, key, model, useMainApi, temperature, ... }

  return foundConfig;
}
```

迁移时机：
- `useApiStore` 初始化时检查
- 如果本地无配置 + 能找到旧配置 → 自动迁移

#### C. useTableFiller.ts - 调度层

管理并发任务队列和状态。

### 2.3 API 请求策略

```typescript
// 并发请求
async function concurrentRequest(groups: string[][]): Promise<string[]> {
  const apiStore = useApiStore();
  // 这里的 fetchAi 会自动根据配置选择 酒馆API 或 自定义API
  return Promise.all(
    groups.map(group => apiStore.fetchAi(buildPrompt(group)))
  );
}
```

## 3. 风险与规避

| 风险 | 等级 | 规避措施 |
|------|------|----------|
| 与 mov1.2.js 冲突 | 高 | 检测 `window.isAutoUpdatingCard_ACU`，如果正在更新则拒绝启动 |
| API 限流 | 中 | 提供可配置的并发数（1-5），默认 3 |
| 用户中途编辑 | 中 | 填表期间锁定 UI 编辑功能 |
| AI 响应格式错误 | 低 | 移植 mov1.2.js 的容错解析逻辑 |

## 4. 任务拆解

### 阶段一：类型定义与解析层
- [ ] 在 `types.ts` 添加 `ApiConfig` 接口
- [ ] 创建 `utils/tableEditParser.ts`
- [ ] 从 mov1.2.js 移植 `extractTableEditBlock` (~17051行)
- [ ] 从 mov1.2.js 移植 `parseCommandLine` (~17154行)
- [ ] 从 mov1.2.js 移植 `sanitizeJsonString` (~17177行)

### 阶段二：配置存储与迁移
- [ ] 创建 `stores/useApiStore.ts`
- [ ] 实现配置持久化 (`useStorage`)
- [ ] 创建 `composables/useLegacyMigration.ts`
- [ ] 实现 LocalStorage 旧配置读取 (`shujuku_v*_allSettings_v2`)
- [ ] 实现酒馆扩展设置读取 (`shujuku_v*__userscript_settings_v1`)
- [ ] 在 Store 初始化时自动迁移

### 阶段三：API 请求封装
- [ ] 在 `useApiStore` 实现 `fetchAi` 方法
- [ ] 支持 `generateRaw` (酒馆模式)
- [ ] 支持 `fetch` + `reverse_proxy` (自定义模式)
- [ ] 实现请求重试与错误处理

### 阶段四：调度层实现
- [ ] 创建 `composables/useTableFiller.ts`
- [ ] 实现表格分组逻辑
- [ ] 实现 `Promise.all` 并发请求
- [ ] 实现命令应用到 Pinia Store 的逻辑
- [ ] 实现进度追踪

### 阶段五：UI 集成
- [ ] 创建 `TableFillerDialog.vue`
- [ ] 实现 API 配置 Tab
- [ ] 实现表格选择 Tab
- [ ] 实现填表进度展示
- [ ] 在 ActionBar 添加入口按钮

## 5. 难度评估

**总体难度：⭐⭐⭐ (中等)**

| 模块 | 难度 | 说明 |
|------|------|------|
| 解析层移植 | ⭐⭐ | 直接复制 + 微调 |
| 配置迁移 | ⭐⭐ | 逻辑清晰，只是查找 key |
| API 封装 | ⭐⭐⭐ | 需要处理两种模式 + 错误 |
| 调度层 | ⭐⭐⭐ | Promise.all + 状态管理 |
| UI 集成 | ⭐⭐ | 复用现有组件样式 |

**预计完成周期**：4-5 个任务（每个任务约 1 个阶段）

## 6. 后续扩展

完成基础功能后可考虑：
- [ ] 支持"增量填表"（只填空行）
- [ ] 支持"修正填表"（让 AI 检查并修正现有数据）
- [ ] 支持自定义提示词模板
- [ ] 支持填表历史记录/回滚
- [ ] 支持更多 API 后端（如 Ollama 本地模型）
