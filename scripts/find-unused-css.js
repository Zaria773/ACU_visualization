/**
 * 未使用 CSS 类名检测脚本
 *
 * 用法: node scripts/find-unused-css.js
 *
 * 功能:
 * 1. 扫描 styles/ 目录下所有 SCSS 文件中定义的类名
 * 2. 在 Vue/TS/HTML 文件中搜索这些类名的使用情况
 * 3. 输出可能未使用的类名列表
 */

const fs = require('fs');
const path = require('path');

// 配置
const STYLES_DIR = path.join(__dirname, '../src/可视化表格/styles');
const SEARCH_DIRS = [
  path.join(__dirname, '../src/可视化表格/components'),
  path.join(__dirname, '../src/可视化表格/composables'),
  path.join(__dirname, '../src/可视化表格'),
];
const SEARCH_EXTENSIONS = ['.vue', '.ts', '.tsx', '.html'];  // 不包含 .scss，避免类名定义被当作使用

// 忽略的类名模式（这些通常是动态生成或外部依赖）
const IGNORE_PATTERNS = [
  /^fa-/,           // Font Awesome
  /^fas$/,
  /^fab$/,
  /^cy-/,           // Cytoscape
  /^toastr/,        // Toastr
  /^tippy/,         // Tippy.js
  /^acu-theme-/,    // 动态主题类
  /^is-/,           // 状态类（通常动态添加）
  /^has-/,
  /^no-/,
  // 动态拼接的类名（通过模板字符串生成）
  /^acu-badge-/,    // Badge.vue: `acu-badge-${detectedType.value}`
  /^acu-view-/,     // DataTable.vue: `acu-view-${viewMode}`
  /^acu-layout-/,   // App.vue: `acu-layout-${layout}`
  /^acu-font-/,     // App.vue: `acu-font-${fontFamily}`
  /^acu-source-/,   // AvatarManagerDialog.vue: 'acu-source-' + item.source
];

/**
 * 递归获取目录下所有指定扩展名的文件
 */
function getAllFiles(dir, extensions, files = []) {
  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFiles(fullPath, extensions, files);
    } else if (extensions.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 从 SCSS 文件中提取类名
 */
function extractClassNames(scssContent) {
  const classNames = new Set();

  // 匹配 .class-name 模式（包括嵌套的 &.class-name）
  // 但排除变量引用 #{$var}
  const patterns = [
    /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g,  // .class-name
    /&\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g, // &.class-name (嵌套)
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scssContent)) !== null) {
      const className = match[1];
      // 排除 SCSS 变量和函数
      if (!className.startsWith('$') &&
          !className.startsWith('@') &&
          !className.match(/^[0-9]/)) {
        classNames.add(className);
      }
    }
  }

  return classNames;
}

/**
 * 检查类名是否在内容中被使用
 */
function isClassUsed(className, content) {
  // 检查多种使用方式
  const patterns = [
    // HTML class 属性
    new RegExp(`class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"`, 'g'),
    new RegExp(`class='[^']*\\b${escapeRegex(className)}\\b[^']*'`, 'g'),
    // Vue :class 绑定
    new RegExp(`:class="[^"]*['"]${escapeRegex(className)}['"][^"]*"`, 'g'),
    new RegExp(`:class="\\{[^}]*['"]${escapeRegex(className)}['"][^}]*\\}"`, 'g'),
    // 模板字符串
    new RegExp(`\`[^\`]*\\b${escapeRegex(className)}\\b[^\`]*\``, 'g'),
    // JavaScript 字符串
    new RegExp(`['"]${escapeRegex(className)}['"]`, 'g'),
    new RegExp(`['"][^'"]*\\b${escapeRegex(className)}\\b[^'"]*['"]`, 'g'),
    // addClass / removeClass / toggleClass
    new RegExp(`(?:addClass|removeClass|toggleClass)\\(['"]${escapeRegex(className)}['"]\\)`, 'g'),
    // classList.add/remove/toggle
    new RegExp(`classList\\.(?:add|remove|toggle)\\(['"]${escapeRegex(className)}['"]\\)`, 'g'),
    // 直接使用类名字符串
    new RegExp(`\\.${escapeRegex(className)}(?![a-zA-Z0-9_-])`, 'g'),
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 检查类名是否应该被忽略
 */
function shouldIgnore(className) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(className));
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始扫描未使用的 CSS 类名...\n');

  // 1. 获取所有 SCSS 文件
  const scssFiles = getAllFiles(STYLES_DIR, ['.scss']);
  console.log(`📁 找到 ${scssFiles.length} 个 SCSS 文件`);

  // 2. 提取所有类名
  const classNamesByFile = new Map();
  const allClassNames = new Set();

  for (const file of scssFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const classNames = extractClassNames(content);
    const relativePath = path.relative(STYLES_DIR, file);
    classNamesByFile.set(relativePath, classNames);
    classNames.forEach(name => allClassNames.add(name));
  }

  console.log(`🏷️  提取到 ${allClassNames.size} 个不同的类名\n`);

  // 3. 获取所有需要搜索的文件
  let searchFiles = [];
  for (const dir of SEARCH_DIRS) {
    searchFiles = searchFiles.concat(getAllFiles(dir, SEARCH_EXTENSIONS));
  }
  // 去重
  searchFiles = [...new Set(searchFiles)];
  console.log(`📄 将在 ${searchFiles.length} 个文件中搜索使用情况\n`);

  // 4. 读取所有搜索文件的内容
  let allContent = '';
  for (const file of searchFiles) {
    allContent += fs.readFileSync(file, 'utf-8') + '\n';
  }

  // 5. 检查每个类名的使用情况
  const unusedByFile = new Map();
  const usedClasses = new Set();
  const unusedClasses = new Set();
  const ignoredClasses = new Set();

  for (const [file, classNames] of classNamesByFile) {
    const unused = [];

    for (const className of classNames) {
      if (shouldIgnore(className)) {
        ignoredClasses.add(className);
        continue;
      }

      if (isClassUsed(className, allContent)) {
        usedClasses.add(className);
      } else {
        unused.push(className);
        unusedClasses.add(className);
      }
    }

    if (unused.length > 0) {
      unusedByFile.set(file, unused);
    }
  }

  // 6. 输出结果
  console.log('=' .repeat(60));
  console.log('📊 扫描结果统计');
  console.log('=' .repeat(60));
  console.log(`✅ 已使用: ${usedClasses.size} 个类名`);
  console.log(`❌ 可能未使用: ${unusedClasses.size} 个类名`);
  console.log(`⏭️  已忽略: ${ignoredClasses.size} 个类名`);
  console.log('');

  if (unusedByFile.size > 0) {
    console.log('=' .repeat(60));
    console.log('📋 按文件列出可能未使用的类名');
    console.log('=' .repeat(60));

    for (const [file, unused] of unusedByFile) {
      console.log(`\n📁 ${file} (${unused.length} 个)`);
      console.log('-'.repeat(40));
      for (const className of unused.sort()) {
        console.log(`   .${className}`);
      }
    }
  } else {
    console.log('🎉 未发现明显未使用的类名！');
  }

  // 7. 输出建议
  console.log('\n' + '=' .repeat(60));
  console.log('💡 使用建议');
  console.log('=' .repeat(60));
  console.log(`
⚠️  注意事项:
1. 此脚本基于静态分析，可能存在误报（动态生成的类名无法检测）
2. 某些类名可能在 SCSS 中作为选择器的一部分使用（如 .parent .child）
3. 建议逐个确认后再删除

🔧 检查单个类名的使用情况:
   grep -r "class-name" src/可视化表格 --include="*.vue" --include="*.ts"

📝 输出到文件:
   node scripts/find-unused-css.js > unused-css-report.txt
`);
}

main();
