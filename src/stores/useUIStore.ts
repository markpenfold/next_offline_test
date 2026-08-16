// stores/useUIStore.ts
import { create } from 'zustand';
import { useDATAStore } from '@/stores/useDataStore';
import { checkWebGPUSupport, WebGPUStatus } from '@/lib/utils/general';
import {
  loadGpuSettingsFromOPFS,
  saveGpuSettingsToOPFS,
  OPFSGpuSettings,
} from '@/components/data/diskOPFS';

import { showWebGPUToast } from '@/lib/utils/webgpuToast';
import { TimelineEvent, EventLink } from "@/components/omenland/omenTypes";
import { GraphNode, GraphLink, GraphData } from "@/components/omenland/omenTypes";
import { sortTimelineEvents } from '@/lib/utils/general';


interface GPUStatus {
  supported: boolean;
  [key: string]: any;
}

export type PanelTab = 'histories' | 'events';

export interface UIStore {

  //Graph view items
  graphData: GraphData;
  setGraphData: (data: GraphData) => void;
  selectedNode: string | null;
  setSelectedNode: (node: string | null) => void;
  hoveredNode: string | null;
  setHoveredNode: (node: string | null) => void;
  selectedLink: { sourceId: string; targetId: string; linkType: string } | null;
  setSelectedLink: (
    link: { sourceId: string; targetId: string; linkType: string } | null
  ) => void;



  addEventLink: (sourceId: string, targetId: string, linkType?: string, weight?: number) => void; // Add a link with type and weight
  updateEventGraphPosition: (eventId: string, x: number, y: number, z: number) => void; // Update event's graph node position
  updateEventLinks: (eventId: string, linkedTo: EventLink[]) => void; // Update event's linkedTo array
  removeEventLink: (sourceId: string, targetId: string, linkType?: string) => void; // Remove a link (optionally by type)
  updateEventLinkWeight: (sourceId: string, targetId: string, linkType: string, weight: number) => void; // Update weight of an existing link
  updateEventNote: (eventId: string, note: string) => void; 
  isUiDragging: boolean;
  setIsUiDragging: (dragging: boolean) => void;


  // Histories and Events Window
  activePanelTab: PanelTab;
  setActivePanelTab: (tab: PanelTab) => void;

  // Event State (Transient UI Data)
  latestClickedEvents: TimelineEvent[];
  timelineBuilderEvents: TimelineEvent[];
  setLatestClickedEvents: (events: TimelineEvent[]) => void;
  addToTimeline: (event: TimelineEvent) => void;
  removeFromTimeline: (eventId: string) => void;
  clearTimelineBuilder: () => void;

  // Modal & Visibility
  finderIsOpen: boolean;
  setFinderOpen: (open: boolean) => void;

  // Transient Loading Indicators
  loadingKeys: string[];
  setKeyLoading: (key: string, isLoading: boolean) => void;

  // Hover & Spatial Interaction
  hoverCoord: { x: number; y: number; z: number } | null;
  setHoverCoord: (coord: { x: number; y: number; z: number } | null) => void;

  // GPU & Renderer Display Preferences
  gpuPreference: 'unset' | 'webgl' | 'webgpu';
  gpuStatus: GPUStatus | null;
  useWebGL: boolean;

  setGpuPreference: (pref: 'unset' | 'webgl' | 'webgpu') => Promise<void>;
  resetGpuPreference: () => Promise<void>;
  initWebGPUSupport: (accountId?: string | null) => Promise<void>;
}

export const useUIStore = create<UIStore>((set, get) => ({

  //////////////////////////////////////////////////////////////////////////
  // EVENT METADATA - notes, graph positions, links
  //////////////////////////////////////////////////////////////////////////
  updateEventNote: (eventId: string, note: string) => {
    const { timelineBuilderEvents } = get();

    const updated = sortTimelineEvents(timelineBuilderEvents.map(event =>
      event._id === eventId
        ? { ...event, userNote: note }
        : event
    ));

    set({ timelineBuilderEvents: updated });
    console.log(`📝 Updated note for event ${eventId}`);
  },

  updateEventGraphPosition: (eventId: string, x: number, y: number, z: number) => {
    const { timelineBuilderEvents } = get();

    const updatedEvents = sortTimelineEvents(timelineBuilderEvents.map(event => {
      if (event._id === eventId) {
        return {
          ...event,
          graphNodePosition: { x, y, z }
        };
      }
      return event;
    }));

    set({ timelineBuilderEvents: updatedEvents });
    console.log(`📍 Saved graph position for event ${eventId}: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
  },

  updateEventLinks: (eventId: string, linkedTo: EventLink[]) => {
    const { timelineBuilderEvents } = get();

    const updated = sortTimelineEvents(timelineBuilderEvents.map(event =>
      event._id === eventId
        ? { ...event, linkedTo }
        : event
    ));

    set({ timelineBuilderEvents: updated });
    console.log(`🔗 Updated links for event ${eventId}:`, linkedTo);
  },

  addEventLink: (sourceId: string, targetId: string, linkType: string = 'contributing_factor', weight: number = 0) => {
    const { timelineBuilderEvents } = get();
    const maxDuplicateLinks = 4;

    const updated = sortTimelineEvents(timelineBuilderEvents.map(event => {
      if (event._id === sourceId) {
        const currentLinks = event.linkedTo || [];
        // Count links to the same target (regardless of type)
        // Handle both old string format and new EventLink format
        const count = currentLinks.filter(link => {
          const tid = typeof link === 'string' ? link : link.targetId;
          return tid === targetId;
        }).length;
        if (count < maxDuplicateLinks) {
          const newLink = { targetId, linkType, weight };
          return { ...event, linkedTo: [...currentLinks, newLink] };
        }
      }
      return event;
    }));

    set({ timelineBuilderEvents: updated });
    console.log(`🔗 Added link: ${sourceId} -> ${targetId} (${linkType}, weight: ${weight})`);
  },

  removeEventLink: (sourceId: string, targetId: string, linkType?: string) => {
    const { timelineBuilderEvents } = get();

    const updated = sortTimelineEvents(timelineBuilderEvents.map(event => {
      if (event._id === sourceId) {
        const currentLinks = event.linkedTo || [];
        // Handle both old string format and new EventLink format
        if (linkType) {
          const indexToRemove = currentLinks.findIndex(link => {
            const tid = typeof link === 'string' ? link : link.targetId;
            const lt = typeof link === 'string' ? 'contributing_factor' : link.linkType;
            return tid === targetId && lt === linkType;
          });
          if (indexToRemove >= 0) {
            const newLinks = [...currentLinks];
            newLinks.splice(indexToRemove, 1);
            return { ...event, linkedTo: newLinks };
          }
        } else {
          // Remove first link to this target
          const indexToRemove = currentLinks.findIndex(link => {
            const tid = typeof link === 'string' ? link : link.targetId;
            return tid === targetId;
          });
          if (indexToRemove >= 0) {
            const newLinks = [...currentLinks];
            newLinks.splice(indexToRemove, 1);
            return { ...event, linkedTo: newLinks };
          }
        }
      }
      return event;
    }));

    set({ timelineBuilderEvents: updated });
    console.log(`🔗 Removed link: ${sourceId} -> ${targetId}${linkType ? ` (${linkType})` : ''}`);
  },

  isUiDragging: false,
  setIsUiDragging: (dragging) => set({ isUiDragging: dragging }),


  updateEventLinkWeight: (sourceId: string, targetId: string, linkType: string, weight: number) => {
    const { timelineBuilderEvents } = get();

    const updated = sortTimelineEvents(timelineBuilderEvents.map(event => {
      if (event._id === sourceId) {
        const currentLinks = event.linkedTo || [];
        // Find the matching link and update its weight
        const updatedLinks = currentLinks.map(link => {
          if (typeof link === 'string') return link;
          if (link.targetId === targetId && link.linkType === linkType) {
            return { ...link, weight };
          }
          return link;
        });
        return { ...event, linkedTo: updatedLinks };
      }
      return event;
    }));

    set({ timelineBuilderEvents: updated });
    //console.log(`⚖️ Updated weight: ${sourceId} -> ${targetId} (${linkType}) = ${weight}`);
  },





  //////////////////////////////////////////////////////////////////////////
  // GRAPH STATE - nodes, links, selection, hover
  //////////////////////////////////////////////////////////////////////////
  graphData: { nodes: [], links: [] },
  setGraphData: (data) => set({ graphData: data }),
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),
  hoveredNode: null,
  setHoveredNode: (node) => set({ hoveredNode: node }),
  selectedLink: null,
  setSelectedLink: (link) => set({ selectedLink: link }),


  // Histories and Events Window
  activePanelTab: 'histories',
  setActivePanelTab: (tab) => set({ activePanelTab: tab }),

  // Event State
  latestClickedEvents: [],
  timelineBuilderEvents: [],

  setLatestClickedEvents: (events) => set({ latestClickedEvents: events }),

  addToTimeline: (event) =>
    set((state) => {
      if (state.timelineBuilderEvents.some((e) => e._id === event._id)) {
        return state;
      }
      return { timelineBuilderEvents: [...state.timelineBuilderEvents, event] };
    }),

  removeFromTimeline: (eventId) =>
    set((state) => ({
      timelineBuilderEvents: state.timelineBuilderEvents.filter((e) => e._id !== eventId),
    })),

  clearTimelineBuilder: () => set({ timelineBuilderEvents: [] }),

  // Modals
  finderIsOpen: false,
  setFinderOpen: (openORclosed) => set({ finderIsOpen: openORclosed }),

  // Transient Loading Keys
  loadingKeys: [],
  setKeyLoading: (key, isLoading) => {
    const currentKeys = get().loadingKeys;
    const nextKeys = isLoading
      ? currentKeys.includes(key) ? currentKeys : [...currentKeys, key]
      : currentKeys.filter((k) => k !== key);

    set({ loadingKeys: nextKeys });
  },

  // Pointer Interaction
  hoverCoord: null,
  setHoverCoord: (coord) =>
    set({
      hoverCoord: coord ? { x: coord.x, y: coord.y, z: coord.z } : null,
    }),

  // Hardware & Display Settings
  gpuPreference: 'unset',
  gpuStatus: null,
  useWebGL: false,

  setGpuPreference: async (pref) => {
    const accountId = useDATAStore.getState().accountId;
    const { gpuStatus } = get();
    const shouldFallback = pref === 'webgl' || !gpuStatus?.supported;

    set({ gpuPreference: pref, useWebGL: shouldFallback });

    if (accountId) {
      await saveGpuSettingsToOPFS(accountId, {
        gpuPreference: pref,
        updatedAt: new Date().toISOString(),
      });
    }
  },

  resetGpuPreference: async () => {
    const accountId = useDATAStore.getState().accountId;
    set({ gpuPreference: 'unset', useWebGL: false });

    if (accountId) {
      await saveGpuSettingsToOPFS(accountId, {
        gpuPreference: 'unset',
        updatedAt: new Date().toISOString(),
      });
    }

    await get().initWebGPUSupport(accountId);
  },

  initWebGPUSupport: async (accountId?: string | null) => {
    const targetAccountId = accountId ?? useDATAStore.getState().accountId ?? null;

    const status = await checkWebGPUSupport();
    set({ gpuStatus: status });

    let opfsSettings: OPFSGpuSettings | null = null;
    if (targetAccountId) {
      opfsSettings = await loadGpuSettingsFromOPFS(targetAccountId);
    }

    if (opfsSettings && opfsSettings.gpuPreference !== 'unset') {
      const pref = opfsSettings.gpuPreference;
      set({ gpuPreference: pref, useWebGL: pref === 'webgl' || !status.supported });
    } else {
      if (!status.supported) {
        set({ gpuPreference: 'webgl', useWebGL: true });
        if (targetAccountId) {
          await saveGpuSettingsToOPFS(targetAccountId, {
            gpuPreference: 'webgl',
            updatedAt: new Date().toISOString(),
          });
        }
        showWebGPUToast(status);
      } else {
        set({ gpuPreference: 'webgpu', useWebGL: false });
        if (targetAccountId) {
          await saveGpuSettingsToOPFS(targetAccountId, {
            gpuPreference: 'webgpu',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  },
}));