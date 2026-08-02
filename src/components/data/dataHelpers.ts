import { Slot } from '@/stores/useDataStore';
import { AvailableIndex } from '@/components/data/dataTypes';
import { 
COLLECTION_COLORS_T6_GREYSCALE,
COLLECTION_COLORS_T6,
COLLECTION_COLORS_P1,
COLLECTION_COLORS_PONTORMO_FRESCO,
COLLECTION_COLORS_BAROCCI_16,
COLLECTION_COLORS_MICHELANGELO_16,
COLLECTION_COLORS_VELAZQUEZ_16,
URUSHI_16,
COLLECTION_COLORS_GOYA_WITCHES_16, } from '@/lib/utils/col_constants';
import { getSharedDuckDBEngine, loadShardIntoEngine } from "./duckDATA";
let sharedReadConn: any = null; // Type as duckdb.AsyncDuckDBConnection if exported
import { getOPFSFileHandle } from '@/components/data/diskOPFS';
// ============================================================================
// Types
// ============================================================================

export type TerrainIndexMap = Map<number, { count: number; uuids: string[] }>;

export interface SliceResult {
  /** 1024-element normalized/raw float array directly streamed to GPU VBO */
  buffer: Float32Array;
  /** Lookup map matching `year` -> array of event UUIDs in that bucket */
  uuidMap: Map<number, string[]>;
}

// ============================================================================
// Helper: sliceWindow
// ============================================================================

export function sliceWindow(
  terrainIndexData: Map<number, { count: number; uuids: string[] }> | null,
  startYear: number,
  stepSize: number = 1,
  minYear?: number,
  maxYear?: number
): SliceResult {
  // 1. Allocation is guaranteed to be 0-initialized by JS spec
  const buffer = new Float32Array(1024);
  const uuidMap = new Map<number, string[]>();

  // 2. Instant exit if completely empty (~0 ms)
  if (!terrainIndexData || terrainIndexData.size === 0) {
    return { buffer, uuidMap };
  }

  // Calculate the absolute end year of this current sliding window
  const endYear = startYear + 1023 * stepSize;

  // 3. EARLY EXIT: Entire window is outside the timeline's range (~0 ms)
  if (minYear !== undefined && maxYear !== undefined) {
    if (startYear > maxYear || endYear < minYear) {
      return { buffer, uuidMap }; 
    }
  }

  // 4. PARTIAL OVERLAP OPTIMIZATION: Only loop through valid indices
  let startIndex = 0;
  let endIndex = 1024;

  if (minYear !== undefined && minYear > startYear) {
    // Math.ceil ensures we snap to the next valid step index
    startIndex = Math.ceil((minYear - startYear) / stepSize);
  }

  if (maxYear !== undefined && maxYear < endYear) {
    // Math.floor ensures we don't overshoot the max year
    endIndex = Math.floor((maxYear - startYear) / stepSize) + 1;
  }

  // Safety clamp just in case of weird step-size math
  startIndex = Math.max(0, startIndex);
  endIndex = Math.min(1024, endIndex);

  // 5. Fixed/Clamped extraction loop
  for (let i = startIndex; i < endIndex; i++) {
    const currentYear = startYear + i * stepSize;
    const entry = terrainIndexData.get(currentYear);

    if (entry) {
      buffer[i] = entry.count;

      if (entry.uuids && entry.uuids.length > 0) {
        uuidMap.set(currentYear, entry.uuids);
      }
    }
  }

  return {
    buffer,
    uuidMap,
  };
}

// Gets or creates a reusable connection for blazing-fast reads.
export async function getReadConnection() {
  if (!sharedReadConn) {
    const db = await getSharedDuckDBEngine();
    sharedReadConn = await db.connect();
  }
  return sharedReadConn;
}


// Added bypassGate flag to resolve the initialization deadlock loop safely
export async function runQuery(sql: string) {
  try {

    const conn = await getReadConnection();
    const result = await conn.query(sql);
    
    return { 
      data: result.toArray(), 
      error: null 
    };
  } catch (err: any) {
    // Log the exact SQL that failed for easy debugging
    console.error(`🦆 DuckDB Query Error: ${err.message}\nSQL: ${sql}`);
    
    return { 
      data: [], // Always return an array so .map() in UI doesn't crash
      error: err.message 
    };
  }
}
/**
 * Reads a single index Parquet file from DuckDB VFS 
 * and compiles it directly into a slot's terrainIndexData Map.
 */
export async function loadSlotIndexData(
  fileName: string
): Promise<Map<number, { count: number; uuids: string[] }>> {
  
  // 1. Fetch file handle from OPFS on demand
  const fileHandle = await getOPFSFileHandle('indexes', fileName);
  
  if (fileHandle) {
    // 2. Register/mount file handle in DuckDB VFS (~2ms)
    await loadShardIntoEngine('indexes', fileName, fileHandle);
  }

  // 3. Query DuckDB now that VFS knows about the file
  const sql = `
    SELECT 
      CAST(year AS BIGINT) AS year,
      CAST(event_count AS BIGINT) AS count,
      uuids
    FROM read_parquet('${fileName}')
    ORDER BY year ASC;
  `;

  const result = await runQuery(sql);
  const indexMap = new Map<number, { count: number; uuids: string[] }>();

  if (result.data) {
    for (const row of result.data) {
      indexMap.set(Number(row.year), {
        count: Number(row.count),
        uuids: row.uuids || [],
      });
    }
  }

  return indexMap;
}

export interface HydrationResult {
  slot: Slot;
  resolvedWindowStartYear: number;
}

export async function hydrateSingleSlot(
  fileName: string,
  slotIndex: number,
  windowStartYear: number | null,
  category: string
): Promise<HydrationResult> {
  // Guard 1: Metadata integrity check
  if (!category) {
    throw new Error(
      `[hydrateSingleSlot] Failed slot ${slotIndex}: Missing required category for dataset '${fileName}'.`
    );
  }

  // 1. Load the full timeline Map directly from the OPFS Parquet file via DuckDB
  const terrainIndexData = await loadSlotIndexData(fileName);

  // Guard 2: Dataset integrity check
  if (!terrainIndexData || terrainIndexData.size === 0) {
    throw new Error(
      `[hydrateSingleSlot] Failed slot ${slotIndex}: Parquet dataset '${fileName}' contains no temporal data.`
    );
  }

  // 2. Extract min/max directly from pre-sorted Map keys
  const years = Array.from(terrainIndexData.keys());
  const minYear = years[0];
  const maxYear = years[years.length - 1];

  // 3. Resolve start year (bootstraps to minYear on first run when store year is null)
  const resolvedYear = windowStartYear ?? minYear;

  // 4. Generate the 1024-year Float32Array buffer and uuidMap
  const windowSlice = sliceWindow(terrainIndexData, resolvedYear);

  // 5. Build and return explicit Slot object + resolved window year
  const slot: Slot = {
    id: slotIndex,
    fileName,
    category,
    isActive: true,
    color: COLLECTION_COLORS_T6[slotIndex] || '#ffffff',
    terrainIndexData,
    buffer: windowSlice.buffer,
    uuidMap: windowSlice.uuidMap,
    minYear,
    maxYear,
  };

  return { slot, resolvedWindowStartYear: resolvedYear };
}


export function deriveTotalYearSpan(
  slots: Slot[],
  defaultSpan: [number, number] = [1000, 2024]
): [number, number] {
  // Filter for active slots that have valid min/max year bounds
  const activeSlots = slots.filter(
    (s) => s.isActive && s.minYear !== undefined && s.maxYear !== undefined
  );

  if (activeSlots.length === 0) return defaultSpan;

  const min = Math.min(...activeSlots.map((s) => s.minYear!));
  const max = Math.max(...activeSlots.map((s) => s.maxYear!));

  return [min, max];
}




