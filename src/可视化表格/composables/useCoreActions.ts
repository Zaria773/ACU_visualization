/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 核心动作 Composable
 * 迁移原代码中的 CoreActions 对象逻辑
 */

import { useDataStore } from '../stores/useDataStore';
import { getBadgeStyle, getCore } from '../utils';
import { useDataPersistence } from './useDataPersistence';
import { appendPromptToInput } from './useHiddenPrompt';
import { toast } from './useToast';

export function useCoreActions() {
  const { saveToDatabase, getTableData, saveSnapshot, loadSnapshot } = useDataPersistence();
  const dataStore = useDataStore();

  // ============================================================
  // 核心操作
  // ============================================================

  /**
   * 插入新行
   * @param tableKey 表格 Key (sheetId，如 'sheet_0')
   * @param rowIdx 行索引 (在此行之后插入)
   */
  const insertRow = async (tableKey: string, rowIdx: number) => {
    // 优先使用 stagedData，其次使用 API 获取的数据
    let rawData = dataStore.getStagedData();
    if (!rawData) {
      rawData = getTableData();
    }
    if (!rawData) {
      console.warn('[ACU insertRow] 无法获取数据');
      toast.error('无法获取数据');
      return;
    }

    const sheet = rawData[tableKey];
    if (!sheet?.content) {
      console.warn('[ACU insertRow] 未找到表格:', tableKey, '可用表格:', Object.keys(rawData));
      toast.error('未找到目标表格');
      return;
    }

    const content = sheet.content;
    const colCount = content[0] ? content[0].length : 2;

    // 创建空行
    const newRow = new Array(colCount).fill('');
    // 如果有第一列且看起来像序号，尝试自动填充
    if (colCount > 0) newRow[0] = String(content.length);

    // 插入到当前行之后（rowIdx 是从 0 开始的数据行索引，content[0] 是表头，所以 +2）
    content.splice(rowIdx + 2, 0, newRow);

    toast.info('正在插入新行...');

    // 关键修复：先更新 stagedData，确保 saveToDatabase 使用最新数据
    dataStore.setStagedData(rawData);

    // 关键修复：将新行添加到 manualDiffMap，这样 saveToDatabase 才会检测到变更
    // 使用表格名称（而非 tableKey）来生成 rowKey，与 getModifiedTableIds 保持一致
    const tableName = sheet.name || tableKey.replace('sheet_', '');
    const newRowIndex = rowIdx + 1; // 新行在数据行中的索引（不含表头）
    const rowKey = dataStore.getRowKey(tableName, newRowIndex);
    dataStore.manualDiffMap.add(rowKey);
    console.info(`[ACU insertRow] 已添加变更标记: ${rowKey}`);

    // 保存当前快照到撤回缓存（在保存操作前执行）
    dataStore.saveLastState();

    // 保存到数据库
    const success = await saveToDatabase(rawData, false, true);
    if (success) {
      toast.success('新行已插入');
    }
  };

  /**
   * 复制内容到剪贴板或酒馆输入框
   * @param content 内容
   */
  const copyContent = (content: string) => {
    const parentWin = window.parent || window;
    // 优先尝试使用酒馆的斜杠命令接口
    if ((parentWin as any).TavernHelper && (parentWin as any).TavernHelper.triggerSlash) {
      try {
        const safeContent = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
        (parentWin as any).TavernHelper.triggerSlash(`/clipboard-set "${safeContent}"`);
        toast.success('已复制');
        return;
      } catch (err) {
        console.warn('酒馆复制接口失败', err);
      }
    }

    // 降级方案：使用临时 textarea
    const textArea = document.createElement('textarea');
    textArea.value = content;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      toast.success('已复制');
    } catch (err) {
      prompt('请手动复制:', content);
    }
    document.body.removeChild(textArea);
  };

  /**
   * 切换行的删除状态
   * @param tableName 表格名称
   * @param rowIdx 行索引
   * @param $card 卡片 DOM 元素 (jQuery 对象)
   */
  const toggleDelete = (tableName: string, rowIdx: number, $card: any) => {
    // 容错处理：如果 $card 无效，尝试重新查找
    if (!($card && $card.length)) {
      const { $ } = getCore();
      if ($) {
        const parentDoc = window.parent.document;
        // 通过标题单元格反向查找卡片
        const $cell = $(parentDoc).find(`.acu-editable-title[data-tname="${tableName}"][data-row="${rowIdx}"]`);
        if ($cell.length) {
          $card = $cell.closest('.acu-data-card');
        }
      }
    }

    if (!($card && $card.find)) {
      console.warn('[ACU] toggleDelete failed: card element not found', { tableName, rowIdx });
      return;
    }

    const deleteKey = `${tableName}-row-${rowIdx}`;

    if (dataStore.isPendingDelete(deleteKey)) {
      // 恢复
      dataStore.toggleDelete(deleteKey);
      $card.find('.acu-badge-pending').remove();
      toast.success('已取消删除');
    } else {
      // 删除
      dataStore.toggleDelete(deleteKey);
      if ($card.find('.acu-badge-pending').length === 0) {
        $card.append('<div class="acu-badge-pending">待删除</div>');
      }
      toast.warning('整行已标记为删除');
    }

    // 更新保存按钮状态 (需要手动触发一下 UI 更新检查，或者依赖 store 的响应式)
    // 这里假设外部会有监听 pendingDeletes 变化来更新按钮状态的逻辑
  };

  /**
   * 设置输入框内容 (追加)
   * @param text 要追加的文本
   */
  const setInput = (text: string) => {
    appendPromptToInput(text, ' ');
  };

  /**
   * 编辑单元格核心逻辑
   * @param cellData 单元格数据
   * @param newVal 新值
   * @param context 文档上下文
   */
  const editCell = (cellData: any, newVal: string, context?: Document) => {
    const { tableKey, rowIdx, colIdx, $cell } = cellData;
    const { $ } = getCore();
    const doc = context || document;

    let freshData = dataStore.getStagedData();
    if (!freshData) freshData = getTableData();
    if (!freshData) freshData = loadSnapshot();

    if (freshData) {
      const sheet = freshData[tableKey];
      if (sheet?.content && sheet.content[rowIdx + 1]) {
        sheet.content[rowIdx + 1][colIdx] = newVal;
        dataStore.setStagedData(freshData);
        saveSnapshot(freshData);
      }
    }

    $cell.attr('data-val', encodeURIComponent(newVal));
    $cell.data('val', encodeURIComponent(newVal));

    let $displayTarget = $cell;
    if ($cell.hasClass('acu-grid-item')) $displayTarget = $cell.find('.acu-grid-value');
    else if ($cell.hasClass('acu-full-item')) $displayTarget = $cell.find('.acu-full-value');

    const badgeStyle = getBadgeStyle(newVal);
    if (badgeStyle && !$cell.hasClass('acu-editable-title')) {
      $displayTarget.html(`<span class="acu-badge ${badgeStyle}">${newVal}</span>`);
    } else {
      $displayTarget.text(newVal);
    }

    $displayTarget.addClass('acu-highlight-changed');
    if ($cell.hasClass('acu-editable-title')) $cell.addClass('acu-highlight-changed');

    // 记录 Diff - 使用正确的方法名 updateCell
    dataStore.updateCell(tableKey, rowIdx, colIdx, newVal);

    // UI 反馈
    const $saveBtn = $(doc).find('#acu-btn-save-global');
    $saveBtn.addClass('acu-save-alert');

    toast.info('修改已暂存');
  };

  return {
    insertRow,
    copyContent,
    toggleDelete,
    setInput,
    editCell,
  };
}
