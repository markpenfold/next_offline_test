# How DUCKDB works
Singleton Database Manager that runs DuckDB-WASM (an analytical SQL database engine) directly inside the user's web browser. It pulls analytical data (Parquet files) from a remote server (Cloudflare R2), caches them locally in the browser's persistent storage (OPFS), and queries them with blazingly fast speeds using background Web Workers.

### FILES
1. cache.ts
2. DuckData.tsx
3. get_cats.ts
4. manager.ts
5. omenWrap.tsx
6. SuperSimpleTestHarness.tsx 


## SuperSimpleTestHarness
> `export function SuperSimpleTestHarness() {`
* Embedded into app>omenland>page.tsx
This component controls the DuckDB manager

#### Variables
1. **R2** - base url used to hit the two folders in the data bucket
* `R2_PRO_BASE_URL`
* `R2_FREE_BASE_URL`

2. **DUCKDB STATE** - state variables with useState
* `engineStatus` - defaults to 'loading'
* `syncLogs`
* `loading`
* `previewRows`

3. **Parquet STATE** - getting the data 
* `tier` - defaults to 'free' - gating access?
* `categories`
* `selectedEra`
* `selectedCategory`

4. **DUCKDB** - instance of the `DuckDBManager` Singleton!!!!!
>  `const db = DuckDBManager.getInstance()`


> [!TIP] 
> **useEffect**
> You use `useEffect` when code needs to run after the component has been rendered and painted onto the screen.
> eg. Adding eventListeners, accessing localStorage ...


#### useEffect 1 - Initialize DuckDB Engine

1. Connects to db created in step 4 of Variables
2. `setEngineStatus` - see step 2 above
3. `refreshGlobalCount` - sets `totalCacheCount` - see step 2 above

#### useEffect 2 - Re-fetch category lists

1. set `bucketName` based on `tier`
2. get categories: `fetch(`/api/categories?bucket=${bucketName}`)`
3. `setCategories` - see 3 above


#### `const handleFetchCategory = async () => {`
> This is the meat of the process
1. creates the url path to the chosen parquet
2. Attempts to grab the file:
* `const newRowsCaptured = await db.getShard(uniqueShardId, fullParquetUrl, [0, 0]);`
3. Update count: `await refreshGlobalCount();`
4. Turns Parquet into 5 rows of usable data:
* `const fetchedItems = await db.getRecordsFromShard(uniqueShardId, [0, 5]);`
5. Presents the data:
* `setPreviewRows(fetchedItems);`




## OmenWrap 
> `export default function OmenWrap({ children }: { children: React.ReactNode }) {`
* Grabs state from `useAppStore`
* Adds `SiteNav`
* Wraps `children` including `SuperSimpleTestHarness` 



## manager.ts
> This CLASS handles duckDB set up, connection, usage 

#### Variables
1. `private static instance: DuckDBManager | null = null;`
* Uses a singleton pattern:

2. `private db: duckdb.AsyncDuckDB | null = null;`
* the db itself, once connected

3. `private conn: duckdb.AsyncDuckDBConnection | null = null;`
* to the db above

4. `private initPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;` 
* This variable acts as a "bookmark" for an initialization process that is currently in progress.
* If a second connection request comes in, the script says, "Hey, I'm already initializing."


#### Functions
1. `public async connect(onStatusChange?: (msg: string) => void): Promise<duckdb.AsyncDuckDBConnection> {`
* Gets storage with `await navigator.storage.persist();`
* `onStatusChange?: (msg: string) => void` - callback used to listen to output of duckdb
* `: Promise<duckdb.AsyncDuckDBConnection>:` The structural promise that this function guarantees it will eventually return a live, usable DuckDB database connection.

2. defines the various components:
 ```javascript
 	  const localWorkerUrl = await getCachedFileBlobUrl("duckdb-worker.js", DuckDBConfig.CDN_WORKER);
      const localModuleUrl = await getCachedFileBlobUrl("duckdb-core.wasm", DuckDBConfig.CDN_MODULE);
      const logger = new duckdb.ConsoleLogger();
      const worker = new Worker(localWorkerUrl); 
      ```
3. creates new db instance:
* `new duckdb.AsyncDuckDB(logger, worker)`: 
* instantiates the JavaScript wrapper for DuckDB.
* links it to a `ConsoleLogger` (to print out database diagnostic messages)
* provides the `worker` (the background browser thread where the data processing actually happens).

4. bring the C++ engine up
* `await this.db.instantiate(localModuleUrl): `
* Downloads/loads the WebAssembly binary (.wasm file) 
* injects it straight into the worker thread


#### Storage
* DuckDB Wasm uses OPFS (Origin Private File System)
* located here: path: `opfs://${cleanDbName}`

#### Memory management
We want to push data out of RAM and into the db. This does that:
```
SET wal_autocheckpoint = '0KB';
SET checkpoint_threshold = '0KB';
```


#### Interacting with the db
> This helper pushes sql to the db, returns json

```javascript
public async query(sql: string): Promise<any[]> {
    if (!this.conn) throw new Error("Database connection not active.");
    const res = await this.conn.query(sql);
    return res.toArray().map((row) => row.toJSON());
  }

```


#### Ingestion of Parquet
> `getShard` uses `query` above
```typescript
  public async getShard(
    shardId: string, 
    parquetUrl: string, 
    recordRange?: [number, number] // Left intact for compatibility, but ignored if [0,0]
  ): Promise<number> {
    if (!this.conn) await this.connect();

```
* builds a standard DuckDB SQL command string to read directly from a remote Parquet file over HTTPS using read_parquet().
* sets the range we are going to request from within the shard 
* `source_shard` tags incoming rows with their source
* Check for record by source_shard and id
* Insert if not found










































