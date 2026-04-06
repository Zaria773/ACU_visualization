import { SCRIPT_LOG_PREFIX } from './constants';
import type { RuntimeStatus, SyncScriptSettings } from './types';

interface CreateMinimalSettingsDialogInput {
  getSettings: () => SyncScriptSettings;
  getRuntimeStatus: () => RuntimeStatus;
  saveAndApply: (next: SyncScriptSettings) => void;
  triggerResync: (reason: string) => void;
}

interface MinimalSettingsDialogController {
  open: () => void;
  close: () => void;
  refresh: () => void;
  destroy: () => void;
}

const INPUT_TOP_ID = `thss_wrapper_top_${getScriptId()}`;
const INPUT_BOTTOM_ID = `thss_wrapper_bottom_${getScriptId()}`;
const INPUT_DEBUG_ID = `thss_debug_log_${getScriptId()}`;
const INPUT_TARGET_ID = `thss_target_mode_${getScriptId()}`;
const INPUT_ZERO_TK_ID = `thss_zero_tk_mode_${getScriptId()}`;
const BTN_RESYNC_ID = `thss_resync_${getScriptId()}`;

/**
 * 纪要同步设置弹窗（改为与 pvp 相同的 callGenericPopup 路线）
 */
export function createMinimalSettingsDialog(input: CreateMinimalSettingsDialogInput): MinimalSettingsDialogController {
  let opening = false;

  const close = (): void => {
    // callGenericPopup 由用户手动关闭，此处保留空实现以兼容调用方
  };

  const refresh = (): void => {
    // callGenericPopup 模式为一次性渲染，刷新由下次 open 时重新读取状态
  };

  const destroy = (): void => {
    opening = false;
    console.info(SCRIPT_LOG_PREFIX, '设置弹窗控制器已销毁（callGenericPopup 模式）。');
  };

  const open = (): void => {
    if (opening) {
      console.info(SCRIPT_LOG_PREFIX, '设置弹窗正在打开中，忽略重复打开请求。');
      return;
    }

    opening = true;
    console.info(SCRIPT_LOG_PREFIX, '设置弹窗 open() 调用开始（callGenericPopup）。');

    const settings = input.getSettings();
    const status = input.getRuntimeStatus();

    let capturedTop = settings.wrapper_text_top;
    let capturedBottom = settings.wrapper_text_bottom;
    let capturedDebug = settings.debug_log_enabled;
    let capturedTarget = settings.injection_target;
    let capturedZeroTkMode = settings.zero_tk_mode_enabled;

    const currentTargetModeText = settings.injection_target === 'chat_bound' ? '当前聊天绑定世界书' : '角色主世界书';

    const html = `
      <div style="padding: 14px 8px 8px 8px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; text-align: center;">纪要世界书同步设置</div>

        <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 10px; margin-bottom: 10px;">
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; margin-bottom: 6px;">
            <div style="font-weight: 600;">当前命中的纪要表名</div>
            <div style="word-break: break-all;">${escapeHtml(status.current_summary_sheet_name || '未命中纪要表')}</div>
          </div>
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; margin-bottom: 6px;">
            <div style="font-weight: 600;">当前注入目标</div>
            <div style="word-break: break-all;">${escapeHtml(currentTargetModeText)}</div>
          </div>
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px;">
            <div style="font-weight: 600;">当前目标世界书名</div>
            <div style="word-break: break-all;">${escapeHtml(status.current_target_worldbook_name || '未定位目标世界书')}</div>
          </div>
        </div>

        <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 10px;">
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">包裹上文本</label>
            <textarea id="${INPUT_TOP_ID}" style="width:100%; min-height:90px; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;">${escapeHtml(settings.wrapper_text_top)}</textarea>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">包裹下文本</label>
            <textarea id="${INPUT_BOTTOM_ID}" style="width:100%; min-height:90px; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;">${escapeHtml(settings.wrapper_text_bottom)}</textarea>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">注入目标</label>
            <select id="${INPUT_TARGET_ID}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; position:relative; z-index:2; pointer-events:auto; -webkit-appearance: menulist; appearance: auto;">
              <option value="character_primary" ${settings.injection_target === 'character_primary' ? 'selected' : ''}>角色主世界书</option>
              <option value="chat_bound" ${settings.injection_target === 'chat_bound' ? 'selected' : ''}>当前聊天绑定世界书</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px;">
            <span style="font-weight:600; white-space:nowrap;">0tk 模式（不生成概览条目）</span>
            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
              <input
                id="${INPUT_ZERO_TK_ID}"
                type="checkbox"
                ${settings.zero_tk_mode_enabled ? 'checked' : ''}
                style="position:absolute; inset:0; opacity:0; width:44px; height:24px; margin:0; cursor:pointer; z-index:3;"
              />
              <span
                id="${INPUT_ZERO_TK_ID}_track"
                style="position:absolute; inset:0; background:${settings.zero_tk_mode_enabled ? '#34c759' : '#8e8e93'}; border-radius:24px; transition:background 0.2s;"
              ></span>
              <span
                id="${INPUT_ZERO_TK_ID}_thumb"
                style="position:absolute; top:2px; left:${settings.zero_tk_mode_enabled ? '22px' : '2px'}; width:20px; height:20px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.35); transition:left 0.2s;"
              ></span>
            </label>
          </div>
          <label style="display:inline-flex; align-items:center; gap:8px; user-select:none;">
            <input id="${INPUT_DEBUG_ID}" type="checkbox" ${settings.debug_log_enabled ? 'checked' : ''}/>
            <span>启用调试日志输出</span>
          </label>
        </div>

        <div style="margin-top: 12px; text-align: right;">
          <button
            id="${BTN_RESYNC_ID}"
            type="button"
            class="menu_button"
            style="writing-mode: horizontal-tb; text-orientation: mixed; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; min-width: 112px;"
          >
            立即重新注入
          </button>
        </div>
      </div>
    `;

    const popupPromise = SillyTavern.callGenericPopup(html, SillyTavern.POPUP_TYPE.CONFIRM, '', {
      okButton: '保存并重新注入',
      cancelButton: '关闭',
      wide: false,
      onClosing: async () => {
        capturedTop = String($(`#${INPUT_TOP_ID}`).val() ?? '');
        capturedBottom = String($(`#${INPUT_BOTTOM_ID}`).val() ?? '');
        capturedDebug = Boolean($(`#${INPUT_DEBUG_ID}`).prop('checked'));
        const rawTarget = String($(`#${INPUT_TARGET_ID}`).val() ?? 'character_primary');
        capturedTarget = rawTarget === 'chat_bound' ? 'chat_bound' : 'character_primary';
        capturedZeroTkMode = Boolean($(`#${INPUT_ZERO_TK_ID}`).prop('checked'));
        return true;
      },
    });

    window.setTimeout(() => {
      const $btn = $(`#${BTN_RESYNC_ID}`);
      if ($btn.length === 0) {
        console.warn(SCRIPT_LOG_PREFIX, '未找到“立即重新注入”按钮，可能弹窗尚未渲染完成。');
        return;
      }
      $btn.off('click.thss').on('click.thss', () => {
        input.triggerResync('设置弹窗按钮：立即重新注入');
        toastr.success('已触发重新注入');
      });

      // 实时捕获注入目标变更，避免个别弹窗生命周期下 onClosing 丢值
      $(`#${INPUT_TARGET_ID}`)
        .off('change.thss')
        .on('change.thss', function () {
          const rawTarget = String($(this).val() ?? 'character_primary');
          capturedTarget = rawTarget === 'chat_bound' ? 'chat_bound' : 'character_primary';
        });

      // iOS 风格开关视觉同步
      const $zeroTkInput = $(`#${INPUT_ZERO_TK_ID}`);
      const $zeroTkTrack = $(`#${INPUT_ZERO_TK_ID}_track`);
      const $zeroTkThumb = $(`#${INPUT_ZERO_TK_ID}_thumb`);
      $zeroTkInput.off('change.thss').on('change.thss', function () {
        const checked = Boolean($(this).prop('checked'));
        capturedZeroTkMode = checked;
        $zeroTkTrack.css('background', checked ? '#34c759' : '#8e8e93');
        $zeroTkThumb.css('left', checked ? '22px' : '2px');
      });

      console.info(SCRIPT_LOG_PREFIX, '设置弹窗内交互监听已绑定（重注入/注入目标/0tk开关）。');
    }, 0);

    void popupPromise
      .then(result => {
        if (result !== SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
          console.info(SCRIPT_LOG_PREFIX, '设置弹窗已关闭（未保存）。');
          return;
        }

        const current = input.getSettings();
        const next: SyncScriptSettings = {
          ...current,
          wrapper_text_top: capturedTop,
          wrapper_text_bottom: capturedBottom,
          debug_log_enabled: capturedDebug,
          injection_target: capturedTarget,
          zero_tk_mode_enabled: capturedZeroTkMode,
        };
        input.saveAndApply(next);
        toastr.success(
          `设置已保存：注入目标=${capturedTarget === 'chat_bound' ? '当前聊天绑定世界书' : '角色主世界书'}，0tk=${capturedZeroTkMode ? '开' : '关'}`,
        );
        console.info(SCRIPT_LOG_PREFIX, '设置弹窗保存完成。');
      })
      .finally(() => {
        opening = false;
        console.info(SCRIPT_LOG_PREFIX, '设置弹窗流程结束。');
      });
  };

  return {
    open,
    close,
    refresh,
    destroy,
  };
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
