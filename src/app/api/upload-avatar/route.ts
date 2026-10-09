import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client } from '@/lib/blog/r2'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bucketName = process.env.R2_AVATAR_BUCKET || 'user-content'

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or userId' }, { status: 400 })
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Single folder key definition
    const r2Key = `user-avatars/${userId}/avatar.webp`

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=3600',
      })
    )

    return NextResponse.json({ success: true, key: r2Key })
  } catch (error: any) {
    console.error('Failed to upload avatar to R2:', error)
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
  }
}