// ==UserScript==
// @name         可视化表格-z6.4悬浮版
// @namespace    http://tampermonkey.net/
// @version      z6.4
// @description  可视化表格 (新版交互）
// @author       Cline
// @match        */*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_ID = 'acu_visualizer_ui_v20_pagination';
  const STORAGE_KEY_TABLE_ORDER = 'acu_table_order';
  const STORAGE_KEY_ACTIVE_TAB = 'acu_active_tab';
  const STORAGE_KEY_UI_CONFIG = 'acu_ui_config_v18';
  const STORAGE_KEY_LAST_SNAPSHOT = 'acu_data_snapshot_v18_5';
  const STORAGE_KEY_UI_COLLAPSE = 'acu_ui_collapse_state';
  const STORAGE_KEY_TABLE_HEIGHTS = 'acu_table_heights';
  const STORAGE_KEY_REVERSE_TABLES = 'acu_reverse_tables';
  const TAB_DASHBOARD = 'acu_tab_dashboard_home';
  const STORAGE_KEY_PIN = 'acu_pin_state';
  const STORAGE_KEY_TABLE_STYLES = 'acu_table_styles';
  const TAB_OPTIONS = 'acu_tab_options_panel';
  let isInitialized = false;
  let isSaving = false;
  let isEditingOrder = false;
  let currentDiffMap = new Set();
  let pendingDeletes = new Set();
  let isCollapsed = localStorage.getItem(STORAGE_KEY_UI_COLLAPSE) === 'true';
  let isPinned = localStorage.getItem(STORAGE_KEY_PIN) === 'true';
  let globalScrollTop = 0;
  let currentPage = 1;
  let currentSearchTerm = '';
  let globalStagedData = null;
  let saveBtnTimer = null;
  let isLongPress = false;

  // 清理可能存在的旧实例（开发调试用）
  try {
    if (window.parent && window.parent.document) {
      const pDoc = window.parent.document;
      const existingBall = pDoc.getElementById('acu-floating-ball');
      if (existingBall) existingBall.remove();
      const existingCont = pDoc.getElementById('acu-parent-container');
      if (existingCont) existingCont.remove();
    }
  } catch (e) {}

  const UpdateController = {
    _suppressNext: false,
    _resetTimer: null,
    runSilently: async action => {
      UpdateController._suppressNext = true;
      try {
        await action();
      } catch (e) {
        UpdateController._suppressNext = false;
        console.error(e);
      }
      setTimeout(() => {
        UpdateController._suppressNext = false;
      }, 2000);
    },
    handleUpdate: () => {
      if (UpdateController._suppressNext) {
        clearTimeout(UpdateController._resetTimer);
        UpdateController._resetTimer = setTimeout(() => {
          UpdateController._suppressNext = false;
        }, 500);
        return;
      }
      if (isEditingOrder || isSaving) return;
      renderInterface();
    },
  };

  const DEFAULT_CONFIG = {
    theme: 'retro',
    fontFamily: 'default',
    cardWidth: 280,
    fontSize: 13,
    itemsPerPage: 20,
    highlightNew: true,
    highlightColor: 'orange',
    customTitleColor: false,
    titleColor: 'orange',
    layout: 'vertical',
    limitLongText: true,
    showDashboard: true,
    showPagination: true,
    lockPanel: false,
    purgeConfirmation: true,
  };

  const FloatingManager = {
    _ball: null,
    _container: null,
    _styleTagId: 'acu-parent-styles-v1',
    _storageKeyPos: 'acu_float_ball_pos',

    updateState: (isActive, renderCallback) => {
      const parentDoc = window.parent.document;
      const $ = getCore().$;
      if (isActive) {
        FloatingManager._injectParentStyles();
      } else {
        $(parentDoc).find('#acu-floating-ball').remove();
        $(parentDoc).find('#acu-parent-container').remove();
        return;
      }

      if (isCollapsed) {
        $(parentDoc).find('#acu-parent-container').hide();
        FloatingManager._createBall(renderCallback);
      } else {
        $(parentDoc).find('#acu-floating-ball').remove();
        let $cont = $(parentDoc).find('#acu-parent-container');
        if ($cont.length) $cont.show();
      }
    },

    _injectParentStyles: () => {
      const parentDoc = window.parent.document;
      const $ = getCore().$;
      if (parentDoc.getElementById(FloatingManager._styleTagId)) return;
      const baseStyles = $(`#${SCRIPT_ID}-styles`).html() || '';
      const fontStyles = $('#acu-dynamic-font').html() || '';
      const css = `${baseStyles}\n${fontStyles}`;
      $(parentDoc.head).append(`<style id="${FloatingManager._styleTagId}">${css}</style>`);
    },

    _createBall: clickCallback => {
      const parentDoc = window.parent.document;
      const $ = getCore().$;
      if ($(parentDoc).find('#acu-floating-ball').length) return;

      // 1. 坐标初始化
      const winHeight = window.parent.innerHeight || window.innerHeight;
      const winWidth = window.parent.innerWidth || window.innerWidth;
      let savedPos = JSON.parse(localStorage.getItem(FloatingManager._storageKeyPos));

      if (!savedPos) savedPos = { x: 20, y: winHeight - 150 };

      // 边界检查
      if (savedPos.x > winWidth - 50) savedPos.x = winWidth - 60;
      if (savedPos.y > winHeight - 50) savedPos.y = winHeight - 120;
      if (savedPos.y < 0) savedPos.y = 10;
      if (savedPos.x < 0) savedPos.x = 0;

      const $ball = $('<div id="acu-floating-ball"><i class="fa-solid fa-layer-group"></i></div>');
      $ball.css({ left: savedPos.x + 'px', top: savedPos.y + 'px' });
      $(parentDoc.body).append($ball);

      const ballEl = $ball[0];

      // 2. 交互变量
      let isDragging = false;
      let startX = 0,
        startY = 0;
      let initialLeft = 0,
        initialTop = 0;
      let clickTimer = null;

      // 3. Pointer 事件处理 (统一 PC 和 Mobile)
      const handleDown = e => {
        e.preventDefault(); // 防止默认触摸行为
        // 捕获指针
        if (ballEl.setPointerCapture) ballEl.setPointerCapture(e.pointerId);

        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;

        // 如果已停靠，只监听点击恢复，不允许直接拖动
        if ($ball.hasClass('docked')) {
          ballEl.addEventListener('pointerup', handleUp);
          return;
        }

        const rect = ballEl.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        ballEl.addEventListener('pointermove', handleMove);
        ballEl.addEventListener('pointerup', handleUp);
      };

      const handleMove = e => {
        if ($ball.hasClass('docked')) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          isDragging = true;

          let newLeft = initialLeft + dx;
          let newTop = initialTop + dy;

          // 边界限制
          const maxW = window.parent.innerWidth - 50;
          const maxH = window.parent.innerHeight - 50;

          if (newLeft < 0) newLeft = 0;
          if (newTop < 0) newTop = 0;
          if (newLeft > maxW) newLeft = maxW;
          if (newTop > maxH) newTop = maxH;

          ballEl.style.left = newLeft + 'px';
          ballEl.style.top = newTop + 'px';
        }
      };

      const handleUp = e => {
        ballEl.removeEventListener('pointermove', handleMove);
        ballEl.removeEventListener('pointerup', handleUp);
        if (ballEl.releasePointerCapture) ballEl.releasePointerCapture(e.pointerId);

        if (isDragging) {
          // 拖动结束：立即保存位置 (解决移动端不记忆问题)
          const rect = ballEl.getBoundingClientRect();
          localStorage.setItem(FloatingManager._storageKeyPos, JSON.stringify({ x: rect.left, y: rect.top }));
        } else {
          // 点击事件处理
          handleInteraction();
        }
      };

      const handleInteraction = () => {
        // Case 1: 停靠状态 -> 恢复
        if ($ball.hasClass('docked')) {
          $ball.removeClass('docked');
          setTimeout(() => {
            $ball.html('<i class="fa-solid fa-layer-group"></i>');
          }, 100);
          return;
        }

        // Case 2: 正常状态 -> 区分单/双击
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          $ball.addClass('docked');
          $ball.html('');
        } else {
          clickTimer = setTimeout(() => {
            clickTimer = null;
            if (clickCallback) clickCallback();
          }, 250);
        }
      };
      ballEl.addEventListener('pointerdown', handleDown);
    },

    mountPanel: htmlStr => {
      const parentDoc = window.parent.document;
      const $ = getCore().$;
      $(parentDoc).find('#acu-floating-ball').remove();
      let $container = $(parentDoc).find('#acu-parent-container');
      if (!$container.length) {
        $container = $('<div id="acu-parent-container"></div>');
        $(parentDoc.body).append($container);
      }
      $container.show().html(htmlStr);
      return $container;
    },
  };

  const THEMES = [
    { id: 'retro', name: '复古羊皮', icon: 'fa-scroll' },
    { id: 'dark', name: '极夜深空', icon: 'fa-moon' },
    { id: 'modern', name: '现代清爽', icon: 'fa-sun' },
    { id: 'forest', name: '森之物语', icon: 'fa-tree' },
    { id: 'ocean', name: '深海幽蓝', icon: 'fa-water' },
    { id: 'cyber', name: '赛博霓虹', icon: 'fa-bolt' },
    { id: 'purple', name: '梦幻浅紫', icon: 'fa-magic' },
  ];

  const FONTS = [
    { id: 'default', name: '系统默认 (Modern)', val: `'Segoe UI', 'Microsoft YaHei', sans-serif` },
    { id: 'hanchan', name: '寒蝉全圆体', val: `"寒蝉全圆体", sans-serif` },
    { id: 'maple', name: 'Maple Mono (代码风)', val: `"Maple Mono NF CN", monospace` },
    { id: 'huiwen', name: '汇文明朝体 (Huiwen)', val: `"Huiwen-mincho", serif` },
    { id: 'cooper', name: 'Cooper正楷', val: `"CooperZhengKai", serif` },
    { id: 'yffyt', name: 'YFFYT (艺术体)', val: `"YFFYT", sans-serif` },
    { id: 'fusion', name: 'Fusion Pixel (像素风)', val: `"Fusion Pixel 12px M latin", monospace` },
    { id: 'wenkai', name: '霞鹜文楷 (WenKai)', val: `"LXGW WenKai", serif` },
    { id: 'notosans', name: '思源黑体 (Noto Sans)', val: `"Noto Sans CJK", sans-serif` },
    { id: 'zhuque', name: '朱雀仿宋 (Zhuque)', val: `"Zhuque Fangsong (technical preview)", serif` },
  ];

  const HIGHLIGHT_COLORS = {
    orange: { main: '#d35400', bg: 'rgba(211, 84, 0, 0.1)', name: '活力橙' },
    red: { main: '#e74c3c', bg: 'rgba(231, 76, 60, 0.1)', name: '警示红' },
    blue: { main: '#3498db', bg: 'rgba(52, 152, 219, 0.1)', name: '天空蓝' },
    green: { main: '#27ae60', bg: 'rgba(39, 174, 96, 0.1)', name: '自然绿' },
    purple: { main: '#9b59b6', bg: 'rgba(155, 89, 182, 0.1)', name: '罗兰紫' },
    teal: { main: '#1abc9c', bg: 'rgba(26, 188, 156, 0.1)', name: '青绿' },
    pink: { main: '#e91e63', bg: 'rgba(233, 30, 99, 0.1)', name: '少女粉' },
    lime: { main: '#82c91e', bg: 'rgba(130, 201, 30, 0.1)', name: '酸橙' },
    indigo: { main: '#3f51b5', bg: 'rgba(63, 81, 181, 0.1)', name: '靛蓝' },
    cyan: { main: '#00bcd4', bg: 'rgba(0, 188, 212, 0.1)', name: '青色' },
    brown: { main: '#795548', bg: 'rgba(121, 85, 72, 0.1)', name: '咖啡' },
    grey: { main: '#607d8b', bg: 'rgba(96, 125, 139, 0.1)', name: '蓝灰' },
  };
  const getCore = () => {
    const w = window.parent || window;
    return {
      $: window.jQuery || w.jQuery,
      getDB: () => w.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI,
    };
  };

  const getUiContext = () => {
    return window.parent.document;
  };

  const getIconForTableName = name => {
    if (!name) return 'fa-table';
    const n = name.toLowerCase();
    if (n.includes('主角') || n.includes('角色')) return 'fa-user-circle';
    if (n.includes('通用') || n.includes('全局') || n.includes('世界') || n.includes('设定')) return 'fa-globe-asia';
    if (n.includes('装备') || n.includes('背包')) return 'fa-briefcase';
    if (n.includes('技能') || n.includes('武魂') || n.includes('功法')) return 'fa-dragon';
    if (n.includes('关系') || n.includes('周边') || n.includes('npc') || n.includes('人物')) return 'fa-user-friends';
    if (n.includes('任务') || n.includes('日志')) return 'fa-scroll';
    if (n.includes('地点') || n.includes('位置')) return 'fa-map-marker-alt';
    if (n.includes('总结') || n.includes('大纲')) return 'fa-book-reader';
    return 'fa-table';
  };

  const getBadgeStyle = text => {
    if (!text) return '';
    const str = String(text).trim();
    if (/^[0-9]+%?$/.test(str) || /^Lv\.?\d+$/.test(str)) return 'acu-badge-green';
    if (['是', '否', '有', '无', '死亡', '存活', '男', '女', '未知'].includes(str)) return 'acu-badge-neutral';
    return '';
  };

  const getActiveTabState = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE_TAB));
    } catch (e) {
      return null;
    }
  };
  const saveActiveTabState = tableName => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, JSON.stringify(tableName));
    } catch (e) {
      console.error(e);
    }
  };
  const getSavedTableOrder = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_TABLE_ORDER));
    } catch (e) {
      return null;
    }
  };
  const saveTableOrder = tableNames => {
    try {
      localStorage.setItem(STORAGE_KEY_TABLE_ORDER, JSON.stringify(tableNames));
    } catch (e) {
      console.error(e);
    }
  };
  const getConfig = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_UI_CONFIG));
      return { ...DEFAULT_CONFIG, ...saved };
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  };
  const saveConfig = newConfig => {
    const current = getConfig();
    const merged = { ...current, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY_UI_CONFIG, JSON.stringify(merged));
    } catch (e) {
      console.error(e);
    }
    applyConfigStyles(merged);
  };

  const getTableHeights = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_TABLE_HEIGHTS)) || {};
    } catch (e) {
      return {};
    }
  };
  const saveTableHeights = heights => {
    try {
      localStorage.setItem(STORAGE_KEY_TABLE_HEIGHTS, JSON.stringify(heights));
    } catch (e) {
      console.error(e);
    }
  };
  const getTableStyles = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_TABLE_STYLES)) || {};
    } catch (e) {
      return {};
    }
  };
  const saveTableStyles = styles => {
    try {
      localStorage.setItem(STORAGE_KEY_TABLE_STYLES, JSON.stringify(styles));
    } catch (e) {
      console.error(e);
    }
  };
  const getReverseOrderTables = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_REVERSE_TABLES)) || [];
    } catch (e) {
      return [];
    }
  };
  const saveReverseOrderTables = list => {
    try {
      localStorage.setItem(STORAGE_KEY_REVERSE_TABLES, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const loadSnapshot = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_LAST_SNAPSHOT));
    } catch (e) {
      return null;
    }
  };
  const saveSnapshot = data => {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_SNAPSHOT, JSON.stringify(data));
    } catch (e) {
      console.error(e);
    }
  };

  const generateDiffMap = currentData => {
    const lastData = loadSnapshot();
    const diffSet = new Set();
    if (!lastData) return diffSet;
    for (const sheetId in currentData) {
      if (sheetId === 'mate') continue;
      const newSheet = currentData[sheetId];
      const oldSheet = lastData[sheetId];
      if (!newSheet || !newSheet.name) continue;
      const tableName = newSheet.name;
      if (!oldSheet) {
        if (newSheet.content) {
          newSheet.content.forEach((row, rIdx) => {
            if (rIdx > 0) diffSet.add(`${tableName}-row-${rIdx - 1}`);
          });
        }
        continue;
      }
      const newRows = newSheet.content || [];
      const oldRows = oldSheet.content || [];
      newRows.forEach((row, rIdx) => {
        if (rIdx === 0) return;
        const oldRow = oldRows[rIdx];
        if (!oldRow) {
          diffSet.add(`${tableName}-row-${rIdx - 1}`);
        } else {
          row.forEach((cell, cIdx) => {
            if (cIdx === 0) return;
            const oldCell = oldRow[cIdx];
            if (String(cell) !== String(oldCell)) {
              diffSet.add(`${tableName}-${rIdx - 1}-${cIdx}`);
            }
          });
        }
      });
    }
    return diffSet;
  };

  const applyConfigStyles = config => {
    const { $ } = getCore();
    let $wrapper = $('.acu-wrapper');
    if (!$wrapper.length && window.parent) $wrapper = $(window.parent.document).find('.acu-wrapper');

    const fontVal = FONTS.find(f => f.id === config.fontFamily)?.val || FONTS[0].val;
    const targetHead = window.parent && window.parent.document ? window.parent.document.head : document.head;

    $(targetHead).find('#acu-dynamic-font').remove();

    const fontImport = `
        @import url("https://fontsapi.zeoseven.com/3/main/result.css");   /* 寒蝉全圆体 */
        @import url("https://fontsapi.zeoseven.com/442/main/result.css"); /* Maple Mono */
        @import url("https://fontsapi.zeoseven.com/256/main/result.css"); /* 汇文明朝 */
        @import url("https://fontsapi.zeoseven.com/482/main/result.css"); /* Cooper正楷 */
        @import url("https://fontsapi.zeoseven.com/446/main/result.css"); /* YFFYT */
        @import url("https://fontsapi.zeoseven.com/570/main/result.css"); /* Fusion Pixel */
        @import url("https://fontsapi.zeoseven.com/292/main/result.css"); /* 霞鹜文楷 */
        @import url("https://fontsapi.zeoseven.com/69/main/result.css");  /* 思源黑体 */
        @import url("https://fontsapi.zeoseven.com/7/main/result.css");   /* 朱雀仿宋 */
    `;
    $(targetHead).append(`
        <style id="acu-dynamic-font">
            ${fontImport}
            .acu-wrapper, .acu-edit-dialog, .acu-cell-menu, .acu-nav-container, .acu-data-card, .acu-panel-title, .acu-settings-label, .acu-btn-block, .acu-nav-btn, .acu-edit-textarea, #acu-ghost-preview {
                font-family: ${fontVal} !important;
            }
        </style>
    `);

    if ($wrapper.length) {
      $wrapper.removeClass(THEMES.map(t => `acu-theme-${t.id}`).join(' '));
      $wrapper.addClass(`acu-theme-${config.theme}`);
      const highlightVal = HIGHLIGHT_COLORS[config.highlightColor] || HIGHLIGHT_COLORS.orange;

      let titleVal = highlightVal;
      if (config.customTitleColor) {
        titleVal = HIGHLIGHT_COLORS[config.titleColor] || HIGHLIGHT_COLORS.blue;
      }
      $wrapper.css({
        '--acu-card-width': `${config.cardWidth}px`,
        '--acu-font-size': `${config.fontSize}px`,
        '--acu-highlight': highlightVal.main,
        '--acu-highlight-bg': highlightVal.bg,
        '--acu-title-color': titleVal.main,
        '--acu-accent': highlightVal.main,
      });
      const $display = $wrapper.find('.acu-data-display');
      $display.removeClass('acu-layout-vertical acu-layout-horizontal').addClass(`acu-layout-${config.layout}`);
    }
  };

  const addStyles = () => {
    const { $ } = getCore();
    if (!$) return;
    // 移除旧样式防止重复
    $(`#${SCRIPT_ID}-styles`).remove();

    const styles = `
            <style id="${SCRIPT_ID}-styles">
                /* =========================================
                  1. Theme Variables (主题变量定义)
                  ========================================= */
                .acu-theme-retro  { --acu-bg-nav: #e6e2d3; --acu-bg-panel: #e6e2d3; --acu-border: #dcd0c0; --acu-text-main: #5e4b35; --acu-text-sub: #999; --acu-btn-bg: #dcd0c0; --acu-btn-hover: #cbbba8; --acu-btn-active-bg: #8d7b6f; --acu-btn-active-text: #fdfaf5; --acu-table-head: #efebe4; --acu-table-hover: #f0ebe0; --acu-shadow: rgba(0,0,0,0.1); --acu-menu-bg: #fff; --acu-menu-text: #333; --acu-card-bg: #fffef9; --acu-badge-bg: #efebe4; --acu-input-bg: rgba(255,255,255,0.5); --acu-overlay-bg: rgba(94, 75, 53, 0.4); }
                .acu-theme-dark   { --acu-bg-nav: rgba(43, 43, 43, 0.95); --acu-bg-panel: rgba(37, 37, 37, 0.95); --acu-border: #444; --acu-text-main: #eee; --acu-text-sub: #aaa; --acu-btn-bg: rgba(58, 58, 58, 0.5); --acu-btn-hover: #4a4a4a; --acu-btn-active-bg: #6a5acd; --acu-btn-active-text: #fff; --acu-table-head: rgba(51, 51, 51, 0.8); --acu-table-hover: rgba(58, 58, 58, 0.5); --acu-shadow: rgba(0,0,0,0.6); --acu-card-bg: rgba(45, 48, 53, 0.8); --acu-badge-bg: #3a3f4b; --acu-menu-bg: #333; --acu-menu-text: #eee; --acu-input-bg: rgba(0,0,0,0.3); --acu-overlay-bg: rgba(0,0,0,0.75); }
                .acu-theme-modern { --acu-bg-nav: #ffffff; --acu-bg-panel: #f8f9fa; --acu-border: #e0e0e0; --acu-text-main: #333; --acu-text-sub: #888; --acu-btn-bg: #f1f3f5; --acu-btn-hover: #e9ecef; --acu-btn-active-bg: #007bff; --acu-btn-active-text: #fff; --acu-table-head: #f8f9fa; --acu-table-hover: #f1f3f5; --acu-shadow: rgba(0,0,0,0.08); --acu-card-bg: #ffffff; --acu-badge-bg: #f1f3f5; --acu-menu-bg: #fff; --acu-menu-text: #333; --acu-input-bg: #ffffff; --acu-overlay-bg: rgba(0,0,0,0.3); }
                .acu-theme-forest { --acu-bg-nav: #e8f5e9; --acu-bg-panel: #e8f5e9; --acu-border: #c8e6c9; --acu-text-main: #2e7d32; --acu-text-sub: #81c784; --acu-btn-bg: #c8e6c9; --acu-btn-hover: #a5d6a7; --acu-btn-active-bg: #43a047; --acu-btn-active-text: #fff; --acu-table-head: #dcedc8; --acu-table-hover: #f1f8e9; --acu-shadow: rgba(0,0,0,0.1); --acu-card-bg: #ffffff; --acu-badge-bg: #dcedc8; --acu-menu-bg: #fff; --acu-menu-text: #2e7d32; --acu-input-bg: rgba(255,255,255,0.7); --acu-overlay-bg: rgba(46, 125, 50, 0.2); }
                .acu-theme-ocean  { --acu-bg-nav: #e3f2fd; --acu-bg-panel: #e3f2fd; --acu-border: #bbdefb; --acu-text-main: #1565c0; --acu-text-sub: #64b5f6; --acu-btn-bg: #bbdefb; --acu-btn-hover: #90caf9; --acu-btn-active-bg: #1976d2; --acu-btn-active-text: #fff; --acu-table-head: #bbdefb; --acu-table-hover: #e1f5fe; --acu-shadow: rgba(0,0,0,0.15); --acu-card-bg: #ffffff; --acu-badge-bg: #e3f2fd; --acu-menu-bg: #fff; --acu-menu-text: #1565c0; --acu-input-bg: rgba(255,255,255,0.7); --acu-overlay-bg: rgba(21, 101, 192, 0.2); }
                .acu-theme-cyber  { --acu-bg-nav: #000000; --acu-bg-panel: #0a0a0a; --acu-border: #333; --acu-text-main: #00ffcc; --acu-text-sub: #ff00ff; --acu-btn-bg: #1a1a1a; --acu-btn-hover: #333; --acu-btn-active-bg: #ff00ff; --acu-btn-active-text: #fff; --acu-table-head: #111; --acu-table-hover: #1a1a1a; --acu-shadow: 0 0 10px rgba(0,255,204,0.3); --acu-card-bg: #050505; --acu-badge-bg: #222; --acu-menu-bg: #111; --acu-menu-text: #00ffcc; --acu-input-bg: #111; --acu-overlay-bg: rgba(0,0,0,0.85); }
                .acu-theme-purple { --acu-bg-nav: #f3e5f5; --acu-bg-panel: #f3e5f5; --acu-border: #e1bee7; --acu-text-main: #4a148c; --acu-text-sub: #8e24aa; --acu-btn-bg: #e1bee7; --acu-btn-hover: #d1c4e9; --acu-btn-active-bg: #7b1fa2; --acu-btn-active-text: #fff; --acu-table-head: #f3e5f5; --acu-table-hover: #ede7f6; --acu-shadow: rgba(0,0,0,0.1); --acu-card-bg: #ffffff; --acu-badge-bg: #f3e5f5; --acu-menu-bg: #fff; --acu-menu-text: #4a148c; --acu-input-bg: rgba(255,255,255,0.6); --acu-overlay-bg: rgba(74, 20, 140, 0.25); }

                /* =========================================
                  2. Core Layout (核心布局)
                  ========================================= */
                /* 全屏穿透容器 */
                #acu-parent-container {
                    position: fixed !important; top: 0; left: 0; right: 0; bottom: 0;
                    width: 100vw; height: 100vh;
                    z-index: 2147483647;
                    pointer-events: none !important;
                    display: flex; flex-direction: column-reverse; justify-content: flex-start;
                }

                /* 窗口化包裹器 */
                #acu-parent-container .acu-wrapper {
                    position: relative;
                    max-width: 98vw;
                    pointer-events: none;
                    display: flex; flex-direction: column-reverse;
                    transform-origin: bottom center; will-change: transform;
                    transition: none !important;
                }

                /* 窗口化模式定位 (全平台通用) */
                #acu-parent-container .acu-wrapper {
                    position: absolute !important;
                    width: var(--acu-win-width, 600px) !important;
                    left: var(--acu-win-left, 50%) !important;
                    bottom: var(--acu-win-bottom, 50%) !important;
                    touch-action: none;
                }

                /* 拖拽交互状态 */
                body.acu-dragging #acu-parent-container,
                body.acu-resizing #acu-parent-container {
                    pointer-events: auto !important;
                    cursor: grabbing;
                }
                body.acu-resizing * { cursor: ew-resize !important; user-select: none !important; }

                /* =========================================
                  3. Floating Ball (悬浮球)
                  ========================================= */
                #acu-floating-ball {
                    position: fixed; width: 50px; height: 50px;
                    background: rgba(255, 255, 255, 0.25);
                    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    border-radius: 50%;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 2147483647;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; touch-action: none;
                    color: var(--acu-text-main, #333); font-size: 20px;
                    user-select: none;
                    transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                    pointer-events: auto !important;
                }
                #acu-floating-ball:active { transform: scale(0.9); background: rgba(255,255,255,0.4); }

                /* 停靠模式 */
                #acu-floating-ball.docked {
                    left: 0 !important; width: 20px !important; height: 50px !important;
                    border-radius: 0 8px 8px 0 !important;
                    opacity: 0.3; background: #000;
                    border: 1px solid #666; border-left: none;
                    font-size: 0 !important; transform: none !important;
                }
                #acu-floating-ball.docked::after { content: '›'; color: #fff; font-size: 16px; font-weight: bold; display: block; }
                #acu-floating-ball.docked:hover, #acu-floating-ball.docked:active { opacity: 0.8; width: 30px !important; }

                /* =========================================
                  4. Navigation Bar (导航栏) - PC 优化版
                  ========================================= */
                .acu-nav-container {
                    order: 1; flex: 0 0 auto;
                    display: flex; flex-direction: column; gap: 0;
                    padding: 6px 10px;
                    background: var(--acu-bg-nav);
                    border-top: 1px solid var(--acu-border);
                    border-radius: 14px 14px 0 0;
                    backdrop-filter: blur(5px);
                    box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
                    transition: transform 0.2s;
                    touch-action: pan-y; width: 100%;
                    pointer-events: auto !important;
                    cursor: move;
                }
                .acu-nav-container.lock-mode { cursor: default !important; }

                /* 选项卡区域 */
                .acu-nav-tabs-area {
                    display: grid;
                    grid-template-columns: var(--acu-nav-cols, repeat(auto-fill, minmax(110px, 1fr)));
                    gap: 5px; width: 100%;
                }

                /* 导航按钮 */
                .acu-nav-btn {
                    width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
                    padding: 5px 3px;
                    border: 1px solid transparent; border-radius: 8px;
                    background: var(--acu-btn-bg); color: var(--acu-text-main);
                    font-weight: 600; font-size: 13px;
                    cursor: pointer; transition: all 0.2s ease;
                    user-select: none; text-align: center; white-space: nowrap; overflow: hidden;
                }
                .acu-nav-btn span { overflow: hidden; text-overflow: ellipsis; }
                .acu-nav-btn:hover { background: var(--acu-btn-hover); transform: translateY(-2px); }
                .acu-nav-btn.active { background: var(--acu-btn-active-bg); color: var(--acu-btn-active-text); box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
                .acu-nav-container.editing-order .acu-nav-btn { border: 1px dashed #f0ad4e; cursor: grab; opacity: 0.8; }

                /* 分割线 */
                .acu-nav-separator {
                    width: 100%; height: 1px;
                    border-top: 1px dashed var(--acu-border);
                    margin: 5px 0;
                    opacity: 0.6;
                }

                /* 底部操作区 */
                /* 底部操作区 - 大按钮模式 */
                .acu-nav-actions-area {
                    display: flex; width: 100%;
                    justify-content: space-between; /* 按钮之间平均分布 */
                    align-items: stretch; /* 拉伸高度一致 */
                    background: transparent;
                    padding-top: 0;
                    gap: 8px; /* 按钮之间的间距 */
                }
                .acu-action-btn {
                    flex: 1; /* 让每个按钮平分宽度 */
                    height: 36px; /* 固定高度，您可以根据喜好改为 32px 或 40px */
                    display: flex; align-items: center; justify-content: center;
                    background: var(--acu-btn-bg); /* 加上背景色 */
                    border-radius: 8px;
                    color: var(--acu-text-sub);
                    cursor: pointer;
                    border: 1px solid transparent; transition: all 0.2s;
                    font-size: 16px; user-select: none;
                }
                /* 鼠标悬停效果保持不变 */
                .acu-action-btn:hover { background: var(--acu-btn-hover); color: var(--acu-text-main); transform: translateY(-2px); border-color: var(--acu-border); }
                #acu-btn-save-global { color: var(--acu-title-color); }
                #acu-btn-save-global:hover { background: var(--acu-btn-active-bg); color: var(--acu-btn-active-text); }
                #acu-btn-save-specific { color: #9b59b6; display: none; }

                /* 排序提示 */
                .acu-order-controls { display: none; width: 100%; text-align: center; background: var(--acu-table-head); padding: 5px; margin-bottom: 5px; border-radius: 4px; border: 1px dashed var(--acu-border); }
                .acu-order-controls.visible { display: block; }

                /* =========================================
                  5. Data Panel (数据面板)
                  ========================================= */
                .acu-data-display {
                    order: 2; flex: 0 1 auto;
                    max-height: 80vh; margin-bottom: 5px;
                    background: var(--acu-bg-panel);
                    border: 1px solid var(--acu-border); border-radius: 12px;
                    display: none; flex-direction: column;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 -5px 25px rgba(0,0,0,0.3);
                    width: 100%;
                    overscroll-behavior: contain; isolation: isolate;
                    pointer-events: auto !important;
                }
                .acu-data-display.visible { display: flex; }
                .acu-data-display.acu-layout-horizontal { touch-action: pan-x !important; overflow-x: auto; overflow-y: hidden; }
                .acu-data-display.acu-layout-vertical { touch-action: pan-y !important; overflow-y: auto; overflow-x: hidden; }

                /* 面板头部 */
                .acu-panel-header { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 4px 12px; background: var(--acu-table-head); border-bottom: 1px solid var(--acu-border); border-radius: 12px 12px 0 0; }
                .acu-panel-title { font-weight: bold; color: var(--acu-text-main); display: flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 15px; }

                /* 搜索框 */
                .acu-header-actions { display: flex; align-items: center; gap: 10px; }
                .acu-search-wrapper { position: relative; display: flex; align-items: center; }
                .acu-search-input { background: var(--acu-btn-bg); border: 1px solid var(--acu-border); color: var(--acu-text-main); padding: 2px 2px 3px 22px; border-radius: 16px; font-size: 12px; width: 100px; transition: all 0.2s; }
                .acu-search-input:focus { width: 140px; outline: none; border-color: var(--acu-highlight); background: var(--acu-input-bg); }
                .acu-search-icon { position: absolute; left: 10px; font-size: 10px; color: var(--acu-text-sub); pointer-events: none; }
                .acu-close-btn { background: none; border: none; color: var(--acu-text-sub); cursor: pointer; font-size: 16px; padding: 4px; transition: color 0.2s; }
                .acu-close-btn:hover { color: #e74c3c; }

                /* 高度调节把手 */
                .acu-height-control { display: flex; align-items: center; gap: 5px; margin-right: 10px; opacity: 0.8; transition: opacity 0.2s; }
                .acu-height-drag-handle { cursor: ns-resize; padding: 5px; border-radius: 4px; transition: all 0.2s; color: var(--acu-text-sub); }
                .acu-height-drag-handle:hover, .acu-height-drag-handle.active { color: var(--acu-highlight); background: var(--acu-table-hover); }
                /* 宽度调节把手 (右侧) */
                .acu-resize-handle {
                    display: block !important; pointer-events: auto !important;
                    position: absolute; right: -12px; top: 0; bottom: 0; width: 14px;
                    cursor: ew-resize; z-index: 2147483650; touch-action: none;
                }
                .acu-resize-handle::after {
                    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
                    background: var(--acu-border); opacity: 0.3; transition: opacity 0.2s;
                }
                .acu-resize-handle:hover::after { background: var(--acu-highlight); opacity: 1; width: 4px; left: 0px; }

                /* 面板内容区 */
                .acu-panel-content {
                    flex: 1; padding: 15px; padding-bottom: 10px; background: transparent;
                    scrollbar-width: thin; scrollbar-color: var(--acu-highlight) transparent;
                    overflow-y: auto; overflow-x: hidden; touch-action: auto; overscroll-behavior: contain;
                }
                .acu-panel-content::-webkit-scrollbar { width: 6px; height: 6px; }
                .acu-panel-content::-webkit-scrollbar-thumb { background-color: var(--acu-highlight); border-radius: 3px; }

                /* =========================================
                  6. Data Cards (数据卡片)
                  ========================================= */
                .acu-data-card {
                    background: var(--acu-card-bg); border: none; box-shadow: 0 2px 8px var(--acu-shadow);
                    border-radius: 12px; transition: all 0.25s ease;
                    display: flex; flex-direction: column; position: relative;
                    -webkit-user-select: none; user-select: none; touch-action: pan-x pan-y;
                    overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
                }
                /* 允许 PC 端文本选中 */
                .acu-grid-value, .acu-full-value, .acu-card-value, .acu-editable-title, .acu-grid-label, .acu-full-label, .acu-card-label {
                    user-select: text !important; -webkit-user-select: text !important; cursor: text;
                }
                /* 编辑状态锁定 */
                .acu-data-card.acu-editing-lock {
                    border-color: var(--acu-highlight) !important; box-shadow: 0 0 0 1px var(--acu-highlight) !important;
                    z-index: 5; -webkit-user-select: text !important; user-select: text !important; touch-action: none !important;
                }
                // .acu-locked-card { touch-action: pan-x !important; overflow: hidden !important; }

                /* 布局模式差异 */
                .acu-layout-vertical .acu-card-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; }
                .acu-layout-vertical .acu-data-card { flex: 0 0 var(--acu-card-width, 280px); width: var(--acu-card-width, 280px); }
                .acu-layout-vertical .acu-data-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px var(--acu-shadow); z-index: 5; }

                .acu-layout-horizontal .acu-panel-content { display: block; white-space: nowrap; overflow-x: auto !important; overflow-y: hidden; }
                .acu-layout-horizontal .acu-card-grid { display: inline-flex; flex-wrap: nowrap; gap: 14px; height: 100%; align-items: flex-start; padding-bottom: 10px; min-width: 100%; }
                .acu-layout-horizontal .acu-data-card { flex: 0 0 var(--acu-card-width, 280px); width: var(--acu-card-width, 280px); max-height: 98%; overflow-y: auto; white-space: normal; }

                /* 卡片内部结构 */
                .acu-card-header { padding: 10px 15px; background: transparent; border-bottom: 1px solid rgba(0,0,0,0.05); font-weight: bold; color: var(--acu-title-color); font-size: 14px; display: flex; justify-content: center; align-items: center; position: relative; flex: 0 0 auto; }
                .acu-editable-title { cursor: pointer; border-bottom: 1px dashed transparent; transition: all 0.2s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 800; text-align: center; width: 100%; padding: 2px 5px; border-radius: 4px; }
                .acu-editable-title:hover { background: var(--acu-table-hover); color: var(--acu-title-color); }
                .acu-card-index { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--acu-text-sub); font-weight: normal; background: var(--acu-badge-bg); padding: 1px 6px; border-radius: 8px; opacity: 0.8; }

                .acu-card-body { padding: 0; display: flex; flex-direction: column; gap: 0; font-size: var(--acu-font-size, 13px); }

                /* Grid Item Style */
                .acu-card-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
                .acu-grid-item { display: flex; flex-direction: column; gap: 2px; padding: 5px; border-radius: 6px; cursor: pointer; overflow: hidden; }
                .acu-grid-item:hover { background: var(--acu-table-hover); }
                .acu-grid-label { font-size: 11px; color: var(--acu-title-color); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .acu-grid-value { font-size: var(--acu-font-size, 13px); color: var(--acu-text-main); font-weight: 500; white-space: pre-wrap; word-break: break-word; line-height: 1.35; }

                /* Full Width Item Style */
                .acu-card-full-area { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 10px 12px; }
                .acu-full-item { display: flex; flex-direction: column; gap: 3px; padding: 6px; border-radius: 6px; border-top: 1px dashed rgba(0,0,0,0.05); cursor: pointer; }
                .acu-full-item:hover { background: var(--acu-table-hover); }
                .acu-full-label { font-size: 11px; color: var(--acu-title-color); font-weight: bold; }
                .acu-full-value { font-size: var(--acu-font-size, 13px); color: var(--acu-text-main); line-height: 1.4; word-break: break-all; white-space: pre-wrap; max-height: var(--acu-text-max-height, 80px); overflow-y: var(--acu-text-overflow, auto); scrollbar-width: none; }

                /* List Style Mode (Source B 风格) */
                .acu-data-card.acu-style-list .acu-card-body { padding: 6px 12px; display: flex; flex-direction: column; gap: 0; }
                .acu-data-card.acu-style-list .acu-card-row { display: block !important; padding: 6px 0 !important; border-bottom: 1px dashed var(--acu-border); cursor: pointer; overflow: hidden; }
                .acu-data-card.acu-style-list .acu-card-row:last-child { border-bottom: none; }
                .acu-data-card.acu-style-list .acu-card-row:hover { background: var(--acu-table-hover); }
                .acu-data-card.acu-style-list .acu-card-label { float: left !important; clear: left; width: auto !important; margin-right: 8px !important; color: var(--acu-title-color); font-size: 0.9em; font-weight: bold; line-height: 1.5; }
                .acu-data-card.acu-style-list .acu-card-value { display: block !important; width: auto !important; margin: 0 !important; text-align: left !important; word-break: break-all !important; white-space: pre-wrap !important; line-height: 1.5 !important; color: var(--acu-text-main); }
                .acu-data-card.acu-style-list .acu-highlight-changed { display: inline-block; width: auto; line-height: 1.4; }

                /* 行内编辑框 */
                .acu-inline-input { width: 100%; height: 100%; box-sizing: border-box; background: rgba(255, 255, 255, 0.1); border: none; outline: none; font-family: inherit; font-size: inherit; line-height: 1.5; color: inherit; resize: none; overflow: hidden; padding: 2px; margin: 0; display: block; border-radius: 4px; }

                /* =========================================
                  7. Dialogs, Overlays & Menus (弹窗与菜单)
                  ========================================= */
                .acu-menu-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: transparent; z-index: 2147483647; pointer-events: auto !important; }

                /* 右键菜单 */
                .acu-cell-menu {
                    position: fixed !important; z-index: 2147483647 !important;
                    background-color: var(--acu-card-bg) !important;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                    border: 1px solid var(--acu-border); border-radius: 8px; overflow: hidden;
                    pointer-events: auto !important;
                }
                .acu-cell-menu-item { padding: 12px 16px; cursor: pointer; font-size: 14px; display: flex; gap: 12px; align-items: center; color: var(--acu-text-main); font-weight: 500; background: transparent; }
                .acu-cell-menu-item:hover { background-color: var(--acu-table-hover); }
                .acu-cell-menu-item#act-delete { color: #e74c3c; }
                .acu-cell-menu-item#act-restore { color: #27ae60; }
                .acu-cell-menu-item#act-edit-card { color: var(--acu-highlight); }

                /* 编辑弹窗 */
                .acu-edit-overlay { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: var(--acu-overlay-bg) !important; z-index: 2147483647 !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; padding-top: 5vh !important; backdrop-filter: blur(2px); pointer-events: auto !important; }
                .acu-edit-dialog { background-color: var(--acu-bg-panel) !important; width: 90%; max-width: 900px; max-height: 80vh; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 15px 50px var(--acu-shadow); color: var(--acu-text-main) !important; border: 1px solid var(--acu-border); margin: 0 auto !important; overflow: hidden; padding: 0; pointer-events: auto !important; }
                .acu-edit-title { flex: 0 0 auto; margin: 0; padding: 20px 24px; font-size: 16px; font-weight: bold; color: var(--acu-text-main); border-bottom: 1px solid var(--acu-border); }
                .acu-settings-content { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; scrollbar-width: thin; scrollbar-color: var(--acu-highlight) transparent; }
                .acu-settings-content::-webkit-scrollbar { width: 6px; }
                .acu-settings-content::-webkit-scrollbar-thumb { background-color: var(--acu-highlight); border-radius: 3px; }
                .acu-dialog-btns { flex: 0 0 auto; display: flex; justify-content: center; gap: 20px; padding: 16px 24px; border-top: 1px solid var(--acu-border); background: var(--acu-bg-panel); }
                .acu-dialog-btn { background: none; border: none; cursor: pointer; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px; color: var(--acu-text-sub); transition: color 0.2s; }

                /* 快速预览弹窗 */
                .acu-quick-view-overlay { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: var(--acu-overlay-bg) !important; z-index: 2147483648 !important; display: flex !important; justify-content: center !important; align-items: center !important; backdrop-filter: blur(4px); pointer-events: auto !important; }
                .acu-quick-view-card { background: var(--acu-card-bg); border-radius: 12px; border: 1px solid var(--acu-border); box-shadow: 0 15px 50px var(--acu-shadow); width: 90%; max-width: 450px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; animation: popUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); color: var(--acu-text-main); pointer-events: auto !important; }
                .acu-quick-view-header { padding: 15px; background: var(--acu-table-head); border-bottom: 1px solid var(--acu-border); font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 1.1em; color: var(--acu-title-color); }
                .acu-quick-view-body { padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
                .acu-quick-view-body::-webkit-scrollbar { width: 4px; }
                .acu-quick-view-body::-webkit-scrollbar-thumb { background: var(--acu-highlight); }

                /* =========================================
                  8. Dashboard & Features (仪表盘与功能)
                  ========================================= */
                .acu-dash-container { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; height: 100%; padding: 5px; overflow-y: auto; font-size: var(--acu-font-size); touch-action: pan-y; }
                @media (max-width: 700px) { .acu-dash-container { grid-template-columns: 1fr; } }
                .acu-dash-card { background: var(--acu-card-bg); border-radius: 12px; border: 1px solid var(--acu-border); padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 12px var(--acu-shadow); }
                .acu-dash-title { font-size: 1.2em; font-weight: bold; color: var(--acu-title-color); border-bottom: 1px dashed var(--acu-border); padding-bottom: 8px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
                .acu-dash-char-info { display: flex; flex-direction: column; gap: 10px; }
                .acu-dash-stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--acu-btn-bg); border-radius: 8px; }
                .acu-dash-stat-label { color: var(--acu-text-sub); font-size: 0.9em; }
                .acu-dash-stat-val { color: var(--acu-text-main); font-weight: bold; font-size: 1.1em; }
                .acu-dash-npc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
                .acu-dash-npc-item { background: var(--acu-table-head); padding: 10px; border-radius: 8px; cursor: default; text-align: center; border: 1px solid transparent; transition: all 0.2s; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--acu-text-main); font-size: 1em; }
                .acu-dash-npc-item:hover { border-color: var(--acu-highlight); color: var(--acu-highlight); background: var(--acu-btn-bg); }
                .acu-dash-sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto; }
                .acu-dash-list-item { padding: 6px 0; border-bottom: 1px solid var(--acu-border); color: var(--acu-text-sub); font-size: 1em; display: flex; align-items: center; gap: 6px; cursor: default; }
                .acu-dash-list-item:hover { color: var(--acu-text-main); padding-left: 4px; }
                .acu-dash-list-item i { font-size: 0.8em; color: var(--acu-highlight); }
                .acu-dash-interactive { cursor: pointer !important; position: relative; }
                .acu-dash-interactive:hover::after { content: '\\f002'; font-family: 'Font Awesome 6 Free'; font-weight: 900; position: absolute; right: 5px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 10px; }

                /* 内部 Tab */
                .acu-tab-header { display: flex; gap: 5px; border-bottom: 1px solid var(--acu-border); margin-bottom: 10px; }
                .acu-tab-btn { padding: 6px 12px; cursor: pointer; font-size: 13px; font-weight: bold; color: var(--acu-text-sub); border-bottom: 2px solid transparent; transition: all 0.2s; }
                .acu-tab-btn:hover { color: var(--acu-text-main); background: var(--acu-table-hover); border-radius: 4px 4px 0 0; }
                .acu-tab-btn.active { color: var(--acu-highlight); border-bottom-color: var(--acu-highlight); }
                .acu-tab-pane { display: none; animation: fadeIn 0.3s; }
                .acu-tab-pane.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

                /* 智能分页器 */
                .acu-pagination-container { flex: 0 0 auto; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; background: var(--acu-bg-panel); border-top: 1px solid var(--acu-border); z-index: 10; box-sizing: border-box; }
                .acu-pagination-container.hidden { display: none !important; }
                .acu-pagination-numbers { display: flex; justify-content: center; align-items: center; gap: 5px; flex: 1; overflow: hidden; }
                .acu-page-btn { padding: 0; border: 1px solid var(--acu-border); background: var(--acu-btn-bg); color: var(--acu-title-color); border-radius: 6px; cursor: pointer; font-size: 12px; min-width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; user-select: none; font-weight: 500; flex-shrink: 0; }
                .acu-page-arrow { width: 36px; font-size: 14px; }
                .acu-page-btn:not(.disabled):not(.active):hover { background: var(--acu-title-color); color: #fff; border-color: var(--acu-title-color); transform: translateY(-2px); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .acu-page-btn.active { background: var(--acu-title-color); color: #fff; border-color: var(--acu-title-color); font-weight: bold; cursor: default; }
                .acu-page-btn.disabled { opacity: 0.5; cursor: not-allowed; background: var(--acu-text-sub); }
                .acu-page-dots { color: var(--acu-text-sub); font-size: 12px; padding: 0 2px; letter-spacing: 1px; }

                /* =========================================
                  9. Utilities & Visual Feedbacks (工具与反馈)
                  ========================================= */
                .acu-highlight-changed { color: var(--acu-highlight) !important; background-color: var(--acu-highlight-bg); border-radius: 4px; padding: 0 4px; font-weight: bold; animation: pulse-highlight 2s infinite; display: inline-block; }
                .acu-badge-pending { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); width: 80px; height: 80px; border: 4px solid #e74c3c; border-radius: 50%; color: #e74c3c; font-size: 20px; font-weight: 900; display: flex; align-items: center; justify-content: center; z-index: 50; pointer-events: none; opacity: 0.6; box-shadow: inset 0 0 10px rgba(231, 76, 60, 0.2); background: rgba(255,255,255,0.1); }
                @keyframes pulse-highlight { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }
                @keyframes acu-shake { 0% { transform: rotate(0deg); } 25% { transform: rotate(10deg); } 50% { transform: rotate(0deg); } 75% { transform: rotate(-10deg); } 100% { transform: rotate(0deg); } }
                .acu-save-alert { animation: acu-shake 0.4s ease-in-out infinite; color: #fff !important; background-color: #e74c3c !important; text-shadow: 0 0 5px rgba(231, 76, 60, 0.5); border-color: #c0392b !important; }

                /* 移动端下拉/滑动反馈 */
                .acu-pull-overlay { display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%; flex: 0 0 auto; height: 0; transition: height 0.1s linear; }
                .acu-pull-top { background: rgba(46, 204, 113, 0.15); border-bottom: 2px dashed #27ae60; color: #27ae60; }
                .acu-pull-bottom { background: rgba(231, 76, 60, 0.15); border-top: 2px dashed #c0392b; color: #c0392b; }
                .acu-pull-restore { background: rgba(52, 152, 219, 0.15) !important; border-top: 2px dashed #2980b9 !important; color: #2980b9 !important; }
                .acu-pull-icon { display: flex; flex-direction: column; align-items: center; gap: 5px; opacity: 0.8; }
                .acu-pull-text { font-size: 12px; opacity: 0.9; }

                .acu-swipe-overlay { position: absolute; top: 0; bottom: 0; width: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; pointer-events: none; z-index: 10; font-size: 18px; font-weight: bold; transition: width 0.1s linear; white-space: nowrap; }
                .acu-swipe-right { left: 0; background: rgba(46, 204, 113, 0.2); border-right: 2px dashed #27ae60; color: #27ae60; }
                .acu-swipe-left { right: 0; background: rgba(231, 76, 60, 0.2); border-left: 2px dashed #c0392b; color: #c0392b; }
                .acu-swipe-restore { background: rgba(52, 152, 219, 0.2) !important; border-left: 2px dashed #2980b9 !important; color: #2980b9 !important; }

                /* =========================================
                  10. Mobile Overrides (移动端极致适配)
                  ========================================= */
                @media (max-width: 768px) {
                    #acu-btn-pin { display: none !important; }

                    /* 标题栏压扁 */
                    .acu-panel-header { padding: 4px 10px !important; min-height: 38px !important; }
                    .acu-panel-title { font-size: 13px !important; margin-right: auto; }
                    .acu-search-wrapper { margin-right: 5px !important; }
                    .acu-search-input { height: 28px !important; width: 80px !important; font-size: 12px !important; }
                    .acu-search-input:focus { width: 120px !important; }

                    /* 导航容器恢复大触摸区 (!important 覆盖 PC 优化) */
                    .acu-nav-container { padding: 8px 6px !important; gap: 0 !important; }
                    .acu-nav-separator { margin: 1px 0 !important; opacity: 0.2; }
                    .acu-nav-tabs-area { gap: 1px !important; }
                    .acu-nav-btn { padding: 6px 2px !important; font-size: 12px !important; min-height: 32px !important; }

                    /* 底部按钮大方块化 */
                    .acu-nav-actions-area { padding-top: 2px !important; gap: 8px !important; display: flex !important; width: 100% !important; }
                    .acu-action-btn { width: auto !important; flex: 1 !important; height: 40px !important; border-radius: 8px !important; background: var(--acu-btn-bg); margin: 0 !important; }
                    .acu-action-btn i { font-size: 18px !important; }
                    .acu-action-btn:active { background: var(--acu-btn-active-bg); color: #fff; }
                }
            </style>
        `;
    $('head').append(styles);
  };

  const getTableData = () => {
    const api = getCore().getDB();
    return api && api.exportTableAsJson ? api.exportTableAsJson() : null;
  };

  const updateSaveBtnState = () => {
    const { $ } = getCore();
    if (!$) return;
    // 手动使用 getUiContext
    const $btn = $(getUiContext()).find('#acu-btn-save-global');
    if (pendingDeletes.size > 0) {
      $btn.addClass('acu-save-alert');
    } else {
      $btn.removeClass('acu-save-alert');
    }
  };
  // ==========================================
  // 保存函数 (v10.15 终极修复版 - 继承原则 + 优先暂存)
  // ==========================================
  const saveDataToDatabase = async (tableData, skipRender = false, commitDeletes = false, targetIndex = -1) => {
    // 1. 状态锁检查
    if (typeof isSaving !== 'undefined' && isSaving) return false;

    // 2. 准备数据源
    let dataToUse = typeof globalStagedData !== 'undefined' ? globalStagedData : null;
    if (!dataToUse) {
      dataToUse = tableData || (typeof getTableData === 'function' ? getTableData() : null);
    }

    if (!dataToUse) {
      console.warn('[ACU] 无数据可保存');
      return false;
    }

    const { $ } = getCore();
    const $saveBtn = $('#acu-btn-save-global, #acu-parent-container #acu-btn-save-global');
    let originalIcon = '';

    // ============================================================
    // 核心保存逻辑封装
    // ============================================================
    const executeCoreSave = async () => {
      if (typeof isSaving !== 'undefined') isSaving = true;

      // 深拷贝一份数据，避免污染源
      let finalData = JSON.parse(JSON.stringify(dataToUse));

      // A. 处理删除操作 (如果有 pendingDeletes)
      if (commitDeletes && typeof pendingDeletes !== 'undefined' && pendingDeletes.size > 0) {
        for (const sheetId in finalData) {
          if (sheetId === 'mate') continue; // 忽略 meta 信息

          const sheet = finalData[sheetId];
          if (!sheet || !sheet.name || !sheet.content) continue;

          const newContent = [sheet.content[0]]; // 保留表头
          for (let i = 1; i < sheet.content.length; i++) {
            const realIdx = i - 1;
            // 只有不在删除列表里的行才保留
            if (!pendingDeletes.has(`${sheet.name}-row-${realIdx}`)) {
              newContent.push(sheet.content[i]);
            }
          }
          sheet.content = newContent;
        }
      }

      try {
        // B. 获取 ST 核心对象
        let ST = window.SillyTavern || (window.parent ? window.parent.SillyTavern : null);
        if (!ST && window.top && window.top.SillyTavern) ST = window.top.SillyTavern;

        // C. 获取隔离配置 Key (保持原有逻辑)
        let configKey = '';
        const STORAGE_KEY_V5_SETTINGS = 'shujuku_v34_allSettings_v2';
        try {
          let storage = window.localStorage;
          if (!storage.getItem(STORAGE_KEY_V5_SETTINGS) && window.parent) {
            try {
              storage = window.parent.localStorage;
            } catch (e) {}
          }
          const settingsStr = storage.getItem(STORAGE_KEY_V5_SETTINGS);
          if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings.dataIsolationEnabled && settings.dataIsolationCode) {
              configKey = settings.dataIsolationCode;
            }
          }
        } catch (e) {}

        // D. 定位目标楼层并保存
        if (ST && ST.chat && ST.chat.length > 0) {
          let targetMsg = null;
          let targetMsgIndex = -1;

          // 策略：指定索引 > 最近的有数据 AI 楼层 > 最新的 AI 楼层
          if (targetIndex >= 0 && targetIndex < ST.chat.length) {
            targetMsgIndex = targetIndex;
            targetMsg = ST.chat[targetMsgIndex];
          } else {
            // 1. 优先寻找已经存在 ACU 数据的 AI 消息 (倒序查找)
            for (let i = ST.chat.length - 1; i >= 0; i--) {
              if (!ST.chat[i].is_user && ST.chat[i].TavernDB_ACU_IsolatedData) {
                targetMsgIndex = i;
                targetMsg = ST.chat[i];
                break;
              }
            }
            // 2. 如果没找到，兜底使用最新的 AI 消息
            if (!targetMsg) {
              for (let i = ST.chat.length - 1; i >= 0; i--) {
                if (!ST.chat[i].is_user) {
                  targetMsgIndex = i;
                  targetMsg = ST.chat[i];
                  break;
                }
              }
            }
          }

          // 写入数据
          if (targetMsg) {
            // 确定存储的 Key
            let finalKey = configKey;
            if (targetMsg.TavernDB_ACU_IsolatedData) {
              const existingKeys = Object.keys(targetMsg.TavernDB_ACU_IsolatedData);
              if (existingKeys.length > 0) {
                finalKey = existingKeys[0]; // 沿用已有的 Key
              }
            } else {
              targetMsg.TavernDB_ACU_IsolatedData = {};
            }

            // 初始化结构
            if (!targetMsg.TavernDB_ACU_IsolatedData[finalKey]) {
              targetMsg.TavernDB_ACU_IsolatedData[finalKey] = {
                independentData: {},
                modifiedKeys: [],
                updateGroupKeys: [],
              };
            }

            const tagData = targetMsg.TavernDB_ACU_IsolatedData[finalKey];
            if (!tagData.independentData) tagData.independentData = {};

            // 过滤并保存 sheet 数据
            const sheetsToSave = Object.keys(finalData).filter(k => k.startsWith('sheet_'));
            sheetsToSave.forEach(k => {
              tagData.independentData[k] = JSON.parse(JSON.stringify(finalData[k]));
            });

            // 记录修改过的 Key
            const existingKeys = tagData.modifiedKeys || [];
            tagData.modifiedKeys = [...new Set([...existingKeys, ...sheetsToSave])];

            // 执行保存到聊天记录
            if (ST.saveChat) {
              await ST.saveChat();
              // 提示保存成功 (仅在不跳过渲染时提示，避免刷屏)
              if (window.toastr && !skipRender) {
                window.toastr.success(`已更新至第 ${targetMsgIndex} 层 (覆盖旧数据)`);
              }
            }
          }
        }
      } catch (directErr) {
        console.error(directErr);
      }

      // E. [关键修改] 调用 API 同步世界书
      // 不再调用 api.importTableAsJson，而是触发全量重算
      const api = getCore().getDB();
      if (api && api.syncWorldbookEntries) {
        try {
          await api.syncWorldbookEntries({ createIfNeeded: true });
        } catch (syncErr) {
          console.warn('[ACU] Worldbook sync failed after save:', syncErr);
        }
      } else {
        console.warn('[ACU] syncWorldbookEntries API not found, skipping sync.');
      }

      return finalData;
    };

    // ============================================================
    // UI 交互与后续处理
    // ============================================================
    try {
      if (!skipRender) {
        originalIcon = $saveBtn.html();
        $saveBtn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
      }

      let savedData = null;
      // 使用 UpdateController (如果存在) 来静默执行，防止触发不必要的外部监听
      if (typeof UpdateController !== 'undefined' && UpdateController.runSilently) {
        await UpdateController.runSilently(async () => {
          savedData = await executeCoreSave();
        });
      } else {
        savedData = await executeCoreSave();
      }

      if (!skipRender) {
        // 暂时抑制下一次可能的自动更新检查
        if (typeof UpdateController !== 'undefined') {
          UpdateController._suppressNext = true;
          setTimeout(() => {
            UpdateController._suppressNext = false;
          }, 1000);
        }

        const ctx = getUiContext();
        $(ctx).find('.acu-highlight-changed').removeClass('acu-highlight-changed');
        $saveBtn.removeClass('acu-save-alert');

        // 清理缓存和标记
        if (typeof currentDiffMap !== 'undefined') currentDiffMap.clear();
        if (commitDeletes) {
          if (typeof pendingDeletes !== 'undefined') pendingDeletes.clear();
          if (typeof updateSaveBtnState === 'function') updateSaveBtnState();
        }

        if (typeof globalStagedData !== 'undefined') globalStagedData = null;

        // 刷新界面
        if (typeof renderInterface === 'function') {
          if (savedData) {
            if (typeof saveSnapshot === 'function') saveSnapshot(savedData);
            renderInterface(savedData);
          } else {
            renderInterface();
          }
        }
      }
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      if (!skipRender && window.toastr) window.toastr.error('保存失败: ' + e.message);
      return false;
    } finally {
      setTimeout(() => {
        if (typeof isSaving !== 'undefined') isSaving = false;
        if (!skipRender && $saveBtn.length) {
          $saveBtn.html(originalIcon || '<i class="fa-solid fa-save"></i>').prop('disabled', false);
        }
      }, 100);
    }
  };

  const processJsonData = json => {
    const tables = {};
    if (!json || typeof json !== 'object') return {};
    for (const sheetId in json) {
      if (json[sheetId]?.name) {
        const sheet = json[sheetId];
        tables[sheet.name] = { key: sheetId, headers: sheet.content[0] || [], rows: sheet.content.slice(1) };
      }
    }
    return Object.keys(tables).length > 0 ? tables : null;
  };
  // [替换原有的 showSettingsModal]
  const showSettingsModal = context => {
    const { $ } = getCore();
    const doc = context || document;
    const $body = $(doc.body);

    // 清理旧弹窗
    $(doc).find('.acu-edit-overlay').remove();

    const config = getConfig();
    const currentThemeClass = `acu-theme-${config.theme}`;

    // 获取所有表格名称用于排序设置
    const rawData = getTableData();
    const reversedTables = getReverseOrderTables();
    const allTableNames = rawData ? Object.keys(processJsonData(rawData)) : [];

    const modalStyles = `
        <style>
            /* 遮罩层 */
            .acu-edit-overlay {
                position: fixed !important; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.5) !important;
                backdrop-filter: blur(3px);
                z-index: 2147483647 !important;
                display: flex !important;
                align-items: center; justify-content: center;
                opacity: 0; animation: acuFadeIn 0.2s forwards;
            }

            /* 弹窗主体 */
            .acu-edit-dialog {
                background-color: var(--acu-bg-panel) !important;
                color: var(--acu-text-main) !important;
                border: 1px solid var(--acu-border) !important;
                display: flex; flex-direction: column;
                box-shadow: 0 10px 50px rgba(0,0,0,0.3) !important;
                transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
                overflow: hidden;
            }

            /* PC端布局：居中，大尺寸 */
            @media (min-width: 769px) {
                .acu-edit-dialog {
                    width: 60% !important; max-width: 800px !important; min-width: 400px;
                    height: 70vh !important; max-height: 800px;
                    border-radius: 16px !important;
                    margin: auto !important;
                }
            }

            /* 移动端布局：底部弹起 (修正版) */
            @media (max-width: 768px) {
                .acu-edit-overlay {
                    /* 关键修正1：不用 flex 居底，改用 block 让内部绝对定位生效 */
                    display: block !important;
                    /* 关键修正2：使用 dvh 解决地址栏遮挡问题，回退用 100vh */
                    height: 100vh !important;
                    height: 100dvh !important;
                }

                .acu-edit-dialog {
                    /* 关键修正3：强制固定在最底部 */
                    position: absolute !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    margin: 0 !important;

                    width: 100% !important;
                    max-width: 100% !important;
                    height: 70vh !important; /* 稍微加高一点，移动端手指粗 */

                    border-radius: 20px 20px 0 0 !important;
                    animation: acuSlideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);

                    /* 修复跳动：确保变换基点正确 */
                    transform-origin: bottom center;
                }
            }

            /* 动画 */
            @keyframes acuFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes acuSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

            /* 控件行样式 (右手原则) */
            .acu-control-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 0;
                border-bottom: 1px dashed var(--acu-border);
            }
            .acu-control-row:last-child { border-bottom: none; }

            .acu-label-col { display: flex; flex-direction: column; gap: 4px; max-width: 60%; }
            .acu-label-main { font-size: 14px; font-weight: bold; color: var(--acu-text-main); }
            .acu-label-sub { font-size: 11px; color: var(--acu-text-sub); }

            .acu-input-col { width: 40%; display: flex; justify-content: flex-end; align-items: center; }

			/* === 微信/iOS 风格开关 (Toggle) === */
			.acu-switch {
				position: relative; display: inline-block; width: 44px; height: 24px;
			}
			.acu-switch input { opacity: 0; width: 0; height: 0; }
            .acu-slider-switch {
                position: absolute; cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #e0e0e0;
                transition: .4s; border-radius: 34px;
                border: 1px solid rgba(0,0,0,0.15); /* 关键：加个淡淡的边框 */
                box-sizing: border-box;
            }
            /* 修正：滑块圆点位置微调，适应边框 */
            .acu-slider-switch:before {
                position: absolute; content: "";
                height: 18px; width: 18px; left: 2px; bottom: 2px;
                background-color: white; transition: .4s; border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
			input:checked + .acu-slider-switch { background-color: var(--acu-highlight); }
			input:checked + .acu-slider-switch:before { transform: translateX(20px); }
            /* === 新增：颜色选择器样式 === */
            .acu-sub-setting {
                background: rgba(0,0,0,0.02); /* 稍微深一点的背景表示从属关系 */
                padding-left: 20px !important; /* 缩进 */
                display: none; /* 默认隐藏，由 JS 控制显示 */
            }
            .acu-color-row {
                display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;
            }
            .acu-color-circle {
                width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
                border: 2px solid transparent; transition: transform 0.2s;
                position: relative;
            }
            .acu-color-circle:hover { transform: scale(1.1); }
            /* 选中状态：加个框和阴影 */
            .acu-color-circle.selected {
                border-color: var(--acu-text-main);
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                transform: scale(1.15);
            }
            /* 选中时中间加个点 (可选，为了看清白色背景下的选中) */
            .acu-color-circle.selected::after {
                content: ''; position: absolute; top: 50%; left: 50%;
                width: 6px; height: 6px; background: var(--acu-text-main);
                border-radius: 50%; transform: translate(-50%, -50%);
                opacity: 0.7;
            }
            /* 下拉框与滑块美化 */
            .acu-nice-select {
                appearance: none; border: 1px solid var(--acu-border); background: var(--acu-btn-bg);
                color: var(--acu-text-main); padding: 6px 24px 6px 10px; border-radius: 8px;
                font-size: 13px; text-align: center; font-weight: bold; outline: none;
                background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
                background-repeat: no-repeat; background-position: right 8px center; background-size: 10px;
                min-width: 100px;
            }

            .acu-nice-slider { width: 100%; height: 6px; background: var(--acu-border); border-radius: 3px; outline: none; appearance: none; }
            .acu-nice-slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; background: #fff; border: 2px solid var(--acu-highlight); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }

            /* 其他组件 */
            .acu-settings-group { background: var(--acu-table-head); border-radius: 12px; padding: 0 15px; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05); }
            .acu-edit-header { padding: 15px 20px; border-bottom: 1px solid var(--acu-border); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.02); }
            .acu-close-pill {
                background-color: var(--acu-text-main) !important;
                color: var(--acu-bg-panel) !important;
                border: none !important;
                padding: 6px 20px;
                border-radius: 20px;
                font-weight: bold; font-size: 13px;
                cursor: pointer;
                box-shadow: 0 4px 10px var(--acu-highlight-bg);
                transition: transform 0.2s, filter 0.2s;
                display: inline-flex; align-items: center; justify-content: center;
            }
            .acu-close-pill:hover {
                filter: brightness(0.85); /* 悬停变暗 */
                transform: scale(1.05);
            }
            .acu-btn-block {
                width: 100%;                     /* 撑满宽度 */
                display: flex;                   /* 弹性布局 */
                justify-content: center;         /* 内容居中 */
                align-items: center;             /* 垂直居中 */
                background: var(--acu-btn-bg);
                color: var(--acu-text-main);
                border: 1px solid var(--acu-border);
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
                text-align: center;
            }
            .acu-btn-block:hover {
                background: var(--acu-btn-hover);
            }
            /* 底部留白 (加高适配移动端安全区) */
            .acu-bottom-spacer {
                height: 120px; /* 从80px加到120px */
                padding-bottom: 30px; /* 额外加点内边距把文字顶上去 */
                width: 100%; text-align: center;
                color: var(--acu-text-sub); font-size: 10px;
                display: flex; align-items: center; justify-content: center;
                opacity: 0.5; flex-shrink: 0;
            }
            </style>
        `;

    // === 2. 构建 HTML 内容 ===
    const dialog = $(`
        <div class="acu-edit-overlay">
            ${modalStyles}
            <div class="acu-edit-dialog ${currentThemeClass}">
                <!-- 顶部标题栏 -->
                <div class="acu-edit-header">
                    <span style="font-size:16px; font-weight:bold;">设置</span>
                    <button id="dlg-close" class="acu-close-pill">完成</button>
                </div>

                <!-- 滚动内容区 -->
                <div class="acu-settings-content" style="flex: 1; overflow-y: auto; padding: 20px;">

                    <!-- 分组1: 外观与显示 -->
                    <div style="font-size:12px; font-weight:bold; color:var(--acu-highlight); margin:0 0 8px 10px;">外观与显示</div>
                    <div class="acu-settings-group">
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">背景主题</span><span class="acu-label-sub">选择你喜欢的配色</span></div>
                            <div class="acu-input-col">
                                <select id="cfg-theme" class="acu-nice-select">
                                    ${THEMES.map(t => `<option value="${t.id}" ${t.id === config.theme ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">布局模式</span></div>
                            <div class="acu-input-col">
                                <select id="cfg-layout" class="acu-nice-select">
                                    <option value="vertical" ${config.layout === 'vertical' ? 'selected' : ''}>PC网格</option>
                                    <option value="horizontal" ${config.layout === 'horizontal' ? 'selected' : ''}>横向滚动</option>
                                </select>
                            </div>
                        </div>
                                                    <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">底部按钮列数</span></div>
                            <div class="acu-input-col">
                                <select id="cfg-grid-cols" class="acu-nice-select">
                                    <option value="0" ${!config.gridColumns ? 'selected' : ''}>自动 (默认)</option>
                                    <option value="2" ${config.gridColumns == 2 ? 'selected' : ''}>2 列</option>
                                    <option value="3" ${config.gridColumns == 3 ? 'selected' : ''}>3 列</option>
                                    <option value="4" ${config.gridColumns == 4 ? 'selected' : ''}>4 列</option>
                                </select>
                            </div>
                        </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">字体风格</span></div>
                            <div class="acu-input-col">
                                <select id="cfg-font-family" class="acu-nice-select">
                                    ${FONTS.map(f => `<option value="${f.id}" ${f.id === config.fontFamily ? 'selected' : ''}>${f.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- 分组2: 尺寸与数值 (拖动实时预览) -->
                    <div style="font-size:12px; font-weight:bold; color:var(--acu-highlight); margin:0 0 8px 10px;">尺寸调节</div>
                    <div class="acu-settings-group">
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">卡片宽度</span><span class="acu-label-sub" id="val-width">${config.cardWidth}px</span></div>
                            <div class="acu-input-col"><input type="range" id="cfg-width" class="acu-nice-slider" min="200" max="500" step="10" value="${config.cardWidth}"></div>
                        </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">字体大小</span><span class="acu-label-sub" id="val-font">${config.fontSize}px</span></div>
                            <div class="acu-input-col"><input type="range" id="cfg-font" class="acu-nice-slider" min="12" max="22" step="1" value="${config.fontSize}"></div>
                        </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">每页条数</span><span class="acu-label-sub" id="val-per-page">${config.itemsPerPage || 20}</span></div>
                            <div class="acu-input-col"><input type="range" id="cfg-per-page" class="acu-nice-slider" min="5" max="100" step="5" value="${config.itemsPerPage || 20}"></div>
                        </div>
                    </div>

                    <!-- 分组3: 行为开关 (iOS 风格) -->
                    <div style="font-size:12px; font-weight:bold; color:var(--acu-highlight); margin:0 0 8px 10px;">功能开关与配色</div>
                    <div class="acu-settings-group">
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">显示仪表盘</span></div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-show-dash" ${config.showDashboard !== false ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                        </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col">
                                <span class="acu-label-main">锁定面板位置</span>
                                <span class="acu-label-sub">开启后禁止通过导航栏拖动窗口</span>
                            </div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-lock-panel" ${config.lockPanel ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                        </div>
                        <div class="acu-control-row">
                          <div class="acu-label-col">
                              <span class="acu-label-main">清除数据确认弹窗</span>
                              <span class="acu-label-sub">关闭后点击清除按钮将直接删除最新一楼有数据楼层的数据</span>
                          </div>
                          <div class="acu-input-col">
                              <label class="acu-switch">
                                  <!-- 注意：这里 ID 是 cfg-purge-confirm，默认选中(true) -->
                                  <input type="checkbox" id="cfg-purge-confirm" ${config.purgeConfirmation !== false ? 'checked' : ''}>
                                  <span class="acu-slider-switch"></span>
                              </label>
                          </div>
                      </div>

                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">显示分页器</span></div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-pagination" ${config.showPagination !== false ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                         </div>
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">长文本折叠</span><span class="acu-label-sub">限制过长文本的高度</span></div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-limit-height" ${config.limitLongText !== false ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                        </div>

                       <!-- 1. 高亮变动内容 (主开关) -->
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">高亮变动内容</span><span class="acu-label-sub">用颜色标记本次修改的地方</span></div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-new" ${config.highlightNew ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                        </div>
                        <!-- 1.1 高亮颜色选择器 (从属行) -->
                        <div class="acu-control-row acu-sub-setting" id="row-highlight-color" style="display: ${config.highlightNew ? 'flex' : 'none'}">
                            <div class="acu-label-col"><span class="acu-label-main" style="font-size:13px">选择高亮色</span></div>
                            <div class="acu-input-col">
                                <div class="acu-color-row" id="cfg-color-opts">
                                    ${Object.keys(HIGHLIGHT_COLORS)
                                      .map(
                                        k => `
                                        <div class="acu-color-circle ${config.highlightColor === k ? 'selected' : ''}"
                                             data-val="${k}" data-type="highlight"
                                             title="${HIGHLIGHT_COLORS[k].name}"
                                             style="background-color:${HIGHLIGHT_COLORS[k].main}">
                                        </div>`,
                                      )
                                      .join('')}
                                </div>
                            </div>
                        </div>

                        <!-- 2. 自定义标题颜色 (主开关) -->
                        <div class="acu-control-row">
                            <div class="acu-label-col"><span class="acu-label-main">标题颜色自定义</span><span class="acu-label-sub">独立设置卡片标题和列名颜色</span></div>
                            <div class="acu-input-col">
                                <label class="acu-switch">
                                    <input type="checkbox" id="cfg-custom-title" ${config.customTitleColor ? 'checked' : ''}>
                                    <span class="acu-slider-switch"></span>
                                </label>
                            </div>
                        </div>
                        <!-- 2.1 标题颜色选择器 (从属行) -->
                        <div class="acu-control-row acu-sub-setting" id="row-title-color" style="display: ${config.customTitleColor ? 'flex' : 'none'}">
                            <div class="acu-label-col"><span class="acu-label-main" style="font-size:13px">选择标题色</span></div>
                            <div class="acu-input-col">
                                <div class="acu-color-row" id="cfg-title-color-opts">
                                    ${Object.keys(HIGHLIGHT_COLORS)
                                      .map(
                                        k => `
                                        <div class="acu-color-circle ${config.titleColor === k ? 'selected' : ''}"
                                             data-val="${k}" data-type="title"
                                             title="${HIGHLIGHT_COLORS[k].name}"
                                             style="background-color:${HIGHLIGHT_COLORS[k].main}">
                                        </div>`,
                                      )
                                      .join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 分组4: 表格倒序设置 (列表) -->
                    <div style="font-size:12px; font-weight:bold; color:var(--acu-highlight); margin:0 0 8px 10px;">表格倒序显示 (最新在前)</div>
                    <div class="acu-settings-group" style="padding: 0;">
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${
                              allTableNames.length > 0
                                ? allTableNames
                                    .map(
                                      name => `
                                <div class="acu-control-row" style="padding: 10px 15px;">
                                    <div class="acu-label-col" style="max-width:70%"><span class="acu-label-main" style="font-weight:normal;">${name}</span></div>
                                    <div class="acu-input-col">
                                        <label class="acu-switch">
                                            <input type="checkbox" class="acu-reverse-check" value="${name}" ${reversedTables.includes(name) ? 'checked' : ''}>
                                            <span class="acu-slider-switch"></span>
                                        </label>
                                    </div>
                                </div>
                            `,
                                    )
                                    .join('')
                                : '<div style="padding:20px; text-align:center; color:var(--acu-text-sub)">暂无表格数据</div>'
                            }
                        </div>
                    </div>

                    <!-- 按钮区域 -->
                    <button class="acu-btn-block" id="btn-enter-sort" style="margin-top:10px; font-weight:bold; padding:12px;">
                        <i class="fa-solid fa-arrow-down-short-wide"></i> 进入表格排序模式
                    </button>

                    <!-- 底部防遮挡垫片 -->
                    <div class="acu-bottom-spacer">—— ACU Visualizer Z6.4 ——</div>
                </div>
            </div>
        </div>
        `);

    $body.append(dialog);

    // === 3. 事件绑定 ===

    // 实时预览辅助函数：直接修改 wrapper 的变量，无需重新渲染
    const updateWrapperVar = (key, val) => {
      const $wrapper = $(doc).find('.acu-wrapper');
      if ($wrapper.length) $wrapper.css(key, val);
    };

    // 尺寸滑块
    dialog
      .find('#cfg-width')
      .on('input', function () {
        const val = $(this).val();
        dialog.find('#val-width').text(val + 'px');
        updateWrapperVar('--acu-card-width', val + 'px');
      })
      .on('change', function () {
        saveConfig({ cardWidth: $(this).val() });
      });
    // 底部按钮列数设置
    dialog.find('#cfg-grid-cols').on('change', function () {
      saveConfig({ gridColumns: parseInt($(this).val()) });
      const cols = $(this).val();
      const $nav = $(doc).find('.acu-nav-tabs-area');
      if (cols == 0) {
        $nav.css('grid-template-columns', 'repeat(auto-fill, minmax(110px, 1fr))');
      } else {
        $nav.css('grid-template-columns', `repeat(${cols}, 1fr)`);
      }
    });
    dialog
      .find('#cfg-font')
      .on('input', function () {
        const val = $(this).val();
        dialog.find('#val-font').text(val + 'px');
        updateWrapperVar('--acu-font-size', val + 'px');
      })
      .on('change', function () {
        saveConfig({ fontSize: $(this).val() });
      });

    // 主题切换 (实时换肤)
    dialog.find('#cfg-theme').on('change', function () {
      const newTheme = $(this).val();
      dialog
        .find('.acu-edit-dialog')
        .removeClass(THEMES.map(t => `acu-theme-${t.id}`).join(' '))
        .addClass(`acu-theme-${newTheme}`);
      // 同时更新背后的主界面主题
      const $wrapper = $(doc).find('.acu-wrapper');
      $wrapper.removeClass(THEMES.map(t => `acu-theme-${t.id}`).join(' ')).addClass(`acu-theme-${newTheme}`);
      saveConfig({ theme: newTheme });
    });

    // 普通配置保存
    dialog.find('#cfg-layout').on('change', function () {
      saveConfig({ layout: $(this).val() });
      renderInterface();
      autoFitPanelHeight(true);
    }); // 布局改变需要重绘
    dialog.find('#cfg-font-family').on('change', function () {
      saveConfig({ fontFamily: $(this).val() });
    }); // 字体改变通常有 CSS 变量监听，或下次生效
    dialog
      .find('#cfg-per-page')
      .on('input', function () {
        dialog.find('#val-per-page').text($(this).val());
      })
      .on('change', function () {
        saveConfig({ itemsPerPage: parseInt($(this).val()) });
        renderInterface();
      });

    // 开关类
    dialog.find('#cfg-lock-panel').on('change', function () {
      const isLocked = $(this).is(':checked');
      saveConfig({ lockPanel: isLocked });
      renderInterface(); // 刷新界面以应用光标和事件状态
    });
    dialog.find('#cfg-purge-confirm').on('change', function () {
      const isChecked = $(this).is(':checked');
      saveConfig({ purgeConfirmation: isChecked });
    });
    dialog.find('#cfg-purge-confirm').on('change', function () {
      saveConfig({ purgeConfirmation: $(this).is(':checked') });
    });
    dialog.find('#cfg-show-dash').on('change', function () {
      saveConfig({ showDashboard: $(this).is(':checked') });
      renderInterface();
    });
    dialog.find('#cfg-new').on('change', function () {
      saveConfig({ highlightNew: $(this).is(':checked') });
      renderInterface();
    });
    dialog.find('#cfg-pagination').on('change', function () {
      saveConfig({ showPagination: $(this).is(':checked') });
      renderInterface();
    });
    dialog.find('#cfg-limit-height').on('change', function () {
      saveConfig({ limitLongText: $(this).is(':checked') });
      renderInterface();
    });

    // 1. 高亮内容开关 & 颜色行显隐
    dialog.find('#cfg-new').on('change', function () {
      const checked = $(this).is(':checked');
      saveConfig({ highlightNew: checked });

      // 动画效果：展开/收起颜色选择行
      const $colorRow = dialog.find('#row-highlight-color');
      if (checked) $colorRow.slideDown(200).css('display', 'flex');
      else $colorRow.slideUp(200);

      renderInterface();
    });

    // 2. 标题颜色开关 & 颜色行显隐
    dialog.find('#cfg-custom-title').on('change', function () {
      const checked = $(this).is(':checked');
      saveConfig({ customTitleColor: checked });

      const $titleColorRow = dialog.find('#row-title-color');
      if (checked) $titleColorRow.slideDown(200).css('display', 'flex');
      else $titleColorRow.slideUp(200);

      // 改变标题颜色模式需要重绘以应用新的 CSS 变量逻辑
      renderInterface();
    });

    // 3. 颜色圆点点击事件 (通用) - [修复版：支持实时预览]
    dialog.find('.acu-color-circle').on('click', function () {
      const type = $(this).data('type');
      const val = $(this).data('val');
      const colorObj = HIGHLIGHT_COLORS[val]; // 获取当前颜色的具体数值对象

      // 视觉选中效果
      $(this).siblings().removeClass('selected');
      $(this).addClass('selected');

      // 获取主界面 (位于弹窗背后的那个界面)
      const $mainWrapper = $(doc).find('.acu-wrapper');

      if (type === 'highlight') {
        saveConfig({ highlightColor: val });

        // 实时预览：高亮色
        // 同时修改弹窗自身和主界面的变量
        const cssMap = {
          '--acu-highlight': colorObj.main,
          '--acu-highlight-bg': colorObj.bg,
          '--acu-accent': colorObj.main,
        };
        dialog.find('.acu-edit-dialog').css(cssMap);
        $mainWrapper.css(cssMap);
      } else if (type === 'title') {
        saveConfig({ titleColor: val });

        // 实时预览：标题色 (关键修复点)
        // 直接修改 CSS 变量，立刻变色，不需要刷新
        $mainWrapper.css('--acu-title-color', colorObj.main);
      }
    });
    // 4. 双列显示开关
    dialog.find('#cfg-dual-col').on('change', function () {
      saveConfig({ dualColumnShortText: $(this).is(':checked') });
      renderInterface();
    });

    // 倒序表格逻辑
    dialog.find('.acu-reverse-check').on('change', function () {
      const tName = $(this).val();
      const checked = $(this).is(':checked');
      let currentList = getReverseOrderTables();
      if (checked) {
        if (!currentList.includes(tName)) currentList.push(tName);
      } else {
        currentList = currentList.filter(n => n !== tName);
      }
      saveReverseOrderTables(currentList);
      // 如果当前正好在看这个表，刷新一下
      const activeTab = getActiveTabState();
      if (activeTab === tName) renderInterface();
    });

    // 排序模式按钮
    dialog.find('#btn-enter-sort').click(() => {
      dialog.remove();
      toggleOrderEditMode();
    });

    // 关闭逻辑
    const close = () => {
      dialog.addClass('closing'); // 可以加个退出动画类
      dialog.fadeOut(200, () => dialog.remove());
    };
    dialog.find('#dlg-close').click(close);
    dialog.on('click', function (e) {
      if ($(e.target).hasClass('acu-edit-overlay')) close();
    });
  };
  // === 辅助函数：生成智能分页数组 ===
  const generatePaginationList = (current, total) => {
    if (total <= 1) return []; // 只有1页不显示分页

    const delta = 1; // 当前页前后保留几页
    const range = [];
    const rangeWithDots = [];
    let l;

    range.push(1); // 永远显示第一页

    for (let i = current - delta; i <= current + delta; i++) {
      if (i < total && i > 1) {
        range.push(i);
      }
    }

    if (total > 1) range.push(total); // 永远显示最后一页

    // 插入省略号
    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }
    return rangeWithDots;
  };
  // [优化] 自动适应面板高度 (智能识别 仪表盘/横向/纵向/网格)
  const autoFitPanelHeight = (force = false) => {
    const { $ } = getCore();
    let parentDoc = document;
    try {
      if (window.parent && window.parent.document) {
        parentDoc = window.parent.document;
      }
    } catch (e) {
      console.warn('Access to parent document restricted, using current.');
    }

    const $p = $(parentDoc);
    const $panel = $p.find('#acu-data-area');
    if (!$panel.length) return;

    // 1. 获取当前活跃的表格名称
    const activeTable = $p.find('.acu-nav-btn.active').data('table');

    if (!force && activeTable) {
      const savedHeights = getTableHeights();
      // 2.只有确实存在该表的记忆高度时，才跳过自动适应
      if (savedHeights[activeTable]) {
        return;
      }
    }
    // 3. 原有自动计算逻辑
    const $cards = $panel.find('.acu-data-card, .acu-dash-card');
    if (!$cards.length && activeTable !== TAB_DASHBOARD) return;

    let maxCardH = 0;
    $cards.each(function () {
      const h = $(this)[0].scrollHeight;
      if (h > maxCardH) maxCardH = h;
    });

    const overhead = 92;
    const targetH = maxCardH + overhead;

    let winH = 800;
    try {
      winH = $(window.parent).height();
    } catch (e) {
      winH = $(window).height();
    }

    const navH = $p.find('#acu-nav-bar').outerHeight() || 60;
    const topBarBuffer = 60;
    const maxAllowed = winH - navH - topBarBuffer;

    const finalH = Math.max(250, Math.min(targetH, maxAllowed));

    $panel.css('height', finalH + 'px');
  };
  const toggleUI = () => {
    isCollapsed = !isCollapsed;
    localStorage.setItem(STORAGE_KEY_UI_COLLAPSE, isCollapsed);
    FloatingManager.updateState(true, () => toggleUI());
    renderInterface();
  };
  // [强力版] 范围清洗函数 (v2)
  const purgeFloorRange = async (startIdx, endIdx) => {
    if (typeof isSaving !== 'undefined' && isSaving) return;

    // 1. 获取 SillyTavern 核心对象
    let ST = window.SillyTavern || (window.parent ? window.parent.SillyTavern : null);
    if (!ST && window.top && window.top.SillyTavern) ST = window.top.SillyTavern;

    if (!ST || !ST.chat) {
      if (window.toastr) window.toastr.error('无法连接到 SillyTavern 核心数据');
      return;
    }

    // 2. 验证和修正范围
    const maxIdx = ST.chat.length - 1;
    startIdx = Math.max(0, parseInt(startIdx));
    endIdx = Math.min(maxIdx, parseInt(endIdx));

    if (isNaN(startIdx) || isNaN(endIdx) || startIdx > endIdx) {
      if (window.toastr) window.toastr.warning('无效的楼层范围');
      return;
    }

    // 3. UI 锁定
    isSaving = true;
    const { $ } = getCore();
    const $btn = $('#acu-btn-purge'); // 假设这是触发范围删除的按钮
    const originalIconClass = 'fa-eraser'; // 假设原始图标是这个
    if ($btn.length) $btn.find('i').removeClass(originalIconClass).addClass('fa-spinner fa-spin');

    try {
      console.log(`[ACU-Purge] 开始强力清洗楼层范围: ${startIdx} - ${endIdx}`);

      let changesCount = 0;

      // **核心**：定义所有需要被清除的数据字段
      // (基于对后端 deleteLocalDataInChat_ACU 函数的分析)
      const keysToDelete = [
        'TavernDB_ACU_Data',
        'TavernDB_ACU_SummaryData',
        'TavernDB_ACU_IndependentData',
        'TavernDB_ACU_Identity',
        'TavernDB_ACU_IsolatedData', // 你原来只删了这个
        'TavernDB_ACU_ModifiedKeys',
        'TavernDB_ACU_UpdateGroupKeys',
      ];

      // 4. 遍历并执行强力删除
      for (let i = startIdx; i <= endIdx; i++) {
        const msg = ST.chat[i];
        if (!msg) continue;

        let messageModified = false;
        for (const key of keysToDelete) {
          if (msg.hasOwnProperty(key)) {
            delete msg[key];
            messageModified = true;
          }
        }

        if (messageModified) {
          changesCount++;
        }
      }

      // 5. 如果有变动，则保存并刷新
      if (changesCount > 0) {
        // 步骤 A: 持久化保存删除操作
        if (ST.saveChat) {
          await ST.saveChat();
        }

        // 步骤 B: 清理前端本地缓存
        if (typeof localStorage !== 'undefined' && typeof STORAGE_KEY_LAST_SNAPSHOT !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_LAST_SNAPSHOT);
        }
        if (typeof currentDiffMap !== 'undefined') currentDiffMap.clear();
        if (typeof pendingDeletes !== 'undefined') pendingDeletes.clear();

        if (window.toastr) window.toastr.success(`已强力清除 ${changesCount} 个楼层的数据，正在同步...`);

        // 步骤 C: 调用 API 进行无刷新同步
        // 这会重新扫描干净的聊天记录，并正确更新世界书和内存数据
        const api = getCore().getDB();
        if (api && api.syncWorldbookEntries) {
          await api.syncWorldbookEntries({ createIfNeeded: true });
        } else {
          console.warn('[ACU-Purge] syncWorldbookEntries API not found, skipping sync.');
        }

        // 步骤 D: 刷新前端表格 UI
        if (typeof renderInterface === 'function') {
          renderInterface();
        }
      } else {
        if (window.toastr) window.toastr.info('指定范围内没有可清除的数据');
      }
    } catch (e) {
      console.error('Purge Error:', e);
      if (window.toastr) window.toastr.error('清除失败: ' + e.message);
    } finally {
      // 6. 解锁 UI
      isSaving = false;
      if ($btn.length) $btn.find('i').removeClass('fa-spinner fa-spin').addClass(originalIconClass);
    }
  };

  // [修改] renderInterface: 解锁移动端窗口位置记忆与居中初始化
  const renderInterface = (dataOverride = null) => {
    const { $ } = getCore();
    if (!$) return;
    try {
      const config = getConfig();

      let parentDoc = document;
      try {
        if (window.parent && window.parent.document) {
          parentDoc = window.parent.document;
        }
      } catch (e) {}

      let $lastPanel = $(parentDoc).find('.acu-panel-content');
      if ($lastPanel.length) {
        globalScrollTop = $lastPanel.scrollTop();
      }

      const rawData = dataOverride || getTableData() || {};
      const tables = processJsonData(rawData) || {};
      currentDiffMap = generateDiffMap(rawData);

      const savedOrder = getSavedTableOrder();
      let orderedNames = Object.keys(tables);
      if (savedOrder)
        orderedNames = savedOrder.filter(n => tables[n]).concat(orderedNames.filter(n => !savedOrder.includes(n)));

      const showDash = config.showDashboard !== false;
      let currentTabName = getActiveTabState();
      if (isEditingOrder) currentTabName = null;
      if (currentTabName === TAB_DASHBOARD && !showDash) currentTabName = null;
      if (
        currentTabName &&
        currentTabName !== TAB_DASHBOARD &&
        currentTabName !== TAB_OPTIONS &&
        !tables[currentTabName]
      )
        currentTabName = null;
      if (currentTabName && currentTabName !== TAB_DASHBOARD && !tables[currentTabName]) currentTabName = null;

      let showPanel = !isCollapsed && currentTabName !== null;
      if (!isCollapsed && currentTabName === null) showPanel = false;

      const savedHeight =
        currentTabName && currentTabName !== TAB_DASHBOARD && tables[currentTabName]
          ? getTableHeights()[currentTabName]
          : getTableHeights()[TAB_DASHBOARD];
      const colorVal = HIGHLIGHT_COLORS[config.highlightColor] || HIGHLIGHT_COLORS.orange;
      // 2. 获取标题色 (titleColorVal) - 关键修复点
      let titleColorVal = colorVal; // 默认跟随高亮色
      if (config.customTitleColor) {
        // 如果开启了自定义，获取配置的颜色
        titleColorVal = HIGHLIGHT_COLORS[config.titleColor] || HIGHLIGHT_COLORS.orange;
      }
      const gridCols =
        config.gridColumns > 0 ? `repeat(${config.gridColumns}, 1fr)` : 'repeat(auto-fill, minmax(110px, 1fr))';

      let navActionsHtml = '';
      if (isEditingOrder) {
        navActionsHtml = `
                    <button class="acu-action-btn" id="acu-btn-settings" title="保存设置" style="color:green"><i class="fa-solid fa-check"></i></button>
                    <button class="acu-action-btn" id="acu-btn-cancel-mode" title="取消退出" style="color:#e74c3c"><i class="fa-solid fa-times"></i></button>
                `;
      } else {
        navActionsHtml = `
                    <button class="acu-action-btn" id="acu-btn-save-global" title="保存 (长按另存)"><i class="fa-solid fa-save"></i></button>
                    <button class="acu-action-btn" id="acu-btn-save-specific" title="另存为" style="display:none"><i class="fa-solid fa-file-export"></i></button>
                    <button class="acu-action-btn" id="acu-btn-pin" title="${isPinned ? '取消固定' : '固定面板 (常驻显示)'}" style="${isPinned ? 'color:var(--acu-highlight); border-color:var(--acu-highlight); background:var(--acu-btn-hover);' : ''}">
                        <i class="fa-solid fa-thumbtack"></i>
                    </button>
                    <button class="acu-action-btn" id="acu-btn-purge" title="清除指定范围数据" style="color:#e74c3c"><i class="fa-solid fa-eraser"></i></button>
                    <button class="acu-action-btn" id="acu-btn-manual-update" title="立即手动更新"><i class="fa-solid fa-hand-sparkles"></i></button>
                    <button class="acu-action-btn" id="acu-btn-open-native" title="打开原生编辑器" style="display:none"><i class="fa-solid fa-external-link-alt"></i></button>
                    <button class="acu-action-btn" id="acu-btn-settings" title="设置"><i class="fa-solid fa-cog"></i></button>
                    <button class="acu-action-btn" id="acu-btn-refresh" title="刷新"><i class="fa-solid fa-sync-alt"></i></button>
                    <button class="acu-action-btn" id="acu-btn-toggle" title="收起面板"><i class="fa-solid fa-compress"></i></button>
                `;
      }

      let contentHtml = '';
      if (currentTabName === TAB_DASHBOARD && showDash) {
        try {
          contentHtml = renderDashboard(tables);
        } catch (e) {
          contentHtml = `<div style="padding:20px">Error: ${e.message}</div>`;
        }
      } else if (currentTabName === TAB_OPTIONS) {
        // 新增：如果是选项面板，直接生成
        contentHtml = renderOptionsPanel(tables);
      } else if (currentTabName && tables[currentTabName]) {
        contentHtml = renderTableContent(tables[currentTabName], currentTabName);
      }
      let layoutClass = `acu-layout-${config.layout}`;
      if (currentTabName === TAB_OPTIONS || currentTabName === TAB_DASHBOARD) {
        layoutClass = 'acu-layout-vertical';
      }

      let html = `
                <div class="acu-wrapper acu-theme-${config.theme}" style="--acu-card-width:${config.cardWidth}px; --acu-font-size:${config.fontSize}px; --acu-highlight:${colorVal.main}; --acu-title-color:${titleColorVal.main}; --acu-nav-cols: ${gridCols}; --acu-highlight-bg:${colorVal.bg}; --acu-accent:${colorVal.main}; --acu-text-max-height:${config.limitLongText !== false ? '80px' : 'none'}; --acu-text-overflow:${config.limitLongText !== false ? 'auto' : 'visible'}">
                <div class="acu-data-display ${layoutClass} ${showPanel ? 'visible' : ''}" id="acu-data-area" ${savedHeight ? `style="height:${savedHeight}px;"` : ''}>
                        ${contentHtml}
                    </div>
                    <div class="acu-resize-handle" title="拖动调整宽度"></div>
                    <div class="acu-nav-container ${isEditingOrder ? 'editing-order' : ''} ${config.lockPanel ? 'acu-locked' : ''}" id="acu-nav-bar">                        <div class="acu-order-controls ${isEditingOrder ? 'visible' : ''}" id="acu-order-hint"><i class="fa-solid fa-arrows-alt"></i> 拖动调整顺序</div>
                        <div class="acu-nav-tabs-area">
                            ${showDash ? `<button class="acu-nav-btn ${currentTabName === TAB_DASHBOARD ? 'active' : ''}" data-table="${TAB_DASHBOARD}"><i class="fa-solid fa-tachometer-alt"></i><span>仪表盘</span></button>` : ''}
                            ${(() => {
                              const hasOptionTable = Object.keys(tables).some(k => k.includes('选项'));
                              if (hasOptionTable) {
                                return `<button class="acu-nav-btn ${currentTabName === TAB_OPTIONS ? 'active' : ''}" data-table="${TAB_OPTIONS}"><i class="fa-solid fa-list-check"></i><span>选项</span></button>`;
                              }
                              return '';
                            })()}
                            `;
      const reverseList = getReverseOrderTables();
      orderedNames.forEach(name => {
        if (name.includes('选项')) return;
        const iconClass = getIconForTableName(name);
        const isActive = currentTabName === name ? 'active' : '';
        html += `<button class="acu-nav-btn ${isActive}" data-table="${name}"><i class="fa-solid ${iconClass}"></i><span>${name}</span></button>`;
      });
      html += `   </div>
                        <div class="acu-nav-separator"></div>
                        <div class="acu-nav-actions-area">
                            ${navActionsHtml}
                        </div>
                    </div>
                </div>`;

      insertHtmlToPage(html);

      // ============================================================
      // DOM生成后立即读取位置并强制覆盖 (移动端/PC端通用)
      // ============================================================
      const $wrapper = $(parentDoc).find('.acu-wrapper');

      if ($wrapper.length) {
        try {
          let savedWin = JSON.parse(localStorage.getItem('acu_win_config'));

          // 【关键修改】如果没存过位置（第一次打开），或者移动端需要重置，默认居中
          if (!savedWin) {
            savedWin = { left: '50%', bottom: '50%', isCentered: true };
          }

          if (savedWin) {
            const cssToApply = {};
            if (savedWin.width) cssToApply['--acu-win-width'] = savedWin.width + 'px';

            // 统一应用位置逻辑
            if (savedWin.left !== undefined) {
              cssToApply['--acu-win-left'] = typeof savedWin.left === 'number' ? savedWin.left + 'px' : savedWin.left;
            }
            if (savedWin.bottom !== undefined) {
              cssToApply['--acu-win-bottom'] =
                typeof savedWin.bottom === 'number' ? savedWin.bottom + 'px' : savedWin.bottom;
            }
            if (savedWin.isCentered) {
              cssToApply['transform'] = 'translate(-50%, 50%)'; // 居中修正
            } else {
              cssToApply['transform'] = 'none';
            }
            $wrapper.css(cssToApply);
          }
        } catch (e) {
          console.error('[ACU] 恢复窗口位置失败:', e);
        }
      }
      // ============================================================

      bindFloatingEvents(tables);
      // 修改：调用新的通用窗口事件函数
      bindWindowEvents();

      if (globalScrollTop > 0) {
        $(parentDoc).find('.acu-panel-content').scrollTop(globalScrollTop);
      }

      updateSaveBtnState();
      if (isEditingOrder) initSortable();
      autoFitPanelHeight();
    } catch (e) {
      console.error('UI Render Error:', e);
    }
  };
// 新增：渲染选项聚合面板 (修复滚动版)
  const renderOptionsPanel = (tables) => {
          // 1. 筛选表格
          const optionTableKeys = Object.keys(tables).filter(k => k.includes('选项'));
          const TAB_NAME = 'acu_tab_options_panel';

          // 2. 构造面板 HTML
          // 【核心修复】：移除了外层的 <div style="display:flex..."> Wrapper
          // 让 Header 和 Content 直接作为 #acu-data-area 的子元素，利用主容器的 Flex 布局
          let html = `
              <!-- 头部区域 -->
              <div class="acu-panel-header" style="flex:0 0 auto; padding: 8px 12px; user-select: none;">
                  <div class="acu-panel-title" style="font-size: 1.2em; font-weight: 800; color:var(--acu-title-color);">
                      <i class="fa-solid fa-list-check" style="margin-right:8px;"></i>选项聚合
                  </div>
                  <div class="acu-header-actions">
                      <div class="acu-height-control" style="display:flex; margin-right: 8px;">
                          <i class="fa-solid fa-arrows-up-down acu-height-drag-handle"
                            data-table="${TAB_NAME}"
                            title="拖动调整高度"
                            style="padding:6px 10px; font-size:16px; cursor:ns-resize; opacity:0.7;"></i>
                      </div>
                      <button class="acu-close-btn" title="关闭"><i class="fa-solid fa-times"></i></button>
                  </div>
              </div>

              <!-- 内容滚动区域 -->
              <!-- touch-action: pan-y 允许单指垂直滚动 -->
              <div class="acu-panel-content"
                  style="
                      flex:1;
                      overflow-y: auto !important;
                      min-height: 0;
                      padding: 10px;
                      touch-action: pan-y;
                      -webkit-overflow-scrolling: touch;
                      position: relative;
                      z-index: 10;">

                  <div style="display:flex; flex-direction:column; gap:12px; padding-bottom: 20px;">`;

          if (optionTableKeys.length === 0) {
              html += `<div style="text-align:center;color:var(--acu-text-sub);padding:30px;font-size:0.9em;">未找到名称包含“选项”的表格</div>`;
          }

          // --- 辅助函数：生成选项行 ---
          const createOptionItemHtml = (text, tags = []) => {
              // 关键：.acu-option-row 不需要 flex:1，它是定高的
              return `
              <div class="acu-option-row" data-val="${encodeURIComponent(text)}" title="点击追加" style="
                  display:flex; align-items:flex-start; gap:10px; padding:12px;
                  background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--acu-border);
                  cursor:pointer; transition:background 0.1s; user-select:none;
                  touch-action: pan-y;"
                  onmouseover="this.style.background='var(--acu-table-hover)'; this.style.borderColor='var(--acu-highlight)';"
                  onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='var(--acu-border)';"
                  onmousedown="this.style.transform='translateY(1px)'"
                  onmouseup="this.style.transform='translateY(0)'">

                  <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:35%; flex-shrink:0; margin-top:2px;">
                      ${tags.map(t => `<span class="acu-badge" style="
                          background:var(--acu-btn-bg); color:var(--acu-title-color);
                          border:1px solid rgba(0,0,0,0.1); opacity:0.9;
                          font-size: 0.85em; padding:2px 6px; border-radius:4px;
                          line-height:1.3; font-weight:bold;">${t}</span>`).join('')}
                  </div>

                  <div style="
                      flex:1; color:var(--acu-text-main); font-weight:500;
                      font-size: var(--acu-font-size, 14px);
                      line-height:1.5; word-break: break-word; white-space: pre-wrap;">${text}</div>
              </div>`;
          };

          // 3. 遍历表格
          optionTableKeys.forEach(key => {
              const table = tables[key];
              if (!table || !table.rows || table.rows.length === 0) return;

              // 智能判断矩阵模式
              const headers = table.headers || [];
              const optionColIndices = [];
              headers.forEach((h, idx) => {
                  if (h && /(选项|Option|分支)/i.test(String(h))) optionColIndices.push(idx);
              });
              const isMatrixMode = optionColIndices.length >= 2;

              html += `
              <div class="acu-dash-card" style="
                  padding: 12px;
                  background:var(--acu-card-bg);
                  box-shadow:0 2px 5px var(--acu-shadow);
                  flex: 0 0 auto;
                  touch-action: pan-y;">

                  <div class="acu-dash-title" style="
                      font-size:1.1em; font-weight:bold; margin-bottom:10px;
                      border-bottom:1px dashed var(--acu-border); padding-bottom:6px;
                      color:var(--acu-title-color);">
                      ${key}
                  </div>
                  <div style="display:flex; flex-direction:column; gap:6px;">`;

              table.rows.forEach(row => {
                  if (isMatrixMode) {
                      const commonTags = [];
                      row.forEach((cell, idx) => {
                          if (!optionColIndices.includes(idx) && cell && String(cell).trim()) {
                              commonTags.push(cell);
                          }
                      });
                      optionColIndices.forEach(colIdx => {
                          const cellText = row[colIdx];
                          if (cellText && String(cellText).trim()) {
                              const currentHeaderTag = headers[colIdx];
                              const allTags = [...commonTags, currentHeaderTag];
                              html += createOptionItemHtml(cellText, allTags);
                          }
                      });
                  } else {
                      const validCells = row.filter(c => c && String(c).trim() !== '');
                      if (validCells.length === 0) return;
                      const targetText = validCells[validCells.length - 1];
                      const tags = validCells.slice(0, validCells.length - 1);
                      html += createOptionItemHtml(targetText, tags);
                  }
              });

              html += `   </div>
              </div>`;
          });

          // 【核心修复】：闭合标签数量减少，因为去掉了外层 div
          html += `</div></div>`;
          return html;
  };

  const renderDashboard = tables => {
    const charTableKey = Object.keys(tables).find(k => k.includes('主角') || k.includes('角色') || k.includes('属性'));
    const charTable = charTableKey ? tables[charTableKey] : null;

    const globalTableKey = Object.keys(tables).find(
      k => k.includes('全局') || k.includes('通用') || k.includes('世界') || k.includes('设定'),
    );
    const globalTable = globalTableKey ? tables[globalTableKey] : null;

    let relTable = null;
    let relTableKey = '';
    try {
      relTableKey = Object.keys(tables).find(k => k.includes('重要人物'));
      if (!relTableKey) {
        relTableKey = Object.keys(tables).find(
          k => k.includes('关系') || k.includes('NPC') || k.includes('npc') || k.includes('好感'),
        );
      }
      relTable = relTableKey ? tables[relTableKey] : null;
    } catch (e) {}

    const taskTableKey = Object.keys(tables).find(k => k.includes('任务') || k.includes('日程'));
    const taskTable = taskTableKey ? tables[taskTableKey] : null;
    const locTableKey = Object.keys(tables).find(k => k.includes('地点') || k.includes('位置'));
    const locTable = locTableKey ? tables[locTableKey] : null;

    const bagTableKey = Object.keys(tables).find(
      k => k.includes('背包') || k.includes('物品') || k.includes('库存') || k.includes('装备'),
    );
    const bagTable = bagTableKey ? tables[bagTableKey] : null;

    const skillTableKey = Object.keys(tables).find(
      k => k.includes('技能') || k.includes('武魂') || k.includes('功法') || k.includes('能力') || k.includes('招式'),
    );
    const skillTable = skillTableKey ? tables[skillTableKey] : null;

    const currentHeight = getTableHeights()[TAB_DASHBOARD] || 600;

    let html = `
        <div class="acu-panel-header">
            <div class="acu-panel-title"><i class="fa-solid fa-tachometer-alt"></i> 主页 / 仪表盘</div>
            <div class="acu-header-actions">
                <div class="acu-height-control">
                    <i class="fa-solid fa-arrows-up-down acu-height-drag-handle" data-table="${TAB_DASHBOARD}" title="拖动调整高度 (双击重置为自动)"></i>
                    </div>
                <button class="acu-close-btn" title="关闭"><i class="fa-solid fa-times"></i></button>
            </div>
        </div>
        <div class="acu-panel-content" style="overflow-y:auto">
            <div class="acu-dash-container">
                <div class="acu-dash-col-left" style="display:flex; flex-direction:column; gap:16px">
    `;
    if (globalTable && globalTable.rows && globalTable.rows.length > 0) {
      html += `<div class="acu-dash-card">
                    <div class="acu-dash-title">当前位置信息</div>
                    <div class="acu-dash-char-info">`;
      globalTable.rows.slice(0, 8).forEach(row => {
        if (row[1]) {
          html += `<div class="acu-dash-stat-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="acu-dash-stat-label" style="min-width: 60px; text-align: left;">${row[0] || '地点'}</span>
                            <span class="acu-dash-stat-val" style="text-align: left;">${row[1]}</span>
                          </div>`;
        }
      });
      html += `   </div></div>`;
    }

    html += `       <div class="acu-dash-card">
                        <div class="acu-tab-header">
                            <div class="acu-tab-btn active" data-target="dash-char">主角状态</div>
                            <div class="acu-tab-btn" data-target="dash-bag">背包物品</div>
                            <div class="acu-tab-btn" data-target="dash-skill">技能列表</div>
                        </div>
                        <div class="acu-tab-content-container">
                            <div id="dash-char" class="acu-tab-pane active">
                                <div class="acu-dash-char-info">
       `;

    if (charTable && charTable.rows && charTable.rows.length > 0) {
      const headers = charTable.headers || [];
      const row = charTable.rows[0];
      let charInfoHtml = '';
      const targets = [
        {
          keys: ['名'],
          label: '姓名',
        },
        {
          keys: ['职', '身'],
          label: '职业/身份',
        },
        {
          keys: ['性', '龄'],
          label: '性别/年龄',
        },
      ];

      const createRow = (label, val) =>
        `<div class="acu-dash-stat-row" style="justify-content: flex-start; gap: 12px;"><span class="acu-dash-stat-label" style="min-width: 60px; text-align: left;">${label}</span><span class="acu-dash-stat-val" style="text-align: left;">${val}</span></div>`;

      targets.forEach(t => {
        const idx = headers.findIndex(h => t.keys.some(k => String(h || '').includes(k)));
        if (idx > 0 && row[idx]) {
          charInfoHtml += createRow(t.label, row[idx]);
        }
      });
      if (!charInfoHtml) {
        let count = 0;
        row.forEach((cell, idx) => {
          if (idx > 0 && count < 3 && cell) {
            charInfoHtml += createRow(headers[idx] || '属性', cell);
            count++;
          }
        });
      }
      html += charInfoHtml;
    } else {
      html += `<div style="text-align:center;color:var(--acu-text-sub);padding:20px">未找到主角信息表</div>`;
    }

    html += `               </div></div>
                            <div id="dash-bag" class="acu-tab-pane">
                                <div class="acu-dash-npc-grid">
    `;

    if (bagTable && bagTable.rows) {
      bagTable.rows.slice(0, 20).forEach(row => {
        if (row[1]) {
          const realIdx = bagTable.rows.indexOf(row);
          html += `<div class="acu-dash-npc-item acu-dash-interactive" data-tname="${bagTableKey}" data-row="${realIdx}">${row[1]}</div>`;
        }
      });
    } else {
      html += `<div style="text-align:center;color:var(--acu-text-sub);padding:20px">未找到背包表</div>`;
    }

    html += `                   </div></div>
                            <div id="dash-skill" class="acu-tab-pane">
                                <div class="acu-dash-npc-grid">
    `;

    if (skillTable && skillTable.rows) {
      skillTable.rows.slice(0, 20).forEach(row => {
        if (row[1]) {
          const realIdx = skillTable.rows.indexOf(row);
          html += `<div class="acu-dash-npc-item acu-dash-interactive" data-tname="${skillTableKey}" data-row="${realIdx}"><i class="fa-solid fa-dragon"></i> ${row[1]}</div>`;
        }
      });
    } else {
      html += `<div style="text-align:center;color:var(--acu-text-sub);padding:20px">未找到技能表</div>`;
    }

    html += `           </div></div></div></div></div>
                <div class="acu-dash-col-right" style="display:flex;flex-direction:column;gap:16px">
                     <div class="acu-dash-card" style="flex:0 0 auto">
                        <div class="acu-dash-title"><span>NPC</span></div>
                        <div class="acu-dash-npc-grid">
    `;

    if (relTable && relTable.rows) {
      let nameIdx = 1;
      const headers = relTable.headers || [];
      if (
        headers
          .map(h => String(h || '').toLowerCase())
          .join('')
          .includes('名')
      ) {
        nameIdx = headers.findIndex(h =>
          String(h || '')
            .toLowerCase()
            .includes('名'),
        );
        if (nameIdx < 0) nameIdx = 1;
      }
      relTable.rows.slice(0, 16).forEach((row, rIdx) => {
        const name = row[nameIdx] || row[1] || 'Unknown';
        const realIdx = relTable.rows.indexOf(row);
        html += `<div class="acu-dash-npc-item acu-dash-interactive" data-tname="${relTableKey}" data-row="${realIdx}">${name}</div>`;
      });
    } else {
      html += `<div style="grid-column:1/-1;text-align:center;color:var(--acu-text-sub)">未找到“重要人物表”</div>`;
    }

    html += `           </div></div>
                    <div class="acu-dash-sub-grid" style="flex:1">
                         <div class="acu-dash-card"><div class="acu-dash-title">任务列表</div><div style="display:flex;flex-direction:column;gap:5px">
    `;
    if (taskTable && taskTable.rows) {
      taskTable.rows.slice(0, 5).forEach((row, rIdx) => {
        const realIdx = taskTable.rows.indexOf(row);
        html += `<div class="acu-dash-list-item acu-dash-interactive" data-tname="${taskTableKey}" data-row="${realIdx}"><i class="fa-solid fa-caret-right"></i> ${row[1] || '任务'}</div>`;
      });
    } else {
      html += `<div style="color:var(--acu-text-sub);font-size:12px">未找到任务表</div>`;
    }

    html += `               </div></div>
                         <div class="acu-dash-card"><div class="acu-dash-title">重要地点</div><div style="display:flex;flex-direction:column;gap:5px">
    `;
    if (locTable && locTable.rows) {
      locTable.rows.slice(0, 5).forEach((row, rIdx) => {
        const realIdx = locTable.rows.indexOf(row);
        html += `<div class="acu-dash-list-item acu-dash-interactive" data-tname="${locTableKey}" data-row="${realIdx}"><i class="fa-solid fa-map-pin"></i> ${row[1] || '地点'}</div>`;
      });
    } else {
      html += `<div style="color:var(--acu-text-sub);font-size:12px">未找到地点表</div>`;
    }

    html += `               </div></div></div></div></div></div>`;
    return html;
  };

  const insertHtmlToPage = html => {
    const { $ } = getCore();

    if (isCollapsed) {
      FloatingManager.updateState(true, () => toggleUI());
    } else {
      FloatingManager.updateState(true);
      FloatingManager.mountPanel(html);
    }
  };

  // [修改] renderTableContent: 支持变动内容置顶 + 智能排序
  const renderTableContent = (tableData, tableName) => {
    // 1. [z6] 基础判空
    if (!tableData || !tableData.rows.length) {
      return `<div class="acu-panel-header">
            <div class="acu-panel-title"><i class="fa-solid ${getIconForTableName(tableName)}"></i> ${tableName}</div>
            <button class="acu-close-btn" title="关闭"><i class="fa-solid fa-times"></i></button>
        </div>
        <div class="acu-panel-content">
            <div style="text-align:center;color:var(--acu-text-sub);padding:20px;">暂无数据</div>
        </div>`;
    }

    // 2. [z6] 获取视图模式
    const savedStyles = typeof getTableStyles === 'function' ? getTableStyles() : {};
    const currentStyle = savedStyles[tableName] || 'list';
    const isListMode = currentStyle === 'list';

    // 3. [z6] 表头与标题列逻辑
    const headers = tableData.headers.slice(1);
    let titleColIndex = 1;
    if (tableName.includes('总结') || tableName.includes('大纲')) {
      const idx = tableData.headers.findIndex(
        h => h && (h.includes('索引') || h.includes('编号') || h.includes('代码')),
      );
      if (idx > 0) titleColIndex = idx;
    }

    // ============================================================
    // 4. [核心修改] 预处理数据：映射原始索引并检查变动状态
    // ============================================================

    // 辅助函数：检查某一行是否有任何变动 (包括内容修改和待删除)
    const checkRowChanged = (realIdx, row) => {
      // A. 检查整行是否为新行
      if (currentDiffMap.has(`${tableName}-row-${realIdx}`)) return true;
      // B. 检查是否在待删除列表
      if (pendingDeletes.has(`${tableName}-row-${realIdx}`)) return true;
      // C. 检查每一个单元格是否有修改
      for (let c = 1; c < row.length; c++) {
        if (currentDiffMap.has(`${tableName}-${realIdx}-${c}`)) return true;
      }
      return false;
    };

    // 将原始行数据包装成对象，携带原始索引 (Original Index)
    let processedRows = tableData.rows.map((row, index) => ({
      data: row,
      originalIndex: index,
      hasChange: checkRowChanged(index, row),
    }));

    // 5. [z6] 搜索逻辑 (基于包装后的对象过滤)
    if (currentSearchTerm) {
      processedRows = processedRows.filter(item =>
        item.data.some(cell => String(cell).toLowerCase().includes(currentSearchTerm)),
      );
    }

    // ============================================================
    // 6. [核心修改] 复合排序逻辑
    // 优先级 1: 有变动的内容 (Diff/Pending) 排在最前
    // 优先级 2: 倒序/顺序 设置
    // ============================================================
    const reverseTables = getReverseOrderTables();
    const isReversed = reverseTables.includes(tableName);

    processedRows.sort((a, b) => {
      // 规则1：有变动的排在前面
      if (a.hasChange && !b.hasChange) return -1; // a 排前
      if (!a.hasChange && b.hasChange) return 1; // b 排前

      // 规则2：根据是否倒序排列
      if (isReversed) {
        return b.originalIndex - a.originalIndex; // 倒序 (大索引在前)
      } else {
        return a.originalIndex - b.originalIndex; // 顺序 (小索引在前)
      }
    });

    // 7. [z6] 分页切片 (基于排序后的数据)
    const config = getConfig();
    const itemsPerPage = config.itemsPerPage || 20;
    const displayTotal = processedRows.length;
    const totalPages = Math.ceil(displayTotal / itemsPerPage) || 1;

    if (currentPage > totalPages) currentPage = 1; // 修正页码越界
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;

    // 这里的 slicedRows 现在包含的是包装对象 { data, originalIndex, hasChange }
    const slicedRows = processedRows.slice(startIdx, endIdx);

    // 8. [z6] 构建 HTML
    let html = `
    <div class="acu-panel-header">
          <div class="acu-panel-title">
            <i class="fa-solid ${getIconForTableName(tableName)}"></i>
            ${tableName}
            <span style="font-size:12px;color:var(--acu-text-sub);font-weight:normal;margin-left:5px">
                (${displayTotal}项${isReversed ? ' <i class="fa-solid fa-arrow-down-9-1" title="倒序"></i>' : ''})
            </span>
        </div>
        <div class="acu-header-actions">
            <button class="acu-action-btn" id="acu-btn-switch-style" data-table="${tableName}" title="切换视图 (当前: ${isListMode ? '列表' : '卡片'})" style="width:28px;height:28px;margin-right:6px;font-size:14px;background:transparent;border:none;color:var(--acu-text-main);cursor:pointer;">
                <i class="fa-solid ${isListMode ? 'fa-th-large' : 'fa-list'}"></i>
            </button>
            <i class="fa-solid fa-arrows-up-down acu-height-drag-handle" data-table="${tableName}" title="拖动调整高度 (双击重置为自动)" style="margin-right:8px; opacity:0.6; cursor:ns-resize; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6"></i>
            <div class="acu-search-wrapper">
                <i class="fa-solid fa-search acu-search-icon"></i>
                <input type="text" class="acu-search-input" placeholder="搜索..." value="${currentSearchTerm}" />
            </div>
           <button class="acu-close-btn" title="关闭"><i class="fa-solid fa-times"></i></button>
        </div>
    </div>
    <div class="acu-panel-content">
        <div class="acu-card-grid">`;

    // 9. [核心修改] 渲染循环 (解包对象)
    slicedRows.forEach(item => {
      // 解包数据
      const row = item.data;
      const realIndex = item.originalIndex;

      const cardTitle = row[titleColIndex] || '未命名';
      const showDefaultIndex = titleColIndex === 1;

      const isRowNew = currentDiffMap.has(`${tableName}-row-${realIndex}`);
      const isPendingDelete = pendingDeletes.has(`${tableName}-row-${realIndex}`);
      const rowClass = isRowNew && config.highlightNew ? 'acu-highlight-changed' : '';

      // 卡片容器
      html += `<div class="acu-data-card ${isListMode ? 'acu-style-list' : ''}">
                ${isPendingDelete ? '<div class="acu-badge-pending">待删除</div>' : ''}
                <div class="acu-card-header">
                    <span class="acu-card-index">${showDefaultIndex ? '#' + (realIndex + 1) : ''}</span>
                    <span class="acu-cell acu-editable-title ${rowClass}" data-key="${tableData.key}" data-tname="${tableName}" data-row="${realIndex}" data-col="${titleColIndex}" data-val="${encodeURIComponent(cardTitle)}" title="点击编辑标题">${cardTitle}</span>
                </div>
                <div class="acu-card-body">`;

      if (isListMode) {
        // 列表模式
        row.forEach((cell, cIdx) => {
          if (cIdx > 0 && cIdx !== titleColIndex) {
            const headerName = headers[cIdx - 1] || `属性${cIdx}`;
            const badgeStyle = getBadgeStyle(cell);
            const cellStr = String(cell);
            const isCellChanged = currentDiffMap.has(`${tableName}-${realIndex}-${cIdx}`);
            const cellHighlight = isCellChanged && config.highlightNew ? 'acu-highlight-changed' : '';

            const dataAttrs = `data-key="${tableData.key}" data-tname="${tableName}" data-row="${realIndex}" data-col="${cIdx}" data-val="${encodeURIComponent(cell)}"`;
            const contentHtml = badgeStyle ? `<span class="acu-badge ${badgeStyle}">${cellStr}</span>` : cellStr;

            html += `<div class="acu-cell acu-card-row" ${dataAttrs}>
                                <div class="acu-card-label">${headerName}</div>
                                <div class="acu-card-value ${cellHighlight}">${contentHtml}</div>
                             </div>`;
          }
        });
      } else {
        // 网格模式
        let gridHtml = '';
        let fullHtml = '';
        row.forEach((cell, cIdx) => {
          if (cIdx > 0 && cIdx !== titleColIndex) {
            const headerName = headers[cIdx - 1] || `属性${cIdx}`;
            const badgeStyle = getBadgeStyle(cell);
            const cellStr = String(cell);
            const isCellChanged = currentDiffMap.has(`${tableName}-${realIndex}-${cIdx}`);
            const cellHighlight = isCellChanged && config.highlightNew ? 'acu-highlight-changed' : '';

            // 修正: 去掉了 dataAttrs 字符串内部的 class="acu-cell"，避免与后续 class 属性冲突
            const dataAttrs = `data-key="${tableData.key}" data-tname="${tableName}" data-row="${realIndex}" data-col="${cIdx}" data-val="${encodeURIComponent(cell)}"`;

            if (cellStr.length > 50 || tableName.includes('总体大纲')) {
              fullHtml += `<div class="acu-cell acu-full-item" ${dataAttrs}><div class="acu-full-label">${headerName}</div><div class="acu-full-value ${cellHighlight}">${cell}</div></div>`;
            } else {
              const contentHtml = badgeStyle ? `<span class="acu-badge ${badgeStyle}">${cell}</span>` : cell;
              gridHtml += `<div class="acu-cell acu-grid-item" ${dataAttrs}><div class="acu-grid-label">${headerName}</div><div class="acu-grid-value ${cellHighlight}">${contentHtml}</div></div>`;
            }
          }
        });
        if (gridHtml) html += `<div class="acu-card-main-grid">${gridHtml}</div>`;
        if (fullHtml) html += `<div class="acu-card-full-area">${fullHtml}</div>`;
      }

      html += `   </div></div>`;
    });

    // 10. [z6] 新版智能分页条
    html += `</div></div>`; // 第一个</div>闭合grid，第二个</div>闭合 acu-panel-content
    if (config.showPagination !== false && totalPages > 1) {
      const pageList = generatePaginationList(currentPage, totalPages);

      html += `<div class="acu-pagination-container">
                <!-- 上一页 (固定在最左) -->
                <div class="acu-page-btn acu-page-arrow ${currentPage === 1 ? 'disabled' : ''}" data-action="prev" title="上一页">
                    <i class="fa-solid fa-chevron-left"></i>
                </div>

                <!-- 中间数字区 (居中) -->
                <div class="acu-pagination-numbers">`;

      pageList.forEach(p => {
        if (p === '...') {
          html += `<div class="acu-page-dots">...</div>`;
        } else {
          const isActive = p === currentPage ? 'active' : '';
          html += `<div class="acu-page-btn ${isActive}" data-action="goto" data-page="${p}">${p}</div>`;
        }
      });

      html += `</div>

                <!-- 下一页 (固定在最右) -->
                <div class="acu-page-btn acu-page-arrow ${currentPage === totalPages ? 'disabled' : ''}" data-action="next" title="下一页">
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            </div>`;
    }

    return html;
  };

  const closePanel = () => {
    const { $ } = getCore();
    const ctx = getUiContext(); // 使用 getUiContext 自动获取当前环境

    // 隐藏面板，取消高亮
    $(ctx).find('#acu-data-area').removeClass('visible');
    $(ctx).find('.acu-nav-btn').removeClass('active');

    pendingDeletes.clear();
    updateSaveBtnState();

    isCollapsed = true;
    localStorage.setItem(STORAGE_KEY_UI_COLLAPSE, isCollapsed);
    renderInterface();
  };

  const showInputFloorDialog = context => {
    const { $ } = getCore();
    const config = getConfig();
    const doc = context || document;

    // 清理旧弹窗
    $(doc).find('.acu-edit-overlay').remove();

    // 获取高亮色用于装饰
    const colorVal = HIGHLIGHT_COLORS[config.highlightColor] || HIGHLIGHT_COLORS.orange;

    const dialog = $(`
            <!-- 关键修改1：强制覆盖全局样式，改为居中对齐 (align-items: center)，去掉顶部留白 -->
            <div class="acu-edit-overlay" style="align-items: center !important; padding-top: 0 !important;">

                <!-- 关键修改2：重写弹窗样式，限制宽度，使其精致化 -->
                <div class="acu-edit-dialog acu-theme-${config.theme}"
                     style="width: 85%; max-width: 320px; height: auto; max-height: auto; margin: 0; box-shadow: 0 25px 50px rgba(0,0,0,0.5); overflow: visible;">

                    <div class="acu-edit-title" style="text-align:center; border-bottom:none; padding: 25px 20px 0 20px; font-size:18px;">
                        保存到指定楼层
                    </div>

                    <div style="padding: 20px 30px; display: flex; flex-direction: column; align-items: center; gap: 15px;">
                        <!-- 装饰图标 -->
                        <div style="width: 50px; height: 50px; background: ${colorVal.bg}; color: ${colorVal.main}; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:5px;">
                            <i class="fa-solid fa-layer-group"></i>
                        </div>

                        <p style="font-size:13px; color:var(--acu-text-sub); margin:0; text-align:center; line-height:1.4;">
                            请输入目标楼层号<br>
                            <span style="opacity:0.7; font-size:12px;">(输入现有楼层号覆盖，或新楼层)</span>
                        </p>

                        <input type="number" id="inp-floor-idx" class="acu-select" placeholder="#"
                               style="text-align:center; font-size:28px; font-weight:bold; height: 60px; width: 140px; border-radius: 12px; background: var(--acu-input-bg); border: 2px solid var(--acu-border); color: var(--acu-text-main);">
                    </div>

                     <div class="acu-dialog-btns" style="padding: 0 20px 25px 20px; border-top: none; justify-content: space-between; gap: 10px;">
                        <button class="acu-dialog-btn" id="dlg-cancel-floor" style="flex:1; justify-content:center; padding: 10px; border-radius: 8px; background: var(--acu-btn-bg);">
                            取消
                        </button>
                        <button class="acu-dialog-btn" id="dlg-save-floor" style="flex:1; justify-content:center; padding: 10px; border-radius: 8px; background: ${colorVal.main}; color: #fff;">
                            确认
                        </button>
                    </div>
                </div>
            </div>
        `);

    $(doc.body).append(dialog);

    // 自动聚焦输入框
    setTimeout(() => dialog.find('#inp-floor-idx').focus(), 100);

    const close = () => dialog.fadeOut(200, () => dialog.remove());

    dialog.find('#dlg-cancel-floor').click(close);

    dialog.find('#dlg-save-floor').click(async () => {
      const val = parseInt(dialog.find('#inp-floor-idx').val());
      if (!isNaN(val) && val >= 0) {
        close();
        let dataToUse = globalStagedData;
        if (!dataToUse) dataToUse = getTableData();
        if (!dataToUse) dataToUse = loadSnapshot();

        if (dataToUse) {
          await saveDataToDatabase(dataToUse, false, true, val);
        } else {
          if (window.toastr) window.toastr.error('无数据可保存');
        }
      } else {
        // 输入框抖动提示
        const $inp = dialog.find('#inp-floor-idx');
        $inp.css('border-color', '#e74c3c');
        setTimeout(() => $inp.css('border-color', ''), 500);
        if (window.toastr) window.toastr.warning('请输入有效的楼层数字');
      }
    });

    // 点击遮罩关闭
    dialog.on('click', function (e) {
      if ($(e.target).hasClass('acu-edit-overlay')) close();
    });
  };

  const showPurgeRangeDialog = (context, defaultStart, defaultEnd) => {
    const { $ } = getCore();
    const config = getConfig();
    const doc = context || document;

    // 清理旧弹窗
    $(doc).find('.acu-edit-overlay').remove();

    const dialog = $(`
            <div class="acu-edit-overlay" style="align-items: center !important; padding-top: 0 !important;">
                <div class="acu-edit-dialog acu-theme-${config.theme}"
                     style="width: 85%; max-width: 360px; height: auto; margin: 0; box-shadow: 0 25px 50px rgba(0,0,0,0.5); overflow: visible;">
                    <div class="acu-edit-title" style="text-align:center; border-bottom:none; padding: 25px 20px 0 20px; font-size:18px;">
                        清除数据范围
                    </div>

                    <div style="padding: 20px 30px; display: flex; flex-direction: column; align-items: center; gap: 15px;">
                        <!-- 装饰图标 -->
                        <div style="width: 50px; height: 50px; background: rgba(231, 76, 60, 0.15); color: #e74c3c; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:5px;">
                            <i class="fa-solid fa-eraser"></i>
                        </div>

                        <p style="font-size:13px; color:var(--acu-text-sub); margin:0; text-align:center; line-height:1.4;">
                            请输入要清除数据的楼层范围<br>
                            <span style="opacity:0.7; font-size:12px;">(起始楼层 - 结束楼层)</span>
                        </p>

                        <div style="display:flex; gap:10px; align-items:center; justify-content: center; width: 100%;">
                            <input type="number" id="inp-purge-start" class="acu-select" placeholder="Start" value="${defaultStart}"
                                   style="text-align:center; font-size:20px; font-weight:bold; height: 50px; width: 100px; border-radius: 12px; background: var(--acu-input-bg); border: 2px solid var(--acu-border); color: var(--acu-text-main);">
                            <span style="font-weight:bold; color:var(--acu-text-main);">-</span>
                            <input type="number" id="inp-purge-end" class="acu-select" placeholder="End" value="${defaultEnd}"
                                   style="text-align:center; font-size:20px; font-weight:bold; height: 50px; width: 100px; border-radius: 12px; background: var(--acu-input-bg); border: 2px solid var(--acu-border); color: var(--acu-text-main);">
                        </div>
                    </div>

                    <div class="acu-dialog-btns" style="padding: 0 20px 25px 20px; border-top: none; justify-content: space-between; gap: 10px;">
                        <button class="acu-dialog-btn" id="dlg-cancel-purge" style="flex:1; justify-content:center; padding: 10px; border-radius: 8px; background: var(--acu-btn-bg);">
                            取消
                        </button>
                        <button class="acu-dialog-btn" id="dlg-confirm-purge" style="flex:1; justify-content:center; padding: 10px; border-radius: 8px; background: #e74c3c; color: #fff;">
                            确认清除
                        </button>
                    </div>
                </div>
            </div>
        `);

    $(doc.body).append(dialog);

    // 自动聚焦第一个输入框
    setTimeout(() => dialog.find('#inp-purge-start').focus(), 100);

    const close = () => dialog.fadeOut(200, () => dialog.remove());

    dialog.find('#dlg-cancel-purge').click(close);

    dialog.find('#dlg-confirm-purge').click(async () => {
      const startVal = parseInt(dialog.find('#inp-purge-start').val());
      const endVal = parseInt(dialog.find('#inp-purge-end').val());

      if (!isNaN(startVal) && !isNaN(endVal) && startVal >= 0 && endVal >= startVal) {
        close();
        await purgeFloorRange(startVal, endVal);
      } else {
        // 错误提示
        const $inps = dialog.find('input');
        $inps.css('border-color', '#e74c3c');
        setTimeout(() => $inps.css('border-color', ''), 500);
        if (window.toastr) window.toastr.warning('请输入有效的楼层范围 (Start <= End)');
      }
    });

    // 点击遮罩关闭
    dialog.on('click', function (e) {
      if ($(e.target).hasClass('acu-edit-overlay')) close();
    });
  };
  // === 0. 核心动作库 (逻辑分离) ===
  const CoreActions = {
    insertRow: async (tableKey, rowIdx, parentDoc) => {
      const rawData = getTableData();
      if (rawData && rawData[tableKey]?.content) {
        const sheet = rawData[tableKey];
        const colCount = sheet.content[0] ? sheet.content[0].length : 2;
        const newRow = new Array(colCount).fill('');
        if (colCount > 0) newRow[0] = String(sheet.content.length);

        // 插入到当前行之后
        sheet.content.splice(rowIdx + 2, 0, newRow);

        if (window.toastr) window.toastr.info('正在插入新行...');
        // 保持和你原代码一致的参数调用
        await saveDataToDatabase(rawData, false, true);
      }
    },
    setInput: text => {
      const parentDoc = window.parent.document;
      const textarea = parentDoc.getElementById('send_textarea');
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
    },
    // 标记删除/恢复
    toggleDelete: (deleteKey, $card) => {
      if (pendingDeletes.has(deleteKey)) {
        // 恢复
        pendingDeletes.delete(deleteKey);
        $card.find('.acu-badge-pending').remove();
        if (window.toastr) window.toastr.success('已取消删除');
      } else {
        // 删除
        pendingDeletes.add(deleteKey);
        if ($card.find('.acu-badge-pending').length === 0) {
          $card.append('<div class="acu-badge-pending">待删除</div>');
        }
        if (window.toastr) window.toastr.warning('整行已标记为删除');
      }
      // 确保调用你原有的状态更新函数
      updateSaveBtnState();
    },

    // 编辑单元格内容
    editCell: (cellData, newVal, context) => {
      const { tableKey, rowIdx, colIdx, cellId, $cell } = cellData;
      const { $ } = getCore();
      const doc = context || document;

      let freshData = globalStagedData;
      if (!freshData) freshData = getTableData();
      if (!freshData) freshData = loadSnapshot();

      if (freshData && freshData[tableKey]?.content[rowIdx + 1]) {
        freshData[tableKey].content[rowIdx + 1][colIdx] = newVal;
        globalStagedData = freshData;
        saveSnapshot(freshData);
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

      currentDiffMap.add(cellId);
      const $saveBtn = $(doc).find('#acu-btn-save-global');
      $saveBtn.addClass('acu-save-alert');

      if (window.toastr) window.toastr.info('修改已暂存');
    },

    // 复制内容
    copyContent: content => {
      const parentWin = window.parent || window;
      if (parentWin.TavernHelper && parentWin.TavernHelper.triggerSlash) {
        try {
          const safeContent = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
          parentWin.TavernHelper.triggerSlash(`/clipboard-set "${safeContent}"`);
          if (window.toastr) window.toastr.success('已复制');
          return;
        } catch (err) {
          console.warn('酒馆复制接口失败', err);
        }
      }
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        if (window.toastr) window.toastr.success('已复制');
      } catch (err) {
        prompt('请手动复制:', content);
      }
      document.body.removeChild(textArea);
    },
  };
  // =========================================================================
  // === 全量替换 bindFloatingEvents (最终完美版：无死代码，逻辑严密) ===
  // =========================================================================
  const bindFloatingEvents = tables => {
    const parentDoc = window.parent.document;
    const { $ } = getCore();
    const $p = $(parentDoc);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // ============================================================
    // [重构] 通用长按绑定辅助函数
    const bindLongPress = (btnId, onShortClick, onLongPress) => {
      const selector = `#${btnId}`;
      let pressTimer = null;
      let isLong = false;

      // 1. 按下：开启计时
      $p.off('mousedown touchstart', selector).on('mousedown touchstart', selector, function (e) {
        e.stopPropagation();
        isLong = false;
        pressTimer = setTimeout(() => {
          isLong = true;
          if (onLongPress) onLongPress();
        }, 800); // 长按阈值 800ms
      });

      // 2. 松开/移出：清除计时
      $p.off('mouseup touchend mouseleave', selector).on('mouseup touchend mouseleave', selector, function (e) {
        e.stopPropagation();
        clearTimeout(pressTimer);
      });

      // 3. 点击：如果是长按触发的，拦截点击；否则执行短按
      $p.off('click', selector).on('click', selector, function (e) {
        e.preventDefault();
        e.stopPropagation();
        // 某些情况下需要阻止冒泡，防止触发关闭面板
        e.stopImmediatePropagation();

        if (isLong) {
          isLong = false; // 重置状态
          return;
        }
        if (onShortClick) onShortClick();
      });
    };

    // [应用] 使用通用函数绑定按钮逻辑

    // 1. 保存按钮 (#acu-btn-save-global)
    bindLongPress(
      'acu-btn-save-global',
      () => {
        // 短按逻辑
        saveDataToDatabase(null, false, true);
      },
      () => {
        // 长按逻辑
        const $target = $p.find('#acu-btn-save-specific');
        if ($target.is(':visible')) {
          $target.fadeOut(200);
        } else {
          // 注意：必须用 flex 以保持对齐，fadeIn 默认是 block
          $target.fadeIn(200).css('display', 'flex');
        }
      },
    );
    // 1.5 补另存
    // [修复版] 另存为按钮 (兼容移动端触摸)
    // ============================================================
    // 同时监听 click 和 touchend，确保手机能点动
    $p.off('click touchend', '#acu-btn-save-specific').on('click touchend', '#acu-btn-save-specific', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if ($(this).data('is-busy')) return;
      $(this).data('is-busy', true);
      setTimeout(() => $(this).data('is-busy', false), 500);
      showInputFloorDialog(parentDoc);
    });
    // 2. 设置按钮 (#acu-btn-settings)
    //    长按: 显示/隐藏 "原生编辑器入口" (#acu-btn-open-native)
    bindLongPress(
      'acu-btn-settings',
      () => {
        // 短按逻辑
        if (isEditingOrder) toggleOrderEditMode();
        else showSettingsModal(parentDoc);
      },
      () => {
        // 长按逻辑
        const $target = $p.find('#acu-btn-open-native');
        if ($target.is(':visible')) {
          $target.fadeOut(200);
        } else {
          $target.fadeIn(200).css('display', 'flex');
          if (window.toastr) window.toastr.info('原生编辑器入口已显示');
        }
      },
    );
    // ============================================================
    // === 辅助函数：原地编辑
    const activateInlineEdit = function (cell) {
      const $cell = $(cell);
      // Prevent double triggering
      if ($cell.find('textarea.acu-inline-input').length > 0) return;

      // 1. Get Data & Dimensions
      const originalVal = decodeURIComponent($cell.data('val'));
      const currentHeight = $cell.height();
      const currentWidth = $cell.width();

      // === CRITICAL FIX STEP A: Backup Original Structure ===
      // Check if a Label exists (Grid/List/Full mode), save its HTML and Class
      const $label = $cell.find('.acu-grid-label, .acu-full-label, .acu-card-label');
      const hasLabel = $label.length > 0;
      const labelHtml = hasLabel ? $label.html() : '';
      const labelClass = hasLabel ? $label.attr('class') : '';

      // Determine Value Layer Class based on parent type
      let valueClass = '';
      if ($cell.hasClass('acu-grid-item')) valueClass = 'acu-grid-value';
      else if ($cell.hasClass('acu-full-item')) valueClass = 'acu-full-value';
      else if ($cell.hasClass('acu-card-row')) valueClass = 'acu-card-value'; // List mode
      // ======================================================

      // 2. Lock Card
      const $card = $cell.closest('.acu-data-card');
      $card.addClass('acu-editing-lock');

      // 3. Build Input HTML
      const inputHtml = `<textarea class="acu-inline-input" style="height:${currentHeight}px; min-height:${currentHeight}px; width:${currentWidth}px; user-select: text !important; -webkit-user-select: text !important; touch-action: pan-y !important;"></textarea>`;
      $cell.html(inputHtml);
      const $input = $cell.find('textarea');

      // 4. Set Value & Focus
      $input.val(originalVal);
      $input.focus();

      // 5. Auto Resize Logic
      const autoResize = () => {
        $input.css('height', 'auto');
        $input.css('height', $input[0].scrollHeight + 'px');
      };

      requestAnimationFrame(() => {
        $input.css('min-height', '24px');
        autoResize();
      });

      $input.on('input', autoResize);

      // 8. Prepare Data Object
      const cellData = {
        tableKey: $cell.data('key'),
        tableName: $cell.data('tname'),
        rowIdx: parseInt($cell.data('row')),
        colIdx: parseInt($cell.data('col')),
        cellId: `${$cell.data('tname')}-${$cell.data('row')}-${$cell.data('col')}`,
        $cell: $cell,
      };

      // 9. Commit Logic (CRITICAL FIX)
      const commitChange = () => {
        const newVal = $input.val();
        $card.removeClass('acu-editing-lock');

        // Prepare HTML to display (Handle Badges)
        const badgeStyle = getBadgeStyle(newVal);
        let displayHtml = badgeStyle ? `<span class="acu-badge ${badgeStyle}">${newVal}</span>` : newVal;
        // If it's a title, just plain text
        if ($cell.hasClass('acu-editable-title')) displayHtml = newVal;

        // === CRITICAL FIX STEP B: Rebuild DOM Structure ===
        let rebuiltHtml = '';

        if (hasLabel && valueClass) {
          // If it had structure, manually put it back together
          rebuiltHtml = `<div class="${labelClass}">${labelHtml}</div><div class="${valueClass}">${displayHtml}</div>`;
        } else {
          // Title or simple cell
          rebuiltHtml = displayHtml;
        }

        // Inject the rebuilt HTML back into cell (Removes textarea)
        $cell.html(rebuiltHtml);
        // ==================================================

        // Handle Data Save
        if (newVal !== originalVal) {
          // If changed:
          // 1. Call Core Save Logic (Updates memory data, marks diff)
          CoreActions.editCell(cellData, newVal, parentDoc);

          // 2. Manually apply highlight class to the inner element we just rebuilt
          if (valueClass) $cell.find('.' + valueClass).addClass('acu-highlight-changed');
          else $cell.addClass('acu-highlight-changed');
        }
      };

      // 10. Bind Events
      $input.on('blur', commitChange);

      $input.on('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          $input.blur();
        }
      });

      $input.on('click touchstart touchmove touchend', e => e.stopPropagation());
    };
    //防误触
    const stopSelectors =
      '.acu-data-display, .acu-nav-container, .acu-wrapper, .acu-edit-overlay, .acu-quick-view-overlay';

    $p.off('wheel touchstart touchmove touchend click', stopSelectors).on(
      'wheel touchstart touchmove touchend click',
      stopSelectors,
      function (e) {
        e.stopPropagation();
      },
    );
    // 高度调节
    $p.off('pointerdown', '.acu-height-drag-handle').on('pointerdown', '.acu-height-drag-handle', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const handle = this;
      const $panel = $p.find('#acu-data-area');
      const startHeight = $panel.height();
      const startY = e.clientY;
      const tableName = $(handle).data('table');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {}
      $(handle).addClass('active');
      let hasDragged = false;
      handle.onpointermove = function (moveE) {
        moveE.preventDefault();
        moveE.stopPropagation();
        const dy = moveE.clientY - startY;
        if (Math.abs(dy) > 2) hasDragged = true;
        let newHeight = startHeight - dy;
        if (newHeight < 200) newHeight = 200;
        if (newHeight > 1500) newHeight = 1500;
        $panel.css('height', newHeight + 'px');
      };
      handle.onpointerup = function (upE) {
        upE.preventDefault();
        upE.stopPropagation();
        $(handle).removeClass('active');
        try {
          handle.releasePointerCapture(upE.pointerId);
        } catch (err) {}
        handle.onpointermove = null;
        handle.onpointerup = null;
        if (tableName) {
          const currentHeight = parseInt($panel.css('height'));
          const heights = getTableHeights();
          heights[tableName] = currentHeight;
          saveTableHeights(heights);
        }
        if (hasDragged) {
          const blockClick = c => {
            c.stopPropagation();
            c.preventDefault();
            handle.removeEventListener('click', blockClick, true);
          };
          handle.addEventListener('click', blockClick, true);
        }
      };
    });
    $p.off('click', '.acu-height-drag-handle').on('click', '.acu-height-drag-handle', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    // [新增] 双击重置高度
    $p.off('dblclick', '.acu-height-drag-handle').on('dblclick', '.acu-height-drag-handle', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const tableName = $(this).data('table');
      const heights = getTableHeights();

      if (tableName) {
        // 1. 删除记忆的高度
        if (heights[tableName]) {
          delete heights[tableName];
          saveTableHeights(heights);
        }

        // 2. 强制执行自适应
        autoFitPanelHeight(true);

        if (window.toastr) window.toastr.success('高度已重置为自适应');
      }
    });
    // 单击防冒泡 (保持不变)
    $p.off('click', '.acu-height-drag-handle').on('click', '.acu-height-drag-handle', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    // 全局关闭
    $p.off('click.acu_autoclose').on('click.acu_autoclose', function (e) {
      if (isPinned) return;
      if (!$p.find('#acu-data-area').hasClass('visible')) return;
      const $target = $(e.target);
      const isClickInside =
        $target.closest('.acu-nav-container').length ||
        $target.closest('.acu-data-display').length ||
        $target.closest('#acu-floating-ball').length ||
        $target.closest('.acu-cell-menu').length ||
        $target.closest('.acu-edit-overlay').length ||
        $target.closest('.acu-quick-view-overlay').length ||
        $target.closest('#acu-btn-save-global').length ||
        $target.closest('.acu-menu-backdrop').length ||
        $target.closest('.acu-height-drag-handle').length;
      if (!isClickInside) {
        closePanel();
      }
    });

    // Pin & Nav & Buttons
    $p.off('click', '#acu-btn-pin').on('click', '#acu-btn-pin', function (e) {
      e.preventDefault();
      e.stopPropagation();

      isPinned = !isPinned;
      localStorage.setItem(STORAGE_KEY_PIN, isPinned);

      const $btn = $(this);
      if (isPinned) {
        $btn.css({
          color: 'var(--acu-highlight)',
          'border-color': 'var(--acu-highlight)',
          background: 'var(--acu-btn-hover)',
        });
      } else {
        $btn.css({
          color: '',
          'border-color': '',
          background: '',
        });
      }

      if (window.toastr) window.toastr.info(isPinned ? '面板已固定' : '固定已取消');
    });
    $p.off('click', '.acu-nav-btn').on('click', '.acu-nav-btn', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isEditingOrder) return;
      const tableName = $(this).data('table');
      if ($(this).hasClass('active')) return;
      switchTabFloating(tableName, $p, tables);
    });
    $p.off('click', '#acu-btn-toggle').on('click', '#acu-btn-toggle', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleUI();
    });
    $p.off('click', '#acu-btn-cancel-mode').on('click', '#acu-btn-cancel-mode', e => {
      e.preventDefault();
      isEditingOrder = false;
      renderInterface();
    });
    // 调用 API 的手动更新方法
    $p.off('click', '#acu-btn-manual-update').on('click', '#acu-btn-manual-update', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const api = getCore().getDB();

      if (api && api.manualUpdate) {
        api.manualUpdate();
      } else if (window.toastr) {
        window.toastr.error('无法调用手动更新 API');
      }
    });
    //原生编辑器
    $p.off('click', '#acu-btn-open-native').on('click', '#acu-btn-open-native', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const api = getCore().getDB();
      if (api && api.openVisualizer) api.openVisualizer();
      else if (window.toastr) window.toastr.error('无法调用原生编辑器 API');
    });
    //刷新
    $p.off('click', '#acu-btn-refresh').on('click', '#acu-btn-refresh', function (e) {
      e.preventDefault();
      const $btn = $(this);
      const $icon = $btn.find('i');
      $icon.addClass('fa-spin'); // 加个旋转动画
      // 【核心修改】刷新时重置快照基准
      // 1. 获取数据库当前最新数据
      const latestData = typeof getTableData === 'function' ? getTableData() : null;

      if (latestData) {
        // 2. 将当前最新数据存为快照
        // 这意味着：承认当前状态为“基准”，之前的变动不再视为变动
        saveSnapshot(latestData);

        // 3. 清理所有暂存状态 (相当于放弃了未保存的手动修改，回归数据库状态)
        globalStagedData = null;
        currentDiffMap.clear(); // 清除高亮记录
        pendingDeletes.clear(); // 清除待删除标记

        // 4. 更新保存按钮状态 (去掉红色感叹号)
        updateSaveBtnState();

        if (window.toastr) window.toastr.success('已刷新快照，高亮已重置');
      }
      // 5. 稍微延迟后重绘界面
      setTimeout(() => {
        renderInterface();
      }, 600);
    });
    // [修改版] 清洗按钮事件 (支持快捷删除)
    $p.off('click', '#acu-btn-purge').on('click', '#acu-btn-purge', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      const config = getConfig();
      // 默认为 true (开启弹窗)，只有显式设置为 false 才跳过
      const needConfirm = config.purgeConfirmation !== false;

      let ST = window.SillyTavern || (window.parent ? window.parent.SillyTavern : null);
      if (!ST && window.top && window.top.SillyTavern) ST = window.top.SillyTavern;

      let targetIdx = -1;
      let lastIdx = 0;

      if (ST && ST.chat) {
        lastIdx = Math.max(0, ST.chat.length - 1);
        // 策略 1: 优先寻找最近的有数据痕迹的楼层
        for (let i = ST.chat.length - 1; i >= 0; i--) {
          const msg = ST.chat[i];
          if (!msg.is_user && msg.TavernDB_ACU_IsolatedData) {
            targetIdx = i;
            break;
          }
        }
      }

      if (!needConfirm) {
        // === 快捷模式：直接删除 ===
        if (targetIdx !== -1) {
          // 有明确目标，删之
          await purgeFloorRange(targetIdx, targetIdx);
        } else {
          // 没找到有数据的楼层，提示一下
          if (window.toastr) window.toastr.info('未找到含有ACU数据的历史楼层');
        }
      } else {
        // === 确认模式：弹窗选择 ===
        // 默认范围逻辑保持不变
        const defaultStart = targetIdx !== -1 ? targetIdx : lastIdx;
        const defaultEnd = targetIdx !== -1 ? targetIdx : lastIdx;
        showPurgeRangeDialog(parentDoc, defaultStart, defaultEnd);
      }
    });
    // 数据区杂项
    $p.off('click', '.acu-close-btn').on('click', '.acu-close-btn', function (e) {
      e.stopPropagation();
      saveActiveTabState(null);
      pendingDeletes.clear();
      updateSaveBtnState();
      renderInterface();
    });
    $p.off('input', '.acu-search-input').on('input', '.acu-search-input', function () {
      currentSearchTerm = $(this).val().toLowerCase();
      currentPage = 1;
      globalScrollTop = 0;
      refreshFloatingTable($p, tables);
    });
    $p.off('click', '#acu-btn-switch-style').on('click', '#acu-btn-switch-style', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const tableName = $(this).data('table');
      const styles = getTableStyles();
      const currentMode = styles[tableName] || 'list';
      styles[tableName] = currentMode === 'grid' ? 'list' : 'grid';
      saveTableStyles(styles);
      refreshFloatingTable($p, tables);
      autoFitPanelHeight(true);
      if (window.toastr) window.toastr.info(`已切换为: ${styles[tableName] === 'grid' ? '双列视图' : '单列视图'}`);
    });
    $p.off('click', '.acu-dash-interactive').on('click', '.acu-dash-interactive', function (e) {
      e.stopPropagation();
      const tableName = $(this).data('tname');
      const rowIdx = $(this).data('row');
      if (tableName && tables[tableName]) {
        showQuickView(tables[tableName].rows[rowIdx], tables[tableName].headers, tableName, parentDoc);
      }
    });
    $p.off('click', '.acu-tab-btn').on('click', '.acu-tab-btn', function (e) {
      e.stopPropagation();
      const target = $(this).data('target');
      $p.find('.acu-tab-btn').removeClass('active');
      $(this).addClass('active');
      $p.find('.acu-tab-pane').removeClass('active');
      $p.find(`#${target}`).addClass('active');
    });
    // [修改] 监听整个选项行的点击
    $p.off('click', '.acu-option-row').on('click', '.acu-option-row', function (e) {
      e.preventDefault();
      e.stopPropagation();

      // 添加一点点击反馈动画（可选，增加手感）
      const $el = $(this);
      $el.css('transform', 'scale(0.98)');
      setTimeout(() => $el.css('transform', 'scale(1)'), 100);

      const val = decodeURIComponent($el.data('val'));
      if (val) {
        CoreActions.setInput(val);
      }
    });
    // === 分页器交互 (新版) ===
    $p.off('click', '.acu-page-btn').on('click', '.acu-page-btn', function (e) {
      e.stopPropagation();
      if ($(this).hasClass('disabled') || $(this).hasClass('active')) return;

      const action = $(this).data('action');
      const targetPage = $(this).data('page');

      // 计算新页码
      let newPage = currentPage;
      if (action === 'prev') newPage--;
      else if (action === 'next') newPage++;
      else if (action === 'goto') newPage = parseInt(targetPage);

      // 执行跳转
      if (newPage !== currentPage) {
        currentPage = newPage;
        globalScrollTop = 0; // 回到顶部
        refreshFloatingTable($p, tables);
      }
    });
    // =========================================================
    // === 2. 核心交互分流 (逻辑修正：Layout -> Gesture) ===
    // =========================================================

    // 清理旧绑定
    $p.off('click dblclick contextmenu', '.acu-cell');
    $p.off('touchstart touchmove touchend', '.acu-data-card');

    if (isMobile) {
      // --- 移动端逻辑 (终极版：状态锁 + Flex布局) ---

      // === 1. 核心状态变量 ===
      let touchStartX = 0;
      let touchStartY = 0;
      let isTouching = false;
      let activeCard = null;
      let isShortCard = false;

      // 长按判定
      let longPressTimer = null;
      let isSelectionMode = false;

      // 【关键】：交互锁 (shouldBlockClick)
      // 这是一个持久锁，不会自动过期，只有在下一次 touchstart 时才会重置。
      let shouldBlockClick = false;

      // === 2. 单击事件 (Click) ===
      $p.on('click', '.acu-cell', function (e) {
        // 1. 检查持久锁
        if (shouldBlockClick) return;

        // 2. 双重保险：检查当前屏幕是否有原生选区
        // (有时候 touchend 检测完了，浏览器才渲染出蓝框，所以这里再防一手)
        if (window.getSelection().toString().length > 0) return;

        e.stopPropagation();
        activateInlineEdit(this);
      });

      // === 3. 触摸开始 (TouchStart) ===
      $p.on('touchstart', '.acu-data-card', function (e) {
        if ($(this).hasClass('acu-editing-lock')) return;

        // 【重置一切】：新的一次触摸开始了，把之前的状态清空
        shouldBlockClick = false;
        isSelectionMode = false;
        clearTimeout(longPressTimer);

        // 如果开始触摸时，屏幕上已经有蓝框选区了，说明用户可能要调整光标
        // 此时直接预判要锁死点击
        if (window.getSelection().toString().length > 0) {
          shouldBlockClick = true;
        }

        const touch = e.originalEvent.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        activeCard = $(this);
        isTouching = true;

        // 开启长按计时 (400ms)
        longPressTimer = setTimeout(() => {
          isSelectionMode = true;
          // 长按触发瞬间，就把锁加上
          shouldBlockClick = true;
        }, 400);

        // 短卡片判断 (用于下拉逻辑)
        const config = getConfig();
        const isHorizontalView = config.layout === 'horizontal';
        // if (this.scrollHeight <= this.clientHeight + 2 && isHorizontalView) {
        //   isShortCard = true;
        //   $(this).addClass('acu-locked-card');
        // } else {
        //   isShortCard = false;
        // }
      });

      // === 4. 触摸移动 (TouchMove) ===
      $p.on('touchmove', '.acu-data-card', function (e) {
        if (!isTouching || !activeCard) return;

        const touch = e.originalEvent.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        // 移动超过 5px，取消长按判定
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          clearTimeout(longPressTimer);
        }

        // 【阻断】：如果已经判定要锁点击（比如选词中），或者有原生选区
        const nativeSelection = window.getSelection().toString();
        if (shouldBlockClick || isSelectionMode || (nativeSelection && nativeSelection.length > 0)) {
          shouldBlockClick = true; // 持续加锁
          return; // 放行浏览器原生行为，不执行下拉/侧滑手势
        }

        const config = getConfig();
        const isHorizontalView = config.layout === 'horizontal';

        // 阻止短卡片默认滚动 (防止带跑网页)
        if (isHorizontalView && isShortCard && Math.abs(deltaY) > Math.abs(deltaX)) {
          if (e.cancelable) e.preventDefault();
        }

        // === 下拉/上拉手势 (Flex布局版) ===
        if (isHorizontalView) {
          if (Math.abs(deltaY) > Math.abs(deltaX)) {
            const scrollTop = activeCard.scrollTop();
            const scrollHeight = activeCard[0].scrollHeight;
            const clientHeight = activeCard[0].clientHeight;

            const isPullDown = deltaY > 0 && (scrollTop <= 0 || isShortCard);
            const isPullUp = deltaY < 0 && scrollTop + clientHeight >= scrollHeight - 1;

            if (isPullDown || isPullUp) {
              if (e.cancelable) e.preventDefault();
              e.stopPropagation();

              let $topIndicator = activeCard.find('.acu-pull-top');
              let $bottomIndicator = activeCard.find('.acu-pull-bottom');

              if (isPullDown) {
                if ($topIndicator.length === 0) {
                  $topIndicator = $(
                    `<div class="acu-pull-overlay acu-pull-top"><div class="acu-pull-icon"><i class="fa-solid fa-plus"></i><span class="acu-pull-text">新增一行</span></div></div>`,
                  );
                  // 修正：用 prepend 插入到流的最前面
                  activeCard.prepend($topIndicator);
                }
                const height = Math.min(deltaY * 0.6, 120);
                $topIndicator.css({ height: height + 'px', opacity: Math.min(height / 80, 1) });
              } else if (isPullUp) {
                if ($bottomIndicator.length === 0) {
                  // 生成底部提示
                  let tableName = activeCard.data('table') || activeCard.find('.acu-cell').first().data('tname');
                  const $firstCell = activeCard.find('.acu-cell').first();
                  const rIdx = parseInt($firstCell.data('row') || 0);
                  const isPending = pendingDeletes.has(`${tableName}-row-${rIdx}`);
                  const icon = isPending ? 'fa-undo' : 'fa-trash';
                  const text = isPending ? '撤销删除' : '删除本行';
                  const colorClass = isPending ? 'acu-pull-restore' : '';

                  $bottomIndicator = $(
                    `<div class="acu-pull-overlay acu-pull-bottom ${colorClass}"><div class="acu-pull-icon"><i class="fa-solid ${icon}"></i><span class="acu-pull-text">${text}</span></div></div>`,
                  );
                  // 修正：用 append 插入到流的最后面
                  activeCard.append($bottomIndicator);
                }
                const height = Math.min(Math.abs(deltaY) * 0.6, 120);
                $bottomIndicator.css({ height: height + 'px', opacity: Math.min(height / 80, 1) });
                // 强制滚动到底部，保证能看到append进去的东西
                activeCard.scrollTop(activeCard[0].scrollHeight);
              }
            }
          }
        } else {
          // === 左右侧滑手势 (保持原样) ===
          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();

            let $leftIndicator = activeCard.find('.acu-swipe-left');
            let $rightIndicator = activeCard.find('.acu-swipe-right');

            if (deltaX > 0) {
              // 右滑 -> 删除
              if ($leftIndicator.length === 0) {
                let tableName = activeCard.data('table') || activeCard.find('.acu-cell').first().data('tname');
                const $firstCell = activeCard.find('.acu-cell').first();
                const rIdx = parseInt($firstCell.data('row') || 0);
                const isPending = pendingDeletes.has(`${tableName}-row-${rIdx}`);
                const icon = isPending ? 'fa-undo' : 'fa-trash';
                const extraClass = isPending ? 'acu-swipe-restore' : '';

                $leftIndicator = $(
                  `<div class="acu-swipe-overlay acu-swipe-left ${extraClass}"><i class="fa-solid ${icon}"></i></div>`,
                );
                activeCard.append($leftIndicator);
              }
              const width = Math.min(deltaX * 0.7, 120);
              $leftIndicator.css({ width: width + 'px', opacity: Math.min(width / 60, 1) });
            } else {
              // 左滑 -> 新增
              if ($rightIndicator.length === 0) {
                $rightIndicator = $(
                  `<div class="acu-swipe-overlay acu-swipe-right"><i class="fa-solid fa-plus"></i></div>`,
                );
                activeCard.append($rightIndicator);
              }
              const width = Math.min(Math.abs(deltaX) * 0.7, 120);
              $rightIndicator.css({ width: width + 'px', opacity: Math.min(width / 60, 1) });
            }
          }
        }
      });

      // === 5. 触摸结束 (TouchEnd) ===
      $p.on('touchend', '.acu-data-card', function (e) {
        clearTimeout(longPressTimer);

        // 【核心判断】：手指离开的瞬间，再次确认一下是否选了字
        // 如果有字被选中，或者刚才处于选词模式，就“永久”锁住点击
        // 这个锁直到下一次 touchstart 才会解开
        if (isSelectionMode || window.getSelection().toString().length > 0) {
          shouldBlockClick = true;
          isTouching = false;
          activeCard = null;
          return;
        }

        // 如果已经锁了，就直接退出
        if (shouldBlockClick) {
          isTouching = false;
          return;
        }

        if (!isTouching) return;
        isTouching = false;

        const $card = $(this);
        const config = getConfig();
        const isHorizontalView = config.layout === 'horizontal';

        let tableName = $card.data('table');
        if (!tableName) tableName = $card.find('.acu-cell').first().data('tname');
        if (!tableName) return;

        const $firstCell = $card.find('.acu-cell').first();
        const tableKey = $firstCell.data('key');
        const rowIdx = parseInt($firstCell.data('row') || 0);

        if (isHorizontalView) {
          // Pull 结算
          const $top = $card.find('.acu-pull-top');
          const $bottom = $card.find('.acu-pull-bottom');
          const topH = $top.height() || 0;
          const botH = $bottom.height() || 0;

          if (topH > 50) {
            if (tableKey) CoreActions.insertRow(tableKey, rowIdx, parentDoc);
          }
          if (botH > 50) {
            const deleteKey = `${tableName}-row-${rowIdx}`;
            CoreActions.toggleDelete(deleteKey, $card);
          }
          // 动画收起并移除
          $top.animate({ height: 0 }, 150, function () {
            $(this).remove();
          });
          $bottom.animate({ height: 0 }, 150, function () {
            $(this).remove();
          });
        } else {
          // Swipe 结算
          const $left = $card.find('.acu-swipe-left');
          const $right = $card.find('.acu-swipe-right');
          const leftW = $left.width() || 0;
          const rightW = $right.width() || 0;

          if (leftW > 40) {
            const deleteKey = `${tableName}-row-${rowIdx}`;
            CoreActions.toggleDelete(deleteKey, $card);
          }
          if (rightW > 40) {
            if (tableKey) CoreActions.insertRow(tableKey, rowIdx, parentDoc);
          }
          $left.animate({ width: 0 }, 150, function () {
            $(this).remove();
          });
          $right.animate({ width: 0 }, 150, function () {
            $(this).remove();
          });
        }
        activeCard = null;
      });
    } else {
      // --- PC 端逻辑 (修复版：支持划词复制) ---

      $p.on('click', '.acu-cell', function (e) {
        e.stopPropagation();

        // === 关键判断：是否有文字被选中？ ===
        const selection = window.parent.getSelection().toString();

        // 如果用户选了文字（长度大于0），说明是想复制，直接返回，不触发编辑
        if (selection && selection.length > 0) {
          return;
        }

        // 只有在没选文字的情况下，才进入编辑模式
        activateInlineEdit(this);
      });

      // 双击依然强制进入编辑 (给用户一个备选方案)
      $p.on('dblclick', '.acu-cell', function (e) {
        e.stopPropagation();
        // 清除可能存在的选中状态，直接进编辑
        window.parent.getSelection().removeAllRanges();
        activateInlineEdit(this);
      });

      // 右键菜单
      $p.on('contextmenu', '.acu-cell', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showCellMenu(e, this, parentDoc);
      });
    }
  };
  // [修改] bindWindowEvents: 智能拖拽版 (完美兼容移动端拖拽与PC端点击，支持锁定)
  const bindWindowEvents = () => {
    const { $ } = getCore();
    const parentDoc = window.parent.document;
    const $p = $(parentDoc);
    const $wrapper = $p.find('.acu-wrapper');
    const config = getConfig(); // 获取最新配置

    if (!$wrapper.length) return;

    const $nav = $p.find('.acu-nav-container');

    // === 关键修正：根据锁定状态，强制重置 CSS 属性 ===
    if (config.lockPanel) {
      // 锁定状态：恢复默认光标，允许触摸默认行为(防止页面滑不动)
      $nav.css({
        'touch-action': 'auto',
        cursor: 'default',
      });
    } else {
      // 解锁状态：设置拖动光标，禁止触摸滚动(防止拖动面板时导致页面滚动)
      $nav.css({
        'touch-action': 'none',
        cursor: 'move',
      });
    }

    // --- 1. 全域拖拽逻辑 ---
    const navEl = $nav[0];

    if (navEl) {
      navEl.onpointerdown = null; // 清理旧事件
      navEl.onpointerdown = function (e) {
        // 【核心判断】如果已锁定，直接终止，不执行任何拖拽计算
        if (config.lockPanel) return;

        // 1. 仅排除 调整把手、滑块、输入框
        if ($(e.target).closest('.acu-resize-handle, .acu-slider, input').length) return;

        if (e.button !== 0) return; // 只响应左键/单指

        // 记录初始状态
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = $wrapper[0].getBoundingClientRect();
        const startLeft = rect.left;
        const winH = $(window.parent).height();
        const startBottom = winH - rect.bottom;

        let isDragging = false;
        let hasCaptured = false; // 标记是否已经开启了捕获

        navEl.onpointermove = function (moveE) {
          const dx = moveE.clientX - startX;
          const dy = moveE.clientY - startY;

          // 2. 阈值检测：只有移动超过 5px 才开始算作拖动
          if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            isDragging = true;

            // 触发拖动后，立即捕获指针
            if (!hasCaptured) {
              try {
                navEl.setPointerCapture(e.pointerId);
                hasCaptured = true;
              } catch (err) {}
              // 拖动开始，给body加样式
              $('body').addClass('acu-dragging');
              $wrapper.css('transform', 'none'); // 取消居中，转为绝对定位
            }
          }

          if (isDragging) {
            moveE.preventDefault();

            let newLeft = startLeft + dx;
            let newBottom = startBottom - dy;

            // 边界限制
            const maxLeft = $(window.parent).width() - 50;
            const maxBottom = winH - 50;
            if (newLeft < -200) newLeft = -200;
            if (newLeft > maxLeft) newLeft = maxLeft;
            if (newBottom < 0) newBottom = 0;
            if (newBottom > maxBottom) newBottom = maxBottom;

            $wrapper.css({
              '--acu-win-left': newLeft + 'px',
              '--acu-win-bottom': newBottom + 'px',
            });
          }
        };

        navEl.onpointerup = function (upE) {
          navEl.onpointermove = null;
          navEl.onpointerup = null;
          $('body').removeClass('acu-dragging');

          if (hasCaptured) {
            try {
              navEl.releasePointerCapture(upE.pointerId);
            } catch (err) {}
          }

          if (isDragging) {
            // A. 如果发生了拖动：保存位置，并【拦截点击】
            const currentStyle = getComputedStyle($wrapper[0]);
            const cfg = {
              width: parseFloat(currentStyle.getPropertyValue('--acu-win-width')) || 600,
              left: parseFloat(currentStyle.getPropertyValue('--acu-win-left')) || 0,
              bottom: parseFloat(currentStyle.getPropertyValue('--acu-win-bottom')) || 20,
              isCentered: false,
            };
            localStorage.setItem('acu_win_config', JSON.stringify(cfg));

            // 核心：在捕获阶段拦截 click 事件，防止触发按钮功能
            const preventClick = clickE => {
              clickE.stopPropagation();
              clickE.preventDefault();
              navEl.removeEventListener('click', preventClick, true);
            };
            navEl.addEventListener('click', preventClick, true);
          }
        };
      };
    }

    // --- 2. 宽度调节 (保持不变) ---
    const handleEl = $p.find('.acu-resize-handle')[0];
    if (handleEl) {
      handleEl.onpointerdown = null;
      handleEl.onpointerdown = function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handleEl.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const rect = $wrapper[0].getBoundingClientRect();
        const startWidth = rect.width;
        handleEl.onpointermove = function (moveE) {
          const dx = moveE.clientX - startX;
          let newWidth = startWidth + dx;
          if (newWidth < 300) newWidth = 300;
          if (newWidth > $(window.parent).width() - 10) newWidth = $(window.parent).width() - 10;
          $wrapper.css('--acu-win-width', newWidth + 'px');
        };
        handleEl.onpointerup = function (upE) {
          handleEl.releasePointerCapture(upE.pointerId);
          handleEl.onpointermove = null;
          handleEl.onpointerup = null;
          const currentStyle = getComputedStyle($wrapper[0]);
          let currentLeft = parseFloat(currentStyle.getPropertyValue('--acu-win-left')) || 0;
          const cfg = {
            width: parseFloat(currentStyle.getPropertyValue('--acu-win-width')),
            left: currentLeft,
            bottom: parseFloat(currentStyle.getPropertyValue('--acu-win-bottom')),
            isCentered: $wrapper.css('transform').includes('-50'),
          };
          localStorage.setItem('acu_win_config', JSON.stringify(cfg));
          if (typeof autoFitPanelHeight === 'function') autoFitPanelHeight();
        };
      };
    }
  };
  // [新增 悬浮模式的 Tab 切换辅助函数]
// [新增 悬浮模式的 Tab 切换辅助函数]
  const switchTabFloating = (tableName, $p, tables) => {
    currentPage = 1;
    currentSearchTerm = '';
    globalScrollTop = 0;

    // 获取显示区域和当前配置
    const $dataArea = $p.find('#acu-data-area');
    const config = getConfig();

    // 【核心修复】：先重置 Class，再根据目标 Tab 决定是否强制 vertical
    $dataArea.removeClass('acu-layout-vertical acu-layout-horizontal');

    if (tableName === TAB_OPTIONS || tableName === TAB_DASHBOARD) {
        // 如果是 选项面板 或 仪表盘，强制使用 Vertical 布局（允许竖向滚动，禁用横向特性）
        $dataArea.addClass('acu-layout-vertical');
    } else {
        // 其他普通表格，恢复用户设置的布局（Vertical 或 Horizontal）
        $dataArea.addClass(`acu-layout-${config.layout}`);
    }

    if (tableName === TAB_DASHBOARD) {
      $p.find('#acu-data-area').html(renderDashboard(tables)).addClass('visible');
      const h = getTableHeights()[TAB_DASHBOARD] || 600;
      $p.find('#acu-data-area').css({ height: h + 'px' });
    } else if (tableName === TAB_OPTIONS) {
      $p.find('#acu-data-area').html(renderOptionsPanel(tables)).addClass('visible');
      const h = getTableHeights()[TAB_OPTIONS] || getTableHeights()[TAB_DASHBOARD] || 600;
      $p.find('#acu-data-area').css({ height: h + 'px' });
    } else if (tables[tableName]) {
      $p.find('#acu-data-area').html(renderTableContent(tables[tableName], tableName)).addClass('visible');
      const h = getTableHeights()[tableName] || 500;
      $p.find('#acu-data-area').css({ height: h + 'px' });
    }
    $p.find('.acu-nav-btn').removeClass('active');
    $p.find(`.acu-nav-btn[data-table="${tableName}"]`).addClass('active');
    saveActiveTabState(tableName);
    autoFitPanelHeight();
  };
  // [修复版] 悬浮模式刷新函数
  const refreshFloatingTable = ($p, tables) => {
    const tableName = $p.find('.acu-nav-btn.active').data('table');
    if (tableName && tables[tableName]) {
      // 1. 生成完整的新 HTML (包含 Header, Content, Footer)
      const fullHtml = renderTableContent(tables[tableName], tableName);
      const $temp = $('<div>').html(fullHtml); // 创建虚拟 DOM

      // 2. 替换中间的内容区 (Content)
      $p.find('.acu-panel-content').html($temp.find('.acu-panel-content').html());

      // 3. 更新标题 (因为页码变了，标题里的计数可能也要变)
      $p.find('.acu-panel-title').html($temp.find('.acu-panel-title').html());

      // 4. 【核心修复】更新底部分页器 (Footer)
      const $oldPager = $p.find('.acu-pagination-container');
      const $newPager = $temp.find('.acu-pagination-container');

      if ($newPager.length) {
        if ($oldPager.length) {
          $oldPager.replaceWith($newPager); // 如果原来有，就替换
        } else {
          $p.find('#acu-data-area').append($newPager); // 如果原来没有，就追加
        }
      } else {
        $oldPager.remove(); // 如果新页面不需要分页(比如搜没了)，就移除旧的
      }

      // 5. 重新计算高度
      autoFitPanelHeight();
    }
  };

  const showQuickView = (row, headers, tableName, context) => {
    const { $ } = getCore();
    const config = getConfig();
    const doc = context || document;
    const $ctx = $(doc);

    $ctx.find('.acu-quick-view-overlay').remove();

    let gridHtml = '';
    let fullHtml = '';
    row.forEach((cell, cIdx) => {
      if (cIdx > 0) {
        const headerName = headers[cIdx] || `属性${cIdx + 1}`;
        const badgeStyle = getBadgeStyle(cell);
        const cellStr = String(cell);
        const contentHtml = badgeStyle ? `<span class="acu-badge ${badgeStyle}">${cell}</span>` : cell;

        if (cellStr.length > 50) {
          fullHtml += `<div class="acu-cell acu-full-item" style="cursor:default"><div class="acu-full-label">${headerName}</div><div class="acu-full-value">${cell}</div></div>`;
        } else {
          gridHtml += `<div class="acu-cell acu-grid-item" style="cursor:default"><div class="acu-grid-label">${headerName}</div><div class="acu-grid-value">${contentHtml}</div></div>`;
        }
      }
    });

    const html = $(`
            <div class="acu-quick-view-overlay">
                <div class="acu-quick-view-card acu-theme-${config.theme}">
                     <div class="acu-quick-view-header">
                        <span><i class="fa-solid ${getIconForTableName(tableName)}"></i> ${row[1] || '详情'}</span>
                        <button class="acu-close-btn" id="qv-close"><i class="fa-solid fa-times"></i></button>
                     </div>
                     <div class="acu-quick-view-body">
                          ${gridHtml ? `<div class="acu-card-main-grid">${gridHtml}</div>` : ''}
                          ${fullHtml ? `<div class="acu-card-full-area">${fullHtml}</div>` : ''}
                     </div>
                </div>
            </div>
        `);

    // 挂载
    $(doc.body).append(html);

    const close = () => html.remove();
    html.find('#qv-close').click(close);
    html.click(e => {
      if ($(e.target).hasClass('acu-quick-view-overlay')) close();
    });
  };

  const toggleOrderEditMode = () => {
    if (isEditingOrder) {
      const { $ } = getCore();
      const newOrder = [];
      $(getUiContext())
        .find('.acu-nav-btn')
        .each(function () {
          const t = $(this).data('table');
          if (t && t !== TAB_DASHBOARD) newOrder.push(t);
        });
      saveTableOrder(newOrder);
      isEditingOrder = false;
    } else {
      isEditingOrder = true;
    }
    renderInterface();
  };

  const initSortable = () => {
    const { $ } = getCore();
    const $btns = $(getUiContext()).find('.acu-nav-btn');
    $btns.attr('draggable', true);
    $btns.on('dragstart', function (e) {
      e.originalEvent.dataTransfer.setData('text/plain', $(this).index());
      $(this).css('opacity', '0.5');
    });
    $btns.on('dragend', function () {
      $(this).css('opacity', '1');
    });
    $btns.on('dragover', function (e) {
      e.preventDefault();
    });
    $btns.on('drop', function (e) {
      e.preventDefault();
      const fromIndex = parseInt(e.originalEvent.dataTransfer.getData('text/plain'));
      const toIndex = $(this).index();
      if (fromIndex !== toIndex) {
        const $container = $(getUiContext()).find('.acu-nav-tabs-area');
        const $allBtns = $container.children('.acu-nav-btn');
        const $src = $allBtns.eq(fromIndex - $allBtns.first().index());
        if (fromIndex < toIndex) $(this).after($src);
        else $(this).before($src);
      }
    });
  };

  const showCellMenu = (e, cell, context) => {
    const { $ } = getCore();
    const doc = context || document;
    const $body = $(doc.body);

    $(doc).find('.acu-cell-menu, .acu-menu-backdrop').remove();
    const backdrop = $('<div class="acu-menu-backdrop"></div>');
    $body.append(backdrop);

    const $cell = $(cell);
    const rowIdx = parseInt($cell.data('row'));
    const colIdx = parseInt($cell.data('col'));
    const tableKey = $cell.data('key');
    const tableName = $cell.data('tname');
    const content = decodeURIComponent($cell.data('val'));
    const config = getConfig();

    const deleteKey = `${tableName}-row-${rowIdx}`;
    const cellId = `${tableName}-${rowIdx}-${colIdx}`;

    const isModified = currentDiffMap.has(cellId);
    const isPending = pendingDeletes.has(deleteKey);

    const menu = $(`
        <div class="acu-cell-menu acu-theme-${config.theme}">
            <div class="acu-cell-menu-item" id="act-insert" style="color:#2980b9"><i class="fa-solid fa-plus"></i> 插入新行</div>
            <div class="acu-cell-menu-item" id="act-copy"><i class="fa-solid fa-copy"></i> 复制内容</div>
            ${isModified ? `<div class="acu-cell-menu-item" id="act-undo" style="color:#e67e22; border-top:1px solid var(--acu-border);"><i class="fa-solid fa-undo"></i> 撤销本次修改</div>` : ''}
            ${
              isPending
                ? `<div class="acu-cell-menu-item" id="act-toggle-del" style="color:#27ae60"><i class="fa-solid fa-undo"></i> 恢复整行</div>`
                : `<div class="acu-cell-menu-item" id="act-toggle-del" style="color:#e74c3c"><i class="fa-solid fa-trash"></i> 删除整行</div>`
            }
        </div>
    `);
    $body.append(menu);

    const win = doc.defaultView || window;
    const winWidth = $(win).width();
    const winHeight = $(win).height();
    const mWidth = menu.outerWidth() || 180;
    const mHeight = menu.outerHeight() || 200;

    let clientX = e.clientX;
    let clientY = e.clientY;
    if (!clientX && clientX !== 0 && e.originalEvent && e.originalEvent.touches && e.originalEvent.touches.length) {
      clientX = e.originalEvent.touches[0].clientX;
      clientY = e.originalEvent.touches[0].clientY;
    }
    if (clientX === undefined) clientX = winWidth / 2;
    if (clientY === undefined) clientY = winHeight / 2;

    let left = clientX + 5;
    let top = clientY + 5;
    if (left + mWidth > winWidth) left = clientX - mWidth - 5;
    if (top + mHeight > winHeight) top = clientY - mHeight - 5;
    menu.css({ top: top + 'px', left: left + 'px' });

    const closeAll = () => {
      menu.remove();
      backdrop.remove();
    };
    backdrop.on('click', closeAll);

    menu.find('#act-copy').click(evt => {
      evt.stopPropagation();
      CoreActions.copyContent(content);
      closeAll();
    });

    menu.find('#act-insert').click(() => {
      closeAll();
      CoreActions.insertRow(tableKey, rowIdx, context);
    });

    menu.find('#act-toggle-del').click(() => {
      const $card = $cell.closest('.acu-data-card');
      CoreActions.toggleDelete(deleteKey, $card);
      closeAll();
    });

    menu.find('#act-undo').click(() => {
      const snapshot = loadSnapshot();
      let originalValue = null;
      if (snapshot && snapshot[tableKey]?.content[rowIdx + 1]) {
        originalValue = snapshot[tableKey].content[rowIdx + 1][colIdx];
      }
      if (originalValue !== null) {
        $cell.attr('data-val', encodeURIComponent(originalValue));
        $cell.data('val', encodeURIComponent(originalValue));
        let $displayTarget = $cell;
        if ($cell.hasClass('acu-grid-item')) $displayTarget = $cell.find('.acu-grid-value');
        else if ($cell.hasClass('acu-full-item')) $displayTarget = $cell.find('.acu-full-value');
        const badgeStyle = getBadgeStyle(originalValue);
        if (badgeStyle && !$cell.hasClass('acu-editable-title')) {
          $displayTarget.html(`<span class="acu-badge ${badgeStyle}">${originalValue}</span>`);
        } else {
          $displayTarget.text(originalValue);
        }
        $displayTarget.removeClass('acu-highlight-changed');
        if ($cell.hasClass('acu-editable-title')) $cell.removeClass('acu-highlight-changed');
        currentDiffMap.delete(cellId);
        const rawData = getTableData();
        if (rawData && rawData[tableKey]?.content[rowIdx + 1]) {
          rawData[tableKey].content[rowIdx + 1][colIdx] = originalValue;
          saveDataToDatabase(rawData, true);
        }
        if (window.toastr) window.toastr.success('已撤销修改');
      } else {
        if (window.toastr) window.toastr.warning('无法找到原始数据，撤销失败');
      }
      closeAll();
    });
  };
  const updateCellUI = (tableName, rowIdx, colIdx, newVal, context) => {
    const { $ } = getCore();
    const $ctx = $(context || document);

    // 1. 查找目标单元格 (兼容 Grid 和 Full 布局)
    // 优先精确匹配 data 属性，这比层级查找更稳
    let $target = $ctx.find(`.acu-cell[data-tname="${tableName}"][data-row="${rowIdx}"][data-col="${colIdx}"]`);

    // 找不到可能是标题 (Editable Title)
    if (!$target.length) {
      $target = $ctx.find(`.acu-editable-title[data-tname="${tableName}"][data-row="${rowIdx}"][data-col="${colIdx}"]`);
    }

    if (!$target.length) return;

    // 2. 更新数据属性
    $target.attr('data-val', encodeURIComponent(newVal));
    $target.data('val', encodeURIComponent(newVal));

    // 3. 确定文字显示的容器
    let $displayText = $target;

    if ($target.hasClass('acu-grid-item')) {
      $displayText = $target.find('.acu-grid-value');
    } else if ($target.hasClass('acu-full-item')) {
      $displayText = $target.find('.acu-full-value');
    }
    // [新增] 适配 Source B 列表模式
    else if ($target.hasClass('acu-card-row')) {
      $displayText = $target.find('.acu-card-value');
    }

    // 4. 更新内容 (支持 Badge 样式)
    const badgeStyle = getBadgeStyle(newVal);
    if (badgeStyle && !$target.hasClass('acu-editable-title')) {
      $displayText.html(`<span class="acu-badge ${badgeStyle}">${newVal}</span>`);
    } else {
      $displayText.text(newVal);
    }

    // 5. 强制添加“手动修改”高亮 (参考 v9 样式)
    // 注意：10.15 原版叫 acu-highlight-changed，这里我们复用它，或者你可以定义一个新的橙色样式
    $displayText.addClass('acu-highlight-changed');
    if ($target.hasClass('acu-editable-title')) $target.addClass('acu-highlight-changed');

    // 6. 添加抖动动画提醒用户
    $displayText.css('animation', 'none');
    $displayText[0].offsetHeight; /* trigger reflow */
    $displayText.css('animation', 'pulse-highlight 0.5s');
  };

  const init = () => {
    if (isInitialized) return;
    addStyles();

    // ============================================================
    // [核弹级防穿透 v2] 智能识别长卡片滚动 (保留你的代码)
    // ============================================================
    const pDoc = window.parent.document;
    let pHzStartX = 0;
    let pHzStartY = 0;

    // 1. 监听 Start
    pDoc.addEventListener(
      'touchstart',
      function (e) {
        const target = e.target;
        if (!target.closest || !target.closest('.acu-layout-horizontal .acu-panel-content')) return;
        const touch = e.touches[0];
        pHzStartX = touch.clientX;
        pHzStartY = touch.clientY;
      },
      { capture: true, passive: false },
    );

    // 2. 监听 Move (增加滚动检测)
    pDoc.addEventListener(
      'touchmove',
      function (e) {
        const target = e.target;
        if (!target.closest || !target.closest('.acu-layout-horizontal .acu-panel-content')) return;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        let node = target;
        let shouldAllowScroll = false;

        while (node && node.classList && !node.classList.contains('acu-panel-content')) {
          if (node.scrollHeight > node.clientHeight) {
            const style = window.getComputedStyle(node);
            if (['auto', 'scroll'].includes(style.overflowY)) {
              shouldAllowScroll = true;
              break;
            }
          }
          node = node.parentElement;
        }

        if (shouldAllowScroll) return;

        const touch = e.touches[0];
        const dx = touch.clientX - pHzStartX;
        const dy = touch.clientY - pHzStartY;

        if (Math.abs(dy) > Math.abs(dx)) {
          if (e.cancelable) e.preventDefault();
        }
      },
      { capture: true, passive: false },
    );

    // ============================================================
    // 核心循环与 API 注册 (此处植入累积高亮逻辑)
    // ============================================================
    const loop = () => {
      const { $ } = getCore();
      if (getCore().getDB()?.exportTableAsJson && $) {
        renderInterface();
        const api = getCore().getDB();

        if (api.registerTableUpdateCallback) {
          api.registerTableUpdateCallback(UpdateController.handleUpdate);
          if (api.registerTableFillStartCallback) {
            api.registerTableFillStartCallback(() => {
              // A. 检测累积变动：如果界面上还有未保存的高亮，跳过快照更新
              if (currentDiffMap && currentDiffMap.size > 0) {
                // console.log('[ACU] 累积高亮：保留旧快照');
                return;
              }

              // B. 界面干净时：保存当前状态为基准快照
              const currentData = api.exportTableAsJson();
              if (currentData && Object.keys(currentData).length > 0) {
                saveSnapshot(currentData);
              }
            });
          }
        }
        isInitialized = true;
      } else {
        setTimeout(loop, 1000);
      }
    };
    loop();

    // 卸载处理
    $(window).on('unload pagehide', () => {
      FloatingManager.updateState(false);
    });
  };

  const { $ } = getCore();
  if ($) $(document).ready(init);
  else window.addEventListener('load', init);
})();
