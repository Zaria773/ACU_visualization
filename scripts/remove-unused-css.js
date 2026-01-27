/**
 * 删除未使用的 CSS 类名脚本（改进版）
 *
 * 用法:
 *   node scripts/remove-unused-css.js --dry-run    # 预览会删除什么（不实际删除）
 *   node scripts/remove-unused-css.js              # 实际执行删除
 *   node scripts/remove-unused-css.js --verbose    # 显示详细日志
 *
 * 改进点:
 *   1. 正确处理嵌套选择器 &.class-name { }（删除整行包括前导空白）
 *   2. 正确处理逗号分隔选择器组（只删除目标选择器，保留其他）
 *   3. 自动清理孤立逗号和多余空行
 *   4. 删除后验证 SCSS 语法（基础检查）
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 配置：要删除的类名列表（不带点号）
// ============================================
const CLASSES_TO_REMOVE = [
  // === 类别 A：已标记为"已移除"的 ===
  'acu-update-hint',

  // === 类别 B：废弃的 Vue Transition 类 ===
  'popup-enter-active',
  'popup-enter-from',
  'popup-enter-to',
  'popup-leave-active',
  'popup-leave-from',
  'popup-leave-to',
  'hidden-popup-enter-active',
  'hidden-popup-enter-from',
  'hidden-popup-leave-active',
  'hidden-popup-leave-to',
  'preview-fade-enter-active',
  'preview-fade-enter-from',
  'preview-fade-leave-active',
  'preview-fade-leave-to',
  'acu-menu-fade-enter-active',
  'acu-menu-fade-enter-from',
  'acu-menu-fade-enter-to',
  'acu-menu-fade-leave-active',
  'acu-menu-fade-leave-from',
  'acu-menu-fade-leave-to',

  // === 添加更多要删除的类名 ===
];

// 样式目录
const STYLES_DIR = path.join(__dirname, '../src/可视化表格/styles');

// 命令行参数
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

/**
 * 递归获取所有 SCSS 文件
 */
function getAllScssFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllScssFiles(fullPath, files);
    } else if (item.endsWith('.scss')) {
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
 * 查找匹配的右括号位置（支持嵌套）
 */
function findMatchingBrace(content, startIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

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

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * 删除顶级类定义 .class-name { ... }
 * 包括处理逗号分隔的选择器组
 */
function removeTopLevelClass(content, className) {
  const classSelector = `.${className}`;
  const escapedClass = escapeRegex(classSelector);
  let result = content;
  let removedCount = 0;

  // 模式1：单独的类选择器 .class-name { }
  // 匹配：可选注释 + .class-name + 空白 + {
  const standalonePattern = new RegExp(
    `((?:\\/\\/[^\\n]*\\n)*[ \\t]*)` +  // 前置注释和缩进
    `${escapedClass}\\s*\\{`,
    'g'
  );

  let match;
  while ((match = standalonePattern.exec(result)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    const braceEnd = findMatchingBrace(result, braceStart);

    if (braceEnd !== -1) {
      // 检查这是否是逗号分隔选择器组的一部分
      const beforeMatch = result.slice(0, match.index);
      const afterBrace = result.slice(braceEnd + 1);

      // 检查前面是否有逗号（说明是选择器组的一部分）
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const lineBeforeMatch = beforeMatch.slice(lastNewline + 1);

      if (lineBeforeMatch.trim().endsWith(',') || lineBeforeMatch.includes(',')) {
        // 这是选择器组的一部分，需要特殊处理
        continue; // 由选择器组处理函数处理
      }

      // 删除整个规则块
      const fullMatch = result.slice(match.index, braceEnd + 1);
      result = result.slice(0, match.index) + result.slice(braceEnd + 1);
      removedCount++;

      if (VERBOSE) {
        console.log(`    [顶级] 删除: ${fullMatch.slice(0, 50).replace(/\n/g, '\\n')}...`);
      }

      // 重置正则位置
      standalonePattern.lastIndex = match.index;
    }
  }

  return { result, removedCount };
}

/**
 * 删除嵌套选择器 &.class-name { ... }
 * 确保删除整行包括前导空白和换行
 */
function removeNestedClass(content, className) {
  const escapedClass = escapeRegex(className);
  let result = content;
  let removedCount = 0;

  // 匹配 &.class-name { } 包括前面的空白和换行
  const nestedPattern = new RegExp(
    `\\n([ \\t]*)&\\.${escapedClass}\\s*\\{`,
    'g'
  );

  let match;
  while ((match = nestedPattern.exec(result)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    const braceEnd = findMatchingBrace(result, braceStart);

    if (braceEnd !== -1) {
      // 删除从换行符开始到右括号结束
      result = result.slice(0, match.index) + result.slice(braceEnd + 1);
      removedCount++;

      if (VERBOSE) {
        console.log(`    [嵌套] 删除: &.${className} { ... }`);
      }

      // 重置正则位置
      nestedPattern.lastIndex = match.index;
    }
  }

  return { result, removedCount };
}

/**
 * 处理逗号分隔的选择器组
 * 例如: .a, .b, .c { } -> 删除 .b 后变成 .a, .c { }
 */
function removeFromSelectorGroup(content, className) {
  const classSelector = `.${className}`;
  let result = content;
  let removedCount = 0;

  // 匹配选择器组: 多个选择器用逗号分隔，以 { 结束
  // 例如: .a,\n.b,\n.c {
  const selectorGroupPattern = /([.#\w\-&\[\]=":*>\s,]+)\s*\{/g;

  let match;
  const replacements = [];

  while ((match = selectorGroupPattern.exec(result)) !== null) {
    const selectorPart = match[1];

    // 检查是否包含目标选择器
    if (!selectorPart.includes(classSelector)) continue;

    // 分割选择器
    const selectors = selectorPart.split(',').map(s => s.trim()).filter(s => s);

    // 检查是否是多选择器组
    if (selectors.length <= 1) continue;

    // 查找并移除目标选择器
    const targetIndex = selectors.findIndex(s => {
      // 精确匹配：选择器就是 .className 或以 .className 开头后跟非类名字符
      const pattern = new RegExp(`^\\${escapeRegex(classSelector)}(?![a-zA-Z0-9_-])`);
      return pattern.test(s) || s === classSelector;
    });

    if (targetIndex === -1) continue;

    // 移除目标选择器
    const newSelectors = selectors.filter((_, i) => i !== targetIndex);

    if (newSelectors.length === 0) {
      // 所有选择器都被删除了，需要删除整个规则块
      const braceStart = match.index + match[0].length - 1;
      const braceEnd = findMatchingBrace(result, braceStart);
      if (braceEnd !== -1) {
        replacements.push({
          start: match.index,
          end: braceEnd + 1,
          replacement: ''
        });
        removedCount++;
      }
    } else {
      // 重建选择器组
      const newSelectorPart = newSelectors.join(',\n');
      const newMatch = newSelectorPart + ' {';

      replacements.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement: newMatch
      });
      removedCount++;

      if (VERBOSE) {
        console.log(`    [选择器组] 从 "${selectorPart.slice(0, 50)}..." 中移除 ${classSelector}`);
      }
    }
  }

  // 从后往前替换，避免位置偏移
  replacements.sort((a, b) => b.start - a.start);
  for (const { start, end, replacement } of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return { result, removedCount };
}

/**
 * 清理语法问题
 */
function cleanupSyntax(content) {
  let result = content;

  // 1. 清理孤立的逗号行（只有逗号和空白的行）
  result = result.replace(/\n\s*,\s*\n/g, '\n');

  // 2. 清理选择器组开头的逗号
  result = result.replace(/\{\s*\n\s*,/g, '{\n');

  // 3. 清理选择器组末尾的逗号（逗号后面直接是 {）
  result = result.replace(/,\s*\{/g, ' {');

  // 4. 清理连续逗号
  result = result.replace(/,\s*,/g, ',');

  // 5. 清理多余空行
  result = result.replace(/\n{3,}/g, '\n\n');

  // 6. 清理选择器组中的多余换行
  result = result.replace(/,\n\s*\n/g, ',\n');

  return result;
}

/**
 * 基础语法验证
 */
function validateSyntax(content, filename) {
  const errors = [];

  // 检查括号匹配
  let braceCount = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

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

    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }

  if (braceCount !== 0) {
    errors.push(`括号不匹配: ${braceCount > 0 ? '缺少 }' : '多余 }'}`);
  }

  // 检查孤立的 &
  const lonelyAmpersand = /&\s*[,}]/g;
  if (lonelyAmpersand.test(content)) {
    errors.push('发现孤立的 & 符号');
  }

  // 检查空的选择器块
  const emptyBlock = /\{\s*\}/g;
  const emptyMatches = content.match(emptyBlock);
  if (emptyMatches && emptyMatches.length > 0) {
    errors.push(`发现 ${emptyMatches.length} 个空的规则块 {}`);
  }

  return errors;
}

/**
 * 从 SCSS 内容中删除指定的类名规则
 */
function removeClassRules(content, classesToRemove, filename) {
  let result = content;
  let totalRemoved = 0;
  const removedClasses = [];

  for (const className of classesToRemove) {
    let classRemoved = 0;

    // 1. 处理顶级类
    const topLevel = removeTopLevelClass(result, className);
    result = topLevel.result;
    classRemoved += topLevel.removedCount;

    // 2. 处理嵌套类
    const nested = removeNestedClass(result, className);
    result = nested.result;
    classRemoved += nested.removedCount;

    // 3. 处理选择器组
    const selectorGroup = removeFromSelectorGroup(result, className);
    result = selectorGroup.result;
    classRemoved += selectorGroup.removedCount;

    if (classRemoved > 0) {
      totalRemoved += classRemoved;
      if (!removedClasses.includes(className)) {
        removedClasses.push(className);
      }
    }
  }

  // 清理语法
  result = cleanupSyntax(result);

  // 验证语法
  const errors = validateSyntax(result, filename);

  return {
    newContent: result,
    removedCount: totalRemoved,
    removedClasses,
    errors
  };
}

/**
 * 主函数
 */
function main() {
  console.log(DRY_RUN ? '🔍 预览模式（不会实际修改文件）\n' : '🚀 执行模式\n');

  if (VERBOSE) {
    console.log('📝 详细日志模式已启用\n');
  }

  if (CLASSES_TO_REMOVE.length === 0) {
    console.log('⚠️  CLASSES_TO_REMOVE 为空，请在脚本中添加要删除的类名');
    return;
  }

  console.log(`📋 待删除类名: ${CLASSES_TO_REMOVE.length} 个`);
  console.log('   ' + CLASSES_TO_REMOVE.slice(0, 10).map(c => `.${c}`).join(', '));
  if (CLASSES_TO_REMOVE.length > 10) {
    console.log(`   ... 还有 ${CLASSES_TO_REMOVE.length - 10} 个`);
  }
  console.log('');

  const scssFiles = getAllScssFiles(STYLES_DIR);
  console.log(`📁 扫描 ${scssFiles.length} 个 SCSS 文件\n`);

  let totalRemoved = 0;
  const affectedFiles = [];
  const filesWithErrors = [];

  for (const file of scssFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(STYLES_DIR, file);

    if (VERBOSE) {
      console.log(`\n处理: ${relativePath}`);
    }

    const { newContent, removedCount, removedClasses, errors } = removeClassRules(
      content,
      CLASSES_TO_REMOVE,
      relativePath
    );

    if (removedCount > 0) {
      affectedFiles.push({ file: relativePath, count: removedCount, classes: removedClasses });
      totalRemoved += removedCount;

      if (!DRY_RUN) {
        fs.writeFileSync(file, newContent, 'utf-8');
      }
    }

    if (errors.length > 0) {
      filesWithErrors.push({ file: relativePath, errors });
    }
  }

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 处理结果');
  console.log('='.repeat(60));

  if (affectedFiles.length > 0) {
    for (const { file, count, classes } of affectedFiles) {
      console.log(`\n📁 ${file}`);
      console.log(`   删除 ${count} 处: ${classes.map(c => `.${c}`).join(', ')}`);
    }
    console.log(`\n✅ 共删除 ${totalRemoved} 处样式规则`);
  } else {
    console.log('\n⚠️  未找到任何匹配的类名');
  }

  // 输出语法错误警告
  if (filesWithErrors.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  语法警告（请手动检查）');
    console.log('='.repeat(60));

    for (const { file, errors } of filesWithErrors) {
      console.log(`\n📁 ${file}`);
      for (const error of errors) {
        console.log(`   ⚠️  ${error}`);
      }
    }
  }

  if (DRY_RUN && affectedFiles.length > 0) {
    console.log('\n💡 这是预览模式，文件未被修改');
    console.log('   运行 `node scripts/remove-unused-css.js` 执行实际删除');
  }

  console.log('\n💡 建议删除后运行 `pnpm build` 验证 SCSS 编译是否通过');
}

main();
