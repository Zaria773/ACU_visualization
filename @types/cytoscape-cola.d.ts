declare module 'cytoscape-cola' {
  import type { LayoutOptions } from 'cytoscape';

  interface ColaLayoutOptions extends LayoutOptions {
    name: 'cola';
    /** 是否动画过渡 */
    animate?: boolean;
    /** 动画持续时间（毫秒） */
    animationDuration?: number;
    /** 初始是否随机化位置 */
    randomize?: boolean;
    /** 是否避免节点重叠 */
    avoidOverlap?: boolean;
    /** 收敛阈值 */
    convergenceThreshold?: number;
    /** 边的理想长度（可以是数字或函数） */
    edgeLength?: number | ((edge: any) => number);
    /** 边的对称差异系数 */
    edgeSymDiffLength?: number;
    /** 边的 jaccard 系数 */
    edgeJaccardLength?: number;
    /** 节点之间的间距 */
    nodeSpacing?: number | ((node: any) => number);
    /** 是否处理断开的图 */
    handleDisconnected?: boolean;
    /** 是否适应视图 */
    fit?: boolean;
    /** 适应视图时的内边距 */
    padding?: number;
    /** 复合节点相关选项 */
    flow?: { axis: 'x' | 'y'; minSeparation: number };
    /** 对齐约束 */
    alignment?: any;
    /** 间隙不等式约束 */
    gapInequalities?: any;
    /** 是否无限运行（直到手动停止） */
    infinite?: boolean;
    /** 无约束迭代次数 */
    unconstrIter?: number;
    /** 用户约束迭代次数 */
    userConstIter?: number;
    /** 所有约束迭代次数 */
    allConstIter?: number;
    /** 中心化时的引力 */
    centerGraph?: boolean;
    /** 每次布局刷新回调 */
    refresh?: number;
    /** 最大模拟时间（毫秒） */
    maxSimulationTime?: number;
    /** 不重叠的内边距 */
    nodeDimensionsIncludeLabels?: boolean;
  }

  function cola(cytoscape: typeof Core): void;
  export = cola;
}
