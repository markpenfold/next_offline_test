import { checkFileExists, saveToOPFSFolder, getLocalOPFSIndexes, getLocalOPFSDataShards } from "./diskOPFS";
import {AvailableIndex, AvailableDataShard, DownloadIndexOptions} from "@/components/data/dataTypes"




export interface GetShardParams {
  fileName: string; // e.g. "index__pro__ancient_history__v1.json"
  accountId: string;
}




export interface ShardMeta {
  localFileName: string;
  tier: string;
  category: string;
  era: "pre_1900" | "post_1900";
  version: string;
}

/**
 * 1. Generates local Parquet shard filenames and metadata from an index name
 */
export function getLocalShardNamesFromIndex(indexFileName: string): ShardMeta[] {
  const cleanBase = indexFileName
    .replace(/^index__/, "")
    .replace(/\.json$/, "")
    .replace(/\.parquet$/, "");

  const parts = cleanBase.split("__");
  if (parts.length < 3) {
    console.error(`❌ Invalid index filename format: ${indexFileName}`);
    return [];
  }

  const [tier, category, version] = parts;
  const eras: Array<"pre_1900" | "post_1900"> = ["pre_1900", "post_1900"];

  return eras.map((era) => ({
    localFileName: buildLocalDataShardFileName(tier, category, era, version),
    tier,
    category: category.toLowerCase(),
    era,
    version: version.toLowerCase(),
  }));
}

export interface FetchShardParams {
  shardMeta: ShardMeta;
  accountId: string;
}

// Fetches a single shard from R2 using its calculated S3 key and saves to OPFS
export async function fetchAndSaveSingleShard({
  shardMeta,
  accountId,
}: FetchShardParams): Promise<boolean> {
  const { localFileName, tier, category, era, version } = shardMeta;

  // Derive S3 key directly from shard metadata
  const s3Key = `data/master_category=${category}/era=${era}/version=${version}/data.parquet`;

  console.log(`📡 Fetching key "${s3Key}" from remote R2...`);

  try {
    const response = await fetch("/api/categories/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        key: s3Key,
        tier,
      }),
    });

    if (response.status === 404) {
      console.warn(`ℹ️ No shard found for era [${era}] at ${s3Key}`);
      return false;
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
    }

    console.log(`Streaming ${localFileName} dataset binary content...`);
    const arrayBuffer = await response.arrayBuffer();

    // Save directly to OPFS /data directory
    await saveToOPFSFolder("data", localFileName, arrayBuffer);
    console.log(`🟢 Successfully downloaded and saved to: /data/${localFileName}`);

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

export interface ParsedShardName {
  tier: "free" | "pro";
  category: string;
  era: "pre_1900" | "post_1900";
  version: string;
}

export function parseLocalDataShardFileName(fileName: string): ParsedShardName | null {
  if (!fileName.endsWith(".parquet")) return null;

  // Pattern breakdown:
  // ^(free|pro)_          -> Match tier at start
  // (.+?)                 -> Lazy capture for category (handles multiple underscores)
  // _(pre_1900|post_1900) -> Match known era options exactly
  // _(v\d+)               -> Match version tag (e.g. v1, v2)
  // \.parquet$            -> Match extension
  const regex = /^(free|pro)_(.+)_(pre_1900|post_1900)_(v\d+)\.parquet$/i;
  const match = fileName.match(regex);

  if (!match) {
    console.warn(`⚠️ [Parser] Filename did not match shard pattern: ${fileName}`);
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
/*
activeTier: normalizedTier, // the user's access level
bucketUsed: BUCKET_NAME,  // indexes
indexes: availableIndexes,  // array of AvailableIndex items
  indexes:category,
  tier,
  versions, // Available versions for dropdown
  defaultVersion: versions[0] || "v1", // Newest version selected by default
*/
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
  const rawIndexes = data.indexes || [];

  return rawIndexes.map((item: any) => ({
    key: item.S3key || item.fileName,
    fileName: buildLocalIndexFileName(
      item.tier,
      item.category,
      item.version || "v1"
    ),
    version: item.version || "v1",
    tier: item.tier,
    category: item.category,
    sizeBytes: item.size || 0,
  }));
}

export async function getMasterIndex({
  item,
  accountId,
}: DownloadIndexOptions): Promise<{ success: boolean; targetFileName: string }> {

  // Fail fast if offline
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    return {
      success: false,
      targetFileName: item.fileName, 
    };
  }

  console.log(`📡 Fetching master index layer from remote storage: "${item.fileName}"...`);

  try {
    const response = await fetch("/api/aggregates/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        category: item.category,
        tier: item.tier,
        version: item.version || "v1",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    console.log("Streaming index dataset content across proxy...");
    const arrayBuffer = await response.arrayBuffer();

    // 💾Save directly to the /indexes/ OPFS folder using fileName
    await saveToOPFSFolder("indexes", item.fileName, arrayBuffer);

    return { success: true, targetFileName: item.fileName };
  } catch (err: any) {
    console.error("Master index download failed:", err);
    console.log(`❌ Master Index Process Error: ${err.message}`);
    return { success: false, targetFileName: item.fileName };
  }
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