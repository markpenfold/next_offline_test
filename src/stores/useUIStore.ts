import { create } from 'zustand';
import { useDATAStore } from '@/stores/useDataStore'; // Adjust import path as needed
import { checkWebGPUSupport, WebGPUStatus } from '@/lib/utils/general';
import {
  loadGpuSettingsFromOPFS,
  saveGpuSettingsToOPFS,
  OPFSGpuSettings,

} from '@/components/data/diskOPFS';

import { showWebGPUToast } from '@/lib/utils/webgpuToast';
// Extend or import these interfaces based on your types
interface GPUStatus {
  supported: boolean;
  [key: string]: any;
}


export interface UIStore {
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