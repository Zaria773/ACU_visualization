declare module 'cytoscape-fcose' {
  import type { LayoutOptions } from 'cytoscape';

  interface FcoseLayoutOptions extends LayoutOptions {
    name: 'fcose';
    quality?: 'draft' | 'default' | 'proof';
    randomize?: boolean;
    animate?: boolean;
    animationDuration?: number;
    animationEasing?: string;
    fit?: boolean;
    padding?: number;
    nodeSeparation?: number;
    idealEdgeLength?: number | ((edge: any) => number);
    edgeElasticity?: number | ((edge: any) => number);
    nestingFactor?: number;
    gravity?: number;
    gravityRange?: number;
    gravityCompound?: number;
    gravityRangeCompound?: number;
    numIter?: number;
    tile?: boolean;
    tilingPaddingVertical?: number;
    tilingPaddingHorizontal?: number;
    initialEnergyOnIncremental?: number;
    fixedNodeConstraint?: Array<{ nodeId: string; position: { x: number; y: number } }>;
    alignmentConstraint?: { vertical?: string[][]; horizontal?: string[][] };
    relativePlacementConstraint?: Array<{ top?: string; bottom?: string; left?: string; right?: string; gap?: number }>;
  }

  function fcose(cytoscape: typeof Core): void;
  export = fcose;
}
