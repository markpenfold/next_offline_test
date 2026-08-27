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


export function formatIndexDisplayName(category = "", version = "v1"): string {
  const formattedCategory = category
    .replace(/^category=/i, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const formattedVersion = version.replace(/^version=/i, "").trim().toUpperCase();
  return `${formattedCategory} ${formattedVersion}`.trim();
}

export function getExpectedDataShardNames(indexFileName: string): string[] {
  // Input examples: "index__free__accidents__v1.json" or "index__pro__conspiracy_ufo__v1"
  const cleanBase = indexFileName
    .replace(/^index__/, "")
    .replace(/\.json$/, "")
    .replace(/\.parquet$/, "");

  const parts = cleanBase.split("__");
  if (parts.length < 3) return [];

  const [tier, category, version] = parts;

  return [
    `${tier}_${category}_pre_1900_${version}.parquet`,
    `${tier}_${category}_post_1900_${version}.parquet`,
  ];
}

export function formatYear(year?: number, isGeologicalTime?: boolean): string {
  if (year === undefined || year === null) return "N/A";
  const roundedYear = Math.round(year);
  const absYear = Math.abs(roundedYear);

  if (isGeologicalTime || absYear >= 1_000_000) {
    if (absYear >= 1_000_000_000) {
      return `${(absYear / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}B YA`;
    }
    if (absYear >= 1_000_000) {
      return `${(absYear / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M YA`;
    }
  }

  return roundedYear < 0 ? `${Math.abs(roundedYear).toLocaleString()} BC` : `${roundedYear} AD`;
}

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


export interface HydrationResult {
  slot: Omit<Slot, 'id' | 'color'> & { color?: string };
  resolvedWindowStartYear: number;
}

/**
 * Reads a single index Parquet file from DuckDB VFS 
 * and compiles it directly into a slot's terrainIndexData Map.
 */
export async function loadSlotIndexData(
  fileName: string
): Promise<{
  indexMap: Map<number, { count: number; uuids: string[] }>;
  totalEvents: number;
}> {
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
  let totalEvents = 0;

  if (result.data) {
  for (const row of result.data) {
    if (Number(row.year) === 961) {
      console.log(`[Index Parquet Check] Year 961 raw count in index file:`, row.count);
    }
  }
}

  if (result.data) {
    for (const row of result.data) {
      const count = Number(row.count);
      totalEvents += count;

      indexMap.set(Number(row.year), {
        count: Number(row.count),
        uuids: row.uuids || [],
      });
    }
  }

  return { indexMap, totalEvents };
}

export async function hydrateSingleSlot(
  fileName: string,
  slotIndex: number,
  windowStartYear: number | null,
  category?: string | null
): Promise<HydrationResult> {
  // Guard 1: Metadata integrity check
  if (!category) {
    throw new Error(
      `[hydrateSingleSlot] Failed slot ${slotIndex}: Missing required category for dataset '${fileName}'.`
    );
  }

  // 1. Load full timeline Map + precomputed total events from OPFS Parquet
  const { indexMap: terrainIndexData, totalEvents } = await loadSlotIndexData(fileName);
  
  // Guard 2: Dataset integrity check
  if (!terrainIndexData || terrainIndexData.size === 0) {
    throw new Error(
      `[hydrateSingleSlot] Failed slot ${slotIndex}: Parquet dataset '${fileName}' contains no temporal data.`
    );
  }

  // Cut off data at year = 2026 by deleting any entries strictly greater than 2026
  for (const year of terrainIndexData.keys()) {
    if (year > 2026) {
      terrainIndexData.delete(year);
    }
  }

  // Guard 3: Check if dataset is empty after the 2026 cutoff
  if (terrainIndexData.size === 0) {
    throw new Error(
      `[hydrateSingleSlot] Failed slot ${slotIndex}: Parquet dataset '${fileName}' contains no temporal data up to year 2026.`
    );
  }

  // 2. Extract min/max directly from pre-sorted Map keys
  const years = Array.from(terrainIndexData.keys());
  const rawMinYear = years[0];
  const maxYear = years[years.length - 1];

  // Ensure the slot's minYear value is not higher than 1000
  const minYear = Math.min(rawMinYear, 1000);

  // 3. Resolve start year (bootstraps to minYear on first run when store year is null, capped at 2026)
  let resolvedYear = 0;
  if(windowStartYear){
    resolvedYear = windowStartYear;
   }else{
    resolvedYear =  minYear;
   }

  console.log("settign resolved year in singlSlot to: ", resolvedYear);

  // 4. Generate the 1024-year Float32Array buffer and uuidMap
  const windowSlice = sliceWindow(terrainIndexData, resolvedYear);
  
  // 5. Build hydrated data object (No dead 'isActive' field)
  return {
    slot: {
      fileName,
      category,
      terrainIndexData,
      buffer: windowSlice.buffer,
      uuidMap: windowSlice.uuidMap,
      minYear,
      maxYear,
      totalEvents,
    },
    resolvedWindowStartYear: resolvedYear,
  };
}


export function deriveTotalYearSpan(
  slots: Slot[],
  defaultSpan: [number, number] = [1000, 2024]
): [number, number] {
  // All slots in the stack are active — filter strictly for valid year bounds
  const slotsWithBounds = slots.filter(
    (s) => s.minYear !== undefined && s.maxYear !== undefined
  );

  if (slotsWithBounds.length === 0) return defaultSpan;

  const min = Math.min(...slotsWithBounds.map((s) => s.minYear!));
  const max = Math.max(...slotsWithBounds.map((s) => s.maxYear!));

  return [min, max];
}




