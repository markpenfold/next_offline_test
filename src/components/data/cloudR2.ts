import { checkFileExists, saveToOPFSFolder } from "./diskOPFS";

import {AvailableIndex} from "@/components/data/dataTypes"

export interface GetShardParams {
  item: AvailableDataShard;
  accountId?: string;
  onLog?: (msg: string) => void;
}

export async function getShard({
  item,
  accountId,
  onLog,
}: GetShardParams): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);

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

export interface AvailableDataShard {
  fileName: string;        // Local standardized OPFS filename (e.g., "pro_african_post_1900_v1.parquet")
  s3Key: string;           // Remote R2 Key (e.g., "data/african/era=post_1900/v1/data.parquet")
  masterCategory: string; // e.g., "african"
  era: string;            // e.g., "post_1900"
  tier: string;           // "free" | "pro"
  version: string;        // "v1"
  sizeBytes: number;
  downloadUrl?: string;   // Pre-signed URL returned from API
}

// Standalone fetch function for remote data shards 
export async function fetchAvailableDataShards(accountId: string): Promise<AvailableDataShard[]> {
  try {
    const response = await fetch("/api/categories/list", { // Adjust endpoint URL to match your route path
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });

    if (!response.ok) {
      throw new Error("Failed to compile remote scanning manifests for data shards");
    }

    const data = await response.json();
    const rawShards = data.dataShards || [];

    return rawShards.map((item: any) => {
      // 1. Derive standardized local OPFS filename
      const localFileName = buildLocalDataShardFileName(
        item.tier,
        item.masterCategory,
        item.era,
        item.version || "v1"
      );

      return {
        fileName: localFileName,
        s3Key: item.key || item.s3Key,
        masterCategory: item.masterCategory,
        era: item.era,
        tier: item.tier,
        version: item.version || "v1",
        sizeBytes: item.sizeBytes || item.size || 0,
        downloadUrl: item.downloadUrl,
      };
    });
  } catch (err) {
    console.error("Error pulling scanned remote data shards list:", err);
    return [];
  }
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

//INDEXES //////////////////////////////////////////////////////////
//using POST request with accountId and s3Key support
export interface DownloadIndexOptions {
  item: AvailableIndex;
  accountId: string;
  onLog?: (msg: string) => void;
}

// list indexes using the API
export async function fetchAvailableIndexes(accountId: string): Promise<AvailableIndex[]> {
  try {
    const response = await fetch("/api/aggregates/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });

    if (!response.ok) throw new Error("Failed to compile remote scanning manifests");

    const data = await response.json();
    const rawIndexes = data.indexes || [];

    return rawIndexes.map((item: any) => {
      // Compute the standardized local OPFS name upfront
      const localFileName = buildLocalIndexFileName(
        item.tier,
        item.cube,
        item.era,
        item.version || "v1"
      );

      return {
        key: item.key || item.fileName, // R2 storage path key
        fileName: localFileName,        // Local OPFS file name
        version: item.version || "v1",
        tier: item.tier,
        era: item.era,
        cube: item.cube,
        sizeBytes: item.size,
      };
    });
  } catch (err) {
    console.error("Error pulling scanned remote catalog list:", err);
    return [];
  }
}

export async function getMasterIndex({
  item,
  accountId,
  onLog,
}: DownloadIndexOptions): Promise<{ success: boolean; targetFileName: string }> {
  const log = (msg: string) => onLog?.(msg);

  log(`📡 Fetching master index layer from remote storage: "${item.fileName}"...`);

  try {
    const response = await fetch("/api/aggregates/download/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        key: item.key, // Exact object path in R2 bucket
        cube: item.cube,
        version: item.version || "v1",
        era: item.era,
        tier: item.tier,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    log("Streaming index dataset content across proxy...");
    const arrayBuffer = await response.arrayBuffer();

    // 💾 Save directly to the /indexes/ OPFS folder using fName
    await saveToOPFSFolder("indexes", item.fileName, arrayBuffer);

    log(`🟢 Successfully downloaded and saved index layer: /indexes/${item.fileName}`);

    return { success: true, targetFileName: item.fileName, };
  } catch (err: any) {
    console.error("Master index download failed:", err);
    log(`❌ Master Index Process Error: ${err.message}`);
    return { success: false, targetFileName: item.fileName, };
  }
}

//Standard Order: index__<tier>__<cube>__<era>__<version>.parquet
export function buildLocalIndexFileName(
  tier: string,
  cube: string,
  era: string,
  version: string = "v1"
): string {
  const cleanEra = era.replace(/^era=/, "");
  const cleanVersion = version || "v1";
  return `index__${tier}__${cube}__${cleanEra}__${cleanVersion}.parquet`;
}