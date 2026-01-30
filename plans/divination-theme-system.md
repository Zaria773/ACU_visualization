# 抽签卡面主题系统设计计划

## 📋 需求分析

**现状问题**：
- 当前只有一套和风御札风格卡面（CardFront.vue + CardBack.vue）
- 样式硬编码在 divination.scss 中
- 用户想添加多种卡面风格（如 mystic-fate 神秘塔罗）
- 需要低耦合、易扩展的架构

**目标**：
1. 支持多主题切换（和风御札、神秘塔罗等）
2. 每个主题独立目录，互不影响
3. 添加新主题只需新建目录 + 注册
4. 所有主题遵循统一接口规范

---

## 🏗️ 架构设计

### 目录结构

```
src/可视化表格/
├── components/
│   └── dialogs/
│       └── divination/
│           ├── index.ts                    # 导出
│           ├── types.ts                    # 公共类型（CardDisplayData 等）
│           ├── DivinationOverlay.vue       # 主界面
│           ├── TarotCard.vue               # 🔄 改为动态组件容器
│           ├── PromptEditorDialog.vue      # 提示词编辑器
│           │
│           └── themes/                     # 🆕 主题目录
│               ├── index.ts                # 主题注册表
│               ├── types.ts                # 主题接口定义
│               │
│               ├── wafuku/                 # 和风御札（重构现有）
│               │   ├── index.ts            # 导出组件
│               │   ├── CardFront.vue       # 移动自原位置
│               │   ├── CardBack.vue        # 移动自原位置
│               │   └── CornerOrnament.vue  # 移动自原位置
│               │
│               └── mystic/                 # 🆕 神秘塔罗
│                   ├── index.ts            # 导出组件
│                   ├── CardFront.vue       # 从 mystic-fate 移植
│                   └── CardBack.vue        # 从 mystic-fate 移植
│
├── styles/
│   └── overlays/
│       ├── divination.scss                 # 🔄 仅保留公共样式
│       └── divination-themes/              # 🆕 主题样式目录
│           ├── _index.scss                 # 统一导入
│           ├── _wafuku.scss                # 和风主题样式
│           └── _mystic.scss                # 神秘主题样式
```

### 类型定义

```typescript
// themes/types.ts
import type { Component } from 'vue';

/** 卡面主题定义 */
export interface CardTheme {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 预览图 URL（用于设置面板） */
  previewImage?: string;
  /** 默认卡背图 URL */
  defaultBackImage?: string;
  /** 卡面组件 */
  CardFront: Component;
  /** 卡背组件 */
  CardBack: Component;
}

/** CardFront 组件统一 Props */
export interface CardFrontProps {
  luckName: string;
  luckColor?: string;
  dimensions?: string[];
  words: string[];
}

/** CardBack 组件统一 Props */
export interface CardBackProps {
  imageUrl?: string;
}

/** CardBack 组件 Emits */
export interface CardBackEmits {
  (e: 'load', aspectRatio: number): void;
}
```

### 主题注册机制

```typescript
// themes/index.ts
import type { CardTheme } from './types';

// 懒加载导入各主题
const wafukuTheme: CardTheme = {
  id: 'wafuku',
  name: '和风御札',
  description: '传统日式御札风格，素雅淡黄纸质',
  defaultBackImage: 'https://i.postimg.cc/j2MPbGv3/IMG-1590.jpg',
  CardFront: () => import('./wafuku/CardFront.vue'),
  CardBack: () => import('./wafuku/CardBack.vue'),
};

const mysticTheme: CardTheme = {
  id: 'mystic',
  name: '神秘塔罗',
  description: '西方塔罗风格，深蓝底金装饰',
  defaultBackImage: 'https://i.postimg.cc/rmY9D1fL/wei-xin-tu-pian-20260121220508-79-297.jpg',
  CardFront: () => import('./mystic/CardFront.vue'),
  CardBack: () => import('./mystic/CardBack.vue'),
};

/** 所有已注册主题 */
export const CARD_THEMES: Record<string, CardTheme> = {
  wafuku: wafukuTheme,
  mystic: mysticTheme,
};

/** 获取主题，不存在则返回默认 */
export function getTheme(id: string): CardTheme {
  return CARD_THEMES[id] || CARD_THEMES.wafuku;
}

/** 获取所有主题列表（用于设置面板） */
export function getAllThemes(): CardTheme[] {
  return Object.values(CARD_THEMES);
}
```

### TarotCard.vue 改造

```vue
<template>
  <div
    class="tarot-card"
    :class="[
      `tarot-card--theme-${themeId}`,
      { 'tarot-card--flipped': isFlipped }
    ]"
    :style="cardStyle"
    @click.stop="handleClick"
  >
    <div class="tarot-card__inner">
      <!-- 卡背 -->
      <div class="tarot-card__face tarot-card__back">
        <component
          :is="theme.CardBack"
          :image-url="effectiveBackImage"
          @load="handleCardBackLoad"
        />
      </div>

      <!-- 卡面 -->
      <div class="tarot-card__face tarot-card__front">
        <component
          :is="theme.CardFront"
          v-if="displayData"
          :luck-name="displayData.luckName"
          :luck-color="displayData.luckColor"
          :dimensions="displayData.dimensions"
          :words="displayData.words"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getTheme } from './themes';
import type { DivinationResult } from '../../../types';
import type { CardDisplayData } from './types';

interface Props {
  /** 主题 ID */
  themeId?: string;
  /** 是否已翻转 */
  isFlipped: boolean;
  /** 抽签结果 */
  result: DivinationResult | null;
  /** 自定义卡背图（优先级高于主题默认） */
  cardBackImage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  themeId: 'wafuku',
  cardBackImage: '',
});

// 获取当前主题
const theme = computed(() => getTheme(props.themeId));

// 计算实际使用的卡背图
const effectiveBackImage = computed(() => {
  return props.cardBackImage || theme.value.defaultBackImage || '';
});

// ... 其余逻辑保持不变
</script>
```

### Store 配置更新

```typescript
// useDivinationStore.ts
const DEFAULT_CONFIG: DivinationConfig = {
  // ...现有配置
  themeId: 'wafuku',      // 🆕 默认主题
  cardBackImage: '',       // 现有：自定义卡背
};
```

### 设置面板更新

在 DivinationPanel.vue 中添加主题选择器：

```vue
<!-- 主题选择 -->
<div class="acu-settings-section">
  <div class="acu-settings-title">
    <i class="fas fa-palette"></i>
    卡面主题
  </div>
  <div class="acu-settings-group">
    <div class="acu-settings-row">
      <div class="acu-settings-label">
        选择主题
        <span class="hint">卡面和卡背的整体风格</span>
      </div>
      <div class="acu-settings-control">
        <select v-model="config.themeId" class="acu-select">
          <option v-for="t in themes" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
      </div>
    </div>
  </div>
</div>
```

---

## 📝 实施步骤

### 阶段 1：创建主题框架
1. 创建 `themes/` 目录结构
2. 创建 `themes/types.ts` 定义接口
3. 创建 `themes/index.ts` 注册机制

### 阶段 2：重构现有主题为 wafuku
1. 移动 `CardFront.vue` → `themes/wafuku/CardFront.vue`
2. 移动 `CardBack.vue` → `themes/wafuku/CardBack.vue`
3. 移动 `CornerOrnament.vue` → `themes/wafuku/CornerOrnament.vue`
4. 创建 `themes/wafuku/index.ts`
5. 分离样式到 `divination-themes/_wafuku.scss`

### 阶段 3：移植 mystic 主题
1. 将 `.kilocode/mystic-fate-_-命运之轮 (1)/components/Card.tsx` 转为 Vue
2. 创建 `themes/mystic/CardFront.vue`
3. 创建 `themes/mystic/CardBack.vue`
4. Tailwind → SCSS 样式转换
5. 创建 `divination-themes/_mystic.scss`

### 阶段 4：更新容器组件
1. 修改 `TarotCard.vue` 使用动态组件
2. 更新 `DivinationOverlay.vue` 传递 themeId

### 阶段 5：更新配置系统
1. 更新 `useDivinationStore` 添加 themeId
2. 更新设置面板添加主题选择器

### 阶段 6：更新文档
1. 更新 `ACU_DEV_GUIDE.md` 文件结构
2. 更新 `STYLE_INDEX.md`

---

## ✅ 验收标准

- [ ] 默认显示和风御札主题
- [ ] 可在设置中切换到神秘塔罗主题
- [ ] 切换主题后立即生效（无需重新抽签）
- [ ] 自定义卡背图优先于主题默认
- [ ] 添加新主题只需：
  1. 创建 `themes/<name>/` 目录
  2. 实现 CardFront + CardBack 组件
  3. 在 `themes/index.ts` 注册
  4. 创建对应样式文件

---

## 🔗 参考

- 现有和风主题：`src/可视化表格/components/dialogs/divination/CardFront.vue`
- mystic-fate 源码：`.kilocode/mystic-fate-_-命运之轮 (1)/components/Card.tsx`
- 样式文件：`src/可视化表格/styles/overlays/divination.scss`
