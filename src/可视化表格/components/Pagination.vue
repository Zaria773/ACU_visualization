<template>
  <div class="acu-pagination">
    <!-- 左侧：页码信息 -->
    <div class="acu-pagination-info">
      <span class="acu-pagination-current">
        第 <strong>{{ currentPage }}</strong> / {{ totalPages }} 页
      </span>
      <span v-if="showTotal" class="acu-pagination-total"> (共 {{ totalItems }} 条) </span>
    </div>

    <!-- 中间：分页控制 -->
    <div class="acu-pagination-controls">
      <!-- 首页按钮 -->
      <button
        class="acu-btn acu-btn-icon"
        :class="{ disabled: currentPage <= 1 }"
        :disabled="currentPage <= 1"
        title="首页"
        @click="goToPage(1)"
      >
        <i class="fas fa-angle-double-left"></i>
      </button>

      <!-- 上一页按钮 -->
      <button
        class="acu-btn acu-btn-icon"
        :class="{ disabled: currentPage <= 1 }"
        :disabled="currentPage <= 1"
        title="上一页"
        @click="goToPage(currentPage - 1)"
      >
        <i class="fas fa-angle-left"></i>
      </button>

      <!-- 页码列表 -->
      <div class="acu-page-list">
        <template v-for="(page, index) in pageList" :key="index">
          <!-- 省略号 -->
          <span v-if="page === '...'" class="acu-page-ellipsis">
            <i class="fas fa-ellipsis-h"></i>
          </span>
          <!-- 页码按钮 -->
          <button
            v-else
            class="acu-btn acu-btn-page"
            :class="{ active: page === currentPage }"
            @click="goToPage(page as number)"
          >
            {{ page }}
          </button>
        </template>
      </div>

      <!-- 下一页按钮 -->
      <button
        class="acu-btn acu-btn-icon"
        :class="{ disabled: currentPage >= totalPages }"
        :disabled="currentPage >= totalPages"
        title="下一页"
        @click="goToPage(currentPage + 1)"
      >
        <i class="fas fa-angle-right"></i>
      </button>

      <!-- 末页按钮 -->
      <button
        class="acu-btn acu-btn-icon"
        :class="{ disabled: currentPage >= totalPages }"
        :disabled="currentPage >= totalPages"
        title="末页"
        @click="goToPage(totalPages)"
      >
        <i class="fas fa-angle-double-right"></i>
      </button>
    </div>

    <!-- 右侧：跳转输入（可选） -->
    <div v-if="showJumper" class="acu-pagination-jump">
      <span>跳至</span>
      <input
        v-model.number="jumpPage"
        type="number"
        min="1"
        :max="totalPages"
        class="acu-input-sm"
        @keydown.enter="handleJump"
        @blur="validateJumpPage"
      />
      <span>页</span>
      <button class="acu-btn acu-btn-sm" @click="handleJump">GO</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Pagination 分页器组件
 *
 * 功能：
 * - 显示页码列表（带省略号）
 * - 首页/末页快捷按钮
 * - 上一页/下一页按钮
 * - 显示当前页/总页数信息
 * - 支持跳转到指定页
 *
 * 智能页码算法：
 * - 始终显示首页和末页
 * - 当前页附近显示连续页码
 * - 其他位置用省略号表示
 */

import { ref, computed, watch } from 'vue';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 当前页码 (1-indexed) */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 总条目数 */
  totalItems: number;
  /** 最大可见页码数 (不含省略号和首末页) */
  maxVisiblePages?: number;
  /** 是否显示总条目数 */
  showTotal?: boolean;
  /** 是否显示跳转输入框 */
  showJumper?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  maxVisiblePages: 5,
  showTotal: true,
  showJumper: true,
});

const emit = defineEmits<{
  /** 更新当前页 (v-model) */
  'update:currentPage': [page: number];
  /** 页码变化事件 */
  pageChange: [page: number];
}>();

// ============================================================
// Refs
// ============================================================

/** 跳转页码输入值 */
const jumpPage = ref(props.currentPage);

// ============================================================
// Computed
// ============================================================

/**
 * 生成页码列表（带省略号）
 * 算法说明：
 * 1. 页数较少时，全部显示
 * 2. 页数较多时：
 *    - 始终显示第1页
 *    - 始终显示最后1页
 *    - 当前页附近显示 maxVisiblePages 个连续页码
 *    - 其他位置用 '...' 表示
 */
const pageList = computed(() => {
  const pages: (number | string)[] = [];
  const total = props.totalPages;
  const current = props.currentPage;
  const maxVisible = props.maxVisiblePages;

  // 边界处理：总页数为 0 或 1
  if (total <= 0) {
    return [1];
  }

  if (total === 1) {
    return [1];
  }

  // 总页数较少，全部显示
  if (total <= maxVisible + 2) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  }

  // 计算中间页码范围
  const halfVisible = Math.floor(maxVisible / 2);
  let start = Math.max(2, current - halfVisible);
  let end = Math.min(total - 1, current + halfVisible);

  // 调整范围确保显示足够多的页码
  const visibleCount = end - start + 1;
  if (visibleCount < maxVisible) {
    if (start === 2) {
      // 靠近开头，向后扩展
      end = Math.min(total - 1, start + maxVisible - 1);
    } else if (end === total - 1) {
      // 靠近末尾，向前扩展
      start = Math.max(2, end - maxVisible + 1);
    }
  }

  // 构建页码列表
  // 始终显示第一页
  pages.push(1);

  // 添加前省略号
  if (start > 2) {
    pages.push('...');
  }

  // 添加中间页码
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // 添加后省略号
  if (end < total - 1) {
    pages.push('...');
  }

  // 始终显示最后一页
  pages.push(total);

  return pages;
});

// ============================================================
// Watchers
// ============================================================

// 同步外部 currentPage 变化到跳转输入框
watch(
  () => props.currentPage,
  newPage => {
    jumpPage.value = newPage;
  },
);

// ============================================================
// Methods
// ============================================================

/**
 * 跳转到指定页码
 * @param page 目标页码
 */
const goToPage = (page: number) => {
  // 边界检查
  if (page < 1 || page > props.totalPages) {
    return;
  }

  // 避免重复触发
  if (page === props.currentPage) {
    return;
  }

  // 触发事件
  emit('update:currentPage', page);
  emit('pageChange', page);

  // 同步跳转输入框
  jumpPage.value = page;
};

/**
 * 验证跳转页码输入
 */
const validateJumpPage = () => {
  if (!jumpPage.value || jumpPage.value < 1) {
    jumpPage.value = 1;
  } else if (jumpPage.value > props.totalPages) {
    jumpPage.value = props.totalPages;
  }
  // 确保是整数
  jumpPage.value = Math.floor(jumpPage.value);
};

/**
 * 处理跳转
 */
const handleJump = () => {
  validateJumpPage();
  goToPage(jumpPage.value);
};

// ============================================================
// Expose
// ============================================================

defineExpose({
  /** 跳转到指定页 */
  goToPage,
  /** 跳转到首页 */
  goToFirst: () => goToPage(1),
  /** 跳转到末页 */
  goToLast: () => goToPage(props.totalPages),
  /** 上一页 */
  goPrev: () => goToPage(props.currentPage - 1),
  /** 下一页 */
  goNext: () => goToPage(props.currentPage + 1),
});
</script>

<!-- 样式已迁移到 styles/components/pagination.scss -->
