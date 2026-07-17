
export interface AvailableIndex {
  key:string;
  fileName: string;
  tier: "free" | "pro"; 
  era: string;
  cube: string;         
  s3Key?: string;        
  sizeBytes?: number;   
  handle?: FileSystemFileHandle; 
  version:string;
}


export interface AvailableIndex {
  key:string;
  fileName: string;
  tier: "free" | "pro"; 
  era: string;
  cube: string;         
  s3Key?: string;        
  sizeBytes?: number;   
  handle?: FileSystemFileHandle; 
  version:string;
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
  onLog?: (msg: string) => void;
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

export const INDEX_TABLE_NAME = 'main.test_index';

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
  loadedIndexes: string[];
  localProjects: Array<{ name: string; handle: FileSystemFileHandle }>;
  activeDataViewIndexes: string[];
  activeProjectName: string | null;
}

export interface OPFSFile {
  name: string;
  handle: FileSystemFileHandle
}


export interface ProjectConfig {
  activeDataViewIndexes: string[];
 // year: number;
  //month:number;
 // day:number;
  updatedAt: string;
}


export type TerrainShaderTuple = [
  string[],       // 0: indexNames (Columns layout)
  number[][],     // 1: heights (Matrix: [years][categories])
  number[],       // 2: summedHeights (Vector: [years])
  string[][][]    // 3: uuids (Matrix: [years][categories][strings])
];