/**
 * 智能 CSS 清理脚本
 *
 * 功能：
 * 1. 检测未使用的 CSS 类
 * 2. 识别类的类型（顶级/嵌套/选择器组）
 * 3. 只自动删除安全的顶级类
 *
 * 用法:
 *   node scripts/smart-css-cleanup.js --analyze    # 分析并显示统计
 *   node scripts/smart-css-cleanup.js --dry-run    # 预览删除（不实际执行）
 *   node scripts/smart-css-cleanup.js --execute    # 实际执行删除
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
const SEARCH_EXTENSIONS = ['.vue', '.ts', '.tsx', '.html'];

// 忽略的类名模式
const IGNORE_PATTERNS = [
  /^fa-/, /^fas$/, /^fab$/,           // Font Awesome
  /^cy-/,                              // Cytoscape
  /^toastr/, /^tippy/,                 // 第三方库
  /^acu-theme-/,                       // 动态主题类
  /^is-/, /^has-/, /^no-/,            // 状态类
  /^acu-badge-/, /^acu-view-/,        // 动态拼接的类
  /^acu-layout-/, /^acu-font-/,
  /^acu-source-/,
  // Vue Transition 类（通过 name="xxx" 生成）
  /^modal-/, /^toast-/, /^fade-/,
  /^popup-/, /^preview-fade-/,
  /^acu-menu-fade-/, /^acu-fade-/,
  /^hidden-popup-/,
];

// 命令行参数
const MODE = process.argv.includes('--execute') ? 'execute' :
             process.argv.includes('--dry-run') ? 'dry-run' : 'analyze';
const INCLUDE_NESTED = process.argv.includes('--nested');  // 是否也处理嵌套类

/**
 * 递归获取所有文件
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
 * 解析 SCSS 并识别每个类的类型
 * 返回 Map<className, { type: 'TOP'|'NEST'|'GROUP', line: number, context: string }>
 */
function analyzeClassTypes(content, filename) {
  const classInfo = new Map();
  const lines = content.split('\n');

  let depth = 0;          // 括号深度
  let inString = false;
  let stringChar = '';
  let currentSelector = '';
  let selectorStartLine = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      // 处理字符串
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      // 跳过注释
      if (char === '/' && line[i + 1] === '/') break;
      if (char === '/' && line[i + 1] === '*') {
        // 跳过块注释（简化处理）
        continue;
      }

      // 收集选择器
      if (char === '{') {
        if (depth === 0) {
          // 顶级选择器
          const fullSelector = currentSelector.trim();

          // 检查是否是逗号分隔的选择器组
          const hasComma = fullSelector.includes(',');

          // 提取类名
          const classPattern = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
          let match;
          while ((match = classPattern.exec(fullSelector)) !== null) {
            const className = match[1];

            let type;
            if (hasComma) {
              type = 'GROUP';
            } else {
              type = 'TOP';
            }

            classInfo.set(className, {
              type,
              line: selectorStartLine + 1,
              context: fullSelector.slice(0, 60),
              file: filename
            });
          }
        } else {
          // 嵌套选择器
          const nestedSelector = currentSelector.trim();
          const classPattern = /&?\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
          let match;
          while ((match = classPattern.exec(nestedSelector)) !== null) {
            const className = match[1];
            classInfo.set(className, {
              type: 'NEST',
              line: selectorStartLine + 1,
              context: nestedSelector.slice(0, 60),
              file: filename
            });
          }
        }

        depth++;
        currentSelector = '';
        selectorStartLine = lineNum;
      } else if (char === '}') {
        depth = Math.max(0, depth - 1);
        currentSelector = '';
        selectorStartLine = lineNum;
      } else {
        currentSelector += char;
        if (currentSelector.trim() === '' || currentSelector.trim().startsWith('.') ||
            currentSelector.trim().startsWith('&') || currentSelector.trim().startsWith('#')) {
          // 保持
        }
      }
    }

    // 行尾
    if (depth === 0 && currentSelector.trim() && !currentSelector.includes('{')) {
      // 可能是多行选择器的一部分
    } else if (depth === 0) {
      currentSelector = '';
      selectorStartLine = lineNum + 1;
    }
  }

  return classInfo;
}

/**
 * 检查类名是否在代码中被使用
 */
function isClassUsed(className, allContent) {
  const patterns = [
    new RegExp(`class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"`, 'g'),
    new RegExp(`class='[^']*\\b${escapeRegex(className)}\\b[^']*'`, 'g'),
    new RegExp(`:class="[^"]*['"]${escapeRegex(className)}['"][^"]*"`, 'g'),
    new RegExp(`\`[^\`]*\\b${escapeRegex(className)}\\b[^\`]*\``, 'g'),
    new RegExp(`['"]${escapeRegex(className)}['"]`, 'g'),
    new RegExp(`['"][^'"]*\\b${escapeRegex(className)}\\b[^'"]*['"]`, 'g'),
  ];

  return patterns.some(p => p.test(allContent));
}

/**
 * 检查类名在 SCSS 文件中出现的次数（用于判断是否有内部依赖）
 */
function countScssOccurrences(className, allScssContent) {
  const escapedClass = escapeRegex(className);
  // 匹配 .className 或 &.className
  const pattern = new RegExp(`[.&]\\.?${escapedClass}(?![a-zA-Z0-9_-])`, 'g');
  const matches = allScssContent.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * 删除顶级类定义
 */
function removeTopLevelClass(content, className) {
  const escapedClass = escapeRegex(className);

  // 匹配顶级类定义：.class-name { ... }
  // 使用非贪婪匹配内部内容
  const pattern = new RegExp(
    `(^|\\n)([ \\t]*)\\.${escapedClass}\\s*\\{`,
    'gm'
  );

  let result = content;
  let match;
  let removed = false;

  while ((match = pattern.exec(result)) !== null) {
    const startIndex = match.index + match[1].length; // 不删开头的换行
    const braceStart = result.indexOf('{', startIndex);

    if (braceStart === -1) continue;

    // 找到匹配的右括号
    let depth = 0;
    let braceEnd = -1;

    for (let i = braceStart; i < result.length; i++) {
      if (result[i] === '{') depth++;
      if (result[i] === '}') {
        depth--;
        if (depth === 0) {
          braceEnd = i;
          break;
        }
      }
    }

    if (braceEnd === -1) continue;

    // 检查这是否真的是顶级（前面没有其他选择器）
    const beforeMatch = result.slice(0, startIndex);
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const lineContent = beforeMatch.slice(lastNewline + 1);

    // 如果行内有逗号，说明是选择器组的一部分
    if (lineContent.includes(',')) continue;

    // 删除这个块
    result = result.slice(0, startIndex) + result.slice(braceEnd + 1);
    removed = true;

    // 重置搜索位置
    pattern.lastIndex = startIndex;
  }

  // 清理多余空行
  result = result.replace(/\n{3,}/g, '\n\n');

  return { result, removed };
}

/**
 * 删除嵌套类定义 &.class-name { } 或 .parent .class-name { }
 */
function removeNestedClass(content, className) {
  const escapedClass = escapeRegex(className);
  let result = content;
  let removed = false;

  // 模式1：&.class-name { }
  const nestedPattern1 = new RegExp(
    `(\\n[ \\t]*)&\\.${escapedClass}\\s*\\{`,
    'g'
  );

  // 模式2：.class-name { } 在嵌套上下文中
  const nestedPattern2 = new RegExp(
    `(\\n[ \\t]+)\\.${escapedClass}\\s*\\{`,
    'g'
  );

  for (const pattern of [nestedPattern1, nestedPattern2]) {
    let match;
    while ((match = pattern.exec(result)) !== null) {
      const braceStart = result.indexOf('{', match.index);
      if (braceStart === -1) continue;

      // 找到匹配的右括号
      let depth = 0;
      let braceEnd = -1;

      for (let i = braceStart; i < result.length; i++) {
        if (result[i] === '{') depth++;
        if (result[i] === '}') {
          depth--;
          if (depth === 0) {
            braceEnd = i;
            break;
          }
        }
      }

      if (braceEnd === -1) continue;

      // 删除从换行开始到右括号结束
      result = result.slice(0, match.index) + result.slice(braceEnd + 1);
      removed = true;

      // 重置搜索位置
      pattern.lastIndex = match.index;
    }
  }

  // 清理多余空行
  result = result.replace(/\n{3,}/g, '\n\n');

  return { result, removed };
}

/**
 * 主函数
 */
function main() {
  console.log(`\n🔍 智能 CSS 清理脚本 - 模式: ${MODE}\n`);

  // 1. 获取所有 SCSS 文件
  const scssFiles = getAllFiles(STYLES_DIR, ['.scss']);
  console.log(`📁 找到 ${scssFiles.length} 个 SCSS 文件`);

  // 2. 分析每个文件中类的类型
  const allClassInfo = new Map();

  for (const file of scssFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(STYLES_DIR, file);
    const classInfo = analyzeClassTypes(content, relativePath);

    for (const [className, info] of classInfo) {
      // 如果同一个类在多个地方定义，保留更严格的类型
      if (!allClassInfo.has(className)) {
        allClassInfo.set(className, info);
      } else {
        const existing = allClassInfo.get(className);
        // GROUP > NEST > TOP (更严格)
        if (info.type === 'GROUP' ||
            (info.type === 'NEST' && existing.type === 'TOP')) {
          allClassInfo.set(className, info);
        }
      }
    }
  }

  console.log(`🏷️  分析到 ${allClassInfo.size} 个类定义\n`);

  // 3. 读取所有使用文件
  let searchFiles = [];
  for (const dir of SEARCH_DIRS) {
    searchFiles = searchFiles.concat(getAllFiles(dir, SEARCH_EXTENSIONS));
  }
  searchFiles = [...new Set(searchFiles)];

  let allContent = '';
  for (const file of searchFiles) {
    allContent += fs.readFileSync(file, 'utf-8') + '\n';
  }

  console.log(`📄 在 ${searchFiles.length} 个文件中搜索使用情况\n`);

  // 读取所有 SCSS 内容（用于检查内部依赖）
  let allScssContent = '';
  for (const file of scssFiles) {
    allScssContent += fs.readFileSync(file, 'utf-8') + '\n';
  }

  // 4. 识别未使用的类并按类型分类
  const unusedByType = {
    TOP: [],
    NEST: [],
    NEST_SAFE: [],  // 新增：可安全删除的嵌套类（SCSS 中只出现 1 次）
    GROUP: []
  };

  for (const [className, info] of allClassInfo) {
    if (shouldIgnore(className)) continue;

    if (!isClassUsed(className, allContent)) {
      if (info.type === 'NEST') {
        // 检查 SCSS 内部依赖
        const scssCount = countScssOccurrences(className, allScssContent);
        if (scssCount <= 1) {
          unusedByType.NEST_SAFE.push({ className, ...info, scssCount });
        } else {
          unusedByType.NEST.push({ className, ...info, scssCount });
        }
      } else {
        unusedByType[info.type].push({ className, ...info });
      }
    }
  }

  // 5. 输出统计
  console.log('='.repeat(60));
  console.log('📊 未使用类的类型分布');
  console.log('='.repeat(60));
  console.log(`[TOP]       顶级类: ${unusedByType.TOP.length} 个 ✅ 可安全删除`);
  console.log(`[NEST_SAFE] 嵌套类(无依赖): ${unusedByType.NEST_SAFE.length} 个 ✅ 可安全删除`);
  console.log(`[NEST]      嵌套类(有依赖): ${unusedByType.NEST.length} 个 ⚠️ 保留`);
  console.log(`[GROUP]     选择器组: ${unusedByType.GROUP.length} 个 ❌ 需手动处理`);
  console.log('');

  if (INCLUDE_NESTED) {
    console.log('💡 --nested 模式：将同时删除 NEST_SAFE 类\n');
  }

  if (MODE === 'analyze') {
    // 只分析，输出详情
    console.log('='.repeat(60));
    console.log('📋 [TOP] 可安全删除的顶级类');
    console.log('='.repeat(60));

    // 按文件分组
    const topByFile = {};
    for (const item of unusedByType.TOP) {
      if (!topByFile[item.file]) topByFile[item.file] = [];
      topByFile[item.file].push(item);
    }

    for (const [file, items] of Object.entries(topByFile)) {
      console.log(`\n📁 ${file} (${items.length} 个)`);
      for (const item of items) {
        console.log(`   L${item.line}: .${item.className}`);
      }
    }

    // 显示可安全删除的嵌套类
    if (unusedByType.NEST_SAFE.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ [NEST_SAFE] 可安全删除的嵌套类（SCSS 中只出现 1 次）');
      console.log('='.repeat(60));
      for (const item of unusedByType.NEST_SAFE) {
        console.log(`   ${item.file}:${item.line} .${item.className}`);
      }
    }

    if (unusedByType.NEST.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('⚠️ [NEST] 嵌套类（需手动检查）');
      console.log('='.repeat(60));
      for (const item of unusedByType.NEST.slice(0, 20)) {
        console.log(`   ${item.file}:${item.line} .${item.className}`);
      }
      if (unusedByType.NEST.length > 20) {
        console.log(`   ... 还有 ${unusedByType.NEST.length - 20} 个`);
      }
    }

    if (unusedByType.GROUP.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('❌ [GROUP] 选择器组类（需手动处理）');
      console.log('='.repeat(60));
      for (const item of unusedByType.GROUP.slice(0, 20)) {
        console.log(`   ${item.file}:${item.line} .${item.className}`);
      }
      if (unusedByType.GROUP.length > 20) {
        console.log(`   ... 还有 ${unusedByType.GROUP.length - 20} 个`);
      }
    }

    console.log('\n💡 运行 `node scripts/smart-css-cleanup.js --dry-run` 预览删除顶级类');
    console.log('   运行 `node scripts/smart-css-cleanup.js --dry-run --nested` 预览删除顶级类 + 安全嵌套类');
    console.log('   运行 `node scripts/smart-css-cleanup.js --execute --nested` 执行删除');
    return;
  }

  // 6. 准备要删除的类
  const classesToDelete = [...unusedByType.TOP];
  if (INCLUDE_NESTED) {
    classesToDelete.push(...unusedByType.NEST_SAFE);
  }

  if (classesToDelete.length === 0) {
    console.log('\n✅ 没有可安全删除的类');
    return;
  }

  console.log('='.repeat(60));
  console.log(MODE === 'dry-run' ? '🔍 预览删除（不实际修改）' : '🚀 执行删除');
  console.log('='.repeat(60));

  // 按文件分组
  const topByFile = {};
  for (const item of classesToDelete) {
    if (!topByFile[item.file]) topByFile[item.file] = [];
    topByFile[item.file].push({ className: item.className, type: item.type });
  }

  let totalRemoved = 0;

  for (const [relativeFile, items] of Object.entries(topByFile)) {
    const fullPath = path.join(STYLES_DIR, relativeFile);
    let content = fs.readFileSync(fullPath, 'utf-8');
    let fileRemoved = 0;
    const removedNames = [];

    for (const { className, type } of items) {
      let removed = false;

      if (type === 'TOP') {
        const result = removeTopLevelClass(content, className);
        if (result.removed) {
          content = result.result;
          removed = true;
        }
      } else if (type === 'NEST') {
        const result = removeNestedClass(content, className);
        if (result.removed) {
          content = result.result;
          removed = true;
        }
      }

      if (removed) {
        fileRemoved++;
        totalRemoved++;
        removedNames.push(className);
      }
    }

    if (fileRemoved > 0) {
      console.log(`\n📁 ${relativeFile}`);
      console.log(`   删除 ${fileRemoved} 个类: ${removedNames.slice(0, 5).map(c => `.${c}`).join(', ')}${removedNames.length > 5 ? '...' : ''}`);

      if (MODE === 'execute') {
        fs.writeFileSync(fullPath, content, 'utf-8');
      }
    }
  }

  console.log(`\n✅ 共删除 ${totalRemoved} 个类`);

  if (MODE === 'dry-run') {
    console.log('\n💡 这是预览模式，文件未被修改');
    console.log('   运行 `node scripts/smart-css-cleanup.js --execute` 执行实际删除');
  } else {
    console.log('\n💡 建议运行 `pnpm build` 验证编译是否通过');
  }

  // 提醒还有类需要处理
  const remaining = unusedByType.NEST.length + unusedByType.GROUP.length +
                    (INCLUDE_NESTED ? 0 : unusedByType.NEST_SAFE.length);
  if (remaining > 0) {
    console.log(`\n⚠️ 还有 ${remaining} 个类需要处理`);
    if (!INCLUDE_NESTED && unusedByType.NEST_SAFE.length > 0) {
      console.log(`   其中 ${unusedByType.NEST_SAFE.length} 个是可安全删除的嵌套类，用 --nested 参数删除`);
    }
  }
}

main();
