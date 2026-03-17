//name: 数据搬家新聊天 v1
//author: Zaria (基于 yellows 原版二改, v1修复版)
//description: 按楼层范围创建新聊天，无痛带高楼层ACU数据搬家。修复范围失效及暗黑模式下UI看不清的问题。

(function() {
    'use strict';

    const STYLE_ID = 'range-export-css';

    // 确保在父窗口操作（脚本可能运行在 iframe 中）
    const parentDoc = window.parent?.document || document;
    const $parent = window.parent?.$ || $;

    // 注入强制浅色的防污染样式到父窗口
    $parent(`#${STYLE_ID}`).remove();
    $parent(parentDoc.head).append(`
        <style id="${STYLE_ID}">
            /* 强制浅色主题与防污染样式 */
            .rex-wrapper {
                width: 100% !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                padding: 12px !important;
                box-sizing: border-box !important;
                background-color: #f7f9fa !important; /* 强制浅色背景 */
                border-radius: 8px !important;
                color: #333333 !important; /* 强制深色文字 */
                text-align: left !important;
                font-family: sans-serif !important;
                border: 1px solid #ced4da !important;
            }
            .rex-wrapper * {
                color: #333333 !important;
                box-sizing: border-box !important;
            }
            .rex-title {
                font-size: 1.1em !important;
                font-weight: 600 !important;
                margin-bottom: 8px !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                color: #3170a7 !important; /* 加深蓝色以在浅色上更易读 */
            }
            .rex-title i {
                color: #3170a7 !important;
            }
            .rex-row {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin-bottom: 8px !important;
            }
            .rex-wrapper .rex-label {
                font-size: 0.9em !important;
                min-width: 72px !important;
                flex-shrink: 0 !important;
                font-weight: 600 !important;
            }
            .rex-wrapper .rex-input {
                flex: 1 !important;
                min-width: 0 !important;
                padding: 8px 12px !important;
                border-radius: 6px !important;
                background-color: #ffffff !important; /* 强制白底 */
                background-image: none !important; /* 防止酒馆的渐变或贴图污染 */
                border: 1px solid #999999 !important; /* 明显的边框 */
                color: #000000 !important; /* 强制纯黑字 */
                font-family: monospace !important;
                font-size: 0.95em !important;
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.05) !important;
                margin: 0 !important;
                height: auto !important;
                line-height: normal !important;
                text-shadow: none !important;
                appearance: auto !important;
            }
            .rex-wrapper .rex-input::placeholder {
                color: #888888 !important;
            }
            .rex-wrapper .rex-input:focus {
                outline: none !important;
                border-color: #3170a7 !important;
                box-shadow: 0 0 0 2px rgba(49, 112, 167, 0.2) !important;
            }
            .rex-wrapper .rex-sep {
                opacity: 0.7 !important;
                font-weight: bold !important;
            }
            .rex-wrapper .rex-hint {
                font-size: 0.75em !important;
                color: #666666 !important;
                margin: -4px 0 8px 80px !important;
            }
            .rex-wrapper .rex-check {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin-bottom: 8px !important;
                font-size: 0.85em !important;
                cursor: pointer !important;
                font-weight: 600 !important;
            }
            .rex-wrapper .rex-check input[type="checkbox"] {
                margin: 0 !important;
                width: 16px !important;
                height: 16px !important;
                cursor: pointer !important;
                appearance: checkbox !important; /* 强制恢复原生复选框 */
                -webkit-appearance: checkbox !important;
                opacity: 1 !important; /* 防止酒馆透明化复选框 */
                visibility: visible !important;
                display: inline-block !important;
                position: static !important;
            }
            .rex-btns {
                display: flex !important;
                gap: 10px !important;
                margin-top: 12px !important;
            }
            .rex-btn {
                flex: 1 !important;
                padding: 10px 16px !important;
                border: none !important;
                border-radius: 6px !important;
                font-weight: bold !important;
                font-size: 0.9em !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 6px !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
            }
            .rex-btn i {
                color: #ffffff !important;
            }
            .rex-btn-export {
                background-color: #4a88c2 !important;
                color: #ffffff !important;
            }
            .rex-btn-export:hover {
                background-color: #3870a3 !important;
            }
            .rex-btn-migrate {
                background-color: #5ba36b !important;
                color: #ffffff !important;
            }
            .rex-btn-migrate:hover {
                background-color: #4a8c59 !important;
            }
            .rex-btn:disabled {
                opacity: 0.6 !important;
                cursor: not-allowed !important;
                box-shadow: none !important;
            }
            .rex-divider {
                height: 1px !important;
                background-color: #d1d5db !important;
                margin: 8px 0 !important;
            }
            .rex-info {
                font-size: 0.8em !important;
                color: #495057 !important;
                margin-top: 8px !important;
                padding: 8px !important;
                background-color: #e9ecef !important;
                border-radius: 6px !important;
                border: 1px solid #ced4da !important;
            }
            @media (max-width: 480px) {
                .rex-row {
                    flex-wrap: wrap !important;
                }
                .rex-label {
                    min-width: 100% !important;
                    margin-bottom: 4px !important;
                }
                .rex-hint {
                    margin-left: 0 !important;
                }
            }
        </style>
    `);

    // 工具函数
    const Utils = {
        // 获取聊天记录
        getRawChat: () => {
            if (window.SillyTavern && window.SillyTavern.chat) {
                return window.SillyTavern.chat;
            }
            return null;
        },

        // 解析真实的Message ID（修复楼层选择不准的核心）
        resolveMessageId: (msg, idx) => {
            const rawId = msg?.message_id !== undefined ? msg.message_id : (msg?.id !== undefined ? msg.id : idx);
            const idNum = Number(rawId);
            return Number.isFinite(idNum) ? idNum : null;
        },

        // 获取隔离标签 (兼容多版本)
        getIsolationTag: () => {
            try {
                const context = window.SillyTavern?.getContext?.();
                const userscripts = context?.extensionSettings?.__userscripts;
                if (userscripts) {
                    const keys = Object.keys(userscripts);
                    const settingsKey = keys.find(k => /shujuku_v\d+__userscript_settings_v1/i.test(k));
                    if (settingsKey && userscripts[settingsKey]) {
                        const raw = userscripts[settingsKey];
                        const container = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        const versionPrefix = settingsKey.replace(/__userscript_settings_v1$/i, '');
                        const metaKey = `${versionPrefix}_globalMeta_v1`;
                        if (container[metaKey]) {
                            const meta = typeof container[metaKey] === 'string'
                                ? JSON.parse(container[metaKey])
                                : container[metaKey];
                            return String(meta.activeIsolationCode || '');
                        }
                    }
                }
            } catch (e) {
                console.warn('[RangeExport] 读取隔离标签失败:', e);
            }
            return '';
        },

        // 从消息中提取 ACU 表格数据
        extractACUData: (msg, tag) => {
            if (!msg) return null;

            // 新版格式
            if (msg.TavernDB_ACU_IsolatedData) {
                const tagData = msg.TavernDB_ACU_IsolatedData[tag];
                if (tagData && tagData.independentData) {
                    return tagData.independentData;
                }
            }

            // 旧版格式
            if (msg.TavernDB_ACU_IndependentData) {
                return msg.TavernDB_ACU_IndependentData;
            }

            return null;
        },

        // 检查表格是否只有表头（没有数据行）
        isEmptyTable: (tableData) => {
            if (!tableData || !tableData.content) return true;
            // content[0] 是表头，如果只有 1 行就是空表
            return tableData.content.length <= 1;
        },

        // 获取当前有效的表格模板列表（从指导表读取）
        getActiveTableKeys: (rawChat, tag) => {
            if (!rawChat || rawChat.length === 0) return new Set();

            const firstMsg = rawChat[0];
            if (!firstMsg) return new Set();

            const guideRaw = firstMsg.TavernDB_ACU_InternalSheetGuide;
            if (!guideRaw) return new Set();

            try {
                let guide = guideRaw;
                if (typeof guide === 'string') {
                    guide = JSON.parse(guide);
                }

                // 获取当前标签的指导表数据
                const tagData = guide.tags?.[tag];
                if (!tagData || !tagData.data) return new Set();

                // 提取所有 sheet_ 开头的键
                const activeKeys = new Set();
                Object.keys(tagData.data).forEach(key => {
                    if (key.startsWith('sheet_')) {
                        activeKeys.add(key);
                    }
                });

                console.log('[RangeExport] 当前有效表格模板:', Array.from(activeKeys));
                return activeKeys;
            } catch (e) {
                console.warn('[RangeExport] 读取指导表失败:', e);
                return new Set();
            }
        },

        // 生成文件名
        getFilename: () => {
            try {
                let name = 'chat_export';
                if (window.SillyTavern) {
                    const ST = window.SillyTavern;
                    if (ST.characters && ST.characterId) {
                        const char = ST.characters[ST.characterId];
                        if (char && char.name) name = char.name;
                    }
                }
                const date = new Date().toISOString().slice(0, 10);
                return `${name.replace(/[\\/:*?"<>|]/g, '')}_${date}`;
            } catch { return 'chat_export'; }
        },

        // 生成 Header (酒馆原版格式)
        createHeader: () => {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}@${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s`;

            return JSON.stringify({
                user_name: window.SillyTavern?.name1 || "User",
                character_name: window.SillyTavern?.name2 || "Character",
                create_date: dateStr,
                chat_metadata: window.SillyTavern?.chatMetadata || {}
            });
        },

        // 下载文件
        download: (content, filename) => {
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    // 显示导出对话框
    function showExportDialog() {
        const rawChat = Utils.getRawChat();
        if (!rawChat || rawChat.length === 0) {
            toastr.warning('没有聊天记录可导出');
            return;
        }

        // 提取最大真实ID
        let maxFloor = 0;
        rawChat.forEach((msg, idx) => {
            const mId = Utils.resolveMessageId(msg, idx);
            if (mId !== null && mId > maxFloor) maxFloor = mId;
        });

        const defaultFilename = Utils.getFilename();

        // 创建弹窗内容
        const $wrapper = $(`
            <div class="rex-wrapper">
                <div class="rex-title">
                    <i class="fa-solid fa-truck-moving"></i>
                    数据搬家
                </div>

                <div class="rex-row">
                    <span class="rex-label">文件名</span>
                    <input type="text" class="rex-input" id="rex-filename" value="${defaultFilename}">
                </div>

                <div class="rex-row">
                    <span class="rex-label">楼层范围</span>
                    <input type="number" class="rex-input" id="rex-start" placeholder="起始" min="0" max="${maxFloor}" value="0">
                    <span class="rex-sep">-</span>
                    <input type="number" class="rex-input" id="rex-end" placeholder="结束" min="0" max="${maxFloor}" value="${maxFloor}">
                </div>
                <div class="rex-hint">当前最高楼层为: ${maxFloor}</div>

                <label class="rex-check">
                    <input type="checkbox" id="rex-merge-missing" checked>
                    合并范围外的缺失表格数据到第 0 楼 (推荐)
                </label>

                <label class="rex-check">
                    <input type="checkbox" id="rex-remap-id" checked>
                    重映射楼层编号 (推荐，导入后从 0 开始)
                </label>

                <div class="rex-btns">
                    <button class="rex-btn rex-btn-export" id="rex-export">
                        <i class="fa-solid fa-download"></i> 导出 JSONL
                    </button>
                </div>

                <div class="rex-divider"></div>

                <div class="rex-btns">
                    <button class="rex-btn rex-btn-migrate" id="rex-migrate">
                        <i class="fa-solid fa-truck-moving"></i> 一键搬家 (创建新聊天)
                    </button>
                </div>

                <div class="rex-info" id="rex-preview">
                    预计导出: 计算中...
                </div>
            </div>
        `);

        // 使用酒馆原生弹窗 API
        let popupInstance = null;
        const closePopup = () => {
            if (popupInstance && popupInstance.completeAffirmative) {
                popupInstance.completeAffirmative();
            } else {
                $('.swal2-confirm').click();
                $('.swal2-container').remove();
            }
        };

        // 更新预览
        const updatePreview = () => {
            const start = parseInt($wrapper.find('#rex-start').val()) || 0;
            const end = parseInt($wrapper.find('#rex-end').val()) || maxFloor;

            // 按照真实 Message ID 匹配数量
            let count = 0;
            rawChat.forEach((msg, idx) => {
                const mId = Utils.resolveMessageId(msg, idx);
                if (mId !== null && mId >= start && mId <= end) count++;
            });

            $wrapper.find('#rex-preview').text(`预计导出: ${count} 楼`);
        };

        // 事件绑定
        $wrapper.find('#rex-start, #rex-end').on('input change', updatePreview);
        updatePreview();

        // 检查是否有 ACU 数据
        const hasACUData = rawChat.some(msg =>
            msg && (msg.TavernDB_ACU_IsolatedData || msg.TavernDB_ACU_IndependentData)
        );
        if (!hasACUData) {
            $wrapper.find('#rex-merge-missing').closest('.rex-check').hide();
            console.log('[RangeExport] 未检测到 ACU 数据，隐藏合并选项');
        }

        // ======================= 数据收集核心逻辑提取 =======================
        const collectMigrationData = (start, end, mergeMissing, activeTableKeys, tag) => {
            const outsideTableData = {};
            const insideTableData = {};

            // 倒序遍历收集（保证留下的都是最新的楼层数据）
            for (let i = rawChat.length - 1; i >= 0; i--) {
                const msg = rawChat[i];
                if (!msg) continue;

                const mId = Utils.resolveMessageId(msg, i);
                if (mId === null) continue;

                const isInside = (mId >= start && mId <= end);
                const acuData = Utils.extractACUData(msg, tag);

                if (acuData) {
                    Object.keys(acuData).forEach(sheetKey => {
                        if (!sheetKey.startsWith('sheet_')) return;
                        if (activeTableKeys.size > 0 && !activeTableKeys.has(sheetKey)) return;

                        const tableData = acuData[sheetKey];
                        if (tableData && !Utils.isEmptyTable(tableData)) {
                            if (isInside && !insideTableData[sheetKey]) {
                                insideTableData[sheetKey] = mId;
                            } else if (!isInside && mergeMissing && !outsideTableData[sheetKey]) {
                                outsideTableData[sheetKey] = { floorIndex: mId, data: JSON.parse(JSON.stringify(tableData)) };
                            }
                        }
                    });
                }
            }

            // 找出需要合并到导出范围开头的缺失表格
            const missingTables = {};
            Object.keys(outsideTableData).forEach(sheetKey => {
                if (!insideTableData[sheetKey]) {
                    missingTables[sheetKey] = outsideTableData[sheetKey].data;
                }
            });

            return missingTables;
        };

        const generateLinesForExport = (start, end, missingTables, remapId, tag) => {
            const lines = [Utils.createHeader()];
            let newMsgId = 0;
            let firstFloorProcessed = false;
            let isFirstExportedMessage = true; // 用于标记新聊天的第 0 楼

            // 提取原聊天的指导表（永远在原聊天的第 0 楼）
            let originalGuide = null;
            if (rawChat.length > 0 && rawChat[0]) {
                originalGuide = rawChat[0].TavernDB_ACU_InternalSheetGuide;
            }

            // 顺序遍历拼装 JSONL
            rawChat.forEach((msg, idx) => {
                const mId = Utils.resolveMessageId(msg, idx);
                if (mId === null) return;

                if (mId >= start && mId <= end) {
                    const item = JSON.parse(JSON.stringify(msg));

                    // 重映射 message_id
                    if (remapId) {
                        item.message_id = newMsgId;
                    }

                    // 【关键修复】将原聊天的指导表强行注入到新聊天的第 0 楼
                    if (isFirstExportedMessage) {
                        if (originalGuide) {
                            item.TavernDB_ACU_InternalSheetGuide = JSON.parse(JSON.stringify(originalGuide));
                            console.log('[RangeExport] 已将原聊天指导表注入到新聊天第 0 楼');
                        }
                        isFirstExportedMessage = false;
                    }

                    // 在第一个导出且为AI回复的楼层合并缺失的表格数据
                    if (!firstFloorProcessed && Object.keys(missingTables).length > 0 && item.is_user === false) {
                        firstFloorProcessed = true;

                        // 确保 ACU 数据结构存在
                        if (!item.TavernDB_ACU_IsolatedData) item.TavernDB_ACU_IsolatedData = {};
                        if (!item.TavernDB_ACU_IsolatedData[tag]) {
                            item.TavernDB_ACU_IsolatedData[tag] = { independentData: {}, modifiedKeys: [], updateGroupKeys: [] };
                        }
                        const tagData = item.TavernDB_ACU_IsolatedData[tag];
                        if (!tagData.independentData) tagData.independentData = {};
                        if (!tagData.modifiedKeys) tagData.modifiedKeys = [];
                        if (!tagData.updateGroupKeys) tagData.updateGroupKeys = [];

                        // 合并缺失的表格
                        Object.keys(missingTables).forEach(sheetKey => {
                            tagData.independentData[sheetKey] = missingTables[sheetKey];

                            // 必须同时推入 modifiedKeys 和 updateGroupKeys
                            if (!tagData.modifiedKeys.includes(sheetKey)) {
                                tagData.modifiedKeys.push(sheetKey);
                            }
                            if (!tagData.updateGroupKeys.includes(sheetKey)) {
                                tagData.updateGroupKeys.push(sheetKey);
                            }
                        });

                        // 同时更新旧版格式以保持兼容
                        if (!item.TavernDB_ACU_IndependentData) item.TavernDB_ACU_IndependentData = {};
                        if (!item.TavernDB_ACU_ModifiedKeys) item.TavernDB_ACU_ModifiedKeys = [];
                        if (!item.TavernDB_ACU_UpdateGroupKeys) item.TavernDB_ACU_UpdateGroupKeys = [];

                        Object.keys(missingTables).forEach(sheetKey => {
                            item.TavernDB_ACU_IndependentData[sheetKey] = missingTables[sheetKey];
                            if (!item.TavernDB_ACU_ModifiedKeys.includes(sheetKey)) {
                                item.TavernDB_ACU_ModifiedKeys.push(sheetKey);
                            }
                            if (!item.TavernDB_ACU_UpdateGroupKeys.includes(sheetKey)) {
                                item.TavernDB_ACU_UpdateGroupKeys.push(sheetKey);
                            }
                        });

                        console.log(`[RangeExport] 已将 ${Object.keys(missingTables).length} 个缺失表格合并到第 ${mId} 楼(AI楼层)`);
                    } else if (!firstFloorProcessed && Object.keys(missingTables).length === 0) {
                        // 如果没有需要合并的表格，也标记为已处理
                        firstFloorProcessed = true;
                    }

                    // 兼容性：确保 mes 字段存在
                    if (item.message !== undefined && item.mes === undefined) item.mes = item.message;

                    lines.push(JSON.stringify(item));
                    newMsgId++;
                }
            });
            return lines;
        };

        // ======================= 导出 =======================
        $wrapper.find('#rex-export').on('click', () => {
            const start = parseInt($wrapper.find('#rex-start').val()) || 0;
            const end = parseInt($wrapper.find('#rex-end').val()) || maxFloor;
            const mergeMissing = $wrapper.find('#rex-merge-missing').is(':checked');
            const remapId = $wrapper.find('#rex-remap-id').is(':checked');
            let filename = $wrapper.find('#rex-filename').val().trim() || 'export';

            if (!filename.endsWith('.jsonl')) filename += '.jsonl';

            if (start > end) { toastr.warning('起始楼层不能大于结束楼层'); return; }

            const tag = Utils.getIsolationTag();
            const activeTableKeys = Utils.getActiveTableKeys(rawChat, tag);

            const missingTables = collectMigrationData(start, end, mergeMissing, activeTableKeys, tag);
            const lines = generateLinesForExport(start, end, missingTables, remapId, tag);
            const exportedCount = lines.length - 1;

            if (exportedCount === 0) {
                toastr.warning('所选范围内没有消息可导出');
                return;
            }

            Utils.download(lines.join('\n'), filename);

            const mergeInfo = Object.keys(missingTables).length > 0 ? `，已合并 ${Object.keys(missingTables).length} 个范围外表格` : '';
            toastr.success(`已导出 ${exportedCount} 楼到 ${filename}${mergeInfo}`);
            closePopup();
        });

        // ======================= 一键搬家 =======================
        $wrapper.find('#rex-migrate').on('click', async () => {
            const start = parseInt($wrapper.find('#rex-start').val()) || 0;
            const end = parseInt($wrapper.find('#rex-end').val()) || maxFloor;
            const mergeMissing = $wrapper.find('#rex-merge-missing').is(':checked');
            const remapId = $wrapper.find('#rex-remap-id').is(':checked');

            if (start > end) { toastr.warning('起始楼层不能大于结束楼层'); return; }
            if (typeof importRawChat !== 'function') { toastr.error('importRawChat 接口不可用，请确保酒馆助手已安装'); return; }

            const $btn = $wrapper.find('#rex-migrate');
            const originalHtml = $btn.html();
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 搬家中...');

            try {
                const tag = Utils.getIsolationTag();
                const activeTableKeys = Utils.getActiveTableKeys(rawChat, tag);

                const missingTables = collectMigrationData(start, end, mergeMissing, activeTableKeys, tag);
                const lines = generateLinesForExport(start, end, missingTables, remapId, tag);
                const exportedCount = lines.length - 1;

                if (exportedCount === 0) {
                    toastr.warning('所选范围内没有消息可搬家');
                    $btn.prop('disabled', false).html(originalHtml);
                    return;
                }

                const jsonlContent = lines.join('\n');

                // 生成新聊天文件名
                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
                const newFilename = `migrated_${start}-${end}_${timestamp}`;

                // 调用酒馆助手接口创建新聊天
                await importRawChat(newFilename, jsonlContent);

                const mergeInfo = Object.keys(missingTables).length > 0 ? `，已合并 ${Object.keys(missingTables).length} 个范围外表格` : '';
                toastr.success(`已创建新聊天 (${exportedCount} 楼)${mergeInfo}`);
                closePopup();

            } catch (e) {
                console.error('[RangeExport] 搬家失败:', e);
                toastr.error('搬家失败: ' + (e.message || e));
                $btn.prop('disabled', false).html(originalHtml);
            }
        });

        // 兼容显示弹窗
        if (window.SillyTavern && SillyTavern.Popup) {
            popupInstance = new SillyTavern.Popup($wrapper, SillyTavern.POPUP_TYPE.TEXT, "", { okButton: "关闭" });
            popupInstance.show();
        } else {
            const popupFunc = SillyTavern.callGenericPopup || window.callGenericPopup;
            if (popupFunc) {
                popupFunc($wrapper, 1, "", { okButton: "关闭" });
            } else {
                $parent(parentDoc.body).append($wrapper);
            }
        }
    }

    // 注册脚本按钮
    function register() {
        if (typeof appendInexistentScriptButtons === 'function' && typeof getButtonEvent === 'function') {
            const BTN_NAME = '数据搬家';
            appendInexistentScriptButtons([{ name: BTN_NAME, visible: true }]);
            eventOn(getButtonEvent(BTN_NAME), showExportDialog);
        }

        if (window.SillyTavern && SillyTavern.SlashCommandParser) {
            SillyTavern.SlashCommandParser.addCommandObject(
                SillyTavern.SlashCommand.fromProps({
                    name: 'range-export',
                    callback: showExportDialog,
                    helpString: '打开范围导出对话框'
                })
            );
        }
    }

    setTimeout(register, 1000);
})();
