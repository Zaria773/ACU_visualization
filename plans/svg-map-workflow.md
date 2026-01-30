# 基于 SVG 骨架与 AI 生图的动态地图生成工作流

本文档总结了利用 SVG 作为结构骨架，结合 AI 生图（ControlNet/Img2Img）生成高沉浸感地图的技术方案。该方案旨在解决传统图片地图坐标定位困难、动态扩展性差的问题，同时兼顾视觉美感与低成本交互。

## 1. 核心理念：双层渲染 (Dual-Layer Rendering)

我们将地图分为**交互层**和**视觉层**，两者通过统一的坐标系（SVG ViewBox）完美对齐。

*   **底层（视觉层）**：由 AI 基于 SVG 骨架生成的精美位图（JPG/PNG）。负责提供沉浸感、氛围感和艺术细节。
*   **顶层（交互层）**：原始 SVG 代码，但在前端设置为透明（`opacity: 0`）。负责提供精准的点击区域、热区检测和动态图标挂载。

**优势**：
*   **零坐标配置**：交互区域（SVG `<path>`）与视觉图像（AI 生成）天然重合，无需人工标注像素坐标。
*   **动态可扩展**：可以在 SVG 层动态插入新的图标（如“新发现的商店”），而无需重新生成底图。
*   **低端模型适配**：通过强语义的颜色编码，即使是普通的生图模型也能准确理解地图结构。

---

## 2. 技术工作流 (Workflow)

### 阶段一：地图初始化（生成底图）

当玩家首次进入一个新区域（如“XX市”）时触发：

1.  **生成 SVG 骨架**：
    *   脚本调用 LLM（如 GPT-4o-mini），要求其生成一段 SVG 代码。
    *   **关键要求**：使用特定的**颜色编码**来代表不同地形（见下文）。
    *   **产出**：一张包含色块（街区）、线条（道路）、曲线（河流）的粗糙 SVG。

2.  **AI 生图（"画皮"）**：
    *   脚本将 SVG 转换为 Base64 图片，发送给生图 API（Stable Diffusion / Midjourney）。
    *   **模式**：Img2Img（图生图）或 ControlNet（推荐）。
    *   **Prompt**：使用特定的颜色映射提示词，告诉 AI “把棕色画成房子，把蓝色画成水”。
    *   **产出**：一张布局与 SVG 完全一致，但细节极度丰富的精美地图。

3.  **前端合成**：
    *   在网页上创建一个容器。
    *   底层放 AI 生成图，顶层放透明 SVG。
    *   底图生成完毕，存入数据库缓存。

### 阶段二：增量更新（动态加点）

当玩家发现新地点（如“幸福宠物店”）时触发：

1.  **解析位置**：
    *   脚本读取地点描述：“在市中心广场旁边”。
    *   解析出关键词 `市中心` -> 对应 SVG 中的 `<path id="block_center">` 区域。

2.  **随机坐标分配**：
    *   在 `block_center` 的多边形范围内，随机生成一个 `(x, y)` 坐标。
    *   **避让算法**：利用 SVG 的 `isPointInPath` 检查该点是否落在 `road`（道路）区域，如果是则重随，确保图标不会生成在马路中间。

3.  **动态挂载**：
    *   在顶层 SVG 中插入一个图标元素（`<image>` 或 `<g>`），位置设为刚才生成的坐标。
    *   **视觉优化**：给图标添加投影（Shadow）和底座，使其看起来像悬浮在地图上的棋子，解决与底图透视不符的违和感。

---

## 3. 实战资源：SVG 颜色编码与提示词

为了让 AI（尤其是低端模型）准确理解 SVG 意图，我们采用**强语义颜色映射**策略。

### 3.1 SVG 颜色定义

| 颜色 (Hex) | 颜色名称 | 语义含义 | 对应 AI 绘制对象 |
| :--- | :--- | :--- | :--- |
| `#2E8B57` | SeaGreen | **自然背景** | 草地、森林、荒野 |
| `#8B4513` | SaddleBrown | **建筑群** | 密集的房屋、屋顶、土木结构 |
| `#D3D3D3` | LightGray | **人工铺装** | 广场、石板地、庭院 |
| `#F5DEB3` | Wheat | **道路** | 泥土路、街道、主干道 |
| `#1E90FF` | DodgerBlue | **水域** | 河流、湖泊、护城河 |

### 3.2 对应的生图提示词 (Prompt)

**通用版（中世纪奇幻城镇）**：

> **Positive Prompt**:
> Top down view of a medieval fantasy town map.
> **(Color Mapping Instructions)**:
> - The **brown blocks (#8B4513)** are crowded medieval wooden houses with red rooftops.
> - The **light grey square (#D3D3D3)** in the center is a stone paved town square.
> - The **green background (#2E8B57)** is lush green grass and forest.
> - The **beige lines (#F5DEB3)** are dirt roads and streets.
> - The **blue curve (#1E90FF)** is a clean river water.
> **(Style)**: RPG map style, hand-drawn texture, ink lines, vibrant colors, flat shading, high detail, no text, no blur.

> **Negative Prompt**:
> text, labels, watermark, 3d buildings, perspective view, street view, realistic photos, modern cars, blurred, messy, low quality.

### 3.3 SVG 骨架示例代码

```xml
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- 背景: 绿色 (草地) -->
  <rect width="100%" height="100%" fill="#2E8B57" />

  <!-- 建筑街区 (棕色) -->
  <path id="block_nw" d="M20,20 L200,20 L200,200 L20,200 Z" fill="#8B4513" stroke="none" />
  <path id="block_ne" d="M312,20 L492,20 L492,200 L312,200 Z" fill="#8B4513" stroke="none" />
  <path id="block_sw" d="M20,312 L200,312 L200,492 L20,492 Z" fill="#8B4513" stroke="none" />
  <path id="block_se" d="M312,312 L492,312 L492,492 L312,492 Z" fill="#8B4513" stroke="none" />

  <!-- 市中心广场 (浅灰) -->
  <path id="block_center" d="M220,220 L292,220 L292,292 L220,292 Z" fill="#D3D3D3" stroke="none" />

  <!-- 河流 (纯蓝) -->
  <path d="M0,256 C150,200 350,300 512,256" stroke="#1E90FF" stroke-width="40" fill="none" />

  <!-- 道路网 (米黄) -->
  <line x1="256" y1="0" x2="256" y2="512" stroke="#F5DEB3" stroke-width="15" />
  <line x1="0" y1="256" x2="512" y2="256" stroke="#F5DEB3" stroke-width="15" />
  <circle cx="256" cy="256" r="150" stroke="#F5DEB3" stroke-width="10" fill="none" />
</svg>
```

---

## 4. 场景分级策略

为了平衡成本与体验，建议根据场景大小采取不同的渲染策略：

| 场景类型 | 示例 | 推荐方案 | 说明 |
| :--- | :--- | :--- | :--- |
| **大世界/区域** | 诺德森大陆、翡翠森林 | **SVG + AI 生图** | 需要极强的氛围感和艺术风格，且地形相对固定。 |
| **城市/街区** | 暴风城、贫民窟 | **SVG + AI 生图** | 需要体现城市肌理，使用上述的“颜色映射”法生成。 |
| **室内/小场景** | 宠物店、酒馆大厅 | **纯 SVG (蓝图风)** | 结构简单（墙、家具），直接用 SVG 绘制线框图或像素风平面图即可，无需 AI 生图，响应最快。 |
| **现实世界** | 北京市海淀区 | **GeoJSON + D3.js** | 直接使用开源地理数据渲染，精准度 100%，无需 AI 介入。 |
