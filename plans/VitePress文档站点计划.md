# VitePress 文档站点搭建计划

> **目标**：为「可视化表格」脚本创建专业的教程文档站点，托管在 GitHub Pages

---

## 一、项目结构

```
docs/                              # 文档根目录
├── .vitepress/
│   ├── config.ts                  # 站点配置（导航、侧边栏、主题）
│   ├── theme/
│   │   └── index.ts               # 自定义主题扩展
│   └── components/                # 文档专用组件
│       ├── DemoFloatingBall.vue   # 悬浮球演示
│       ├── DemoThemeSwitch.vue    # 主题切换演示
│       └── VideoPlayer.vue        # 视频播放器封装
│
├── public/                        # 静态资源
│   ├── videos/                    # 教程视频
│   │   ├── getting-started.mp4
│   │   └── dashboard-config.mp4
│   └── images/                    # 截图
│
├── index.md                       # 首页
├── guide/                         # 指南
│   ├── introduction.md            # 介绍
│   ├── installation.md            # 安装
│   └── quick-start.md             # 快速开始
│
├── tutorial/                      # 教程
│   ├── data-table.md              # 数据表格
│   ├── dashboard.md               # 仪表盘
│   ├── relationship-graph.md      # 关系图
│   ├── tag-manager.md             # 标签管理
│   ├── divination.md              # 抽签系统
│   └── theme-customization.md     # 主题自定义
│
│
├── reference/                     # 参考
│   └── faq.md                     # 常见问题
│
└── changelog.md                   # 更新日志
```

---

## 二、实施步骤

### 阶段 1：环境搭建 (Day 1)

- [ ] 在项目中初始化 VitePress
  ```bash
  pnpm add -D vitepress
  mkdir docs
  ```
- [ ] 创建 `.vitepress/config.ts` 基础配置
- [ ] 配置 GitHub Actions 自动部署
- [ ] 创建首页 `docs/index.md`

### 阶段 2：内容骨架 (Day 2)

- [ ] 编写侧边栏结构（所有 .md 文件占位）
- [ ] 完成「介绍」和「安装」章节
- [ ] 添加第一个视频演示

### 阶段 3：核心教程 (Day 3-5)

- [ ] 数据表格教程（含视频、截图）
- [ ] 仪表盘配置教程
- [ ] 关系图教程
- [ ] 标签管理教程

### 阶段 4：交互演示 (Day 6)

- [ ] 创建文档专用的 Mock 组件
- [ ] 嵌入悬浮球演示
- [ ] 嵌入主题切换演示

### 阶段 5：完善 (Day 7)

- [ ] FAQ 常见问题
- [ ] 快捷键参考表
- [ ] 更新日志
- [ ] 全文搜索配置

---

## 三、技术要点

### 3.1 视频嵌入

**本地视频**（推荐录制 MP4 放在 `public/videos/`）：

```md
<video controls width="100%">
  <source src="/videos/getting-started.mp4" type="video/mp4">
</video>
```

**Bilibili 嵌入**：

```md
<iframe
  src="//player.bilibili.com/player.html?bvid=BVxxx&autoplay=0"
  width="100%"
  height="400"
  frameborder="0"
  allowfullscreen>
</iframe>
```

**封装视频组件**（可复用）：

```vue
<!-- docs/.vitepress/components/VideoPlayer.vue -->
<script setup>
defineProps<{ src: string; poster?: string }>()
</script>

<template>
  <div class="video-container">
    <video controls :poster="poster">
      <source :src="src" type="video/mp4">
    </video>
  </div>
</template>

<style scoped>
.video-container {
  border-radius: 8px;
  overflow: hidden;
  margin: 16px 0;
}
video {
  width: 100%;
}
</style>
```

使用：
```md
<VideoPlayer src="/videos/demo.mp4" poster="/images/demo-cover.png" />
```

---

### 3.2 Vue 组件复用策略

**可直接复用**：
- 纯展示组件（Badge、按钮样式）
- 无酒馆 API 依赖的 UI

**需要 Mock 的组件**：

```vue
<!-- docs/.vitepress/components/DemoSettingsDialog.vue -->
<script setup lang="ts">
import { ref } from 'vue'

// Mock 数据，不依赖 Pinia store
const config = ref({
  theme: 'purple',
  fontSize: 14,
  showFloatingBall: true,
})
</script>

<template>
  <div class="demo-container">
    <!-- 复用原组件的模板结构，但用 mock 数据 -->
    <div class="acu-modal">
      <div class="acu-modal-header">设置演示</div>
      <div class="acu-modal-body">
        <!-- 演示内容 -->
      </div>
    </div>
  </div>
</template>

<style>
/* 引入脚本样式（需提取公共样式） */
@import '../../../src/可视化表格/styles/index.scss';
</style>
```

**样式复用**：
- 将 `src/可视化表格/styles/` 中的 CSS 变量和通用样式提取为独立文件
- 在文档组件中导入

---

### 3.3 GitHub Actions 部署

`.github/workflows/docs.yml`：

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: pnpm docs:build

      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: docs/.vitepress/dist
```

`package.json` 添加脚本：

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

---

## 四、内容大纲

### 首页 (`index.md`)

```md
---
layout: home
hero:
  name: ACU 可视化表格
  text: 酒馆数据管理增强工具
  tagline: 让角色卡数据管理变得简单直观
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quick-start
    - theme: alt
      text: 视频教程
      link: /tutorial/data-table

features:
  - icon: 📊
    title: 数据表格
    details: 可视化编辑、搜索、排序、分页
  - icon: 🎛️
    title: 仪表盘
    details: 自定义看板，一目了然
  - icon: 🕸️
    title: 关系图
    details: 可视化人物关系网络
  - icon: 🏷️
    title: 标签管理
    details: 全局标签库，统一管理
---
```

### 教程章节模板

```md
# 数据表格

本章介绍如何使用数据表格功能。

## 视频演示

<VideoPlayer src="/videos/data-table.mp4" />

## 基本操作

### 打开表格

1. 点击悬浮球
2. 选择目标表格

<DemoFloatingBall />

### 编辑数据

...（截图 + 步骤）

## 进阶功能

### 搜索过滤

...

### 批量操作

...
```

---

## 五、注意事项

1. **视频格式**：推荐 MP4 (H.264)，文件不宜过大（<20MB），可用 FFmpeg 压缩
2. **图片优化**：使用 WebP 格式，截图标注用 Snipaste 或 CleanShot
3. **移动端适配**：VitePress 默认响应式，视频需设置 `width="100%"`
4. **多语言**：暂不考虑，后续可添加
5. **版本对应**：文档版本与脚本版本保持一致

---

## 六、预期效果

- 访问地址：`https://<你的用户名>.github.io/<仓库名>/`
- 或自定义域名
- 预计 1 周完成基础版本
