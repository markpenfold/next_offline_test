import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, BUCKET_NAME } from '@/lib/blog/r2'
import { createClient } from '@/lib/supabase/server'
import { checkPublishingPermissions } from '@/lib/supabase/client_queries'

export async function POST(request: Request) {
  // 1. Instantiate server-side Supabase client (scoped to request headers/cookies)
  const supabase = await createClient()

  // 2. Authenticate user session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 3. Parse multipart payload from Tiptap editor
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const accountId = formData.get('accountId') as string | null
    const accountSlug = formData.get('accountSlug') as string | null
    const postSlug = formData.get('postSlug') as string | null

    if (!file) return NextResponse.json({ error: 'Missing file payload' }, { status: 400 })
    if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
    if (!accountSlug) return NextResponse.json({ error: 'Missing accountSlug' }, { status: 400 })
    if (!postSlug) return NextResponse.json({ error: 'Missing postSlug' }, { status: 400 })

    // 4. Verify membership privileges using shared helper
    const hasPermission = await checkPublishingPermissions(supabase, user.id, accountId)
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient privileges for this account' },
        { status: 403 }
      )
    }

    // 5. Convert file binary stream for S3 client
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique WebP asset path inside post directory
    const fileExt = file.name.split('.').pop() || 'webp'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`
    
    // R2 Key: <accountSlug>/posts/<postSlug>/media/<fileName>
    const r2Key = `${accountSlug}/posts/${postSlug}/media/${fileName}`

    // 6. Upload binary object to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        Body: buffer,
        ContentType: file.type || 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    )

    // 7. Construct and return final public asset URL for insertion into Tiptap
    const publicUrl = `https://${accountSlug}.omen.land/${postSlug}/media/${fileName}`

    return NextResponse.json({
      success: true,
      url: publicUrl,
    })
  } catch (error: any) {
    console.error('Failed to upload image to R2:', error)
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
  }
}