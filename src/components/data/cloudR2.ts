import { checkFileExists, saveToOPFSFolder, getLocalOPFSIndexes, getLocalOPFSDataShards } from "./diskOPFS";
import { useAppStore } from "@/providers/AppStoreProvider";
import {AvailableIndex, AvailableDataShard, DownloadIndexOptions} from "@/components/data/dataTypes"
import { isReallyOnline, isSUPAyOnline } from '@/lib/utils/checkOnline';

export interface GetShardParams {
  item: AvailableDataShard;
  accountId?: string;
  onLog?: (msg: string) => void;
}

// Get the main data parquet 
export async function getShard({
  item,
  accountId,
  onLog,
}: GetShardParams): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);

    // Fail fast if offline
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    return {
      success: false,
      fileName: item.fileName, 
    };
  }


  if (!accountId) {
    log("❌ Action aborted: Active account context is missing or null.");
    return { success: false, fileName: item.fileName };
  }

  log(`🔍 Checking local cache for data shard: "${item.masterCategory}"...`);

  // Use the standardized local filename directly from item
  const safeLocalFileName = item.fileName;

  try {
    // 1. Check local cache first
    const fileExists = await checkFileExists("data", safeLocalFileName);

    if (fileExists) {
      log(`⚡ Cache Hit! "/data/${safeLocalFileName}" is active.`);
      return { success: true, fileName: safeLocalFileName };
    }

    log(`📡 Cache Miss. Fetching shard from remote R2 repository...`);

    // 2. Fetch using POST endpoint
    const response = await fetch("/api/categories/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        key: item.s3Key,
        tier: item.tier,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
    }

    log("Streaming dataset binary content across proxy...");
    const arrayBuffer = await response.arrayBuffer();

    // 3. Save to local OPFS folder
    await saveToOPFSFolder("data", safeLocalFileName, arrayBuffer);
    log(`🟢 Successfully downloaded and saved to: /data/${safeLocalFileName}`);

    return { success: true, fileName: safeLocalFileName };
  } catch (err: any) {
    log(`❌ Process Error: ${err.message}`);
    return { success: false, fileName: safeLocalFileName };
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





////////////////////////////////////////////////////////////////////////////////////////////////////////
///// Get data from index requests /////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function syncFullDataShards({
  item,
  accountId,
  signal,
  onLog,
}: {
  item: AvailableIndex;
  accountId: string;
  signal?: AbortSignal;
  onLog?: (msg: string) => void;
}): Promise<{ success: boolean; files: string[] }> {
  const specs = resolveDataShardSpecs(item);
  const downloadedFiles: string[] = [];

  const syncPromises = specs.map(async (spec) => {
    if (signal?.aborted) return false;

    // 1. Check OPFS local cache
    const exists = await checkFileExists("data", spec.localFileName);
    if (exists) {
      onLog?.(`⚡ Full data cache hit: /data/${spec.localFileName}`);
      downloadedFiles.push(spec.localFileName);
      return true;
    }

    // 2. Fetch missing split from R2 via proxy API
    onLog?.(`📡 Cache miss. Prefetching full shard: ${spec.s3Key}...`);
    
    const response = await fetch("/api/categories/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        key: spec.s3Key,
        tier: spec.tier,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed downloading shard ${spec.s3Key}: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // 3. Save to OPFS /data directory
    await saveToOPFSFolder("data", spec.localFileName, arrayBuffer);
    onLog?.(`🟢 Cached full shard to OPFS: /data/${spec.localFileName}`);
    
    downloadedFiles.push(spec.localFileName);
    return true;
  });

  try {
    const results = await Promise.all(syncPromises);
    const allSucceeded = results.every(Boolean);
    return { success: allSucceeded, files: downloadedFiles };
  } catch (err: any) {
    if (err.name === "AbortError") {
      onLog?.(`⏹️ Background download canceled for ${item.category}`);
    } else {
      console.error(`❌ Error syncing full data for ${item.category}:`, err);
    }
    return { success: false, files: downloadedFiles };
  }
}


export interface DataShardSpec {
  localFileName: string;
  s3Key: string;
  tier: "free" | "pro";
  era: "pre_1900" | "post_1900";
}

export function resolveDataShardSpecs(item: AvailableIndex): DataShardSpec[] {
  const cat = item.category.replace(/^master_category=/i, "");
  const ver = (item.version || "v1").replace(/^version=/i, "");
  const tier: "free" | "pro" = item.tier === "pro" ? "pro" : "free";

  const eras: Array<"pre_1900" | "post_1900"> = ["pre_1900", "post_1900"];

  return eras.map((era) => ({
    // Flat local OPFS cache name
    localFileName: `${cat}_${ver}_${era}.parquet`,
    
    // Relative object key inside whichever bucket 'tier' resolves to
    s3Key: `data/master_category=${cat}/era=${era}/version=${ver}/data.parquet`,
    
    tier,
    era,
  }));
}