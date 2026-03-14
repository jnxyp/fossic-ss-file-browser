import { NextResponse } from 'next/server';
import { getManifest } from '@/lib/manifest';

export async function GET() {
  const manifest = getManifest();
  return NextResponse.json(manifest);
}
