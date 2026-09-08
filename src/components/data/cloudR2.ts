import { checkFileExists, saveToOPFSFolder,deleteOPFSFile, getLocalOPFSIndexes, getLocalOPFSDataShards } from "./diskOPFS";
import {AvailableIndex, AvailableDataShard, DownloadIndexOptions} from "@/components/data/dataTypes"
import { getSharedDuckDBEngine } from "./duckDATA";

export interface GetShardParams {
  fileName: string; // e.g. "index__pro__ancient_history__v1.json"
  accountId: string;
}
export interface ShardMeta {
  localFileName: string;
  tier: "free" | "pro";
  category: string;
  era: "pre_1900" | "post_1900";
  version: string;
  s3Key?: string;
  s3Keys?: string[];
}
export interface FetchShardParams {
  shardMeta: ShardMeta;
  accountId: string;
}
export interface ParsedShardName {
  tier: "free" | "pro";
  category: string;
  era: "pre_1900" | "post_1900";
  version: string;
}


export function getLocalShardNamesFromIndex(indexFileName: string): ShardMeta[] {
  // 1. Strip path prefixes, extension, and index prefix
  const baseName = indexFileName.split("/").pop() || indexFileName;
  const cleanBase = baseName
    .replace(/^index__/, "")
    .replace(/\.json$/, "")
    .replace(/\.parquet$/, "");

  const parts = cleanBase.split("__").filter(Boolean);
  if (parts.length < 3) {
    console.error(`❌ Invalid index filename format: ${indexFileName}`);
    return [];
  }

  // 2. Extract components defensively
  const tier = (parts[0] === "pro" ? "pro" : "free") as "free" | "pro";
  
  // Last segment is the version; middle segments form the category name
  const rawVersion = parts[parts.length - 1];
  const version = rawVersion.replace(/^version=/, "").toLowerCase();

  const rawCategory = parts.slice(1, parts.length - 1).join("_");
  const category = rawCategory.replace(/^master_category=/, "").toLowerCase();

  const eras: Array<"pre_1900" | "post_1900"> = ["pre_1900", "post_1900"];

  return eras.map((era) => {
    // Hive R2 storage path layout for history-files buckets
    const s3Key = `master_category=${category}/version=${version}/era=${era}/data.parquet`;

    return {
      localFileName: buildLocalDataShardFileName(tier, category, era, version),
      tier,
      category,
      era,
      version,
      s3Key,
    };
  });
}

// Helper to fetch an individual binary data shard from R2
async function fetchDataBuffer(
  accountId: string,
  tier: "free" | "pro",
  s3Key: string
): Promise<{ buffer: ArrayBuffer | null; status: number }> {
  const response = await fetch("/api/categories/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, key: s3Key, tier }),
  });

  if (response.status === 404) {
    return { buffer: null, status: 404 };
  }

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return { buffer, status: 200 };
}

// Fetches data shards from R2 and compacts multi-part segments into OPFS /data
export async function fetchAndSaveSingleShard({
  shardMeta,
  accountId,
  db: dbParam,
}: FetchShardParams & { db?: any }): Promise<boolean> {
  const { localFileName, tier, category, era, version } = shardMeta;

  // Resolve s3Keys array, falling back to default Hive key path
  const defaultKey = `master_category=${category}/era=${era}/version=${version}/data.parquet`;
  const shards =
    shardMeta.s3Keys && shardMeta.s3Keys.length > 0
      ? shardMeta.s3Keys
      : [shardMeta.s3Key || defaultKey];

  try {
    // =========================================================================
    // FAST PATH: Single File Data Shard (Standard case)
    // =========================================================================
    if (shards.length === 1) {
      const s3Key = shards[0];
      console.log(`📡 Fetching key "${s3Key}" from remote R2...`);

      const { buffer, status } = await fetchDataBuffer(accountId, tier, s3Key);

      if (status === 404 || !buffer) {
        console.warn(`ℹ️ No shard found for era [${era}] at ${s3Key}`);
        return false;
      }

      console.log(`Streaming ${localFileName} dataset binary content...`);
      await saveToOPFSFolder("data", localFileName, buffer);
      console.log(`🟢 Successfully downloaded and saved to: /data/${localFileName}`);

      return true;
    }

    // =========================================================================
    // COMPACTION PATH: Multi-Part Split Data Shards
    // =========================================================================
    const db = dbParam || (await getSharedDuckDBEngine());
    console.log(`🧩 Multi-part data shard detected (${shards.length} segments) for "${category}" [${era}]. Downloading...`);
    const tempFileNames: string[] = [];

    for (let i = 0; i < shards.length; i++) {
      const tempName = `_temp_${localFileName.replace(/\.parquet$/, "")}_part${i + 1}.parquet`;
      const { buffer, status } = await fetchDataBuffer(accountId, tier, shards[i]);

      if (status === 404 || !buffer) {
        console.warn(`⚠️ Multi-part shard segment missing at ${shards[i]}. Aborting download.`);
        // Clean up any temp shards already written
        for (const cleanupFile of tempFileNames) {
          await deleteOPFSFile("data", cleanupFile);
        }
        return false;
      }

      await saveToOPFSFolder("data", tempName, buffer);
      tempFileNames.push(tempName);
    }

    if (!db) {
      throw new Error("DuckDB instance required to compact multi-part data shards");
    }

    console.log(`🛠️ Compacting ${tempFileNames.length} data segments into OPFS file: "${localFileName}"...`);

    const formattedTempPaths = tempFileNames.map((f) => `'data/${f}'`).join(", ");
    await db.query(`
      COPY (
        SELECT * FROM read_parquet([${formattedTempPaths}])
      ) TO 'data/${localFileName}' (FORMAT PARQUET);
    `);

    // Delete temporary OPFS shard files
    for (const tempFile of tempFileNames) {
      await deleteOPFSFile("data", tempFile);
    }

    console.log(`🟢 Successfully merged split data shards into: /data/${localFileName}`);
    return true;

  } catch (err: any) {
    console.log(`❌ Single Shard Download Error (${localFileName}): ${err.message}`);
    return false;
  }
}

// Given an index name -> get related shard names
// Check local OPFS then dl if needed. 

export async function getShardsFromIndex({
  fileName,
  accountId,
}: GetShardParams): Promise<{ success: boolean; downloadedFiles: string[] }> {
  // Fail fast if offline
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    console.warn("❌ Offline: Cannot download shards.");
    return { success: false, downloadedFiles: [] };
  }

  if (!accountId) {
    console.log("❌ Action aborted: Active account context is missing or null.");
    return { success: false, downloadedFiles: [] };
  }

  // Step 1: Derive shard targets from index name
  const shardTargets = getLocalShardNamesFromIndex(fileName);
  if (shardTargets.length === 0) {
    return { success: false, downloadedFiles: [] };
  }

  const downloadedFiles: string[] = [];

  try {
    for (const shardMeta of shardTargets) {
      const { localFileName } = shardMeta;

      // Step 2: Check local OPFS cache
      const fileExists = await checkFileExists("data", localFileName);

      if (fileExists) {
        console.log(`⚡ Cache Hit! "/data/${localFileName}" is active.`);
        downloadedFiles.push(localFileName);
        continue;
      }

      // Step 3: Cache Miss -> Call smaller fetcher function
      const downloaded = await fetchAndSaveSingleShard({
        shardMeta,
        accountId,
      });

      if (downloaded) {
        downloadedFiles.push(localFileName);
      }
    }

    return { success: downloadedFiles.length > 0, downloadedFiles };
  } catch (err: any) {
    console.error(`❌ Shard Sync Error for ${fileName}: ${err.message}`);
    return { success: false, downloadedFiles };
  }
}

// Standalone fetch function for remote data shards 
export async function fetchAvailableDataShards(accountId: string): Promise<AvailableDataShard[]> {
  const response = await fetch("/api/categories/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch remote data shards manifest`);
  }

  const data = await response.json();
  const rawShards = data.dataShards || [];

  return rawShards.map((item: any) => ({
    fileName: buildLocalDataShardFileName(
      item.tier,
      item.masterCategory,
      item.version || "v1"
    ),
    s3Key: item.key || item.s3Key,
    masterCategory: item.masterCategory,
    era: item.era,
    tier: item.tier,
    version: item.version || "v1",
    sizeBytes: item.sizeBytes || item.size || 0,
    downloadUrl: item.downloadUrl,
  }));
}

export function buildLocalDataShardFileName(
  tier: string,
  masterCategory: string,
  era: string,
  version: string = "v1"
): string {
  // e.g. "pro_african_post_1900_v1.parquet"
  const cleanEra = era.replace("era=", "");
  return `${tier.toLowerCase()}_${masterCategory.toLowerCase()}_${cleanEra.toLowerCase()}_${version.toLowerCase()}.parquet`;
}


export function parseLocalDataShardFileName(fileName: string): ParsedShardName | null {
  if (!fileName.endsWith(".parquet")) return null;

  // Extract base name to handle full path inputs (e.g., "/data/free_...parquet")
  const baseName = fileName.split("/").pop() || fileName;

  // Pattern breakdown:
  // ^(free|pro)_          -> Match tier at start
  // (.+?)                 -> Lazy capture for category (stops at first era tag)
  // _(pre_1900|post_1900) -> Match known era options exactly
  // _(v\d+)               -> Match version tag (e.g. v1, v2)
  // \.parquet$            -> Match extension
  const regex = /^(free|pro)_(.+?)_(pre_1900|post_1900)_(v\d+)\.parquet$/i;
  const match = baseName.match(regex);

  if (!match) {
    console.warn(`⚠️ [Parser] Filename did not match shard pattern: ${baseName}`);
    return null;
  }

  const [, tier, category, era, version] = match;

  return {
    tier: tier.toLowerCase() as "free" | "pro",
    category: category.toLowerCase(), // e.g. "conspiracy_ufo" or "architecture_design"
    era: era.toLowerCase() as "pre_1900" | "post_1900",
    version: version.toLowerCase(),
  };
}

export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////
///// list indexes using the API ///////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function fetchAvailableIndexes(accountId: string): Promise<AvailableIndex[]> {
  const response = await fetch("/api/aggregates/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch remote indexes manifest`);
  }

  const data = await response.json();
  const rawIndexes: any[] = data.indexes || [];

  if (data.source) {
    console.log(`📋 Index Manifest loaded via [${data.source.toUpperCase()}] (${rawIndexes.length} raw files)`);
  }

  // Group split index shards by unique composite key
  const groupedMap = new Map<string, AvailableIndex>();

  for (const item of rawIndexes) {
    const tier = item.tier || "free";
    const category = item.category || "";
    const version = item.version || "v1";
    const groupKey = `${tier}:${category}:${version}`;
    const s3Key = item.s3Key || item.key;
    const sizeBytes = item.sizeBytes ?? item.size ?? 0;

    if (!groupedMap.has(groupKey)) {
      const fileName = buildLocalIndexFileName(tier, category, version);
      groupedMap.set(groupKey, {
        key: groupKey,
        s3Key,
        s3Keys: [s3Key],
        fileName,
        version,
        tier,
        category,
        sizeBytes,
      });
    } else {
      const existing = groupedMap.get(groupKey)!;
      if (s3Key && !existing.s3Keys.includes(s3Key)) {
        existing.s3Keys.push(s3Key);
      }
      existing.sizeBytes += sizeBytes;
    }
  }

  const amalgamatedIndexes = Array.from(groupedMap.values());
  console.log(`✨ Consolidated into ${amalgamatedIndexes.length} unique master indexes`);

  return amalgamatedIndexes;
}

// Helper to fetch an individual binary shard from R2
async function fetchShardBuffer(
  accountId: string,
  category: string,
  tier: string,
  version: string,
  s3Key: string
): Promise<ArrayBuffer> {
  const response = await fetch("/api/aggregates/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, category, tier, version, s3Key }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: Download failed`);
  }

  return response.arrayBuffer();
}

// Standard Order: index__<tier>__<category>__<version>.parquet
export function buildLocalIndexFileName(
  tier: string,
  category: string,
  version: string = "v1"
): string {
  const cleanVersion = version || "v1";
  return `index__${tier}__${category}__${cleanVersion}.parquet`;
}

export async function getMasterIndex({
  item,
  accountId,
  db: dbParam,
}: DownloadIndexOptions & { db?: any }): Promise<{ success: boolean; targetFileName: string }> {

  // Fail fast if offline
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    return { success: false, targetFileName: item.fileName };
  }

  const shards = item.s3Keys && item.s3Keys.length > 0 ? item.s3Keys : [item.s3Key || item.key];

  try {
    // =========================================================================
    // FAST PATH: Single File Index
    // =========================================================================
    if (shards.length === 1) {
      console.log(`📡 Fetching master index layer: "${item.fileName}"...`);
      const arrayBuffer = await fetchShardBuffer(
        accountId, 
        item.category, 
        item.tier, 
        item.version, 
        shards[0]
      );
      await saveToOPFSFolder("indexes", item.fileName, arrayBuffer);
      return { success: true, targetFileName: item.fileName };
    }

    // =========================================================================
    // COMPACTION PATH: Multi-Part Split Index Shards
    // =========================================================================
    const db = dbParam || (await getSharedDuckDBEngine());
    console.log(`🧩 Multi-part index detected (${shards.length} shards) for "${item.category}". Downloading...`);
    const tempFileNames: string[] = [];

    for (let i = 0; i < shards.length; i++) {
      const tempName = `_temp_${item.category}_part${i + 1}.parquet`;
      const arrayBuffer = await fetchShardBuffer(
        accountId, 
        item.category, 
        item.tier, 
        item.version, 
        shards[i]
      );
      
      await saveToOPFSFolder("indexes", tempName, arrayBuffer);
      tempFileNames.push(tempName);
    }

    if (!db) {
      throw new Error("DuckDB instance required to compact multi-part index shards");
    }

    console.log(`🛠️ Compacting and sorting ${tempFileNames.length} shards into: "${item.fileName}"...`);
    
    const formattedTempPaths = tempFileNames.map((f) => `'indexes/${f}'`).join(", ");
    await db.query(`
      COPY (
        SELECT * FROM read_parquet([${formattedTempPaths}])
        ORDER BY year ASC, precision ASC NULLS LAST
      ) TO 'indexes/${item.fileName}' (FORMAT PARQUET);
    `);

    // Delete temporary OPFS shard files using your exact delete helper
    for (const tempFile of tempFileNames) {
      await deleteOPFSFile("indexes", tempFile);
    }

    console.log(`✅ Successfully merged and sorted split index into: "${item.fileName}"`);
    return { success: true, targetFileName: item.fileName };

  } catch (err: any) {
    console.error("❌ Master index process failed:", err);
    return { success: false, targetFileName: item.fileName };
  }
}