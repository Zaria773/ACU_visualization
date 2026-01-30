/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useConfigStore } from '../stores/useConfigStore';
import { useTagLibraryStore } from '../stores/useTagLibraryStore';
import { useToast } from './useToast';

/**
 * 交互表格导入器
 * 负责将交互表格中的数据解析并导入到全局标签库中
 */
export function useInteractionImporter() {
  const tagStore = useTagLibraryStore();
  const configStore = useConfigStore();
  const { success } = useToast();

  /**
   * 获取主角名
   */
  function getPlayerName(): string {
    const parentWin = window.parent || window;
    try {
      const ctx = (parentWin as any).SillyTavern?.getContext?.();
      if (ctx?.name1) {
        return ctx.name1;
      }
    } catch (e) {
      console.warn('[InteractionImporter] 获取主角名失败', e);
    }
    return '';
  }

  /**
   * 确保分类路径存在，返回分类 ID
   * @param categoryPath 分类路径 (如 "A/B")
   */
  function ensureCategoryPath(categoryPath: string): string {
    if (!categoryPath) return '';

    // 尝试查找现有分类
    const existing = tagStore.getCategoryByPath(categoryPath);
    if (existing) {
      return existing.id;
    }

    // 如果不存在，创建新分类（addCategory 会自动处理父级分类）
    // 默认给一级分类一个通用图标
    const parts = categoryPath.split('/');
    const icon = parts.length === 1 ? 'fa-star' : undefined;

    const newCategory = tagStore.addCategory(categoryPath, icon);
    return newCategory.id;
  }

  /**
   * 从单行数据导入交互
   * @param rowData 行数据 [null, target, label, category, content, description]
   * @returns 是否导入成功
   */
  function importFromRow(rowData: (string | number)[]): boolean {
    try {
      // 数据校验：确保至少有 5 列
      if (!rowData || rowData.length < 5) return false;

      const target = String(rowData[1] || '').trim();
      const label = String(rowData[2] || '').trim();
      const categoryPath = String(rowData[3] || '').trim();
      const content = String(rowData[4] || '').trim();
      // 尝试获取简介列（第6列），如果存在则优先对简介进行逆向替换
      const description = rowData[5] ? String(rowData[5]).trim() : '';

      // 必填项校验
      if (!label || !content) return false;

      // 1. 逆向替换逻辑
      // 如果有简介，优先使用简介进行逆向替换，否则使用内容
      let textToProcess = description || content;

      // 将 {{user}} 替换回占位符 (如果内容中本来就有 {{user}} 则保持不变)
      // 注意：这里假设 content 中的 userName 已经被替换成了实际名字，我们需要逆向找回
      // 但通常 ACU 生成的内容是具体的，我们需要把具体名字替换成占位符

      // 替换 {{user}}: 获取当前主角名并替换为 {{user}}
      const playerName = getPlayerName();
      if (playerName) {
        textToProcess = textToProcess.split(playerName).join('{{user}}');
      }

      // 替换 target 为 {{rowTitle}}
      if (target) {
        // 全局替换 target 为 {{rowTitle}}
        // 使用正则以避免部分匹配 (如 target="A", content="AB" -> "{{rowTitle}}B")
        // 这里简单起见直接 replaceAll，实际可能需要更精细的边界匹配
        textToProcess = textToProcess.split(target).join('{{rowTitle}}');
      }

      // 如果使用了简介进行逆向替换，最终保存的 promptTemplate 应该是处理后的简介
      // 但这里有个问题：标签库的 promptTemplate 通常用于生成内容
      // 如果我们存入的是简介，那么点击标签时生成的就是简介，而不是原始内容
      // 根据需求 "如果此交互表有列含“简介”，会去逆向替换交互简介而不是交互内容"
      // 理解为：用户希望标签库里存的是处理后的简介（作为 promptTemplate），
      // 或者说，用户希望通过简介来生成 promptTemplate，但实际使用时可能需要区分？
      // 按照常规逻辑，promptTemplate 就是点击标签后发送给 AI 或输入框的内容。
      // 如果表里有“简介”，通常意味着“内容”是具体的长文，“简介”是简短描述或指令。
      // 如果用户希望逆向替换简介，那么存入的应该是处理后的简介。
      // 如果没有简介，则处理内容。
      const finalPrompt = textToProcess;

      // 2. 分类处理
      const categoryId = ensureCategoryPath(categoryPath);

      // 3. 存入 Store
      // 检查是否已存在同名标签（在同分类下）
      const existingTag = tagStore.library.tags.find(t => t.label === label && t.categoryId === categoryId);

      if (existingTag) {
        // 更新现有标签
        tagStore.upsertTag({
          ...existingTag,
          promptTemplate: finalPrompt,
          // 保持原有 ID 和创建时间
        });
      } else {
        // 创建新标签
        tagStore.createTag(label, categoryId, finalPrompt);
      }

      return true;
    } catch (e) {
      console.error('[InteractionImporter] Import row failed:', e);
      return false;
    }
  }

  /**
   * 批量导入整个表格数据
   * @param rows 表格的所有行数据
   * @param isAuto 是否为自动导入（受配置开关控制）
   */
  function importAll(rows: (string | number)[][], isAuto = false): number {
    // 如果是自动导入，且开关未开启，则跳过
    if (isAuto && !configStore.config.autoImportInteractions) {
      return 0;
    }

    let successCount = 0;

    if (!rows || !Array.isArray(rows)) return 0;

    rows.forEach(row => {
      if (importFromRow(row)) {
        successCount++;
      }
    });

    if (successCount > 0) {
      success(`成功导入 ${successCount} 个交互动作`);
    }

    return successCount;
  }

  return {
    importFromRow,
    importAll,
  };
}
