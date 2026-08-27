import { TimelineEvent, EventLink } from "@/components/omenland/omenTypes";
export interface AvailableIndex {
  key:string;
  fileName: string;
  category:string;
  tier: "free" | "pro"; 
  version:string;    
  s3Key?: string;        
  sizeBytes?: number;   
  handle?: FileSystemFileHandle; 

}

export interface AvailableIndex2 {
  key?:string;
  fileName: string;
  category:string;
  tier: "free" | "pro"; 
  handle?: FileSystemFileHandle; 
  default_version:string;
  versions:string[];
}

export interface DownloadIndexOptions {
  item: AvailableIndex;
  accountId: string;
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

export interface IndexRow {
  year: string;
  folderName: string;
  eventCount: string;
  eventUuids: string[];
}

export interface GetShardParams {
  item: AvailableDataShard;
  accountId?: string;
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

export type OPFSDirectory = "indexes" | "data" | "projects";

// Define the exact tuple shape you requested
export type TerrainTuple = [
  number,      // [0] year
  string[],    // [1] [category, category, ...]
  number[],    // [2] [event_count, event_count, ...]
  number,      // [3] highest_precision
  string[][]   // [4] [[uuids], [uuids], ...]
];

export interface OmenlandInitPayload {
  availableIndexes: AvailableIndex[];
  downloadedIndexes: string[];
  localProjects: Array<{ name: string; handle: FileSystemFileHandle }>;
  activeDataViewIndexes: ActiveDataViewIndex[];
  activeProjectName: string | null;
  
  // Hydrated from session.json / ProjectConfig
  windowStartYear?: number | null;
  fullYearRange?: [number, number] | null;
  isGeologicalTime?: boolean;
  builderEvents?:  TimelineEvent[] | null;
}

export interface OPFSFile {
  name: string;
  handle: FileSystemFileHandle
}

/**
 * Universal project and session configuration state model saved to OPFS
 */
export interface ProjectConfig {
  /** Name of the active workspace project (null when running in transient session.json mode) */
  activeProjectName?: string | null;

  /** Selected active dataset index selections */
  activeDataViewIndexes?: ActiveDataViewIndex[];

  /** Starting year anchor for the active 1,024-year WebGPU viewing window */
  windowStartYear?: number | null;

  /** Toggle state for deep geological time vs. the 50,000-year human era limit */
  isGeologicalTime?: boolean;

  /** ISO 8601 timestamp automatically recorded when saved to OPFS */
  updatedAt?: string;

  builderEvents?:  TimelineEvent[];
}

export type TerrainYearStep = [
  number,     // 0: Year
  string[],   // 1: Categories
  number[],   // 2: Counts
  string[][]  // 3: UUIDs grouped by category
];

export interface ActiveDataViewIndex {
  fileName: string;
  category: string;
  tier: string;
}

