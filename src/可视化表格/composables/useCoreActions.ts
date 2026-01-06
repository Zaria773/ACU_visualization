/**
 * 核心动作 Composable
 * 迁移原代码中的 CoreActions 对象逻辑
 */

import { useDataStore } from '../stores/useDataStore';
import { getBadgeStyle, getCore } from '../utils';
import { useDataPersistence } from './useDataPersistence';
import { toast } from './useToast';

export function useCoreActions() {
  const { saveToDatabase, getTableData, saveSnapshot, loadSnapshot } = useDataPersistence();
  const dataStore = useDataStore();

  // ============================================================
  // 核心操作
  // ============================================================

  /**
   * 插入新行
   * @param tableKey 表格 Key
   * @param rowIdx 行索引 (在此行之后插入)
   */
  const insertRow = async (tableKey: string, rowIdx: number) => {
    const rawData = getTableData();
    if (!rawData) return;

    const sheet = rawData[tableKey];
    if (!sheet?.content) return;

    const content = sheet.content;
    const colCount = content[0] ? content[0].length : 2;

    // 创建空行
    const newRow = new Array(colCount).fill('');
    // 如果有第一列且看起来像序号，尝试自动填充
    if (colCount > 0) newRow[0] = String(content.length);

    // 插入到当前行之后
    content.splice(rowIdx + 2, 0, newRow);

    toast.info('正在插入新行...');

    // 保存到数据库
    await saveToDatabase(rawData, false, true);
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
    const parentDoc = window.parent.document;
    const textarea = parentDoc.getElementById('send_textarea') as HTMLTextAreaElement;
    // 移动端正则检测
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (textarea) {
      // 1. 获取旧值并追加新值
      const currentVal = textarea.value || '';
      const newVal = currentVal ? currentVal + ' ' + text : text;

      // 2. 赋值并触发事件
      textarea.value = newVal;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // 3. 仅在非移动端聚焦 (防止弹键盘)
      if (!isMobile) {
        textarea.focus();
      }
    } else {
      console.warn('[ACU] 未找到输入框 #send_textarea');
    }
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
