/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 关系表数据解析器
 *
 * 将表格数据转换为 Cytoscape 可用的节点和边格式
 */

import type { ElementDefinition } from 'cytoscape';

import type { ProcessedTable, TableRow } from '../types';

import { cleanRelationText, type CustomLegendItem, getRelationColor, shouldUseDashedLine } from './relationshipColors';

// ============================================================
// 常量定义
// ============================================================

/** 段落分隔符（用于分割多段关系描述） */
const SEGMENT_SEPARATORS = /[;；|\n]/;

/** 子项分隔符（用于分割多个目标或关系） */
const ITEM_SEPARATORS = /[、,，/&]/;

/** 冒号匹配（中英文兼容） */
const COLON_PATTERN = /[：:]/;

// ============================================================
// 类型定义
// ============================================================

/** 节点类型 */
export type NodeType = 'protagonist' | 'character' | 'faction' | 'unknown';

/** 节点数据 */
export interface NodeData {
  /** 节点 ID（名称） */
  id: string;
  /** 显示标签 */
  label: string;
  /** 节点类型 */
  type: NodeType;
  /** 头像 URL（预留） */
  avatar?: string;
}

/** 边数据 */
export interface EdgeData {
  /** 边 ID */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
  /** 关系词 */
  label: string;
  /** 备注 */
  note: string;
  /** 颜色 */
  color: string;
  /** 线条样式 */
  lineStyle: 'solid' | 'dashed';
  /** 关系级别 */
  level: string;
}

/** 解析结果 */
export interface ParseResult {
  /** Cytoscape 元素数组 */
  elements: ElementDefinition[];
  /** 节点数量 */
  nodeCount: number;
  /** 边数量 */
  edgeCount: number;
  /** 解析警告 */
  warnings: string[];
}

/** 通用解析配置 */
export interface ParserConfig {
  /** 查找名字列的关键词 */
  nameColKeywords: string[];
  /** 查找关系列的关键词 */
  relationColKeywords: string[];
  /** 默认节点类型 */
  nodeType: NodeType;
  /** (可选) 目标白名单，用于校验及智能消歧 */
  validTargets?: Set<string>;
  /** (可选) 别名映射 */
  aliasMap?: Map<string, string>;
  /** (可选) 自定义图例 */
  customLegendItems?: CustomLegendItem[];
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从表格行中获取指定列的值
 */
function getCellValue(row: TableRow, colIndex: number): string {
  const cell = row.cells.find(c => c.colIndex === colIndex);
  return cell ? String(cell.value ?? '').trim() : '';
}

/**
 * 解析别名，返回主名称
 * @param name 原始名称（可能是别名）
 * @param aliasMap 别名到主名称的映射表
 * @returns 主名称（如果找到映射）或原名称
 */
function resolveAlias(name: string, aliasMap?: Map<string, string>): string {
  if (!aliasMap || !name) return name;
  return aliasMap.get(name) || name;
}

/**
 * 查找列索引（支持多个可能的列名）
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => h.toLowerCase());
  for (const name of possibleNames) {
    const idx = lowerHeaders.findIndex(h => h.includes(name.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * 判断表格是否为人物/角色相关表
 */
export function isCharacterTable(tableName: string, tableId: string): boolean {
  const name = tableName.toLowerCase();
  const id = tableId.toLowerCase();
  const keywords = ['人物', '角色', 'npc', 'character', '主角', 'protagonist', 'player'];
  return keywords.some(kw => name.includes(kw) || id.includes(kw));
}

/**
 * 判断表格是否为关系表
 */
export function isRelationshipTable(tableName: string, tableId: string): boolean {
  const name = tableName.toLowerCase();
  const id = tableId.toLowerCase();
  const keywords = ['关系', 'relationship', 'relation'];
  return keywords.some(kw => name.includes(kw) || id.includes(kw));
}

// ============================================================
// 辅助函数 - 默认标签
// ============================================================

/**
 * 检测是否为英文名（包含空格或全英文）
 */
export function isEnglishName(name: string): boolean {
  return /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
}

/**
 * 获取默认显示标签
 * - 中文名: 取最后一个字
 * - 英文名: 取第一个单词（名字而非姓氏）
 */
export function getDefaultLabel(fullName: string): string {
  if (isEnglishName(fullName)) {
    // 英文名：取第一个单词（名字）
    const firstName = fullName.split(' ')[0];
    return firstName.length > 6 ? firstName.slice(0, 6) : firstName;
  }
  // 中文名：取最后一个字
  return fullName.length > 0 ? fullName[fullName.length - 1] : fullName;
}

// ============================================================
// 核心解析函数
// ============================================================

/**
 * 解析关系表数据，生成 Cytoscape 元素
 *
 * @param relationshipTable 关系表数据
 * @param characterTables 角色表列表（用于确定节点类型）
 * @param factionTable 势力表（可选）
 * @param aliasMap 别名到主名称的映射表（可选）
 * @param customLegendItems 自定义图例配置（可选，用于优先匹配颜色）
 * @returns 解析结果
 */
export function parseRelationshipTable(
  relationshipTable: ProcessedTable | null | undefined,
  characterTables: ProcessedTable[] = [],
  factionTable?: ProcessedTable | null,
  aliasMap?: Map<string, string>,
  customLegendItems?: CustomLegendItem[],
): ParseResult {
  const warnings: string[] = [];
  const nodes: ElementDefinition[] = [];
  const edges: ElementDefinition[] = [];
  const nodeIds = new Set<string>();

  // 无关系表数据
  if (!relationshipTable || relationshipTable.rows.length === 0) {
    return { elements: [], nodeCount: 0, edgeCount: 0, warnings: ['关系表为空或不存在'] };
  }

  const headers = relationshipTable.headers;

  // 查找列索引
  const sourceIdx = findColumnIndex(headers, ['source', '源', '主体', '发起方', 'from']);
  const targetIdx = findColumnIndex(headers, ['target', '目标', '客体', '接收方', 'to']);
  const relationIdx = findColumnIndex(headers, ['关系', 'relation', '关系词']);
  const noteIdx = findColumnIndex(headers, ['备注', 'note', '说明', 'remark']);

  // 验证必需列
  if (sourceIdx === -1 || targetIdx === -1) {
    return {
      elements: [],
      nodeCount: 0,
      edgeCount: 0,
      warnings: ['关系表缺少 source/target 列，无法解析'],
    };
  }

  // 收集角色名称（用于判断节点类型）
  const protagonistNames = new Set<string>();
  const characterNames = new Set<string>();
  const factionNames = new Set<string>();

  // 从角色表提取名称
  characterTables.forEach(table => {
    const tableName = table.name.toLowerCase();
    const isProtagonist = tableName.includes('主角') || tableName.includes('protagonist');
    const nameIdx = findColumnIndex(table.headers, ['姓名', 'name', '名称', '角色名']);

    if (nameIdx !== -1) {
      table.rows.forEach(row => {
        const name = getCellValue(row, nameIdx);
        if (name) {
          if (isProtagonist) {
            protagonistNames.add(name);
          } else {
            characterNames.add(name);
          }
        }
      });
    }
  });

  // 从势力表提取名称
  if (factionTable) {
    const nameIdx = findColumnIndex(factionTable.headers, ['名称', 'name', '势力名']);
    if (nameIdx !== -1) {
      factionTable.rows.forEach(row => {
        const name = getCellValue(row, nameIdx);
        if (name) factionNames.add(name);
      });
    }
  }

  /**
   * 确定节点类型
   */
  function getNodeType(name: string): NodeType {
    if (protagonistNames.has(name)) return 'protagonist';
    if (characterNames.has(name)) return 'character';
    if (factionNames.has(name)) return 'faction';
    return 'unknown';
  }

  /**
   * 添加节点（如果不存在）
   * - 中文名: 取最后一个字
   * - 英文名: 取第一个单词（名字而非姓氏）
   */
  function addNode(name: string): void {
    if (!name || nodeIds.has(name)) return;

    nodeIds.add(name);
    const nodeType = getNodeType(name);
    // 智能获取默认标签
    const defaultLabel = getDefaultLabel(name);

    nodes.push({
      data: {
        id: name,
        label: defaultLabel,
        type: nodeType,
      } as NodeData,
      classes: nodeType,
    });
  }

  // 遍历关系表，构建边和节点
  relationshipTable.rows.forEach((row, rowIndex) => {
    const rawSource = getCellValue(row, sourceIdx);
    const rawTarget = getCellValue(row, targetIdx);
    const relation = relationIdx !== -1 ? getCellValue(row, relationIdx) : '';
    const note = noteIdx !== -1 ? getCellValue(row, noteIdx) : '';

    // 跳过空行
    if (!rawSource || !rawTarget) {
      if (rawSource || rawTarget) {
        warnings.push(`第 ${rowIndex + 1} 行数据不完整（source: "${rawSource}", target: "${rawTarget}"）`);
      }
      return;
    }

    // 解析别名，获取主名称
    const source = resolveAlias(rawSource, aliasMap);
    const target = resolveAlias(rawTarget, aliasMap);

    // 添加节点
    addNode(source);
    addNode(target);

    // 获取关系颜色（优先使用自定义图例配置）
    const colorResult = getRelationColor(relation, customLegendItems);

    // 添加边
    edges.push({
      data: {
        id: `edge-${rowIndex}`,
        source,
        target,
        label: relation || '关系',
        note,
        color: colorResult.color,
        lineStyle: shouldUseDashedLine(note) ? 'dashed' : 'solid',
        level: colorResult.level,
      } as EdgeData,
    });
  });

  return {
    elements: [...nodes, ...edges],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    warnings,
  };
}

/**
 * 从多个表中查找关系表
 */
export function findRelationshipTable(tables: ProcessedTable[]): ProcessedTable | null {
  return tables.find(t => isRelationshipTable(t.name, t.id)) || null;
}

/**
 * 从多个表中查找势力表
 */
export function findFactionTable(tables: ProcessedTable[]): ProcessedTable | null {
  const keywords = ['势力', 'faction', '组织', 'organization', '阵营'];
  return (
    tables.find(t => {
      const name = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      return keywords.some(kw => name.includes(kw) || id.includes(kw));
    }) || null
  );
}

/**
 * 从多个表中查找角色相关表
 */
export function findCharacterTables(tables: ProcessedTable[]): ProcessedTable[] {
  return tables.filter(t => isCharacterTable(t.name, t.id) && !isRelationshipTable(t.name, t.id));
}

// ============================================================
// 内嵌字段解析（从人物表的"人际关系"列解析）
// ============================================================

/**
 * 通用函数：从属性表（如人物表、势力表）解析关系并生成 Cytoscape 元素
 *
 * @param tables 要解析的表格列表
 * @param config 解析配置
 * @returns 解析结果
 */
export function parseAttributeTableToElements(
  tables: ProcessedTable[],
  config: ParserConfig,
): ParseResult {
  const warnings: string[] = [];
  const nodes: ElementDefinition[] = [];
  const edges: ElementDefinition[] = [];
  const nodeIds = new Set<string>();
  let edgeIndex = 0;

  // 准备已知名称集合（用于辅助解析）
  // 包含白名单目标（如果有）
  const knownNames = new Set<string>(config.validTargets || []);

  /**
   * 添加节点（如果不存在）
   */
  function addNode(name: string, type: NodeType = config.nodeType): void {
    if (!name || nodeIds.has(name)) return;

    nodeIds.add(name);
    // 智能获取默认标签
    const defaultLabel = getDefaultLabel(name);

    nodes.push({
      data: {
        id: name,
        label: defaultLabel,
        type: type,
      } as NodeData,
      classes: type,
    });
  }

  // 边缓存：用于合并同一 source→target 的多条关系
  const edgeCache = new Map<
    string,
    {
      relations: string[];
      notes: string[];
      color: string;
      level: string;
      useDashed: boolean;
    }
  >();

  // 遍历表格
  tables.forEach(table => {
    const nameIdx = findColumnIndex(table.headers, config.nameColKeywords);
    const relationColIdx = findColumnIndex(table.headers, config.relationColKeywords);

    if (nameIdx === -1 || relationColIdx === -1) {
      return; // 跳过没有所需列的表
    }

    table.rows.forEach(row => {
      const rawSourceName = getCellValue(row, nameIdx);
      const relationText = getCellValue(row, relationColIdx);

      if (!rawSourceName || !relationText) return;

      // 解析源名称别名
      const sourceName = resolveAlias(rawSourceName, config.aliasMap);

      // 添加源节点
      addNode(sourceName);
      // 如果 config.validTargets 存在，则将源名称也加入 knownNames，以便在后续行中作为已知目标
      knownNames.add(sourceName);

      // 解析关系文本
      const parsedRelations = parseEmbeddedRelationship(relationText, knownNames);

      for (const parsed of parsedRelations) {
        // 清理关系词
        const cleanedRelation = cleanRelationText(parsed.relation);
        if (!cleanedRelation) continue;

        for (const rawTarget of parsed.targets) {
          // 解析别名
          const target = resolveAlias(rawTarget, config.aliasMap);

          // 校验目标是否有效（如果提供了白名单）
          if (config.validTargets && !config.validTargets.has(target)) {
            // 如果不在白名单中，跳过
            // console.warn(`[RelationshipParser] 目标 "${target}" 不在白名单中，跳过`);
            continue;
          }

          // 添加目标节点
          addNode(target);

          // 生成边的唯一键
          const edgeKey = `${sourceName}->${target}`;

          // 获取关系颜色
          const colorResult = getRelationColor(cleanedRelation, config.customLegendItems);
          const useDashed = shouldUseDashedLine(parsed.note, cleanedRelation);

          // 合并到缓存
          if (edgeCache.has(edgeKey)) {
            const cached = edgeCache.get(edgeKey)!;
            // 添加新的关系词（去重）
            if (!cached.relations.includes(cleanedRelation)) {
              cached.relations.push(cleanedRelation);
            }
            // 添加备注
            if (parsed.note && !cached.notes.includes(parsed.note)) {
              cached.notes.push(parsed.note);
            }
            // 更新颜色（按优先级覆盖：S > A > E > D > B > C > ?）
            const priorityOrder = ['S', 'A', 'E', 'D', 'B', 'C', '?'];
            const currentPriority = priorityOrder.indexOf(cached.level);
            const newPriority = priorityOrder.indexOf(colorResult.level);
            if (newPriority < currentPriority || currentPriority === -1) {
              cached.color = colorResult.color;
              cached.level = colorResult.level;
            }
            // 虚线：任一关系需要虚线则使用虚线
            if (useDashed) {
              cached.useDashed = true;
            }
          } else {
            edgeCache.set(edgeKey, {
              relations: [parsed.relation],
              notes: parsed.note ? [parsed.note] : [],
              color: colorResult.color,
              level: colorResult.level,
              useDashed,
            });
          }
        }
      }
    });
  });

  // 从缓存生成边，检测双向边
  const processedPairs = new Set<string>(); // 记录已处理的节点对

  edgeCache.forEach((cached, edgeKey) => {
    const [source, target] = edgeKey.split('->');

    // 检查是否已处理过这对节点（作为反向边的一部分）
    const pairKey = [source, target].sort().join('<->');
    if (processedPairs.has(pairKey)) {
      return; // 跳过，已作为双向边处理
    }

    // 检查是否存在反向边
    const reverseKey = `${target}->${source}`;
    const reverseEdge = edgeCache.get(reverseKey);

    // 判断是否应该合并为双向边
    let isBidirectional = false;
    if (reverseEdge) {
      const sortedRelations = [...cached.relations].sort().join(',');
      const sortedReverseRelations = [...reverseEdge.relations].sort().join(',');
      isBidirectional = sortedRelations === sortedReverseRelations;
    }

    // 合并关系词，用 / 分隔
    const label = cached.relations.join('/');
    const note = cached.notes.join('; ');

    if (isBidirectional) {
      processedPairs.add(pairKey);
      edges.push({
        data: {
          id: `edge-${edgeIndex++}`,
          source,
          target,
          label: label || '关系',
          note,
          color: cached.color,
          lineStyle: cached.useDashed ? 'dashed' : 'solid',
          level: cached.level,
          bidirectional: true,
        } as EdgeData,
      });
    } else {
      edges.push({
        data: {
          id: `edge-${edgeIndex++}`,
          source,
          target,
          label: label || '关系',
          note,
          color: cached.color,
          lineStyle: cached.useDashed ? 'dashed' : 'solid',
          level: cached.level,
          bidirectional: false,
        } as EdgeData,
      });
    }
  });

  return {
    elements: [...nodes, ...edges],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    warnings,
  };
}

/** 解析出的单条关系 */
interface ParsedRelation {
  /** 目标人物名 */
  targets: string[];
  /** 关系词 */
  relation: string;
  /** 备注（括号内内容） */
  note: string;
}

/**
 * 解析内嵌的人际关系字段
 *
 * 支持格式：
 * - "江之之的哥哥" → target: 江之之, relation: 哥哥
 * - "江晦与江之之的义父" → targets: [江晦, 江之之], relation: 义父
 * - "江晦的死对头（暗中）" → target: 江晦, relation: 死对头, note: 暗中
 * - 多段用 ；或 ; 分隔
 * - 多关系用 、分隔
 *
 * @param text 人际关系文本
 * @param knownNames 已知的人物名集合（用于辅助匹配）
 * @returns 解析出的关系列表
 */
export function parseEmbeddedRelationship(text: string, knownNames: Set<string> = new Set()): ParsedRelation[] {
  if (!text || typeof text !== 'string') return [];

  const results: ParsedRelation[] = [];

  // 按常用分隔符分割成多段
  // 注意：顿号「、」不作为分段符，因为它用于分隔多个目标/关系
  const segments = text
    .split(SEGMENT_SEPARATORS)
    .map(s => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    // 提取括号内的备注
    let note = '';
    let cleanSegment = segment;
    const bracketMatch = segment.match(/[（(]([^）)]+)[）)]/);
    if (bracketMatch) {
      note = bracketMatch[1];
      cleanSegment = segment.replace(/[（(][^）)]+[）)]/g, '').trim();
    }

    // 去除引号包裹的内容中的引号（但保留内容）
    cleanSegment = cleanSegment.replace(/[""]([^""]+)[""]/g, '$1');

    // --------------------------------------------------------
    // 模式1: {目标A}与{目标B}的{关系}
    // --------------------------------------------------------
    const multiTargetMatch = cleanSegment.match(/^(.+?)与(.+?)的(.+)$/);
    if (multiTargetMatch) {
      const target1 = multiTargetMatch[1].trim();
      const target2 = multiTargetMatch[2].trim();
      const relations = multiTargetMatch[3]
        .split(ITEM_SEPARATORS)
        .map(r => r.trim())
        .filter(Boolean);

      for (const relation of relations) {
        const cleanedRelation = cleanRelationText(relation);
        if (cleanedRelation) {
          results.push({
            targets: [target1, target2],
            relation: cleanedRelation,
            note,
          });
        }
      }
      continue;
    }

    // --------------------------------------------------------
    // 模式2: {目标A}、{目标B}...的{关系}（顿号分隔多目标）
    // 如 "小明、小红的朋友" → targets: [小明, 小红], relation: 朋友
    // --------------------------------------------------------
    const commaMultiTargetMatch = cleanSegment.match(/^(.+?[、,，].+?)的(.+)$/);
    if (commaMultiTargetMatch) {
      const targetsText = commaMultiTargetMatch[1];
      const relationsText = commaMultiTargetMatch[2];

      // 分割多个目标（使用子项分隔符）
      const targets = targetsText
        .split(ITEM_SEPARATORS)
        .map(t => t.trim())
        .filter(Boolean);

      // 如果确实有多个目标，则按多目标处理
      if (targets.length > 1) {
        // 关系也可能有多个（用子项分隔符）
        const relations = relationsText
          .split(ITEM_SEPARATORS)
          .map(r => r.trim())
          .filter(Boolean);

        for (const relation of relations) {
          const cleanedRelation = cleanRelationText(relation);
          if (cleanedRelation) {
            results.push({
              targets,
              relation: cleanedRelation,
              note,
            });
          }
        }
        continue;
      }
    }

    // --------------------------------------------------------
    // 模式3: {目标}的{关系}
    // --------------------------------------------------------
    const singleTargetMatch = cleanSegment.match(/^(.+?)的(.+)$/);
    if (singleTargetMatch) {
      const target = singleTargetMatch[1].trim();
      const relationsText = singleTargetMatch[2];

      // 关系可能包含 "与" 分隔的多个关系
      // 如 "直属上司" 或 "监护人哥哥"与情趣SM"玩伴"
      let relations: string[];

      if (relationsText.includes('与')) {
        // 按 "与" 分割
        relations = relationsText
          .split(/与/)
          .map(r => r.trim())
          .filter(Boolean);
      } else {
        // 按子项分隔符分割
        relations = relationsText
          .split(ITEM_SEPARATORS)
          .map(r => r.trim())
          .filter(Boolean);
      }

      for (const relation of relations) {
        const cleanedRelation = cleanRelationText(relation);
        if (cleanedRelation) {
          results.push({
            targets: [target],
            relation: cleanedRelation,
            note,
          });
        }
      }
      continue;
    }

    // --------------------------------------------------------
    // 模式4: 与{目标}{关系} (新支持，常见于势力关系)
    // 如 "与胜和敌对"
    // --------------------------------------------------------
    // 排除逗号等分隔符，但允许 / 和 &（支持 "竞争/合作"）
    const withMatch = cleanSegment.match(/^与(.+?)([^、,，\s]+)$/);
    if (withMatch) {
      const targetsText = withMatch[1].trim();
      const relationText = withMatch[2].trim();

      // 支持多目标 "与胜和、洪盛敌对"
      const targets = targetsText
        .split(ITEM_SEPARATORS)
        .map(t => t.trim())
        .filter(Boolean);

      // 支持多关系 "与胜和竞争/合作"
      const relations = relationText
        .split(ITEM_SEPARATORS)
        .map(r => r.trim())
        .filter(Boolean);

      let hasValidRelation = false;

      for (const relation of relations) {
        const cleanedRelation = cleanRelationText(relation);
        if (targets.length > 0 && cleanedRelation) {
          results.push({
            targets,
            relation: cleanedRelation,
            note,
          });
          hasValidRelation = true;
        }
      }

      if (hasValidRelation) continue;
    }

    // --------------------------------------------------------
    // 模式5: {目标}：{关系} 或 {目标}:{关系}（冒号格式）
    // 增加智能消歧逻辑：利用 knownNames 判断是 Target:Relation 还是 Relation:Target
    // --------------------------------------------------------
    const colonMatch = cleanSegment.match(new RegExp(`^(.+?)${COLON_PATTERN.source}(.+)$`));
    if (colonMatch) {
      let part1 = colonMatch[1].trim();
      let part2 = colonMatch[2].trim();

      // 智能消歧
      // 默认假设 Part1 是 Target, Part2 是 Relation (Target:Relation)
      // 如果 Part1 在白名单中，或者是多个目标且其中之一在白名单中 -> 确认 Target:Relation
      // 如果 Part2 在白名单中 -> 翻转为 Relation:Target (如 "盟友：洪盛")

      let isReversed = false;

      // 辅助函数：检查文本是否包含已知名称
      const containsKnownName = (text: string) => {
        const parts = text.split(ITEM_SEPARATORS).map(t => t.trim());
        return parts.some(p => knownNames.has(p));
      };

      if (knownNames.size > 0) {
        const part1Known = containsKnownName(part1);
        const part2Known = containsKnownName(part2);

        if (!part1Known && part2Known) {
          isReversed = true;
        }
      }

      if (isReversed) {
        [part1, part2] = [part2, part1];
      }

      const targetsText = part1;
      const relationsText = part2;

      // 分割多个目标
      const targets = targetsText
        .split(ITEM_SEPARATORS)
        .map(t => t.trim())
        .filter(Boolean);

      // 分割多个关系
      const relations = relationsText
        .split(ITEM_SEPARATORS)
        .map(r => r.trim())
        .filter(Boolean);

      for (const relation of relations) {
        const cleanedRelation = cleanRelationText(relation);
        if (cleanedRelation) {
          results.push({
            targets,
            relation: cleanedRelation,
            note,
          });
        }
      }
      continue;
    }

    // 无法匹配的段落，跳过
    console.info(`[RelationshipParser] 无法解析: "${segment}"`);
  }

  return results;
}

// ============================================================
// 势力映射解析（用于 Cola 布局的分组容器）
// ============================================================

/** 势力间关系 */
export interface FactionRelation {
  /** 源势力名 */
  source: string;
  /** 目标势力名 */
  target: string;
  /** 关系词 */
  relation: string;
}

/** 势力映射结果 */
export interface FactionMapping {
  /** 权威势力列表（从势力表提取） */
  factionList: string[];
  /** 角色名 -> 势力名（只有在 factionList 中的才记录） */
  characterToFaction: Map<string, string>;
  /** 势力间关系列表 */
  factionRelations: FactionRelation[];
}

/**
 * 查找势力表
 */
function findFactionTableInternal(allTables: ProcessedTable[]): ProcessedTable | null {
  const factionKeywords = ['势力', 'faction', '组织', 'organization', '阵营'];
  return (
    allTables.find(t => {
      const name = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      return factionKeywords.some(kw => name.includes(kw) || id.includes(kw));
    }) || null
  );
}

/**
 * 从势力表提取权威势力列表
 * 查找含有"阵营/势力/组织/名称"列的表，提取所有势力名称
 */
function extractFactionList(allTables: ProcessedTable[]): string[] {
  const nameKeywords = ['名称', 'name', '势力名', '组织名', '阵营名'];

  // 查找势力表
  const factionTable = findFactionTableInternal(allTables);

  if (!factionTable) {
    console.info('[FactionMapping] 未找到势力表');
    return [];
  }

  // 查找名称列
  const nameIdx = findColumnIndex(factionTable.headers, nameKeywords);
  if (nameIdx === -1) {
    console.info('[FactionMapping] 势力表中未找到名称列');
    return [];
  }

  // 提取所有势力名称
  const factionList: string[] = [];
  factionTable.rows.forEach(row => {
    const name = getCellValue(row, nameIdx);
    if (name && !factionList.includes(name)) {
      factionList.push(name);
    }
  });

  console.info(`[FactionMapping] 从势力表提取 ${factionList.length} 个势力:`, factionList);
  return factionList;
}

/**
 * 从人物表提取势力归属
 * 查找人物的"身份/职业/所属/势力"等列
 * 使用**包含匹配**：如果单元格值包含某个势力名称，则记录该势力
 * 例如："洪盛骨干/铜锣湾坐馆" 包含 "洪盛"，则匹配到 "洪盛" 势力
 */
function extractCharacterFactions(
  characterTables: ProcessedTable[],
  factionList: string[],
): Map<string, string> {
  const characterToFaction = new Map<string, string>();

  // 势力归属可能的列名
  const factionColKeywords = ['所属', '势力', '阵营', '组织', '身份', '职业', 'faction', 'affiliation', 'organization'];

  for (const table of characterTables) {
    const nameIdx = findColumnIndex(table.headers, ['姓名', 'name', '名称', '角色名']);
    const factionIdx = findColumnIndex(table.headers, factionColKeywords);

    if (nameIdx === -1) continue;
    if (factionIdx === -1) continue;

    table.rows.forEach(row => {
      const charName = getCellValue(row, nameIdx);
      const factionValue = getCellValue(row, factionIdx);

      if (!charName || !factionValue) return;

      // 使用包含匹配：检查 factionValue 是否包含某个势力名称
      // 优先匹配较长的势力名称（避免 "洪盛" 和 "洪盛会" 的歧义）
      const sortedFactions = [...factionList].sort((a, b) => b.length - a.length);
      for (const faction of sortedFactions) {
        if (factionValue.includes(faction)) {
          characterToFaction.set(charName, faction);
          console.info(`[FactionMapping] 角色 "${charName}" 匹配势力 "${faction}" (来自 "${factionValue}")`);
          break; // 匹配到第一个就停止
        }
      }
    });
  }

  console.info(`[FactionMapping] 从人物表提取 ${characterToFaction.size} 个角色的势力归属`);
  return characterToFaction;
}

/**
 * 提取势力映射
 * 1. 先从势力表提取权威势力列表
 * 2. 再从人物表提取势力归属（只有在 factionList 中的才记录）
 * 3. 从势力表解析势力间关系 (使用 parseAttributeTableToElements)
 *
 * @param allTables 所有表格（用于查找势力表）
 * @param characterTables 人物表列表
 * @returns 势力映射结果
 */
export function extractFactionMapping(
  allTables: ProcessedTable[],
  characterTables: ProcessedTable[],
): FactionMapping {
  // 1. 从势力表提取势力列表
  const factionList = extractFactionList(allTables);

  // 2. 从人物表提取势力归属（必须在 factionList 中）
  const characterToFaction = extractCharacterFactions(characterTables, factionList);

  // 3. 从势力表解析势力间关系 (使用通用解析器)
  const factionTable = findFactionTableInternal(allTables);
  const factionRelations: FactionRelation[] = [];

  if (factionTable && factionList.length > 0) {
    const parseResult = parseAttributeTableToElements([factionTable], {
      nameColKeywords: ['名称', 'name', '势力名', '组织名', '阵营名'],
      relationColKeywords: ['关系', '外交', 'relation', 'relationship', '势力关系'],
      nodeType: 'faction',
      validTargets: new Set(factionList), // 传入势力列表作为白名单，启用智能消歧
    });

    // 将解析出的边转换为 FactionRelation
    parseResult.elements.forEach(el => {
      if (el.data.source && el.data.target) {
        factionRelations.push({
          source: el.data.source,
          target: el.data.target,
          relation: el.data.label || '关系',
        });
      }
    });
    console.info(`[FactionMapping] 使用通用解析器解析出 ${factionRelations.length} 条势力间关系`);
  }

  return { factionList, characterToFaction, factionRelations };
}

/**
 * 从角色表解析内嵌的人际关系，生成 Cytoscape 元素 (Wrapper for parseAttributeTableToElements)
 *
 * @param characterTables 角色表列表（包含人际关系列）
 * @param factionTable 势力表（可选）
 * @param aliasMap 别名到主名称的映射表（可选）
 * @param customLegendItems 自定义图例配置（可选，用于优先匹配颜色）
 * @returns 解析结果
 */
export function parseEmbeddedRelationships(
  characterTables: ProcessedTable[] = [],
  factionTable?: ProcessedTable | null,
  aliasMap?: Map<string, string>,
  customLegendItems?: CustomLegendItem[],
): ParseResult {
  // 分离主角表和其他角色表，以便赋予不同的节点类型
  const protagonistTables: ProcessedTable[] = [];
  const otherTables: ProcessedTable[] = [];

  characterTables.forEach(table => {
    const tableName = table.name.toLowerCase();
    if (tableName.includes('主角') || tableName.includes('protagonist')) {
      protagonistTables.push(table);
    } else {
      otherTables.push(table);
    }
  });

  // 解析主角表
  const protagonistResult = parseAttributeTableToElements(protagonistTables, {
    nameColKeywords: ['姓名', 'name', '名称', '角色名'],
    relationColKeywords: ['人际关系', '关系', 'relationship', 'relations'],
    nodeType: 'protagonist',
    aliasMap,
    customLegendItems,
  });

  // 解析其他角色表
  const otherResult = parseAttributeTableToElements(otherTables, {
    nameColKeywords: ['姓名', 'name', '名称', '角色名'],
    relationColKeywords: ['人际关系', '关系', 'relationship', 'relations'],
    nodeType: 'character',
    aliasMap,
    customLegendItems,
  });

  // 合并结果
  // 注意：需要合并节点和边，并处理 ID 冲突（尤其是节点）
  // 优先保留 protagonistResult 中的节点（如果 ID 冲突）

  const nodesMap = new Map<string, ElementDefinition>();
  const edges: ElementDefinition[] = [];
  const warnings = [...protagonistResult.warnings, ...otherResult.warnings];

  // 辅助函数：添加元素到合并集合
  const addElements = (result: ParseResult) => {
    result.elements.forEach(el => {
      if (el.data.source && el.data.target) {
        // 边：直接添加 (之后可能需要重新生成 ID 以防冲突，或者直接使用)
        // 简单起见，我们假设 edge-index 可能会冲突，所以重命名
        const newEdge = { ...el };
        newEdge.data.id = `edge-${edges.length}`;
        edges.push(newEdge);
      } else {
        // 节点：按 ID 去重
        const id = el.data.id as string;
        if (!nodesMap.has(id)) {
          nodesMap.set(id, el);
        }
      }
    });
  };

  addElements(protagonistResult);
  addElements(otherResult);

  // 补充：额外添加有势力归属但无社交关系的人物
  // (这是旧 parseEmbeddedRelationships 的特性，需要保留)
  // 暂时简化：如果不做这一步，那些只有势力没有关系的人物将不显示在关系图中。
  // 为了保持兼容性，我们应该加上。

  const nodeIds = new Set(nodesMap.keys());
  const factionColKeywords = ['所属', '势力', '阵营', '组织', '身份', '职业', 'faction', 'affiliation', 'organization'];

  characterTables.forEach(table => {
    const nameIdx = findColumnIndex(table.headers, ['姓名', 'name', '名称', '角色名']);
    const factionIdx = findColumnIndex(table.headers, factionColKeywords);

    if (nameIdx === -1 || factionIdx === -1) return;

    table.rows.forEach(row => {
      const charName = getCellValue(row, nameIdx);
      const factionValue = getCellValue(row, factionIdx);

      if (charName && factionValue && !nodeIds.has(charName)) {
        // 添加新节点
        const isProtagonist = table.name.toLowerCase().includes('主角');
        const nodeType: NodeType = isProtagonist ? 'protagonist' : 'character';
        const defaultLabel = getDefaultLabel(charName);

        nodesMap.set(charName, {
          data: {
            id: charName,
            label: defaultLabel,
            type: nodeType,
          } as NodeData,
          classes: nodeType,
        });
        nodeIds.add(charName);
        // console.info(`[RelationshipParser] 添加有势力归属但无社交关系的人物: "${charName}"`);
      }
    });
  });

  return {
    elements: [...nodesMap.values(), ...edges],
    nodeCount: nodesMap.size,
    edgeCount: edges.length,
    warnings,
  };
}

