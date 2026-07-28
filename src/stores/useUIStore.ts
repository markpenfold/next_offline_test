import { create } from 'zustand';
import type { Vector2Like } from 'three';

export type GraphNode = Record<string, any>;
export type GraphLink = Record<string, any>;
export type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

export interface HoverInfo {
  [key: string]: any;
}

export interface HoverVertexData {
  [key: string]: any;
}

interface UIStore {
  // GRAPH STATE
  graphData: GraphData;
  setGraphData: (data: GraphData) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  hoveredNode: GraphNode | null;
  setHoveredNode: (node: GraphNode | null) => void;
  selectedLink: GraphLink | null;
  setSelectedLink: (link: GraphLink | null) => void;

  // UI / INTERACTION STATE
  isUiDragging: boolean;
  setIsUiDragging: (dragging: boolean) => void;

  // UV & HOVER METRICS
  hoverInfo: HoverInfo | null;
  setHoverInfo: (info: HoverInfo | null) => void;
  clickedUV: Vector2Like | null;
  setClickedUV: (uv: Vector2Like | null) => void;
  hoverUV: Vector2Like | null;
  setHoverUV: (uv: Vector2Like | null) => void;
  
  hoverVertexData: HoverVertexData | null;
  setHoverVertexData: (data: HoverVertexData | null) => void;

  // VIEWING WINDOW & TIMELINE
  viewingWindowStart: number;
  viewingWindowWidth: number;
  setViewingWindowStart: (s: number) => number;
  setViewingWindowWidth: (w: number) => number;
  hoverYear: number | null;
  setHoverYear: (year: number | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  //////////////////////////////////////////////////////////////////////////
  // GRAPH STATE
  //////////////////////////////////////////////////////////////////////////
  graphData: { nodes: [], links: [] },
  setGraphData: (data) => set({ graphData: data }),
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),
  hoveredNode: null,
  setHoveredNode: (node) => set({ hoveredNode: node }),
  selectedLink: null,
  setSelectedLink: (link) => set({ selectedLink: link }),

  //////////////////////////////////////////////////////////////////////////
  // UI & INTERACTION STATE
  //////////////////////////////////////////////////////////////////////////
  isUiDragging: false,
  setIsUiDragging: (dragging) => set({ isUiDragging: dragging }),

  hoverInfo: null,
  clickedUV: null,
  hoverUV: null,

  hoverVertexData: null,
  setHoverVertexData: (data) => set({ hoverVertexData: data }),

  viewingWindowStart: -60,
  viewingWindowWidth: 10,
  setViewingWindowStart: (s) => {
    set({ viewingWindowStart: s });
    return s;
  },
  setViewingWindowWidth: (w) => {
    set({ viewingWindowWidth: w });
    return w;
  },

  setClickedUV: (uv) => set({ clickedUV: uv }),
  setHoverUV: (uv) => set({ hoverUV: uv }),

  setHoverInfo: (info) => {
    if (!info) {
      set({ hoverInfo: null, hoverUV: null });
      return;
    }
    set({ hoverInfo: info });
  },

  hoverYear: null,
  setHoverYear: (year) => set({ hoverYear: year }),
}));