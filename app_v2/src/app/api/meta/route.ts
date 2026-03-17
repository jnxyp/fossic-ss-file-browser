import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { MetaInfo } from '@/lib/types';

export async function GET() {
  try {
    const rows = getDb()
      .prepare('SELECT key, value FROM meta')
      .all() as Array<{ key: string; value: string }>;

    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const meta: MetaInfo = {
      revision: map['revision'] ?? '',
      lastUpdated: map['last_updated'] ?? '',
      schemaVersion: map['schema_version'] ?? '',
    };
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json(
      { revision: '', lastUpdated: '', schemaVersion: '' } satisfies MetaInfo,
      { status: 500 }
    );
  }
}
