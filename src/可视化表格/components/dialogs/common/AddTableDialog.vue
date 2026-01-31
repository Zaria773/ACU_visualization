<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div ref="dialogRef" class="acu-modal acu-add-table-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <button class="acu-modal-back" @click.stop="handleClose">
          <i class="fas fa-arrow-left"></i>
        </button>
        <span class="acu-modal-title">添加表格</span>
        <span></span>
      </div>

      <!-- 内容区 -->
      <div class="acu-modal-body">
        <!-- Tab 切换：粘贴 JSON / 导入文件 -->
        <div class="acu-add-table-tabs">
          <button :class="['acu-tab-btn', { active: mode === 'paste' }]" @click.stop="mode = 'paste'">
            <i class="fas fa-paste"></i> 粘贴 JSON
          </button>
          <button :class="['acu-tab-btn', { active: mode === 'file' }]" @click.stop="mode = 'file'">
            <i class="fas fa-file-import"></i> 导入文件
          </button>
        </div>

        <!-- 粘贴模式 -->
        <div v-if="mode === 'paste'" class="acu-add-table-paste">
          <textarea
            v-model="jsonInput"
            placeholder="粘贴表格模板 JSON..."
            class="acu-textarea-scrollable"
            rows="8"
          ></textarea>
          <button class="acu-modal-btn primary" @click.stop="parseJson"><i class="fas fa-search"></i> 解析</button>
        </div>

        <!-- 文件导入模式 -->
        <div v-else class="acu-add-table-file">
          <label class="acu-file-label">
            <input type="file" accept=".json" @change="handleFileSelect" style="display: none" />
            <i class="fas fa-upload"></i>
            <span>{{ selectedFileName || '点击选择 JSON 文件' }}</span>
          </label>
        </div>

        <!-- 错误提示 -->
        <div v-if="parseError" class="acu-add-table-error">
          <i class="fas fa-exclamation-circle"></i>
          {{ parseError }}
        </div>

        <!-- 解析结果：表格选择列表 -->
        <div v-if="parsedTables.length > 0" class="acu-add-table-list">
          <div class="acu-settings-title">
            <i class="fas fa-table"></i>
            选择要添加的表格
          </div>
          <SwitchList
            v-model="selectedTableKeys"
            :items="parsedTableItems"
            empty-text="暂无可添加的表格"
            footer-template="已选择: {selected}/{total} 个表格"
          />
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="acu-modal-footer">
        <button class="acu-modal-btn secondary" @click.stop="handleClose">取消</button>
        <button class="acu-modal-btn primary" :disabled="selectedTableKeys.length === 0" @click.stop="handleConfirm">
          <i class="fas fa-plus"></i>
          添加 ({{ selectedTableKeys.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { toast } from '../../../composables/useToast';
import type { SwitchListItem } from '../../ui/SwitchList.vue';
import SwitchList from '../../ui/SwitchList.vue';

// ============================================================
// 类型定义
// ============================================================

// 表格模板类型
interface SheetTemplate {
  uid?: string;
  name: string;
  sourceData?: Record<string, string>;
  content: (string | number | null)[][];
  updateConfig?: Record<string, number>;
  exportConfig?: Record<string, any>;
  orderNo?: number;
  [key: string]: any;
}

// 解析后的表格信息
interface ParsedTable {
  key: string;
  template: SheetTemplate;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [tables: SheetTemplate[]];
}>();

// ============================================================
// Refs & State
// ============================================================

const mode = ref<'paste' | 'file'>('paste');
const jsonInput = ref('');
const selectedFileName = ref('');
const parseError = ref('');
const parsedTables = ref<ParsedTable[]>([]);
const selectedTableKeys = ref<string[]>([]);
const dialogRef = ref<HTMLElement>();

// ============================================================
// Computed
// ============================================================

// 转换为 SwitchList 所需格式
const parsedTableItems = computed<SwitchListItem[]>(() => {
  return parsedTables.value.map(t => ({
    key: t.key,
    label: t.template.name,
  }));
});

// ============================================================
// Watch & Lifecycle
// ============================================================

// 当弹窗打开时重置状态
watch(
  () => props.visible,
  visible => {
    if (visible) {
      jsonInput.value = '';
      selectedFileName.value = '';
      parseError.value = '';
      parsedTables.value = [];
      selectedTableKeys.value = [];
      mode.value = 'paste';
    }
  },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleClose();
});

// ============================================================
// Methods
// ============================================================

// 解析 JSON
function parseJson() {
  parseError.value = '';
  parsedTables.value = [];
  selectedTableKeys.value = [];

  if (!jsonInput.value.trim()) {
    parseError.value = '请输入 JSON 内容';
    return;
  }

  try {
    const data = JSON.parse(jsonInput.value);
    extractTables(data);
  } catch (e) {
    parseError.value = `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// 处理文件选择
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  selectedFileName.value = file.name;
  parseError.value = '';
  parsedTables.value = [];
  selectedTableKeys.value = [];

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);
      extractTables(data);
    } catch (err) {
      parseError.value = `文件解析失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  reader.onerror = () => {
    parseError.value = '文件读取失败';
  };
  reader.readAsText(file);
}

// 从 JSON 中提取表格
function extractTables(data: any) {
  if (!data || typeof data !== 'object') {
    parseError.value = '无效的 JSON 格式';
    return;
  }

  const tables: ParsedTable[] = [];

  // 遍历所有 sheet_ 开头的键
  for (const key of Object.keys(data)) {
    if (!key.startsWith('sheet_')) continue;

    const sheet = data[key];
    if (!sheet || typeof sheet !== 'object') continue;

    // 验证必要字段
    if (!sheet.name || !Array.isArray(sheet.content)) {
      console.warn(`[ACU] 跳过无效表格: ${key}`);
      continue;
    }

    tables.push({
      key,
      template: sheet as SheetTemplate,
    });
  }

  if (tables.length === 0) {
    parseError.value = '未找到有效的表格定义 (需要 sheet_xxx 格式的键)';
    return;
  }

  parsedTables.value = tables;

  // 如果只有一个表格，自动选中
  if (tables.length === 1) {
    selectedTableKeys.value = [tables[0].key];
  }

  toast.success(`解析成功，找到 ${tables.length} 个表格`);
}

// 关闭弹窗
function handleClose() {
  emit('update:visible', false);
}

// 确认添加
function handleConfirm() {
  if (selectedTableKeys.value.length === 0) return;

  const tablesToAdd = parsedTables.value.filter(t => selectedTableKeys.value.includes(t.key)).map(t => t.template);

  emit('confirm', tablesToAdd);
  handleClose();
}
</script>
