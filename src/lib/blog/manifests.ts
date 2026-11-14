import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { ManifestPost } from "@/components/blog/blogHelpers";




export interface AccountManifest {
  posts: ManifestPost[];
}
// ==========================================
// Sub-functions: List Operations
// ==========================================

/**
 * 1. Insert or update a post in a manifest list (prevents duplicate IDs and puts newest first)
 */
function insertIntoManifest(posts: ManifestPost[], postData: ManifestPost): ManifestPost[] {
  const filtered = posts.filter((p) => p.id !== postData.id);
  return [postData, ...filtered];
}

/**
 * 2. Delete a post from a manifest list by ID
 */
function deleteFromManifest(posts: ManifestPost[], postId: string): ManifestPost[] {
  return posts.filter((p) => p.id !== postId);
}

// ==========================================
// R2 Storage Helpers
// ==========================================

async function fetchManifestPosts(bucketName: string, key: string): Promise<ManifestPost[]> {
  try {
    const res = await r2Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key })
    );
    if (res.Body) {
      const str = await res.Body.transformToString();
      const data: AccountManifest = JSON.parse(str);
      return data.posts || [];
    }
  } catch {
    // Manifest doesn't exist yet; return empty array
  }
  return [];
}

async function saveManifestPosts(bucketName: string, key: string, posts: ManifestPost[]) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify({ posts }, null, 2),
      ContentType: "application/json",
    })
  );
}

// ==========================================
// Top-Level Orchestrator Function
// ==========================================

/**
 * Top-level function to update both the account-specific manifest 
 * and the root aggregate-manifest.json
 */
export async function updateManifests(params: {
  bucketName: string;
  accountSlug: string;
  postData: ManifestPost;
  deleteFlag?: boolean;
}) {
  const { bucketName, accountSlug, postData, deleteFlag = false } = params;

  // --- 1. Handle Account-Specific Manifest (${accountSlug}/manifest.json) ---
  const accountManifestKey = `${accountSlug}/manifest.json`;
  let accountPosts = await fetchManifestPosts(bucketName, accountManifestKey);

  if (deleteFlag) {
    accountPosts = deleteFromManifest(accountPosts, postData.id);
  } else {
    accountPosts = insertIntoManifest(accountPosts, postData);
  }

  await saveManifestPosts(bucketName, accountManifestKey, accountPosts);

  // --- 2. Handle Root Aggregate Manifest (aggregate-manifest.json) ---
  const globalManifestKey = `aggregate-manifest.json`;
  let globalPosts = await fetchManifestPosts(bucketName, globalManifestKey);

  if (deleteFlag) {
    globalPosts = deleteFromManifest(globalPosts, postData.id);
  } else {
    globalPosts = insertIntoManifest(globalPosts, postData);
  }

  await saveManifestPosts(bucketName, globalManifestKey, globalPosts);
}

/**
 * 1. Fetch and map existing manifest items by slug
 */
export async function fetchExistingManifestMap(bucketName: string, manifestKey: string):Promise<Map<string, ManifestPost>>  {
  const map = new Map<string, ManifestPost>();
  try {
    const res = await r2Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
    );
    if (res.Body) {
      const rawText = await res.Body.transformToString();
      const parsedData = JSON.parse(rawText);
      const postsList: ManifestPost[] = parsedData.posts || parsedData || [];
      
      for (const item of postsList) {
        const key = item.postSlug || (item as any).slug;
        if (key) {
          map.set(key, item);
        }
      }
    }
  } catch {
    // do nothing - returns empty map
  }
  return map;
}


/**
 * 2. Scan R2 bucket prefix and extract unique post slugs
 */
async function scanR2Slugs(bucketName: string, postsPrefix: string): Promise<string[]> {
  const listResult = await r2Client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: postsPrefix })
  );
  
  const objects = listResult.Contents || [];
  return Array.from(
    new Set(
      objects
        .map((obj) => obj.Key)
        .filter((key): key is string => Boolean(key && key.endsWith("/index.html")))
        .map((key) => {
          const parts = key.split("/");
          return parts[parts.length - 2];
        })
    )
  );
}

/**
 * 3. Parse a new post's HTML file to extract metadata/fallback values
 */
async function parseNewPostFromR2(bucketName: string, htmlKey: string, slug: string, accountSlug: string): Promise<ManifestPost> {
  let title = slug.replace(/-/g, " ");
  let subTitle: string | null = null;
  let heroImage: string | null = null;
  let postId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const file = await r2Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: htmlKey })
    );
    if (file.Body) {
      const html = await file.Body.transformToString();

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch?.[1]) title = titleMatch[1].trim();

      const subTitleMatch = html.match(/<p class=["']post-subtitle["']>(.*?)<\/p>/i);
      if (subTitleMatch?.[1]) subTitle = subTitleMatch[1].trim();

      const heroMatch = html.match(/<img[^>]+class=["'][^"']*post-hero-image[^"']*["'][^>]+src=["']([^"']+)["']/i);
      if (heroMatch?.[1]) heroImage = heroMatch[1];

      const idMatch = html.match(/data-post-id=["']([^"']+)["']/i);
      if (idMatch?.[1]) postId = idMatch[1];
    }
  } catch {
    // Fallback defaults if reading HTML fails
  }

  return {
    id: postId,
    postSlug: slug,
    title,
    subTitle,
    heroImage,
    publishedAt: now,
    updatedAt: now,
    accountSlug,
    author: {
      userId: "",
      accountId: "",
      accountSlug,
      name: "Author",
    },
  };
}

/**
 * 4. Main Orchestrator: Scans R2, merges with existing manifest, and overwrites R2
 */
export async function rebuildAccountManifestFromR2(params: {
  bucketName: string;
  accountSlug: string;
}): Promise<ManifestPost[]> {
  const { bucketName, accountSlug } = params;

  const postsPrefix = `${accountSlug}/posts/`;
  const manifestKey = `${accountSlug}/manifest.json`;

  const existingManifestMap = await fetchExistingManifestMap(bucketName, manifestKey);
  const postSlugs = await scanR2Slugs(bucketName, postsPrefix);

  const mergedPosts: ManifestPost[] = await Promise.all(
    postSlugs.map(async (slug) => {
      const existingEntry = existingManifestMap.get(slug);
      if (existingEntry) {
        return existingEntry; // Preserve stable UUID and timestamps
      }
      return parseNewPostFromR2(bucketName, `${postsPrefix}${slug}/index.html`, slug, accountSlug);
    })
  );

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: manifestKey,
      Body: JSON.stringify({ posts: mergedPosts }, null, 2),
      ContentType: "application/json",
    })
  );

  return mergedPosts;
}