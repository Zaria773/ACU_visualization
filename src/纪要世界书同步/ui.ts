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
const INPUT_TIME_TRANSFORM_ID = `thss_time_transform_${getScriptId()}`;
const BTN_TIME_SETTINGS_ID = `thss_time_settings_${getScriptId()}`;

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
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px;">
            <span style="font-weight:600; white-space:nowrap;">时间动态变换</span>
            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
              <input
                id="${INPUT_TIME_TRANSFORM_ID}"
                type="checkbox"
                ${settings.time_transform_enabled ? 'checked' : ''}
                style="position:absolute; inset:0; opacity:0; width:44px; height:24px; margin:0; cursor:pointer; z-index:3;"
              />
              <span
                id="${INPUT_TIME_TRANSFORM_ID}_track"
                style="position:absolute; inset:0; background:${settings.time_transform_enabled ? 'var(--SmartThemeQuoteColor,#888)' : '#8e8e93'}; border-radius:24px; transition:background 0.2s;"
              ></span>
              <span
                id="${INPUT_TIME_TRANSFORM_ID}_thumb"
                style="position:absolute; top:2px; left:${settings.time_transform_enabled ? '22px' : '2px'}; width:20px; height:20px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.35); transition:left 0.2s;"
              ></span>
            </label>
          </div>
          <div id="${BTN_TIME_SETTINGS_ID}_container" style="margin-bottom: 10px; text-align: center; ${settings.time_transform_enabled ? '' : 'display:none;'}">
            <button
              id="${BTN_TIME_SETTINGS_ID}"
              type="button"
              class="menu_button"
              style="writing-mode: horizontal-tb; text-orientation: mixed; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; min-width: 112px;"
            >
              时间动态设置
            </button>
          </div>
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

    let capturedTimeTransform = settings.time_transform_enabled;

    window.setTimeout(() => {
      // 列显示设置按钮
      $(`#${BTN_COLUMN_SETTINGS_ID}`)
        .off('click.thss')
        .on('click.thss', () => {
          openColumnVisibilityDialog(input);
        });

      // 时间动态设置按钮
      $(`#${BTN_TIME_SETTINGS_ID}`)
        .off('click.thss')
        .on('click.thss', () => {
          openTimeTransformDialog(input);
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

      // 时间动态变换开关
      const $timeInput = $(`#${INPUT_TIME_TRANSFORM_ID}`);
      const $timeTrack = $(`#${INPUT_TIME_TRANSFORM_ID}_track`);
      const $timeThumb = $(`#${INPUT_TIME_TRANSFORM_ID}_thumb`);
      const $timeBtnContainer = $(`#${BTN_TIME_SETTINGS_ID}_container`);
      $timeInput.off('change.thss').on('change.thss', function () {
        const checked = Boolean($(this).prop('checked'));
        capturedTimeTransform = checked;
        $timeTrack.css('background', checked ? 'var(--SmartThemeQuoteColor,#888)' : '#8e8e93');
        $timeThumb.css('left', checked ? '22px' : '2px');
        $timeBtnContainer.css('display', checked ? '' : 'none');
      });

      console.info(SCRIPT_LOG_PREFIX, '设置弹窗内交互监听已绑定（注入目标/0tk/时间变换）。');
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
          time_transform_enabled: capturedTimeTransform,
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

/**
 * 时间动态设置弹窗
 */
function openTimeTransformDialog(input: CreateMinimalSettingsDialogInput): void {
  const settings = input.getSettings();
  const status = input.getRuntimeStatus();

  const idPrefix = `thss_tt_${getScriptId()}`;
  const INPUT_TEMPLATE_ID = `${idPrefix}_template`;
  const INPUT_GLOBAL_SHEET_ID = `${idPrefix}_global_sheet`;
  const INPUT_GLOBAL_COL_ID = `${idPrefix}_global_col`;
  const INPUT_SUMMARY_COL_ID = `${idPrefix}_summary_col`;
  const BTN_HELP_ID = `${idPrefix}_help`;

  // 全局数据表列名（从运行时状态获取）
  const globalHeaders = status.current_global_sheet_headers ?? [];
  // 纪要表列名
  const summaryHeaders = status.current_raw_headers ?? [];

  // 生成全局时间列下拉选项
  const globalColOptions =
    globalHeaders.length > 0
      ? globalHeaders
          .map(
            h =>
              `<option value="${escapeHtml(h)}" ${h === settings.global_time_column ? 'selected' : ''}>${escapeHtml(h)}</option>`,
          )
          .join('')
      : `<option value="">（请先确保数据已加载）</option>`;

  // 生成纪要时间列下拉选项
  const summaryColOptions =
    summaryHeaders.length > 0
      ? summaryHeaders
          .map(
            h =>
              `<option value="${escapeHtml(h)}" ${h === settings.summary_time_column ? 'selected' : ''}>${escapeHtml(h)}</option>`,
          )
          .join('')
      : `<option value="">（请先确保数据已加载）</option>`;

  // Token 快捷输入芯片
  const tokenChips = [
    { token: '{Y}', label: '{Y} 年', desc: '年份数字' },
    { token: '{M}', label: '{M} 月', desc: '月份数字' },
    { token: '{D}', label: '{D} 日', desc: '日期数字' },
    { token: '{W}', label: '{W} 周', desc: '星期几' },
    { token: '{H}', label: '{H} 时', desc: '小时数字' },
    { token: '{m}', label: '{m} 分', desc: '分钟数字' },
    { token: '{s}', label: '{s} 秒', desc: '秒数字' },
    { token: '{CM}', label: '{CM} 华月', desc: '中文月份' },
    { token: '{CD}', label: '{CD} 华日', desc: '中文日期' },
    { token: '{T}', label: '{T} 辰', desc: '十二时辰' },
    { token: '{K}', label: '{K} 刻', desc: '一~三刻' },
  ];

  const chipsHtml = tokenChips
    .map(
      chip =>
        `<span
      class="thss-token-chip"
      data-token="${escapeHtml(chip.token)}"
      title="${escapeHtml(chip.desc)}"
      style="display:inline-block; padding:3px 8px; margin:2px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor,#666); cursor:pointer; font-size:12px; user-select:none; background:var(--SmartThemeBlurTintColor,rgba(0,0,0,0.1));"
    >${escapeHtml(chip.label)}</span>`,
    )
    .join('');

  const html = `
    <div style="padding: 14px 8px 8px 8px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;">
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 700;">时间动态设置</div>
        <button
          id="${BTN_HELP_ID}"
          type="button"
          style="width:24px; height:24px; border-radius:50%; border:1px solid var(--SmartThemeBorderColor,#666); background:transparent; cursor:pointer; font-weight:700; font-size:14px; display:inline-flex; align-items:center; justify-content:center; color:var(--SmartThemeBodyColor,#ccc);"
          title="格式模板填写教程"
        >?</button>
      </div>

      <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 10px;">
        <div style="margin-bottom: 10px;">
          <label style="display:block; font-weight:600; margin-bottom: 6px;">格式模板</label>
          <div style="margin-bottom:6px; line-height:1.8;">
            ${chipsHtml}
          </div>
          <input
            id="${INPUT_TEMPLATE_ID}"
            type="text"
            value="${escapeHtml(settings.time_format_template)}"
            placeholder="{Y}/{M}/{D} {H}:{m}"
            style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; font-family:monospace;"
          />
        </div>

        <div style="margin-bottom: 10px;">
          <label style="display:block; font-weight:600; margin-bottom: 6px;">当前时间所在表名</label>
          <input
            id="${INPUT_GLOBAL_SHEET_ID}"
            type="text"
            value="${escapeHtml(settings.global_sheet_name)}"
            placeholder="全局数据表"
            style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px;"
          />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom: 10px;">
          <div>
            <label style="display:block; font-weight:600; margin-bottom: 6px;">全局时间列</label>
            <select id="${INPUT_GLOBAL_COL_ID}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; -webkit-appearance:menulist; appearance:auto;">
              ${globalColOptions}
            </select>
          </div>
          <div>
            <label style="display:block; font-weight:600; margin-bottom: 6px;">纪要时间列</label>
            <select id="${INPUT_SUMMARY_COL_ID}" style="width:100%; box-sizing:border-box; border-radius:8px; border:1px solid var(--SmartThemeBorderColor,#666); padding:8px; -webkit-appearance:menulist; appearance:auto;">
              ${summaryColOptions}
            </select>
          </div>
        </div>
      </div>
    </div>
  `;

  let capturedTemplate = settings.time_format_template;
  let capturedGlobalSheet = settings.global_sheet_name;
  let capturedGlobalCol = settings.global_time_column;
  let capturedSummaryCol = settings.summary_time_column;

  const popupPromise = SillyTavern.callGenericPopup(html, SillyTavern.POPUP_TYPE.CONFIRM, '', {
    okButton: '保存并重新注入',
    cancelButton: '关闭',
    wide: false,
    onClosing: async () => {
      capturedTemplate = String($(`#${INPUT_TEMPLATE_ID}`).val() ?? '{Y}/{M}/{D} {H}:{m}');
      capturedGlobalSheet = String($(`#${INPUT_GLOBAL_SHEET_ID}`).val() ?? '全局数据表');
      capturedGlobalCol = String($(`#${INPUT_GLOBAL_COL_ID}`).val() ?? '');
      capturedSummaryCol = String($(`#${INPUT_SUMMARY_COL_ID}`).val() ?? '');
      return true;
    },
  });

  window.setTimeout(() => {
    // Token 芯片点击 -> 追加到模板输入框末尾
    $(`.thss-token-chip`)
      .off('click.thss')
      .on('click.thss', function () {
        const token = $(this).data('token') as string;
        const $input = $(`#${INPUT_TEMPLATE_ID}`);
        const current = String($input.val() ?? '');
        $input.val(current + token);
        // 聚焦到输入框末尾
        const inputEl = $input[0] as HTMLInputElement;
        inputEl.focus();
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      });

    // 帮助按钮
    $(`#${BTN_HELP_ID}`)
      .off('click.thss')
      .on('click.thss', () => {
        openTimeTransformHelpDialog();
      });

    console.info(SCRIPT_LOG_PREFIX, '时间动态设置弹窗交互监听已绑定。');
  }, 0);

  void popupPromise.then(result => {
    if (result !== SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
      console.info(SCRIPT_LOG_PREFIX, '时间动态设置弹窗已关闭（未保存）。');
      return;
    }

    const current = input.getSettings();
    const next: SyncScriptSettings = {
      ...current,
      time_format_template: capturedTemplate,
      global_sheet_name: capturedGlobalSheet,
      global_time_column: capturedGlobalCol,
      summary_time_column: capturedSummaryCol,
    };
    input.saveAndApply(next);
    toastr.success('时间动态设置已保存并触发重新注入');
    console.info(SCRIPT_LOG_PREFIX, '时间动态设置已保存。', {
      template: capturedTemplate,
      globalSheet: capturedGlobalSheet,
      globalCol: capturedGlobalCol,
      summaryCol: capturedSummaryCol,
    });
  });
}

/**
 * 格式模板填写教程弹窗
 */
function openTimeTransformHelpDialog(): void {
  const html = `
    <div style="padding: 14px 8px 8px 8px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;">
      <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; text-align: center;">格式模板填写教程</div>

      <div style="border: 1px solid var(--SmartThemeBorderColor,#666); border-radius: 10px; padding: 12px; line-height:1.7;">
        <p style="margin-bottom:10px;">
          在格式模板中，用 <code>{X}</code> 标记时间值中各部分的位置。<br>
          模板其余字符作为分隔符原样匹配。
        </p>

        <div style="font-weight:700; margin-bottom:6px;">── 现代时间 Token ──</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:13px;">
          <tr><td style="padding:2px 6px;"><code>{Y}</code> 或 <code>{年}</code></td><td>年份</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 1998</td></tr>
          <tr><td style="padding:2px 6px;"><code>{M}</code> 或 <code>{月}</code></td><td>月份</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 07</td></tr>
          <tr><td style="padding:2px 6px;"><code>{D}</code> 或 <code>{日}</code></td><td>日期</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 28</td></tr>
          <tr><td style="padding:2px 6px;"><code>{W}</code> 或 <code>{周}</code></td><td>星期几</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配 周X / 星期X / 礼拜X</td></tr>
          <tr><td style="padding:2px 6px;"><code>{H}</code> 或 <code>{时}</code></td><td>小时</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 21</td></tr>
          <tr><td style="padding:2px 6px;"><code>{m}</code> 或 <code>{分}</code></td><td>分钟</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 58</td></tr>
          <tr><td style="padding:2px 6px;"><code>{s}</code> 或 <code>{秒}</code></td><td>秒</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配数字，如 30</td></tr>
        </table>

        <div style="font-weight:700; margin-bottom:6px;">── 古代/中文时间 Token ──</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:13px;">
          <tr><td style="padding:2px 6px;"><code>{CM}</code> 或 <code>{华月}</code></td><td>中文月份</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配 正/一~十二/腊</td></tr>
          <tr><td style="padding:2px 6px;"><code>{CD}</code> 或 <code>{华日}</code></td><td>中文日期</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配 初X/十X/二十X 等</td></tr>
          <tr><td style="padding:2px 6px;"><code>{T}</code> 或 <code>{辰}</code></td><td>十二时辰</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配 子~亥（时）</td></tr>
          <tr><td style="padding:2px 6px;"><code>{K}</code> 或 <code>{刻}</code></td><td>刻</td><td style="color:var(--SmartThemeQuoteColor,#888);">匹配 一刻~三刻</td></tr>
        </table>

        <div style="font-weight:700; margin-bottom:6px;">── 常见格式举例 ──</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:13px;">
          <tr><td style="padding:2px 6px; font-weight:600;">现代</td><td><code>{Y}/{M}/{D} {H}:{m}</code></td></tr>
          <tr><td style="padding:2px 6px; font-weight:600;">中文现代</td><td><code>{Y}年{M}月{D}日 {H}时{m}分</code></td></tr>
          <tr><td style="padding:2px 6px; font-weight:600;">带星期</td><td><code>{Y}/{M}/{D} {W} {H}:{m}</code></td></tr>
          <tr><td style="padding:2px 6px; font-weight:600;">古代</td><td><code>{CM}月{CD} {T}{K}</code></td></tr>
          <tr><td style="padding:2px 6px; font-weight:600;">混合</td><td><code>{Y}年{CM}月{CD}</code></td></tr>
        </table>

        <p style="color:var(--SmartThemeQuoteColor,#888); font-size:12px;">
          提示：模板匹配不到的尾部文本会原样保留。<br>
          例如 "1997/06/13 上午" 用 "{Y}/{M}/{D}" 模板时，<br>
          "上午" 会作为剩余文本追加在变换结果末尾。
        </p>
      </div>
    </div>
  `;

  void SillyTavern.callGenericPopup(html, SillyTavern.POPUP_TYPE.TEXT, '', {
    okButton: '知道了',
    wide: false,
  });
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
