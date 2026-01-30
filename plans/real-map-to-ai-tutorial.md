# 【保姆级】把现实地图变成 RPG 游戏地图 (GeoJSON + AI)

本教程将教你如何把**你家楼下的街道**或者**任何现实城市**，变成一张极具沉浸感的 RPG/赛博朋克游戏地图。

**核心原理**：
1. 下载现实地图数据 (GeoJSON)。
2. 转换成 AI 能看懂的色块图 (SVG)。
3. 用 AI (ControlNet) 给它“贴图”变成精美画作。

---

## 第一步：获取现实地图数据 (GeoJSON)

不需要写代码，我们用现成的在线工具。

### 方法 A：简单的行政区（适合生成大地图）
1. 打开 **[阿里云 DataV 地图选择器](http://datav.aliyun.com/portal/school/atlas/area_selector)**。
2. 搜索你想要的城市或区域（例如“杭州市西湖区”）。
3. 点击地图上的区域，右侧会出现下载按钮。
4. 点击 **JSON** 图标下载，或者复制里面的代码。

### 方法 B：精细的街道/建筑（适合生成街区图）
1. 打开 **[geojson.io](https://geojson.io/)**。
2. 在地图上定位到你想生成的区域。
3. 使用左侧工具栏：
   - 矩形工具：框选一片区域。
   - 绘制工具：手描几条特殊的路线。
4. 右侧 `JSON` 面板里的代码就是我们要的。

---

## 第二步：转换成 SVG 底图

把下载到的数据变成 AI 能识别的“语义色块”。

1. 打开我为你准备的工具：`map_converter.html`（在浏览器中打开该文件）。
2. 把第一步获取的 GeoJSON 代码粘贴到左侧输入框。
3. 点击 **“生成 SVG 预览”**。
4. 你会看到一张花花绿绿的图：
   - **棕色** = 建筑/街区
   - **米色** = 道路
   - **蓝色** = 水域
   - **绿色** = 背景
5. 点击 **“下载 SVG 文件”**，保存为 `map_base.svg`。

---

## 第三步：AI 魔改 (ControlNet)

这一步是见证奇迹的时刻。你需要安装了 ControlNet 的 Stable Diffusion WebUI。

1. **上传底图**：
   - 打开 SD WebUI -> **txt2img (文生图)** -> **ControlNet** 栏目。
   - 把刚才下载的 `map_base.svg` 拖进去。

2. **设置 ControlNet**：
   - **Enable**: 勾选 (启用)。
   - **Preprocessor (预处理器)**: 选择 `None`。
     - *注意：因为 SVG 已经是分好色的色块图了，不需要再预处理。*
   - **Model (模型)**: 选择 `control_v11p_sd15_seg` (语义分割模型)。
   - **Resize Mode**: `Just Resize` (直接缩放)。

3. **输入提示词 (Prompt)**：
   复制下面的模板，根据你想要的风格修改。

   **现代写实风 (Google Maps 风格)**：
   > Top down satellite view of a modern city, realistic, 8k resolution.
   > The brown blocks are residential buildings. The beige lines are asphalt roads. The blue area is a river. The green background is park grass.
   > (Negative: text, labels, low quality, blurry)

   **赛博朋克风 (夜之城)**：
   > Top down view of a cyberpunk city, night, neon lights, glowing.
   > The brown blocks are high-tech skyscrapers with neon signs. The beige lines are glowing energy roads. The blue area is a digital stream.
   > (Negative: day, sun, rustic, vintage)

   **中世纪风 (DND)**：
   > Top down view of a medieval fantasy town, parchment texture.
   > The brown blocks are wooden houses with red roofs. The beige lines are dirt paths.
   > (Negative: cars, modern, concrete)

4. **点击 Generate (生成)**！

---

## 第四步：怎么用在游戏里？

现在你手上有两样东西：
1. **SVG 文件** (交互层)：包含了精确的坐标和形状。
2. **AI 生成图** (视觉层)：看起来超酷的地图。

在前端网页里：
- 把 **AI 生成图** 设为背景图片。
- 把 **SVG 文件** 盖在上面，设置透明度 `opacity: 0`。
- 监听 SVG 的点击事件。

**效果**：玩家看到的是酷炫的赛博朋克城市，点上去的时候，程序能精确知道他点的是“海淀区中关村街道”，因为 SVG 的形状和 AI 图是完美重合的！
