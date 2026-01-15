/**
 * 关系表数据解析器
 *
 * 将表格数据转换为 Cytoscape 可用的节点和边格式
 */

import type { ElementDefinition } from 'cytoscape';

import type { ProcessedTable, TableRow } from '../types';

import { cleanRelationText, getRelationColor, shouldUseDashedLine } from './relationshipColors';

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
function isEnglishName(name: string): boolean {
  return /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
}

/**
 * 获取默认显示标签
 * - 中文名: 取最后一个字
 * - 英文名: 取第一个单词（名字而非姓氏）
 */
function getDefaultLabel(fullName: string): string {
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
 * @returns 解析结果
 */
export function parseRelationshipTable(
  relationshipTable: ProcessedTable | null | undefined,
  characterTables: ProcessedTable[] = [],
  factionTable?: ProcessedTable | null,
  aliasMap?: Map<string, string>,
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

    // 获取关系颜色
    const colorResult = getRelationColor(relation);

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

  // 按 ；; 分割成多段
  const segments = text
    .split(/[；;]/)
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

    // 尝试匹配模式1: {目标A}与{目标B}的{关系}
    const multiTargetMatch = cleanSegment.match(/^(.+?)与(.+?)的(.+)$/);
    if (multiTargetMatch) {
      const target1 = multiTargetMatch[1].trim();
      const target2 = multiTargetMatch[2].trim();
      const relations = multiTargetMatch[3]
        .split(/[、,，]/)
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

    // 尝试匹配模式2: {目标A}、{目标B}...的{关系}（顿号分隔多目标）
    // 如 "小明、小红的朋友" → targets: [小明, 小红], relation: 朋友
    const commaMultiTargetMatch = cleanSegment.match(/^(.+?[、,，].+?)的(.+)$/);
    if (commaMultiTargetMatch) {
      const targetsText = commaMultiTargetMatch[1];
      const relationsText = commaMultiTargetMatch[2];

      // 分割多个目标（使用顿号、逗号分隔）
      const targets = targetsText
        .split(/[、,，]/)
        .map(t => t.trim())
        .filter(Boolean);

      // 如果确实有多个目标，则按多目标处理
      if (targets.length > 1) {
        // 关系也可能有多个（用顿号分隔）
        const relations = relationsText
          .split(/[、,，]/)
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

    // 尝试匹配模式3: {目标}的{关系}
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
        // 按 、分割
        relations = relationsText
          .split(/[、,，]/)
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

    // 尝试匹配模式4: {目标}：{关系} 或 {目标}:{关系}（冒号格式）
    // 如 "小明：朋友" 或 "小明:朋友、同事"
    const colonMatch = cleanSegment.match(/^(.+?)[：:](.+)$/);
    if (colonMatch) {
      const target = colonMatch[1].trim();
      const relationsText = colonMatch[2].trim();

      // 关系可能有多个（用顿号、逗号分隔）
      const relations = relationsText
        .split(/[、,，]/)
        .map(r => r.trim())
        .filter(Boolean);

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

    // 无法匹配的段落，跳过
    console.info(`[RelationshipParser] 无法解析: "${segment}"`);
  }

  return results;
}

/**
 * 从角色表解析内嵌的人际关系，生成 Cytoscape 元素
 *
 * @param characterTables 角色表列表（包含人际关系列）
 * @param factionTable 势力表（可选）
 * @param aliasMap 别名到主名称的映射表（可选）
 * @returns 解析结果
 */
export function parseEmbeddedRelationships(
  characterTables: ProcessedTable[] = [],
  factionTable?: ProcessedTable | null,
  aliasMap?: Map<string, string>,
): ParseResult {
  const warnings: string[] = [];
  const nodes: ElementDefinition[] = [];
  const edges: ElementDefinition[] = [];
  const nodeIds = new Set<string>();
  let edgeIndex = 0;

  // 收集所有已知人物名
  const allCharacterNames = new Set<string>();
  const protagonistNames = new Set<string>();
  const characterNames = new Set<string>();

  // 预先收集所有人物名
  characterTables.forEach(table => {
    const tableName = table.name.toLowerCase();
    const isProtagonist = tableName.includes('主角') || tableName.includes('protagonist');
    const nameIdx = findColumnIndex(table.headers, ['姓名', 'name', '名称', '角色名']);

    if (nameIdx !== -1) {
      table.rows.forEach(row => {
        const name = getCellValue(row, nameIdx);
        if (name) {
          allCharacterNames.add(name);
          if (isProtagonist) {
            protagonistNames.add(name);
          } else {
            characterNames.add(name);
          }
        }
      });
    }
  });

  /**
   * 确定节点类型
   */
  function getNodeType(name: string): NodeType {
    if (protagonistNames.has(name)) return 'protagonist';
    if (characterNames.has(name)) return 'character';
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

  // 边缓存：用于合并同一 source→target 的多条关系
  // key: "source->target", value: { relations: string[], notes: string[], color: string, level: string }
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

  // 遍历角色表，解析人际关系列
  characterTables.forEach(table => {
    const nameIdx = findColumnIndex(table.headers, ['姓名', 'name', '名称', '角色名']);
    const relationColIdx = findColumnIndex(table.headers, ['人际关系', '关系', 'relationship', 'relations']);

    if (nameIdx === -1 || relationColIdx === -1) {
      return; // 跳过没有所需列的表
    }

    table.rows.forEach(row => {
      const sourceName = getCellValue(row, nameIdx);
      const relationText = getCellValue(row, relationColIdx);

      if (!sourceName || !relationText) return;

      // 添加源节点
      addNode(sourceName);

      // 解析人际关系文本
      const parsedRelations = parseEmbeddedRelationship(relationText, allCharacterNames);

      for (const parsed of parsedRelations) {
        // 清理关系词（去除句号等）
        const cleanedRelation = cleanRelationText(parsed.relation);
        if (!cleanedRelation) continue;

        for (const rawTarget of parsed.targets) {
          // 解析别名，获取主名称
          const target = resolveAlias(rawTarget, aliasMap);

          // 添加目标节点
          addNode(target);

          // 生成边的唯一键
          const edgeKey = `${sourceName}->${target}`;

          // 获取关系颜色
          const colorResult = getRelationColor(cleanedRelation);
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
    // 条件：反向边存在 且 关系词集合相同（顺序无关）
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
      // 标记这对节点已处理
      processedPairs.add(pairKey);

      // 创建双向边
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
          bidirectional: true, // 标记为双向
        } as EdgeData,
      });
    } else {
      // 普通单向边
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

  if (nodes.length === 0) {
    warnings.push('未能从角色表中解析出任何人际关系数据');
  }

  return {
    elements: [...nodes, ...edges],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    warnings,
  };
}
