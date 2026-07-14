// useUIStore.ts
import { create } from 'zustand';

interface DATAStore {
  // State
  downloadedIndexes: string[]; // Files saved on local disk (OPFS)
  loadedIndexes: string[];     // Indexes mounted into active DuckDB context
  
  /*
  An array of unique remote R2 keys currently in an active async state 
  (downloading from R2 or writing to OPFS), 
  e.g., ["pro/category=african/era=post_1900/version=v1/index.parquet"]
  */
  loadingKeys: string[];       // Keys currently downloading or mounting

  // OPFS Disk State Actions
  setDownloadedIndexes: (indexes: string[]) => void;
  addDownloadedIndex: (index: string) => void;

  // DuckDB Context Actions (Base Store + Extensions)
  setLoadedIndexes: (indexes: string[]) => void;
  addLoadedIndex: (newIndex: string) => void;
  removeLoadedIndex: (deleteIndex: string) => void;

  // Async Loading Lock Action
  setKeyLoading: (key: string, isLoading: boolean) => void;
}

export const useDATAStore = create<DATAStore>((set) => ({
    downloadedIndexes: [],
    loadedIndexes: [],
    loadingKeys: [],

    // --- OPFS DISK ACTIONS ---

    setDownloadedIndexes: (indexes) =>
        set(() => ({
        downloadedIndexes: indexes,
        })),

    addDownloadedIndex: (newIndex) =>
        set((state) => {
        if (state.downloadedIndexes.includes(newIndex)) return state;
        return { downloadedIndexes: [...state.downloadedIndexes, newIndex] };
        }),

    // --- DUCKDB / DATAVIEW ACTIVE CONTEXT ACTIONS ---
    setLoadedIndexes: (indexes) =>
        set(() => ({
        loadedIndexes: indexes,
        })),

    addLoadedIndex: (newIndex) =>
        set((state) => {
        // Prevent duplicates safely without mutating state
        if (state.loadedIndexes.includes(newIndex)) return state;
        return { loadedIndexes: [...state.loadedIndexes, newIndex] };
        }),

    removeLoadedIndex: (deleteIndex) =>
        set((state) => ({
        loadedIndexes: state.loadedIndexes.filter((idx) => idx !== deleteIndex),
        })),

    // --- LOADING / LOCK CONTROLLER ---
    setKeyLoading: (key, isLoading) =>
        set((state) => ({
        loadingKeys: isLoading
            ? state.loadingKeys.includes(key)
            ? state.loadingKeys
            : [...state.loadingKeys, key]
            : state.loadingKeys.filter((k) => k !== key),
        })),
    }));