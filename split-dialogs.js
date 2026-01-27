/**
 * dialogs.scss 拆分脚本
 *
 * 用法: node split-dialogs.js
 *
 * 此脚本会根据双等号分隔符 // ========= 将 dialogs.scss 拆分为多个文件
 * 拆分后需要手动更新 index.scss 添加新文件导入
 */

const fs = require('fs');
const path = require('path');

const sourceFile = 'src/可视化表格/styles/overlays/dialogs.scss';
const outputDir = 'src/可视化表格/styles/overlays';

// 拆分配置：[起始行, 结束行] (行号从1开始，包含两端)
// 注意：多个区间会合并到同一个文件
const splitConfig = {
  // 保留在 dialogs.scss 的内容
  'dialogs.scss': [
    [1, 484],      // 通用对话框 (.acu-modal-*)
    [1732, 1753],  // 动画过渡效果 (Vue Transition)
    [2353, 2421],  // Toast 通知
  ],

  // 设置面板相关
  'dialogs-settings.scss': [
    [485, 1463],   // 背景配置专用样式
    [1464, 1508],  // 颜色圆点选择器
    [1509, 1618],  // 势力颜色配置区域样式
    [1619, 1731],  // 导航行样式
    [2240, 2352],  // SettingsDialog 导航入口样式
  ],

  // 清除相关弹窗
  'dialogs-purge.scss': [
    [1872, 1903],  // InputFloorDialog 特定样式
    [1904, 2102],  // PurgeRangeDialog 特定样式
    [2103, 2238],  // AdvancedPurgeDialog 高级清除
  ],

  // 手动更新弹窗
  'dialogs-update.scss': [
    [2422, 2586],  // ManualUpdateDialog 手动更新配置弹窗
  ],

  // 预设管理
  'dialogs-preset.scss': [
    [2587, 2682],  // 预设管理相关样式
    [2683, 2762],  // 迷你对话框（保存预设）
    [2763, 2853],  // 预设保存对话框增强样式
  ],

  // 历史记录弹窗
  'dialogs-history.scss': [
    [2854, 3076],  // HistoryDialog 历史记录弹窗样式
  ],

  // 移动端适配
  'dialogs-responsive.scss': [
    [1754, 1871],  // 移动端底部弹起样式
    [3077, 3388],  // 移动端布局
  ],

  // 悬浮球外观
  'dialogs-ball.scss': [
    [3389, 4323],  // BallAppearancePanel 悬浮球外观设置面板
  ],

  // 主题美化
  'dialogs-theme.scss': [
    [4324, 5527],  // ThemePanel 主题美化与高亮配置面板
  ],

  // 字体弹窗
  'dialogs-font.scss': [
    [5528, 5674],  // 自定义字体弹窗样式
  ],

  // 看板组件相关
  'dialogs-widget.scss': [
    [5675, 6207],  // 仪表盘组件设置弹窗
    [6208, 6333],  // WidgetSettingsDialog 组件设置弹窗样式
    [6334, 6608],  // 看板管理弹窗
  ],

  // 标签系统
  'dialogs-tag.scss': [
    [6609, Infinity], // 标签系统样式到文件末尾
  ],
};

// 文件头部注释模板
function getHeader(filename, description) {
  return `// =========================================
// ${description}
// 从 dialogs.scss 拆分而来
// =========================================

`;
}

// 文件描述映射
const fileDescriptions = {
  'dialogs.scss': 'Dialogs - 通用对话框基础样式',
  'dialogs-settings.scss': 'Settings - 设置面板相关样式',
  'dialogs-purge.scss': 'Purge - 清除相关弹窗样式',
  'dialogs-update.scss': 'Update - 手动更新弹窗样式',
  'dialogs-preset.scss': 'Preset - 预设管理相关样式',
  'dialogs-history.scss': 'History - 历史记录弹窗样式',
  'dialogs-responsive.scss': 'Responsive - 移动端适配样式',
  'dialogs-ball.scss': 'Ball - 悬浮球外观设置样式',
  'dialogs-theme.scss': 'Theme - 主题美化与高亮配置样式',
  'dialogs-font.scss': 'Font - 自定义字体弹窗样式',
  'dialogs-widget.scss': 'Widget - 看板组件相关样式',
  'dialogs-tag.scss': 'Tag - 标签系统样式',
};

// 主函数
function main() {
  console.log('📂 读取源文件...');

  // 检查源文件是否存在
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ 源文件不存在: ${sourceFile}`);
    process.exit(1);
  }

  // 读取源文件
  const content = fs.readFileSync(sourceFile, 'utf-8');
  const lines = content.split('\n');
  console.log(`   总行数: ${lines.length}`);

  // 检查输出目录
  if (!fs.existsSync(outputDir)) {
    console.error(`❌ 输出目录不存在: ${outputDir}`);
    process.exit(1);
  }

  console.log('\n🔧 开始拆分...\n');

  const results = [];

  // 为每个目标文件生成内容
  for (const [targetFile, ranges] of Object.entries(splitConfig)) {
    let output = '';

    // 对于新文件（非 dialogs.scss），添加头部注释
    if (targetFile !== 'dialogs.scss') {
      output = getHeader(targetFile, fileDescriptions[targetFile]);
    }

    // 合并所有区间
    for (const [start, end] of ranges) {
      const endLine = end === Infinity ? lines.length : end;
      const chunk = lines.slice(start - 1, endLine).join('\n');
      output += chunk + '\n\n';
    }

    // 清理多余空行
    output = output.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    // 写入文件
    const outputPath = path.join(outputDir, targetFile);
    fs.writeFileSync(outputPath, output);

    const lineCount = output.split('\n').length;
    results.push({ file: targetFile, lines: lineCount });
    console.log(`   ✅ ${targetFile} (${lineCount} 行)`);
  }

  console.log('\n📊 拆分结果汇总:');
  console.log('─'.repeat(40));

  let totalLines = 0;
  for (const { file, lines } of results) {
    console.log(`   ${file.padEnd(28)} ${lines.toString().padStart(5)} 行`);
    totalLines += lines;
  }

  console.log('─'.repeat(40));
  console.log(`   总计: ${totalLines} 行\n`);

  console.log('📝 下一步操作:');
  console.log('   1. 检查生成的文件内容是否正确');
  console.log('   2. 更新 index.scss 添加新文件导入');
  console.log('   3. 运行 pnpm build 验证编译是否通过');
  console.log('   4. 在酒馆中测试各弹窗样式是否正常\n');

  // 生成 index.scss 导入语句
  console.log('📋 index.scss 导入语句 (复制到 overlays 部分):');
  console.log('─'.repeat(40));
  console.log(`
// 4. 覆盖层样式 - 弹窗模块
@use 'overlays/dialogs';           // 通用弹窗基础
@use 'overlays/dialogs-settings';  // 设置面板
@use 'overlays/dialogs-purge';     // 清除弹窗
@use 'overlays/dialogs-update';    // 更新弹窗
@use 'overlays/dialogs-preset';    // 预设管理
@use 'overlays/dialogs-history';   // 历史记录
@use 'overlays/dialogs-responsive';// 移动端适配
@use 'overlays/dialogs-ball';      // 悬浮球外观
@use 'overlays/dialogs-theme';     // 主题美化
@use 'overlays/dialogs-font';      // 字体弹窗
@use 'overlays/dialogs-widget';    // 看板组件
@use 'overlays/dialogs-tag';       // 标签系统

// 4. 覆盖层样式 - 其他
@use 'overlays/context-menu';
@use 'overlays/quick-view';
@use 'overlays/overlays';
@use 'overlays/avatar-dialogs';
@use 'overlays/dashboard-dialogs';
@use 'overlays/tag-manager';
`);
}

main();
