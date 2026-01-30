# 地图生成系统设计方案 (Python + AI)

本方案旨在解决**“如何将Excel/CSV表格中的地点信息转化为AI可识别的地图结构”**的问题，特别是如何处理“装饰性区域”（功能区）与“叙事性地标”（具体的楼、塔、店）之间的空间关系。

## 1. 核心挑战：占坑 (Hole Reservation)

我们面临的主要矛盾是：
*   **功能区 (Zones)**：如“住宅区”、“商业区”，它们是背景噪音，形状不重要，主要是为了填充空间。
*   **叙事地标 (Landmarks)**：如“法师塔”、“黑市入口”，它们是故事核心，必须有**特定的形状**（塔是圆的，兵营是方的）和**特定的位置**。

如果 AI 只是把它们混在一起画，ControlNet 可能会把法师塔画成一栋普通的居民楼。

### 解决方案：基于优先级的布尔挖孔算法

我们将生成过程分为两层：

1.  **前景层 (Foreground)**：优先放置所有“叙事地标”。它们有固定的形状（圆形、矩形、多边形）和高对比度的语义颜色（红、蓝）。
2.  **背景层 (Background)**：用 Voronoi 图或 Grid 网格填充剩余空间，作为“功能区”。
3.  **挖孔 (Boolean Subtract)**：在绘制背景层时，必须**扣除**前景层所占据的区域，防止背景的“居民楼”覆盖了“法师塔”。

---

## 2. 表格数据结构 (Excel/CSV Template)

我们设计一个简单的 CSV 模板，让用户只需填写这些信息：

| 字段名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `id` | 唯一标识符 | `magic_tower` |
| `name` | 显示名称 | 法师塔 |
| `type` | 类型 (`landmark` 或 `zone`) | `landmark` |
| `category` | 具体的建筑类型 (决定颜色) | `tower` (对应红色), `shop` (对应蓝色), `housing` (对应棕色) |
| `shape` | 形状 (`circle`, `rect`, `grid`) | `circle` |
| `size` | 相对大小 (1-10) | `3` |
| `position` | 大致位置 (`center`, `nw`, `se`...) | `center` |
| `description` | 用于生成 Prompt 的描述 | "a tall mysterious wizard tower with purple light" |

---

## 3. 生成逻辑流程 (Python Script)

### 步骤 A：布局计算
1.  **画布初始化**：创建一个 512x512 的空白画布。
2.  **地标落位 (Placement)**：
    *   读取所有 `type=landmark` 的行。
    *   根据 `position` (如 `nw` 西北角) 计算一个大致坐标。
    *   添加随机抖动，确保不完全死板。
    *   **碰撞检测**：确保新放下的地标不与已有的地标重叠。
3.  **功能区填充 (Tessellation)**：
    *   在画布上随机撒下 50-100 个种子点。
    *   生成 Voronoi 图（泰森多边形），将画布切碎成小块。
    *   剔除那些**落在地标内部**的多边形（这就是“占坑”！）。
    *   将剩余的多边形根据 `category` 填色（如：靠近中心的填灰色作为商业区，边缘的填棕色作为住宅区）。

### 步骤 B：SVG 输出
1.  **写入地标**：将地标作为 `<circle>` 或 `<rect>` 写入 SVG，填充**高亮语义色**（如 `#FF0000`）。
2.  **写入背景**：将功能区碎片作为 `<path>` 写入 SVG，填充**纹理语义色**（如 `#8B4513`）。
3.  **写入路网**：在多边形之间留出缝隙（stroke-width），作为道路。

---

## 4. AI 匹配策略 (Prompting)

Python 脚本不仅生成 SVG，还会**自动生成 Prompt**。

*   **SVG 侧**：
    *   法师塔 = `#FF0000` (纯红)
    *   居民区 = `#8B4513` (棕色)
*   **Prompt 侧**：
    *   脚本会自动拼接：“The **red circle** is a mysterious wizard tower. The **brown blocks** are crowded wooden houses...”

这样，AI 看到红圈就知道要画塔，看到棕色块就知道要画房子，完美对应。

---

## 5. 目录结构建议

```
project/
├── data/
│   └── map_data.csv        # 用户填写的表格
├── templates/
│   └── base_prompt.txt     # 提示词模板
├── output/
│   ├── map.svg             # 生成的 SVG 底图
│   └── prompt.txt          # 生成的 Prompt
└── map_gen.py              # Python 主脚本
