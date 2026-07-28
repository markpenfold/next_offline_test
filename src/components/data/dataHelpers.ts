import { Slot } from '@/stores/useDataStore';
import { AvailableIndex } from '@/components/data/dataTypes';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';
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

/**
 * Slices and bins a dataset starting from `startYear` across 1024 GPU histogram channels.
 * 
 * @param terrainIndexData Map of target year -> { count, uuids }
 * @param startYear The window offset (e.g. 1000 AD or -65,000,000 for geological view)
 * @param stepSize Scale multiplier per bin (default: 1 year per bin)
 */
export function sliceWindow(
  terrainIndexData: TerrainIndexMap | null,
  startYear: number,
  stepSize: number = 1
): SliceResult {
  // 1. Allocation is guaranteed to be 0-initialized by JS spec
  const buffer = new Float32Array(1024);
  const uuidMap = new Map<number, string[]>();

  // 2. Instant exit if empty (~0 ms)
  if (!terrainIndexData || terrainIndexData.size === 0) {
    return { buffer, uuidMap };
  }

  // 3. Fixed 1024-step extraction (3 microseconds in V8)
  for (let i = 0; i < 1024; i = i + 1) {
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


// Hydrates a single target slot given a file name, assigned slot index, 
// and the current window start year.
export async function hydrateSingleSlot(
  fileName: string,
  slotIndex: number,
  windowStartYear: number,
  categoryName?: string | null,
  availableIndexes?: AvailableIndex[]
): Promise<Slot> {

  // 1. Resolve category display name
  let resolvedCategory: string = categoryName || '';

  if (!resolvedCategory && availableIndexes) {
    const matchedIndex = availableIndexes.find(function (item: AvailableIndex) {
      return item.fileName === fileName;
    });

    if (matchedIndex) {
      resolvedCategory = matchedIndex.category;
    }
  }

  // Fallback to filename if no category metadata was found
  if (!resolvedCategory) {
    resolvedCategory = fileName;
  }

  // 2. Load the full timeline Map directly from the OPFS Parquet file via DuckDB
  const terrainIndexData = await loadSlotIndexData(fileName);

  // 3. Generate the 1024-year Float32Array buffer and uuidMap for this window
  const windowSlice = sliceWindow(terrainIndexData, windowStartYear);

  // 4. Resolve hex color assigned to this slot index
  const slotColor: string = COLLECTION_COLORS_T6[slotIndex] || '#ffffff';

  // 5. Build and return the fully populated Slot object explicitly
  const hydratedSlot: Slot = {
    id: slotIndex,
    fileName: fileName,
    category: resolvedCategory,
    isActive: true,
    color: slotColor,
    terrainIndexData: terrainIndexData,
    buffer: windowSlice.buffer,
    uuidMap: windowSlice.uuidMap,
  };

  return hydratedSlot;
}