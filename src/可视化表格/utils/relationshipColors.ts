/**
 * 关系词颜色映射工具函数
 *
 * 根据关系词自动判断关系类型并返回对应颜色
 */

// ============================================================
// 类型定义
// ============================================================

/** 关系级别 */
export type RelationLevel = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '?';

/** 关系类型配置 */
export interface RelationType {
  /** 级别标识 */
  level: RelationLevel;
  /** 类型名称 */
  name: string;
  /** 颜色值 */
  color: string;
  /** 关键词列表 */
  keywords: string[];
}

/** 颜色匹配结果 */
export interface RelationColorResult {
  /** 主颜色 */
  color: string;
  /** 关系级别 */
  level: RelationLevel;
  /** 类型名称 */
  typeName: string;
  /** 是否为复杂关系（正负混合） */
  isComplex: boolean;
}

// ============================================================
// 关系类型配置
// ============================================================

/**
 * 关系类型定义
 * 按优先级排序：S > A > E > D > B > C
 */
export const RELATION_TYPES: RelationType[] = [
  {
    level: 'S',
    name: '爱/沉迷',
    color: '#E91E63', // 粉红
    keywords: [
      '恋',
      '恋人',
      '男友',
      '女友',
      '爱',
      '暧昧',
      '暗恋',
      '情人',
      '伴侣',
      '老婆',
      '老公',
      '丈夫',
      '妻子',
      '粉丝',
      '迷',
      '爱慕',
      '倾心',
      '心上人',
      '挚爱',
      '深爱',
      '相恋',
      '热恋',
      '初恋',
      '单恋',
      '苦恋',
      '痴迷',
      '迷恋',
      '倾慕',
    ],
  },
  {
    level: 'A',
    name: '亲属',
    color: '#2196F3', // 蓝
    keywords: [
      '父',
      '母',
      '兄',
      '哥',
      '弟',
      '姐',
      '妹',
      '爷',
      '奶',
      '叔',
      '姑',
      '舅',
      '姨',
      '义兄',
      '义妹',
      '义父',
      '义子',
      '义弟',
      '义姐',
      '义母',
      '义女',
      '养父',
      '养母',
      '养子',
      '养女',
      '亲人',
      '家人',
      '至亲',
      '血亲',
      '族人',
      '堂兄',
      '堂弟',
      '表兄',
      '表弟',
      '表姐',
      '表妹',
      '外公',
      '外婆',
      '祖父',
      '祖母',
      '曾祖',
      '儿子',
      '女儿',
      '孙子',
      '孙女',
    ],
  },
  {
    level: 'B',
    name: '师/友/同伴',
    color: '#4CAF50', // 绿
    keywords: [
      '友',
      '盟',
      '朋友',
      '挚友',
      '知己',
      '故交',
      '青梅竹马',
      '发小',
      '闺蜜',
      '死党',
      '战友',
      '伙伴',
      '同窗',
      '师徒',
      '弟子',
      '师傅',
      '老师',
      '学生',
      '队友',
      '搭档',
      '同伴',
      '好友',
      '密友',
      '旧友',
      '故友',
      '同门',
      '师兄',
      '师姐',
      '师弟',
      '师妹',
      '徒弟',
      '徒儿',
      '恩师',
      '导师',
      '教官',
      '学徒',
      '盟友',
      '向导',
      '哨兵',
    ],
  },
  {
    level: 'C',
    name: '社会关系/未分类',
    color: '#9E9E9E', // 灰
    keywords: [
      '同事',
      '邻居',
      '舍友',
      '室友',
      '顾客',
      '客户',
      '上司',
      '下属',
      '同学',
      '路人',
      '熟人',
      '认识',
      '相识',
      '同乡',
      '老乡',
      '房东',
      '租客',
      '店员',
      '老板',
      '员工',
      '主管',
      '经理',
      '助手',
      '秘书',
      '管家',
      '仆人',
      '侍从',
      '护卫',
      '保镖',
    ],
  },
  {
    level: 'D',
    name: '利益关系',
    color: '#FF9800', // 橙
    keywords: [
      '合作',
      '雇佣',
      '交易',
      '债务',
      '炮友',
      '利用',
      '工具人',
      '棋子',
      '操控',
      '傀儡',
      '买卖',
      '债主',
      '欠债',
      '商业',
      '合伙',
      '投资',
      '赞助',
      '金主',
      '资助',
      '包养',
      '契约',
      '协议',
    ],
  },
  {
    level: 'E',
    name: '敌对关系',
    color: '#F44336', // 红
    keywords: [
      '仇',
      '敌',
      '死',
      '对手',
      '竞争',
      '仇敌',
      '死敌',
      '宿敌',
      '威胁',
      '敌对',
      '仇人',
      '仇家',
      '敌人',
      '对头',
      '冤家',
      '杀父',
      '杀母',
      '血仇',
      '深仇',
      '世仇',
      '夙敌',
      '劲敌',
      '强敌',
      '死对头',
      '眼中钉',
      '宿主',
      '夺舍',
      '寄生',
    ],
  },
];

/** 复杂关系配置 */
const COMPLEX_RELATION: Omit<RelationType, 'keywords'> = {
  level: '?',
  name: '复杂/未知',
  color: '#9C27B0', // 紫
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 判断关系词是否匹配某个类型
 */
function matchesType(word: string, type: RelationType): boolean {
  return type.keywords.some(kw => word.includes(kw));
}

/**
 * 根据关系词获取颜色和类型信息
 *
 * @param relationWords 关系词字符串（可包含多个词，用逗号/顿号/分号分隔）
 * @returns 颜色匹配结果
 *
 * @example
 * getRelationColor('恋人')        // { color: '#E91E63', level: 'S', typeName: '爱情/伴侣', isComplex: false }
 * getRelationColor('恋人,仇敌')   // { color: '#9C27B0', level: '?', typeName: '复杂/未知', isComplex: true }
 * getRelationColor('同事')        // { color: '#9E9E9E', level: 'C', typeName: '社会关系', isComplex: false }
 */
export function getRelationColor(relationWords: string): RelationColorResult {
  // 分割关系词
  const words = relationWords
    .split(/[,，、;；|]/)
    .map(w => w.trim())
    .filter(w => w.length > 0);

  if (words.length === 0) {
    return {
      color: RELATION_TYPES.find(t => t.level === 'C')!.color,
      level: 'C',
      typeName: '社会关系',
      isComplex: false,
    };
  }

  // 收集匹配到的级别
  const matchedLevels = new Set<RelationLevel>();

  words.forEach(word => {
    for (const type of RELATION_TYPES) {
      if (matchesType(word, type)) {
        matchedLevels.add(type.level);
        break; // 每个词只匹配一个类型
      }
    }
  });

  // 如果没有匹配到任何类型，返回默认（社会关系）
  if (matchedLevels.size === 0) {
    return {
      color: RELATION_TYPES.find(t => t.level === 'C')!.color,
      level: 'C',
      typeName: '社会关系',
      isComplex: false,
    };
  }

  // 冲突检测：正面（S/A/B）与负面（E）同时存在
  const positivelevels: RelationLevel[] = ['S', 'A', 'B'];
  const hasPositive = positivelevels.some(l => matchedLevels.has(l));
  const hasNegative = matchedLevels.has('E');

  if (hasPositive && hasNegative) {
    return {
      color: COMPLEX_RELATION.color,
      level: COMPLEX_RELATION.level,
      typeName: COMPLEX_RELATION.name,
      isComplex: true,
    };
  }

  // 最高级优先：S > A > E > D > B > C
  const priority: RelationLevel[] = ['S', 'A', 'E', 'D', 'B', 'C'];

  for (const level of priority) {
    if (matchedLevels.has(level)) {
      const type = RELATION_TYPES.find(t => t.level === level)!;
      return {
        color: type.color,
        level: type.level,
        typeName: type.name,
        isComplex: false,
      };
    }
  }

  // 兜底返回
  return {
    color: RELATION_TYPES.find(t => t.level === 'C')!.color,
    level: 'C',
    typeName: '社会关系',
    isComplex: false,
  };
}

/**
 * 获取图例数据（用于 UI 显示）
 */
export function getRelationLegend(): Array<{ level: RelationLevel; name: string; color: string; emoji: string }> {
  const emojiMap: Record<RelationLevel, string> = {
    S: '💗',
    A: '💙',
    B: '💚',
    C: '⚪',
    D: '💛',
    E: '❤️',
    '?': '🟣',
  };

  return [
    ...RELATION_TYPES.map(t => ({
      level: t.level,
      name: t.name,
      color: t.color,
      emoji: emojiMap[t.level],
    })),
    {
      level: COMPLEX_RELATION.level,
      name: COMPLEX_RELATION.name,
      color: COMPLEX_RELATION.color,
      emoji: emojiMap['?'],
    },
  ];
}

/**
 * 判断边是否应该用虚线
 * 当关系词或备注暗示非直接/复杂/隐秘/过去关系时使用虚线
 *
 * @param note 备注内容
 * @param relation 关系词（可选）
 * @returns 是否使用虚线
 */
export function shouldUseDashedLine(note: string | undefined | null, relation?: string): boolean {
  // 过去/历史关系关键词
  const pastKeywords = ['过去', '过往', '从前', '曾经', '曾', '前', '原', '故', '昔', '已故', '已逝', '前任', '旧'];
  // 隐秘/复杂关系关键词
  const secretKeywords = ['暗', '秘', '隐', '伪', '假', '表面', '疑', '可能', '潜在', '疑似'];

  const allKeywords = [...pastKeywords, ...secretKeywords];
  const text = (note || '') + (relation || '');

  return allKeywords.some(kw => text.includes(kw));
}

/**
 * 清理关系词文本
 * - 去除末尾句号
 * - 去除多余空格
 */
export function cleanRelationText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[。.]+$/, '') // 去除末尾句号
    .replace(/\s+/g, '') // 去除空格
    .trim();
}
