<template>
  <div v-if="visible" class="acu-modal-container" @click.self="close">
    <div class="acu-modal" style="max-width: 500px">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">导演控制台</span>
        <button class="acu-close-pill" @click.stop="close">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 表格模板设置 -->
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            表格模板
            <span class="hint">切换游戏数据结构</span>
          </div>
          <div class="acu-settings-control" style="display: flex; gap: 8px; align-items: center">
            <select class="acu-select" :value="currentTemplate" style="flex: 1" @change="handleTemplateChange">
              <option value="" disabled>选择模板...</option>
              <option v-for="name in templatePresets" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <button class="acu-tool-btn" title="粘贴导入模板配置" @click.stop="handleImportTemplate">
              <i class="fas fa-file-import"></i>
            </button>
          </div>
        </div>

        <!-- 剧情推进设置 -->
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            剧情推进
            <span class="hint">切换 AI 叙事风格</span>
          </div>
          <div class="acu-settings-control" style="display: flex; gap: 8px; align-items: center">
            <select class="acu-select" :value="currentPlot" style="flex: 1" @change="handlePlotChange">
              <option value="" disabled>选择预设...</option>
              <option v-for="name in plotPresets" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <button class="acu-tool-btn" title="粘贴导入剧情预设" @click.stop="handleImportPlot">
              <i class="fas fa-file-import"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { toast } from '../../../composables';
import { useUIStore } from '../../../stores/useUIStore';

const uiStore = useUIStore();

// Props & Emits
const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'close'): void;
}>();

// State
const templatePresets = ref<string[]>([]);
const plotPresets = ref<string[]>([]);
const currentTemplate = ref('');
const currentPlot = ref('');

// Methods
const close = () => {
  emit('update:visible', false);
  emit('close');
};

const loadData = async (retries = 0) => {
  console.log('[DirectorDialog] loadData called, attempt:', retries + 1);

  // 尝试从当前窗口或父窗口获取 API
  const api = window.AutoCardUpdaterAPI || (window.parent as any).AutoCardUpdaterAPI;

  if (!api) {
    console.warn('[DirectorDialog] AutoCardUpdaterAPI not found.');
    if (retries < 5) {
      setTimeout(() => loadData(retries + 1), 200);
    } else {
      toast.error('API 初始化失败，无法加载数据。');
    }
    return;
  }

  // 加载模板列表
  try {
    const templates = api.getTemplatePresetNames() || [];
    templatePresets.value = templates;
    console.log('[DirectorDialog] Templates loaded:', templates);
  } catch (e) {
    console.error('[DirectorDialog] Failed to load template presets:', e);
  }

  // 加载剧情预设列表
  try {
    const plots = api.getPlotPresetNames() || [];
    plotPresets.value = plots;
    const current = api.getCurrentPlotPreset() || '';
    currentPlot.value = current;
    console.log('[DirectorDialog] Plots loaded:', plots, 'Current:', current);
  } catch (e) {
    console.error('[DirectorDialog] Failed to load plot presets:', e);
  }
};

// Watch visibility to reload data
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      // 每次打开时，如果数据为空或者想刷新，都重新加载
      // 这里简单起见每次都重试
      loadData();
    }
  },
);

// Handlers
const handleTemplateChange = async (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const name = target.value;
  const api = window.AutoCardUpdaterAPI || (window.parent as any).AutoCardUpdaterAPI;

  if (!name || !api) return;

  try {
    const result = await api.switchTemplatePreset(name);
    if (result.success) {
      currentTemplate.value = name;
      toast.success(result.message);
    } else {
      toast.error(result.message);
      // 恢复选择
      target.value = currentTemplate.value;
    }
  } catch (e: any) {
    toast.error('切换模板失败: ' + e.message);
  }
};

const handlePlotChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const name = target.value;
  const api = window.AutoCardUpdaterAPI || (window.parent as any).AutoCardUpdaterAPI;

  if (!name || !api) return;

  try {
    const success = api.switchPlotPreset(name);
    if (success) {
      currentPlot.value = name;
      toast.success(`已切换剧情风格: ${name}`);
    } else {
      toast.error('切换剧情风格失败');
      target.value = currentPlot.value;
    }
  } catch (e: any) {
    toast.error('切换剧情风格失败: ' + e.message);
  }
};

const handleImportTemplate = async () => {
  const input = prompt('请粘贴表格模板配置 (JSON):');
  if (!input || !input.trim()) return;

  const api = window.AutoCardUpdaterAPI || (window.parent as any).AutoCardUpdaterAPI;
  if (!api) return;

  try {
    const result = await api.importTemplateFromData(input);
    if (result.success) {
      toast.success(result.message);
      loadData(); // 刷新列表
    } else {
      toast.error(result.message);
    }
  } catch (e: any) {
    toast.error('导入失败: ' + e.message);
  }
};

const handleImportPlot = async () => {
  const input = prompt('请粘贴剧情推进预设 (JSON):');
  if (!input || !input.trim()) return;

  const api = window.AutoCardUpdaterAPI || (window.parent as any).AutoCardUpdaterAPI;
  if (!api) return;

  try {
    const result = await api.importPlotPresetFromData(input, { switchTo: true });
    if (result.success) {
      toast.success(result.message);
      loadData(); // 刷新列表
      if (result.presetName) {
        currentPlot.value = result.presetName;
      }
    } else {
      toast.error(result.message);
    }
  } catch (e: any) {
    toast.error('导入失败: ' + e.message);
  }
};

onMounted(() => {
  if (props.visible) {
    loadData();
  }
});
</script>
