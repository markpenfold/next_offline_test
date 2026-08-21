import { useDATAStore } from './useDataStore';
import { useUIStore } from './useUIStore';
import { saveProject } from '@/components/data/diskOPFS';

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastResult: ReturnType<T> | undefined = undefined;

  const debounced = (...args: Parameters<T>): ReturnType<T> | undefined => {
    lastArgs = args;

    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      if (lastArgs) {
        lastResult = fn(...lastArgs);
        timer = null;
        lastArgs = null;
      }
    }, delay);

    return lastResult;
  };

  // Immediately executes any pending invocation
  debounced.flush = (): ReturnType<T> | undefined => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      lastResult = fn(...lastArgs);
      timer = null;
      lastArgs = null;
    }
    return lastResult;
  };

  // Cancels any pending execution without running it
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return debounced;
}

// 1. Unified save function reading fresh snapshots from both stores
export async function performSave(){
  const dataState = useDATAStore.getState();
  const uiState = useUIStore.getState();
  const { accountId, isInitialized, isInitializing, activeProjectName } = dataState;
  
  if (!accountId || !isInitialized || isInitializing) return;

  const payload = {
    activeProjectName,
    activeDataViewIndexes: dataState.activeDataViewIndexes,
    windowStartYear: dataState.windowStartYear,
    isGeologicalTime: dataState.isGeologicalTime,
    builderEvents: uiState.timelineBuilderEvents,
  };

  try {
    await saveProject(accountId, activeProjectName, payload);
    console.log(
      `💾 Auto-saved state to OPFS [${dataState.activeDataViewIndexes.length} active slots]`
    );
  } catch (error) {
    console.error('Failed to auto-save project:', error);
  }

};

// 2. Debounce to handle rapid changes (e.g., rapid slider drags or typing)
export const debouncedSave = debounce(performSave, 400);

/**
 * Call this once at application startup (e.g. inside an App.tsx useEffect).
 * Subscribes to changes across both stores and triggers debounced saves.
 */
export function initAutoSaveWatcher() {
    let prevDataSnapshot = '';
    let prevEventsSnapshot = '';
  
    // Standard 1-argument subscribe for DATAStore
    const unsubDataStore = useDATAStore.subscribe((state) => {
      const currentSnapshot = JSON.stringify({
        activeProjectName: state.activeProjectName,
        activeDataViewIndexes: state.activeDataViewIndexes,
        windowStartYear: state.windowStartYear,
        isGeologicalTime: state.isGeologicalTime,
        isInitialized: state.isInitialized,
      });
  
      if (currentSnapshot !== prevDataSnapshot) {
        prevDataSnapshot = currentSnapshot;
        debouncedSave();
      }
    });
  
    // Standard 1-argument subscribe for UIStore
    const unsubUIStore = useUIStore.subscribe((state) => {
      const currentEvents = JSON.stringify(state.timelineBuilderEvents);
  
      if (currentEvents !== prevEventsSnapshot) {
        prevEventsSnapshot = currentEvents;
        debouncedSave();
      }
    });
  
    return () => {
      unsubDataStore();
      unsubUIStore();
      debouncedSave.flush(); // Flushes any remaining changes on cleanup
    };
  }