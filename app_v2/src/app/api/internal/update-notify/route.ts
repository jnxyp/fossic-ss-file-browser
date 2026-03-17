import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST() {
  try {
    const rows = getDb()
      .prepare('SELECT key, value FROM meta')
      .all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    console.log(`[update-notify] revision=${map['revision'] ?? '—'} updated=${map['last_updated'] ?? '—'}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[update-notify] error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
