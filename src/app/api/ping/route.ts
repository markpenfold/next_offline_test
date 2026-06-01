// app/ping/route.ts
import { NextResponse } from 'next/server'

// Handles the checkOnline.ts HEAD request safely
export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export async function GET() {
  return new NextResponse('pong', { status: 200 })
}