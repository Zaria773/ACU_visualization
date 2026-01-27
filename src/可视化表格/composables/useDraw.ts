/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 运势抽取 Composable
 *
 * 功能：根据权重随机抽取运势档位
 *
 * @example
 * ```typescript
 * import { drawLuck, DEFAULT_LUCK_TIERS, calculateProbabilities } from './useDraw';
 *
 * // 使用默认档位抽签
 * const result = drawLuck(DEFAULT_LUCK_TIERS);
 * console.log(`抽到: ${result.name}`);
 *
 * // 计算各档位概率
 * const probs = calculateProbabilities(DEFAULT_LUCK_TIERS);
 * probs.forEach((prob, id) => console.log(`${id}: ${prob.toFixed(1)}%`));
 * ```
 */

// ============================================
// 类型定义
// ============================================

/**
 * 运势档位
 */
export interface LuckTier {
  /** 唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 权重值（用于计算抽中概率） */
  weight: number;
  /** 注入的提示词内容 */
  prompt: string;
}

// ============================================
// 预设运势档位（7档）
// ============================================

/**
 * 默认运势档位列表
 *
 * 概率分布：
 * - 超吉大成功: 5%
 * - 大吉: 15%
 * - 小吉: 20%
 * - 平: 20%
 * - 小凶: 20%
 * - 大凶: 15%
 * - 凶残大失败: 5%
 */
export const DEFAULT_LUCK_TIERS: LuckTier[] = [
  {
    id: 'superLucky',
    name: '超吉大成功',
    weight: 5,
    color: '#ffd700',
    prompt:
      '奇迹降临。无论多么不可能的事情都将完美实现，环境会以超自然的方式主动配合主角，甚至原本的敌人也会因各种离奇原因成为助力。',
  },
  {
    id: 'lucky',
    name: '大吉',
    weight: 15,
    color: '#fbc02d',
    prompt:
      '命运此刻站在主角这边。请安排惊人的巧合或好运，让环境主动配合主角的行动，一切阻碍都应奇迹般地自行化解。',
  },
  {
    id: 'slightlyLucky',
    name: '小吉',
    weight: 20,
    color: '#e6b000',
    prompt: '剧情走向应平稳顺滑。让行动得到积极的反馈，即便有微小的波折，也是为了衬托最终的成功。',
  },
  {
    id: 'neutral',
    name: '平',
    weight: 20,
    color: '#808080',
    prompt: '请保持绝对客观中立。严格遵循现实逻辑和物理法则，不偏袒任何人，成败完全取决于操作的可行性。',
  },
  {
    id: 'slightlyUnlucky',
    name: '小凶',
    weight: 20,
    color: '#ffa07a',
    prompt: '制造一些令人烦躁的摩擦。让事情无法一次性做成，或者引入外界干扰（噪音、打滑、误解）来拖慢节奏。',
  },
  {
    id: 'unlucky',
    name: '大凶',
    weight: 15,
    color: '#ff6347',
    prompt: '墨菲定律生效：如果事情可能变糟，它就必须变糟。请让环境充满敌意，用恶劣的意外狠狠打断主角的计划。',
  },
  {
    id: 'superUnlucky',
    name: '凶残大失败',
    weight: 5,
    color: '#8b0000',
    prompt:
      '灾难性的连锁反应。最坏的情况不仅发生了，还会引发更多的灾难。请描写令人绝望的、接二连三的厄运，让主角陷入前所未有的困境。',
  },
];

// ============================================
// 核心函数
// ============================================

/**
 * 根据权重随机抽取一个运势档位
 *
 * 算法说明：
 * 1. 计算所有档位的权重总和
 * 2. 生成 [0, 总和) 范围内的随机数
 * 3. 遍历档位，依次减去各档位权重
 * 4. 当随机数 <= 0 时，返回当前档位
 *
 * @param tiers - 运势档位列表
 * @returns 抽中的运势档位
 *
 * @example
 * ```typescript
 * const result = drawLuck(DEFAULT_LUCK_TIERS);
 * console.log(`抽到了: ${result.name} (${result.color})`);
 * ```
 */
export function drawLuck(tiers: LuckTier[]): LuckTier {
  if (tiers.length === 0) {
    throw new Error('[drawLuck] 运势档位列表不能为空');
  }

  const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0);

  if (totalWeight <= 0) {
    throw new Error('[drawLuck] 权重总和必须大于 0');
  }

  let random = Math.random() * totalWeight;

  for (const tier of tiers) {
    random -= tier.weight;
    if (random <= 0) {
      return tier;
    }
  }

  // 理论上不会到达这里，但作为兜底返回最后一个
  return tiers[tiers.length - 1];
}

/**
 * 计算各档位的概率百分比
 *
 * @param tiers - 运势档位列表
 * @returns Map，key 为档位 id，value 为概率百分比 (0-100)
 *
 * @example
 * ```typescript
 * const probs = calculateProbabilities(DEFAULT_LUCK_TIERS);
 * // Map { 'superLucky' => 5, 'lucky' => 15, ... }
 * ```
 */
export function calculateProbabilities(tiers: LuckTier[]): Map<string, number> {
  const total = tiers.reduce((sum, t) => sum + t.weight, 0);
  const probs = new Map<string, number>();

  if (total <= 0) {
    // 所有权重为0时，返回空Map
    return probs;
  }

  for (const tier of tiers) {
    probs.set(tier.id, (tier.weight / total) * 100);
  }

  return probs;
}

/**
 * 获取档位的概率百分比（带格式化）
 *
 * @param tier - 运势档位
 * @param allTiers - 所有档位列表
 * @param decimals - 小数位数，默认1位
 * @returns 格式化的百分比字符串，如 "15.0%"
 */
export function getTierProbability(tier: LuckTier, allTiers: LuckTier[], decimals = 1): string {
  const total = allTiers.reduce((sum, t) => sum + t.weight, 0);
  if (total <= 0) return '0%';

  const percentage = (tier.weight / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * 验证档位列表是否有效
 *
 * @param tiers - 运势档位列表
 * @returns 验证结果和错误信息
 */
export function validateLuckTiers(tiers: LuckTier[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(tiers)) {
    return { valid: false, errors: ['档位列表必须是数组'] };
  }

  if (tiers.length === 0) {
    errors.push('档位列表不能为空');
    return { valid: false, errors };
  }

  const ids = new Set<string>();

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];

    // 检查 id
    if (!tier.id || typeof tier.id !== 'string') {
      errors.push(`档位 ${i + 1}: id 必须是非空字符串`);
    } else if (ids.has(tier.id)) {
      errors.push(`档位 ${i + 1}: id "${tier.id}" 重复`);
    } else {
      ids.add(tier.id);
    }

    // 检查 name
    if (!tier.name || typeof tier.name !== 'string') {
      errors.push(`档位 ${i + 1}: name 必须是非空字符串`);
    }

    // 检查 weight
    if (typeof tier.weight !== 'number' || tier.weight < 0) {
      errors.push(`档位 ${i + 1}: weight 必须是非负数`);
    }

    // 检查 color
    if (!tier.color || typeof tier.color !== 'string') {
      errors.push(`档位 ${i + 1}: color 必须是非空字符串`);
    }

    // 检查 prompt
    if (typeof tier.prompt !== 'string') {
      errors.push(`档位 ${i + 1}: prompt 必须是字符串`);
    }
  }

  // 检查权重总和
  const totalWeight = tiers.reduce((sum, t) => sum + (t.weight || 0), 0);
  if (totalWeight <= 0) {
    errors.push('所有档位的权重总和必须大于 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 创建新的运势档位（带默认值）
 *
 * @param partial - 部分档位数据
 * @returns 完整的运势档位
 */
export function createLuckTier(partial: Partial<LuckTier> = {}): LuckTier {
  return {
    id: partial.id || `tier_${Date.now()}`,
    name: partial.name || '新档位',
    weight: partial.weight ?? 10,
    color: partial.color || '#888888',
    prompt: partial.prompt || '',
  };
}

/**
 * 复制档位（生成新 id）
 *
 * @param tier - 要复制的档位
 * @returns 新的档位（带新 id）
 */
export function cloneLuckTier(tier: LuckTier): LuckTier {
  return {
    ...tier,
    id: `tier_${Date.now()}`,
    name: `${tier.name} (副本)`,
  };
}

// ============================================
// Composable 封装（Vue 3）
// ============================================

/**
 * 运势抽取 Composable
 *
 * 提供响应式的抽签功能
 *
 * @example
 * ```typescript
 * const { tiers, draw, result, probabilities } = useDraw();
 *
 * // 执行抽签
 * const luck = draw();
 * console.log(luck.name);
 *
 * // 访问最近一次结果
 * console.log(result.value?.name);
 * ```
 */
import { computed, ref, type Ref, shallowRef } from 'vue';

export interface UseDrawOptions {
  /** 初始档位列表，默认使用 DEFAULT_LUCK_TIERS */
  initialTiers?: LuckTier[];
}

export interface UseDrawReturn {
  /** 档位列表（响应式） */
  tiers: Ref<LuckTier[]>;
  /** 执行抽签 */
  draw: () => LuckTier;
  /** 最近一次抽签结果 */
  result: Ref<LuckTier | null>;
  /** 各档位概率百分比（计算属性） */
  probabilities: Ref<Map<string, number>>;
  /** 重置档位为默认值 */
  resetTiers: () => void;
  /** 添加档位 */
  addTier: (tier?: Partial<LuckTier>) => void;
  /** 删除档位 */
  removeTier: (id: string) => void;
  /** 更新档位 */
  updateTier: (id: string, updates: Partial<LuckTier>) => void;
}

export function useDraw(options: UseDrawOptions = {}): UseDrawReturn {
  const tiers = ref<LuckTier[]>(options.initialTiers ?? [...DEFAULT_LUCK_TIERS]);
  const result = shallowRef<LuckTier | null>(null);

  // 计算概率
  const probabilities = computed(() => calculateProbabilities(tiers.value));

  // 执行抽签
  function draw(): LuckTier {
    const luck = drawLuck(tiers.value);
    result.value = luck;
    console.info(`[useDraw] 抽签结果: ${luck.name} (${getTierProbability(luck, tiers.value)})`);
    return luck;
  }

  // 重置为默认值
  function resetTiers(): void {
    tiers.value = [...DEFAULT_LUCK_TIERS];
    result.value = null;
  }

  // 添加档位
  function addTier(partial?: Partial<LuckTier>): void {
    tiers.value.push(createLuckTier(partial));
  }

  // 删除档位
  function removeTier(id: string): void {
    const index = tiers.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tiers.value.splice(index, 1);
    }
  }

  // 更新档位
  function updateTier(id: string, updates: Partial<LuckTier>): void {
    const tier = tiers.value.find(t => t.id === id);
    if (tier) {
      Object.assign(tier, updates);
    }
  }

  return {
    tiers,
    draw,
    result,
    probabilities,
    resetTiers,
    addTier,
    removeTier,
    updateTier,
  };
}
