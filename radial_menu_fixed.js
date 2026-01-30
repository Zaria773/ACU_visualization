$((() => {
    "use strict";

    // --- 配置与常量 ---
    const LONG_PRESS_DURATION = 400, MOVE_THRESHOLD = 10, MENU_CONTAINER_ID = 'radial-menu-container', BUTTON_CLASS = 'radial-menu-button', SELECTED_CLASS = 'selected', EDIT_BUTTON_SELECTOR = '.mes_edit', DONE_BUTTON_SELECTOR = '.mes_edit_done', DELETE_BUTTON_SELECTOR = '.mes_edit_delete', BOOKMARK_BUTTON_SELECTOR = '.swipe-bookmark-button', SWIPE_COUNTER_SELECTOR = '.swipes-counter', SWIPE_LEFT_SELECTOR = '.swipe_left', SWIPE_RIGHT_SELECTOR = '.swipe_right', MENU_RADIUS = 110;
    const BUTTONS_CONFIG = [
        { id: 'scrollToTop',   angle: 90,  icon: 'fa-arrow-up' },
        { id: 'deleteMessage', angle: 135, icon: 'fa-trash-can' },
        { id: 'editOrConfirm', angle: 180, icon: 'fa-pencil' },
        { id: 'jumpToBookmark',angle: 225, icon: 'fa-crosshairs' },
        { id: 'scrollToBottom',angle: 270, icon: 'fa-arrow-down' },
        { id: 'clickBookmark', angle: 0,   icon: 'fa-bookmark', radius: 75 },
        { id: 'jumpToEnd',     angle: -50, icon: 'fa-angles-right', radius: 90 },
        { id: 'jumpToTarget',  angle: 50,  icon: 'fa-bullseye', radius: 90 } // 【修改】将 toggleFullscreen 替换为 jumpToTarget
    ];
    let touchTimer = null, menuVisible = false, selectedButton = null, longPressedMessageCard = null, isPossiblyLongPress = false;
    let pressCoords = { x: 0, y: 0 };
    let animationFrameId = null, fingerCoords = { x: 0, y: 0 }, buttonDataCache = [];
    const log = (message, ...args) => console.log(`[RadialMenu] ${message}`, ...args);

    function mapValue(value, fromLow, fromHigh, toLow, toHigh) { const c = Math.max(fromLow, Math.min(value, fromHigh)); return toLow + (toHigh - toLow) * (c - fromLow) / (fromHigh - fromLow); }

    function injectStyles() {
        const parentDoc = window.parent.document, parent$ = window.parent.$;
        const STYLE_ID = 'radial-menu-styles';
        if (parent$(`#${STYLE_ID}`, parentDoc).length > 0) return;
        const styles = `
        <style id="${STYLE_ID}">
            @keyframes glowing { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            #${MENU_CONTAINER_ID} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none; display: none; }
            .${BUTTON_CLASS} { position: absolute; width: 50px; height: 50px; background-color: rgba(40, 40, 40, 0.9); color: white; border: 2px solid transparent; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; pointer-events: auto; transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1); transform: translate(-50%, -50%); box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 1; }
            .${BUTTON_CLASS}::before { content: ''; position: absolute; top: -4px; left: -4px; width: calc(100% + 8px); height: calc(100% + 8px); background: linear-gradient(45deg, #ffafcc, #bde0fe, #ffc8dd, #fcf6bd, #ffafcc); background-size: 400% 400%; border-radius: 50%; z-index: -1; animation: glowing 10s ease infinite; filter: blur(5px); opacity: 0.8; transition: opacity 0.15s ease-out, filter 0.15s ease-out; }
            .${BUTTON_CLASS}.${SELECTED_CLASS}::before { opacity: 1; filter: blur(8px); }
            .${BUTTON_CLASS}[data-id='scrollToTop'].${SELECTED_CLASS}, .${BUTTON_CLASS}[data-id='scrollToBottom'].${SELECTED_CLASS}, .${BUTTON_CLASS}[data-id='jumpToEnd'].${SELECTED_CLASS} { background-color: #328242; }
            .${BUTTON_CLASS}[data-id='deleteMessage'].${SELECTED_CLASS} { background-color: #d9534f; }
            .${BUTTON_CLASS}[data-id='editOrConfirm'].${SELECTED_CLASS} { background-color: #f0ad4e; }
            .${BUTTON_CLASS}[data-id='clickBookmark'].${SELECTED_CLASS}, .${BUTTON_CLASS}[data-id='jumpToBookmark'].${SELECTED_CLASS} { background-color: #5bc0de; }
            /* 【修改】为跳转按钮保留原全屏按钮的高亮色 (紫色) */
            .${BUTTON_CLASS}[data-id='jumpToTarget'].${SELECTED_CLASS} { background-color: #6a5acd; }
        </style>`;
        parent$(parentDoc.head).append(styles);
    }

    function parseSwipeCounter(text) { const n = text.replace(/\D/g, ' ').trim().split(/\s+/).map(Number); if (n.length === 2 && !isNaN(n[0]) && !isNaN(n[1])) return { current: n[0], total: n[1] }; return null; }

    // 【修复】使用原版正确的跳转指定楼层函数
    async function action_jumpToTarget() {
        try {
            const targetIdStr = await SillyTavern.callGenericPopup('请输入目标楼层号：', SillyTavern.POPUP_TYPE.INPUT, '');
            if (!targetIdStr) return;
            const targetId = parseInt(targetIdStr, 10);
            if (isNaN(targetId) || targetId < 0) {
                toastr.error('输入无效。');
                return;
            }
            SillyTavern.SlashCommandParser.commands['chat-jump'].callback({}, targetId);
        } catch (e) {
            console.error(e);
            toastr.error("弹窗或跳转失败。");
        }
    }

    async function action_jumpToEnd() { /* ... */ }

    // ... 其他所有函数保持不变 ...
    function updateScales() { let c = null; const S = 1.225, N = 0.5, D = 200, d = 25; for (let i = 0; i < buttonDataCache.length; i++) { const b = buttonDataCache[i], dx = b.center.x - fingerCoords.x, dy = b.center.y - fingerCoords.y, dist = Math.sqrt(dx * dx + dy * dy), scale = mapValue(dist, d, D, S, N); b.element.style.transform = `translate(-50%, -50%) scale(${scale})`; const isH = dist < b.radius + 5; if (isH) { if (!b.element.classList.contains(SELECTED_CLASS)) b.element.classList.add(SELECTED_CLASS); c = b.element; } else { if (b.element.classList.contains(SELECTED_CLASS)) b.element.classList.remove(SELECTED_CLASS); } } selectedButton = c; animationFrameId = null; }

    // 【修复】handleTouchMove: 增加 event.stopPropagation() 以防止误触底层 Swipe 事件
    function handleTouchMove(event) {
        if (!menuVisible) {
            if (isPossiblyLongPress) {
                const t = event.originalEvent.touches[0], d = Math.sqrt(Math.pow(t.clientX - pressCoords.x, 2) + Math.pow(t.clientY - pressCoords.y, 2));
                if (d > MOVE_THRESHOLD) {
                    isPossiblyLongPress = false;
                    if (touchTimer) clearTimeout(touchTimer);
                }
            }
            return;
        }
        event.preventDefault();
        event.stopPropagation(); // <--- 【修复点】阻止事件冒泡
        const t = event.originalEvent.touches[0];
        fingerCoords = { x: t.clientX, y: t.clientY };
        if (!animationFrameId) {
            animationFrameId = window.parent.requestAnimationFrame(updateScales);
        }
    }

    function createAndInjectUI() { const parentDoc = window.parent.document, parent$ = window.parent.$; if (parent$(`#${MENU_CONTAINER_ID}`, parentDoc).length > 0) return; const $container = $('<div/>', { id: MENU_CONTAINER_ID }); BUTTONS_CONFIG.forEach(config => { const $button = $('<div/>', { class: BUTTON_CLASS, 'data-id': config.id }); if (config.icon) { $button.html(`<i class="fa-solid ${config.icon}"></i>`); } else { $button.text(config.text); } $button.appendTo($container); }); $container.appendTo(parent$('body', parentDoc)); }
    function action_scrollToTop() { const $s = window.parent.$('#chat'); if ($s.length === 0) return; const t = findTopmostVisibleMessage($s); if (!t) return; const $c = $(t); if (Math.abs(t.getBoundingClientRect().top - $s[0].getBoundingClientRect().top) < 5) { const $p = $c.prev('.mes'); if ($p.length > 0) $p[0].scrollIntoView({ behavior: 'smooth', block: 'start' }); else toastr.info("已是首条"); } else t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    function action_scrollToBottom() { const $s = window.parent.$('#chat'); if ($s.length === 0) return; const b = findBottommostVisibleMessage($s); if (!b) return; const $c = $(b), cRect = $s[0].getBoundingClientRect(), bRect = b.getBoundingClientRect(); if (Math.abs(bRect.bottom - cRect.bottom) < 5) { const $n = $c.next('.mes'); if ($n.length > 0) $n[0].scrollIntoView({ behavior: 'smooth', block: 'end' }); else toastr.info("已是末条"); } else b.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
    function findTopmostVisibleMessage($s) { let t = null, min = Infinity; $s.find('.mes:visible').each(function() { const rect = this.getBoundingClientRect(), cRect = $s[0].getBoundingClientRect(); if (rect.bottom > cRect.top && rect.top < cRect.bottom) { if (rect.top < min) { min = rect.top; t = this; } } }); return t; }
    function findBottommostVisibleMessage($s) { let b = null, max = -Infinity; $s.find('.mes:visible').each(function() { const rect = this.getBoundingClientRect(), cRect = $s[0].getBoundingClientRect(); if (rect.bottom > cRect.top && rect.top < cRect.bottom) { if (rect.bottom > max) { max = rect.bottom; b = this; } } }); return b; }
    function action_deleteMessage() { if (!longPressedMessageCard) return; const $m = $(longPressedMessageCard), $e = $m.find(EDIT_BUTTON_SELECTOR), $d = $m.find(DELETE_BUTTON_SELECTOR); if ($e.length > 0 && $d.length > 0) { $e.trigger('click'); $d.trigger('click'); } else { toastr.error("删除失败"); } }
    function action_editOrConfirm() { if (!longPressedMessageCard) return; const $m = $(longPressedMessageCard), $e = $m.find(EDIT_BUTTON_SELECTOR); if ($e.length > 0 && $e.is(':visible')) { $e.trigger('click'); } else { const $d = $m.find(DONE_BUTTON_SELECTOR); if ($d.length > 0) { $d.trigger('click'); } else { toastr.error("操作失败"); } } }
    function action_clickBookmark() { if (!longPressedMessageCard) return; const $b = $(longPressedMessageCard).find(BOOKMARK_BUTTON_SELECTOR); if ($b.length > 0) { $b.trigger('click'); toastr.success("已更新书签"); } else { toastr.warning("未找到书签按钮"); } }
    async function action_jumpToBookmark() { if (!longPressedMessageCard) return; const $m = $(longPressedMessageCard), $b = $m.find(BOOKMARK_BUTTON_SELECTOR), $c = $m.find(SWIPE_COUNTER_SELECTOR); if ($b.length === 0 || $c.length === 0) { toastr.warning("操作失败"); return; } const bv = parseInt($b.text(), 10); if (isNaN(bv) || bv <= 0) { toastr.info("请先设置书签"); return; } const match = $c.text().match(/^\d+/); if (!match || !match[0]) { toastr.error("读取当前序号失败"); return; } const cv = parseInt(match[0], 10); const diff = cv - bv; if (diff === 0) { toastr.success(`已在书签 #${bv}`); return; } const clicks = Math.abs(diff); const $btn = diff > 0 ? $m.find(SWIPE_LEFT_SELECTOR) : $m.find(SWIPE_RIGHT_SELECTOR); if ($btn.length === 0) { toastr.error(`找不到翻页按钮`); return; } toastr.info(`准备翻页 ${clicks} 次...`); for (let i = 0; i < clicks; i++) { $btn.trigger('click'); await new Promise(resolve => setTimeout(resolve, 20)); } toastr.success(`已定位到书签 #${bv}`); }
    async function action_jumpToEnd() { if (!longPressedMessageCard) return; const $m = $(longPressedMessageCard), $c = $m.find(SWIPE_COUNTER_SELECTOR); if ($c.length === 0) { toastr.warning("找不到计数器"); return; } const d = parseSwipeCounter($c.text()); if (!d) { toastr.error("解析序号失败"); return; } const diff = d.total - d.current; if (diff <= 0) { toastr.success(`已是末条`); return; } const $btn = $m.find(SWIPE_RIGHT_SELECTOR); if ($btn.length === 0) { toastr.error(`找不到右翻按钮`); return; } toastr.info(`准备翻页 ${diff} 次...`); for (let i = 0; i < diff; i++) { $btn.trigger('click'); await new Promise(r => setTimeout(r, 20)); } toastr.success(`已到末条`); }
    function handleTouchStart(event) { if (touchTimer) clearTimeout(touchTimer); const touch = event.originalEvent.touches[0]; pressCoords = { x: touch.clientX, y: touch.clientY }; longPressedMessageCard = event.currentTarget; isPossiblyLongPress = true; touchTimer = setTimeout(() => { if (isPossiblyLongPress) { menuVisible = true; const $c = window.parent.$(`#${MENU_CONTAINER_ID}`); buttonDataCache = []; $c.find(`.${BUTTON_CLASS}`).each(function() { const id = $(this).data('id'), conf = BUTTONS_CONFIG.find(c => c.id === id); if (!conf) return; const r = conf.radius || MENU_RADIUS, a = conf.angle * (Math.PI / 180), x = r * Math.cos(a), y = -r * Math.sin(a); const fL = pressCoords.x + x, fT = pressCoords.y + y; $(this).css({ left: `${fL}px`, top: `${fT}px` }); buttonDataCache.push({ element: this, center: { x: fL, y: fT }, radius: 25 }); }); $c.show(); } }, LONG_PRESS_DURATION); }
    function handleTouchEnd() { if (animationFrameId) { window.parent.cancelAnimationFrame(animationFrameId); animationFrameId = null; } if (touchTimer) clearTimeout(touchTimer); isPossiblyLongPress = false; if (menuVisible) { if (selectedButton) { const buttonId = $(selectedButton).data('id'); try { switch(buttonId) { case 'scrollToTop': action_scrollToTop(); break; case 'deleteMessage': action_deleteMessage(); break; case 'editOrConfirm': action_editOrConfirm(); break; case 'scrollToBottom': action_scrollToBottom(); break; case 'clickBookmark': action_clickBookmark(); break; case 'jumpToBookmark': action_jumpToBookmark(); break; case 'jumpToEnd': action_jumpToEnd(); break; case 'jumpToTarget': action_jumpToTarget(); break; default: toastr.info(`按钮功能尚未实现。`); break; } } catch (err) { console.error("[RadialMenu] Error:", err); toastr.error("操作出错！"); } } window.parent.$(`#${MENU_CONTAINER_ID}`).hide(); window.parent.$(`.${BUTTON_CLASS}`).removeClass(SELECTED_CLASS); window.parent.$(`.${BUTTON_CLASS}`).css('transform', 'translate(-50%, -50%) scale(1)'); menuVisible = false; selectedButton = null; longPressedMessageCard = null; } }
    function init() { log("初始化径向菜单(全功能版)脚本..."); injectStyles(); createAndInjectUI(); const parent$ = window.parent.$; const $chat = parent$('#chat', window.parent.document); if ($chat.length > 0) { $chat.on('touchstart', '.mes', handleTouchStart); $chat.on('touchmove', handleTouchMove); $chat.on('touchend touchcancel', handleTouchEnd); log("事件已成功绑定。"); } else { warn("未找到#chat元素"); } }

    setTimeout(init, 500);

})());
