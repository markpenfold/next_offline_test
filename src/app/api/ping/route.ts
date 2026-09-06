// app/api/ping/route.ts
import { NextResponse } from 'next/server';

export async function HEAD() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export async function GET() {
  return new NextResponse('pong', { 
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}