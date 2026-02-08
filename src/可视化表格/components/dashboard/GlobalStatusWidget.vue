<template>
  <div
    class="acu-global-widget"
    :class="{ 'is-editing': isEditing, 'acu-dash-interactive': !isEditing }"
    @click.stop="handleWidgetClick"
  >
    <!-- 头部区域 (Location + Time) -->
    <div class="acu-global-header">
      <!-- Location (H1) -->
      <div v-if="locationText" class="acu-global-location">
        <i class="fas fa-map-marker-alt"></i>
        <div class="location-path">
          <template v-for="(part, index) in locationParts" :key="index">
            <span class="location-part">{{ part }}</span>
            <span v-if="index < locationParts.length - 1" class="location-sep">›</span>
          </template>
        </div>
      </div>

      <!-- Time Group -->
      <div v-if="timeData.current || timeData.passed || timeData.last" class="acu-global-time-group">
        <!-- Current Time -->
        <div v-if="timeData.current" class="acu-global-time-primary">
          <i class="fas fa-clock"></i>
          <span>{{ timeData.current }}</span>
        </div>

        <!-- Secondary Times -->
        <div class="acu-global-time-secondary">
          <!-- Passed Time Badge -->
          <span v-if="timeData.passed" class="acu-badge-outline is-highlight">
            <i class="fas fa-hourglass-half"></i>
            {{ timeData.passed }}
          </span>
          <!-- Last Time -->
          <span v-if="timeData.last" class="acu-badge-outline" title="上轮时间">
            <i class="fas fa-history"></i>
            {{ timeData.last }}
          </span>
        </div>
      </div>
    </div>

    <!-- 内容区域 (Body) -->
    <div class="acu-global-body">
      <!-- 天气模块 -->
      <div v-if="weatherData" class="acu-global-item layout-inline">
        <div class="item-icon">
          <i :class="['fas', getWeatherIcon(weatherData.value)]"></i>
        </div>
        <div class="item-content">
          <div class="item-label">{{ weatherData.label }}</div>
          <div class="item-value">{{ weatherData.value }}</div>
        </div>
      </div>

      <!-- 其他属性 (流式排版) -->
      <div
        v-for="attr in attributes"
        :key="attr.key"
        class="acu-global-item"
        :class="attr.isLong ? 'layout-block' : 'layout-inline'"
      >
        <div class="item-icon">
          <i :class="['fas', getAttributeIcon(attr.key)]"></i>
        </div>
        <div class="item-content">
          <div class="item-label">{{ attr.key }}</div>
          <div class="item-value">{{ attr.value }}</div>
        </div>
      </div>

      <!-- 人物列表 (Tag Group) -->
      <div v-if="peopleCol && peopleList.length > 0" class="acu-global-item layout-inline people-group">
        <div class="item-icon">
          <i class="fas fa-users"></i>
        </div>
        <div class="item-content">
          <div class="item-label">{{ peopleCol.key }}</div>
          <div class="acu-global-person-list">
            <div v-for="(person, idx) in peopleList" :key="idx" class="person-tag">
              {{ person }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部区域 (Footer: System Notice / Long Text) -->
    <div v-if="footerData" class="acu-global-footer">
      <div class="acu-global-item layout-block system-notice">
        <div class="item-icon">
          <i :class="['fas', getAttributeIcon(footerData.key)]"></i>
        </div>
        <div class="item-content">
          <div class="item-label">{{ footerData.key }}</div>
          <div class="item-value">{{ footerData.value }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProcessedTable, TableCell, TableRow } from '../../types';

interface Props {
  tableData: ProcessedTable | null;
  isEditing: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'row-click': [row: TableRow];
}>();

// ============================================================
// Smart Parser Logic
// ============================================================

// 提取第一行数据 (Global 表通常只有一行)
const firstRow = computed(() => {
  if (!props.tableData || props.tableData.rows.length === 0) return null;
  return props.tableData.rows[0];
});

// 解析结果容器
const parsedData = computed(() => {
  const row = firstRow.value;
  if (!row) return null;

  const result = {
    locationCols: [] as TableCell[],
    timeCols: {
      current: null as TableCell | null,
      passed: null as TableCell | null,
      last: null as TableCell | null,
    },
    weatherCol: null as TableCell | null,
    peopleCol: null as TableCell | null,
    attributes: [] as TableCell[],
    footer: null as TableCell | null,
  };

  // 1. 遍历所有单元格进行归类
  row.cells.forEach(cell => {
    const key = cell.key.toLowerCase();
    const valueStr = String(cell.value || '');
    if (!valueStr) return; // 跳过空值

    // Time: 优先匹配时间
    if (['时', 'time', 'date', 'clock'].some(k => key.includes(k))) {
      if (['流逝', '经过', 'passed', 'elapse'].some(k => key.includes(k))) {
        result.timeCols.passed = cell;
      } else if (['上轮', 'last', 'prev'].some(k => key.includes(k))) {
        result.timeCols.last = cell;
      } else if (!result.timeCols.current || key.length < result.timeCols.current.key.length) {
        // 如果已经有 Current，且当前列名更像 Current (更短)，则替换
        // 或者如果还没有 Current

        // 旧的 Current 降级为 Attribute
        if (result.timeCols.current) result.attributes.push(result.timeCols.current);
        result.timeCols.current = cell;
      } else {
        result.attributes.push(cell);
      }
      return;
    }

    // Location: 排除已识别的时间列后匹配地点 (并排除"在场"，防止人物列被误判)
    if (['场', '地', '位置', 'loc', 'place', 'area', 'zone'].some(k => key.includes(k)) && !key.includes('在场')) {
      result.locationCols.push(cell);
      return;
    }

    // Weather
    if (['天', '气', 'weather', 'climate'].some(k => key.includes(k))) {
      result.weatherCol = cell;
      return;
    }

    // People
    if (['人', 'npc', 'chara', '在场', 'role'].some(k => key.includes(k))) {
      result.peopleCol = cell;
      return;
    }

    // Attributes (剩余列)
    result.attributes.push(cell);
  });

  // 2. 二次处理 Attributes -> 分离 Footer (超长文本)
  // 找最长的那个且长度 > 30 作为 Footer
  let maxLen = 0;
  let footerIdx = -1;

  result.attributes.forEach((attr, idx) => {
    const len = String(attr.value).length;
    // 优先匹配“系统”、“通知”类
    const isSystem = ['系', '统', '知', 'sys', 'info'].some(k => attr.key.toLowerCase().includes(k));

    if (isSystem || (len > 30 && len > maxLen)) {
      maxLen = len;
      footerIdx = idx;
    }
  });

  if (footerIdx !== -1) {
    result.footer = result.attributes[footerIdx];
    result.attributes.splice(footerIdx, 1);
  }

  return result;
});

// ============================================================
// Display Helpers
// ============================================================

// Location Display
const locationText = computed(() => {
  const cols = parsedData.value?.locationCols;
  if (!cols || cols.length === 0) return '';
  // 按列索引排序
  return cols
    .sort((a, b) => a.colIndex - b.colIndex)
    .map(c => c.value)
    .join(' › ');
});

const locationParts = computed(() => {
  const cols = parsedData.value?.locationCols;
  if (!cols || cols.length === 0) return [];
  return cols.sort((a, b) => a.colIndex - b.colIndex).map(c => c.value);
});

// Time Display
const timeData = computed(() => ({
  current: parsedData.value?.timeCols.current?.value,
  passed: parsedData.value?.timeCols.passed?.value,
  last: parsedData.value?.timeCols.last?.value,
}));

// Weather Display
const weatherData = computed(() => {
  const col = parsedData.value?.weatherCol;
  if (!col) return null;
  return { label: col.key, value: String(col.value) };
});

function getWeatherIcon(value: string): string {
  const v = value.toLowerCase();
  if (v.includes('晴') || v.includes('sun') || v.includes('clear')) return 'fa-sun';
  if (v.includes('阴') || v.includes('cloud') || v.includes('overcast')) return 'fa-cloud';
  if (v.includes('雨') || v.includes('rain')) return 'fa-cloud-showers-heavy';
  if (v.includes('雪') || v.includes('snow')) return 'fa-snowflake';
  if (v.includes('雷') || v.includes('thunder') || v.includes('storm')) return 'fa-bolt';
  if (v.includes('雾') || v.includes('fog') || v.includes('mist')) return 'fa-smog';
  if (v.includes('风') || v.includes('wind')) return 'fa-wind';
  if (v.includes('台风') || v.includes('hurricane')) return 'fa-hurricane';
  return 'fa-cloud-sun';
}

// People Display
const peopleCol = computed(() => parsedData.value?.peopleCol);

const peopleList = computed(() => {
  const col = peopleCol.value;
  if (!col || !col.value) return [];
  // 分割字符串
  return String(col.value)
    .split(/[,，、/&]/)
    .map(s => s.trim())
    .filter(s => s);
});

// Attributes Display
const attributes = computed(() => {
  if (!parsedData.value) return [];
  return parsedData.value.attributes.map(cell => ({
    key: cell.key,
    value: String(cell.value),
    isLong: String(cell.value).length > 15,
  }));
});

const footerData = computed(() => {
  const col = parsedData.value?.footer;
  if (!col) return null;
  return { key: col.key, value: String(col.value) };
});

function getAttributeIcon(key: string): string {
  const k = key.toLowerCase();
  if (['金', '钱', '币', 'money', 'gold', 'coin'].some(w => k.includes(w))) return 'fa-coins';
  if (['系', '统', '知', 'sys', 'info', 'notice'].some(w => k.includes(w))) return 'fa-bell';
  if (['态', 'state', 'status', 'hp', 'mp'].some(w => k.includes(w))) return 'fa-heart-pulse';
  if (['级', 'level', 'lv', 'rank'].some(w => k.includes(w))) return 'fa-layer-group';
  return 'fa-info-circle';
}

function handleWidgetClick() {
  if (props.isEditing) return;
  if (firstRow.value) {
    emit('row-click', firstRow.value);
  }
}
</script>
