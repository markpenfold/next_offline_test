// useUIStore.ts
import { create } from 'zustand';
import type { BufferGeometry } from 'three';

type GraphNode = any;
type GraphLink = any;
type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

interface UIStore {
  graphData: GraphData;
  setGraphData: (data: GraphData) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  hoveredNode: GraphNode | null;
  setHoveredNode: (node: GraphNode | null) => void;
  isUiDragging: boolean;
  setIsUiDragging: (dragging: boolean) => void;
  hoverInfo: unknown;
  clickedUV: unknown;
  hoverUV: unknown;
  hoverVertexData: unknown;
  setHoverVertexData: (data: unknown) => void;
  viewingWindowStart: number;
  viewingWindowWidth: number;
  setViewingWindowStart: (s: number) => number;
  setViewingWindowWidth: (w: number) => number;
  setClickedUV: (uv: unknown) => void;
  setHoverUV: (uv: unknown) => void;
  setHoverInfo: (info: unknown) => void;
  selectedLink: GraphLink | null;
  setSelectedLink: (link: GraphLink | null) => void;
  hoverYear: number | null;
  setHoverYear: (year: number | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  
      //////////////////////////////////////////////////////////////////////////
      // GRAPH STATE - nodes, links, selection, hover
      //////////////////////////////////////////////////////////////////////////
      graphData: { nodes: [], links: [] },
      setGraphData: (data) => set({ graphData: data }),
      selectedNode: null,
      setSelectedNode: (node) => set({ selectedNode: node }),
      hoveredNode: null,
      setHoveredNode: (node) => set({ hoveredNode: node }),

      //////////////////////////////////////////////////////////////////////////
      // UI STATE - dragging, hover info, viewing window
      //////////////////////////////////////////////////////////////////////////
      isUiDragging: false,
      setIsUiDragging: (dragging) => set({ isUiDragging: dragging }),

      hoverInfo: null,
      clickedUV: null,
      hoverUV: null,

      hoverVertexData: null,
      setHoverVertexData: (data) =>
        set({ hoverVertexData: data }),


      
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

      selectedLink: null,
      setSelectedLink: (link) => set({ selectedLink: link }),

      hoverYear:  null as number | null,
      setHoverYear: (year: number | null) => set({ hoverYear: year }),

}));


