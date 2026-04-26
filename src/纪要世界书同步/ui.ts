import { SCRIPT_LOG_PREFIX } from './constants';
import type { ColumnVisibility, RuntimeStatus, SyncScriptSettings } from './types';

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
const INPUT_DEPTH_ID = `thss_depth_${getScriptId()}`;
const INPUT_POSITION_ID = `thss_position_${getScriptId()}`;
const INPUT_DEBUG_ID = `thss_debug_log_${getScriptId()}`;
const INPUT_TARGET_ID = `thss_target_mode_${getScriptId()}`;
const INPUT_ZERO_TK_ID = `thss_zero_tk_mode_${getScriptId()}`;
const INPUT_ZERO_TK_NO_TRIGGER_ID = `thss_zero_tk_no_trigger_${getScriptId()}`;
const BTN_COLUMN_SETTINGS_ID = `thss_column_settings_${getScriptId()}`;

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

    let capturedTop = settings.wrapper_text_top;
    let capturedBottom = settings.wrapper_text_bottom;
    let capturedDepth = settings.depth_override;
    let capturedPosition = settings.injection_position;
    let capturedDebug = settings.debug_log_enabled;
    let capturedTarget = settings.injection_target;
    let capturedZeroTkMode = settings.zero_tk_mode_enabled;
    let capturedZeroTkNoTrigger = settings.zero_tk_inject_no_trigger;

    const html = `
      <div style="padding: 14px 8px 8px 8px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; text-align: center;">纪要世界书同步设置</div>

        <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 10px;">
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">包裹上文本</label>
            <textarea id="${INPUT_TOP_ID}" style="width:100%; min-height:90px; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;">${escapeHtml(settings.wrapper_text_top)}</textarea>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">包裹下文本</label>
            <textarea id="${INPUT_BOTTOM_ID}" style="width:100%; min-height:90px; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;">${escapeHtml(settings.wrapper_text_bottom)}</textarea>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom: 10px;">
            <div>
              <label style="display:block; font-weight:600; margin-bottom: 6px;">注入位置</label>
              <select id="${INPUT_POSITION_ID}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; -webkit-appearance:menulist; appearance:auto;">
                <option value="at_depth" ${settings.injection_position === 'at_depth' ? 'selected' : ''}>@D 系统深度</option>
                <option value="before_character_definition" ${settings.injection_position === 'before_character_definition' ? 'selected' : ''}>角色定义之前</option>
                <option value="after_character_definition" ${settings.injection_position === 'after_character_definition' ? 'selected' : ''}>角色定义之后</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-weight:600; margin-bottom: 6px;">注入深度</label>
              <input id="${INPUT_DEPTH_ID}" type="number" value="${settings.depth_override ?? 9997}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;"/>
            </div>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom: 6px;">注入目标</label>
            <select id="${INPUT_TARGET_ID}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; position:relative; z-index:2; pointer-events:auto; -webkit-appearance: menulist; appearance: auto;">
              <option value="character_primary" ${settings.injection_target === 'character_primary' ? 'selected' : ''}>角色主世界书</option>
              <option value="chat_bound" ${settings.injection_target === 'chat_bound' ? 'selected' : ''}>当前聊天绑定世界书</option>
            </select>
          </div>
          <div style="margin-bottom: 10px; text-align: center;">
            <button
              id="${BTN_COLUMN_SETTINGS_ID}"
              type="button"
              class="menu_button"
              style="writing-mode: horizontal-tb; text-orientation: mixed; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; min-width: 112px;"
            >
              列显示设置
            </button>
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
                style="position:absolute; inset:0; background:${settings.zero_tk_mode_enabled ? 'var(--SmartThemeQuoteColor,#888)' : '#8e8e93'}; border-radius:24px; transition:background 0.2s;"
              ></span>
              <span
                id="${INPUT_ZERO_TK_ID}_thumb"
                style="position:absolute; top:2px; left:${settings.zero_tk_mode_enabled ? '22px' : '2px'}; width:20px; height:20px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.35); transition:left 0.2s;"
              ></span>
            </label>
          </div>
          <label style="display:inline-flex; align-items:center; gap:8px; user-select:none; margin-bottom: 10px;">
            <input id="${INPUT_ZERO_TK_NO_TRIGGER_ID}" type="checkbox" ${settings.zero_tk_inject_no_trigger ? 'checked' : ''}/>
            <span>0tk 注入但不触发（zaria自用）</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:8px; user-select:none;">
            <input id="${INPUT_DEBUG_ID}" type="checkbox" ${settings.debug_log_enabled ? 'checked' : ''}/>
            <span>启用调试日志输出</span>
          </label>
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
        const rawDepth = parseInt(String($(`#${INPUT_DEPTH_ID}`).val() ?? '9997'), 10);
        capturedDepth = Number.isFinite(rawDepth) ? rawDepth : 9997;
        const rawPosition = String($(`#${INPUT_POSITION_ID}`).val() ?? 'at_depth');
        capturedPosition = (
          ['at_depth', 'before_character_definition', 'after_character_definition'].includes(rawPosition)
            ? rawPosition
            : 'at_depth'
        ) as typeof capturedPosition;
        capturedDebug = Boolean($(`#${INPUT_DEBUG_ID}`).prop('checked'));
        const rawTarget = String($(`#${INPUT_TARGET_ID}`).val() ?? 'character_primary');
        capturedTarget = rawTarget === 'chat_bound' ? 'chat_bound' : 'character_primary';
        capturedZeroTkMode = Boolean($(`#${INPUT_ZERO_TK_ID}`).prop('checked'));
        capturedZeroTkNoTrigger = Boolean($(`#${INPUT_ZERO_TK_NO_TRIGGER_ID}`).prop('checked'));
        return true;
      },
    });

    window.setTimeout(() => {
      // 列显示设置按钮
      $(`#${BTN_COLUMN_SETTINGS_ID}`)
        .off('click.thss')
        .on('click.thss', () => {
          openColumnVisibilityDialog(input);
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
        $zeroTkTrack.css('background', checked ? 'var(--SmartThemeQuoteColor,#888)' : '#8e8e93');
        $zeroTkThumb.css('left', checked ? '22px' : '2px');
      });

      // 0tk 注入但不触发（普通 checkbox）
      $(`#${INPUT_ZERO_TK_NO_TRIGGER_ID}`)
        .off('change.thss')
        .on('change.thss', function () {
          capturedZeroTkNoTrigger = Boolean($(this).prop('checked'));
        });

      console.info(SCRIPT_LOG_PREFIX, '设置弹窗内交互监听已绑定（注入目标/0tk开关/0tk不触发开关）。');
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
          depth_override: capturedDepth,
          injection_position: capturedPosition,
          debug_log_enabled: capturedDebug,
          injection_target: capturedTarget,
          zero_tk_mode_enabled: capturedZeroTkMode,
          zero_tk_inject_no_trigger: capturedZeroTkNoTrigger,
        };
        input.saveAndApply(next);
        toastr.success(
          `设置已保存：注入目标=${capturedTarget === 'chat_bound' ? '当前聊天绑定世界书' : '角色主世界书'}，0tk=${capturedZeroTkMode ? '开' : '关'}，0tk不触发=${capturedZeroTkNoTrigger ? '开' : '关'}`,
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

/**
 * 获取列的默认可见性（与 builder.ts 保持一致）
 */
function getDefaultColumnVisibility(key: string): ColumnVisibility {
  if (key === '纪要') return 'detail_only';
  if (key === '概览') return 'summary_only';
  return 'both';
}

/**
 * 列显示设置弹窗：控制每列在纪要条目和概览条目中的显示
 */
function openColumnVisibilityDialog(input: CreateMinimalSettingsDialogInput): void {
  const settings = input.getSettings();
  const status = input.getRuntimeStatus();
  const headers = status.current_raw_headers;

  if (!headers || headers.length === 0) {
    toastr.warning('尚未识别到纪要表列，请先确保数据源已加载并成功同步。');
    return;
  }

  const selectIdPrefix = `thss_col_vis_${getScriptId()}`;

  let columnsHtml = '';
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    const currentVis = settings.column_visibility[header] ?? getDefaultColumnVisibility(header);
    const selectId = `${selectIdPrefix}_${i}`;
    columnsHtml += `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:6px; align-items:center;">
        <div style="word-break:break-all;">${escapeHtml(header)}</div>
        <select id="${selectId}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:6px 8px; -webkit-appearance:menulist; appearance:auto;">
          <option value="both" ${currentVis === 'both' ? 'selected' : ''}>都注入</option>
          <option value="detail_only" ${currentVis === 'detail_only' ? 'selected' : ''}>仅注入纪要</option>
          <option value="summary_only" ${currentVis === 'summary_only' ? 'selected' : ''}>仅注入概览</option>
          <option value="none" ${currentVis === 'none' ? 'selected' : ''}>都不注入</option>
        </select>
      </div>
    `;
  }

  const html = `
    <div style="padding: 14px 8px 8px 8px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;">
      <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; text-align: center;">列显示设置</div>
      <p style="margin-bottom:10px; color:var(--SmartThemeQuoteColor,#888); font-size:13px;">
        控制每列在纪要条目和概览条目中的显示。保存后将自动重新注入。
      </p>
      <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 10px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--SmartThemeBorderColor,#666);">
          <div style="font-weight:700;">列名</div>
          <div style="font-weight:700;">显示范围</div>
        </div>
        ${columnsHtml}
      </div>
    </div>
  `;

  // 在 DOM 销毁前捕获所有 select 值（与主设置弹窗 onClosing 同理）
  let capturedVisibility: Record<string, ColumnVisibility> = {};

  void SillyTavern.callGenericPopup(html, SillyTavern.POPUP_TYPE.CONFIRM, '', {
    okButton: '保存并重新注入',
    cancelButton: '取消',
    wide: false,
    onClosing: async () => {
      capturedVisibility = {};
      for (let i = 0; i < headers.length; i += 1) {
        const val = String($(`#${selectIdPrefix}_${i}`).val() ?? 'both');
        if (['both', 'detail_only', 'summary_only', 'none'].includes(val)) {
          capturedVisibility[headers[i]] = val as ColumnVisibility;
        }
      }
      return true;
    },
  }).then(result => {
    if (result !== SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
      console.info(SCRIPT_LOG_PREFIX, '列显示设置弹窗已关闭（未保存）。');
      return;
    }

    const current = input.getSettings();
    const next: SyncScriptSettings = {
      ...current,
      column_visibility: capturedVisibility,
    };
    input.saveAndApply(next);
    toastr.success('列显示设置已保存并触发重新注入');
    console.info(SCRIPT_LOG_PREFIX, '列显示设置已保存。', capturedVisibility);
  });
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
