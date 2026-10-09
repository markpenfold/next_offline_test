import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rebuildBlogIndex } from '@/lib/blog/rebuildIndex'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { accountSlug, accountId } = body

    if (!accountSlug || !accountId) {
      return NextResponse.json(
        { error: 'Missing accountSlug or accountId parameter' }, 
        { status: 400 }
      )
    }

    await rebuildBlogIndex(supabase, accountSlug, accountId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Failed to rebuild index route:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to rebuild index.html' }, 
      { status: 500 }
    )
  }
}