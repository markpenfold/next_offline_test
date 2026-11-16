import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { BlogPost } from "@/components/blog/blogHelpers";
import { getBucketName } from "@/lib/blog/helpers";


export interface AccountManifest {
  posts: BlogPost[];
}

export async function rebuildBlogManifest(accountSlug: string) {
  const prefix = `${accountSlug}/posts/`
  const BUCKET_NAME = getBucketName()
  
  // List all files under the account's posts prefix
  const listed = await r2Client.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  }))

  const posts: BlogPost[] = []

  if (listed.Contents) {
    // Filter for post.json files
    const jsonKeys = listed.Contents.filter(item => item.Key?.endsWith('/post.json'))

    for (const obj of jsonKeys) {
      if (!obj.Key) continue
      
      // Fetch each post.json content
      const getRes = await r2Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: obj.Key,
      }))
      
      if (getRes.Body) {
        const text = await getRes.Body.transformToString()
        const metadata = JSON.parse(text)
        
        // Only include published posts in public manifests
        if (metadata.status === 'published') {
          posts.push(metadata)
        }
      }
    }
  }

  // Sort newest first based on dateLastEdited or createdAt
  posts.sort((a, b) => new Date(b.dateLastEdited || b.createdAt).getTime() - new Date(a.dateLastEdited || a.createdAt).getTime())

  // Write the blog-level manifest
  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `${accountSlug}/manifest.json`,
    Body: JSON.stringify({ posts, updatedAt: new Date().toISOString() }, null, 2),
    ContentType: 'application/json',
  }))
}


export async function rebuildRootManifest() {
  // Discover all unique blog accounts by listing top-level prefixes or tracking manifests.
  // For simplicity, we can list top-level directories or scan for account manifests.
  const BUCKET_NAME = getBucketName()

  const listed = await r2Client.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Delimiter: '/',
  }))

  // Delimiter '/' returns prefixes (e.g., "MarkP/", "JaneBlog/")
  const accountSlugs = (listed.CommonPrefixes || []).map(p => p.Prefix?.replace('/', '')).filter(Boolean)

  const allSitePosts: BlogPost[] = []

  for (const slug of accountSlugs) {
    try {
      // Fetch each blog's manifest
      const getRes = await r2Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${slug}/manifest.json`,
      }))

      if (getRes.Body) {
        const text = await getRes.Body.transformToString()
        const blogManifest = JSON.parse(text)
        if (blogManifest.posts) {
          allSitePosts.push(...blogManifest.posts)
        }
      }
    } catch {
      // Ignore if a blog folder doesn't have a manifest yet
    }
  }

  // Sort all site-wide posts globally by date
  allSitePosts.sort((a, b) => new Date(b.dateLastEdited || b.createdAt).getTime() - new Date(a.dateLastEdited || a.createdAt).getTime())

  // Write the site-wide root manifest
  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `root_manifest.json`,
    Body: JSON.stringify({ posts: allSitePosts, updatedAt: new Date().toISOString() }, null, 2),
    ContentType: 'application/json',
  }))
}




/// NEEDS UPDATES TO WORK
/** 
export async function checkSyncStatus(userContext: { accountSlug: string }) {
  // 1. Load local manifest from OPFS
  const rootDir = await getDirectory('publishing')
  let localPosts: BlogPost[] = []
  try {
    const handle = await rootDir.getFileHandle('manifest.json')
    const file = await handle.getFile()
    const data = JSON.parse(await file.text())
    localPosts = data.posts || []
  } catch {
    // If local manifest doesn't exist yet, build it
    localPosts = await rebuildBlogManifest(userContext.accountSlug)
  }

  // 2. Fetch remote manifest from R2
  let remotePosts: any[] = []
  try {
    const res = await fetch(`https://your-cdn.com/${userContext.accountSlug}/manifest.json`)
    if (res.ok) {
      const data = await res.json()
      remotePosts = data.posts || []
    }
  } catch (err) {
    console.warn('Could not reach remote manifest (offline mode?):', err)
    return { isOffline: true, localPosts, remotePosts: [] }
  }

  // 3. Diff them by ID and last edited timestamps
  const remoteMap = new Map(remotePosts.map(p => [p.id, p]))
  const localMap = new Map(localPosts.map(p => [p.id, p]))

  const unpublishedChanges: string[] = [] // Local edits that haven't been pushed
  const missingLocally: string[] = []     // Remote posts missing from OPFS

  for (const local of localPosts) {
    const remote = remoteMap.get(local.id)
    if (!remote) {
      if (local.status === 'published') {
        unpublishedChanges.push(local.id) // Published locally, but not on R2? (Edge case)
      }
    } else {
      // Check if local version is newer than remote version
      if (new Date(local.dateLastEdited) > new Date(remote.dateLastEdited || remote.createdAt)) {
        unpublishedChanges.push(local.id)
      }
    }
  }

  for (const remote of remotePosts) {
    if (!localMap.has(remote.id)) {
      missingLocally.push(remote.id)
    }
  }

  return {
    isOffline: false,
    unpublishedChanges, // Post IDs with local edits pending publish
    missingLocally,     // Post IDs on R2 not found in local OPFS
    localPosts,
    remotePosts,
  }
}*/