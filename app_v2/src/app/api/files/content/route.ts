import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Dataset } from '@/lib/types';

/** com/fs/A$1.class → com/fs/A.java */
function toSourcePath(className: string): string {
  return className
    .replace(/\$[^/]+(?=\.(class|java)$)/, '')
    .replace(/\.class$/, '.java');
}

/**
 * GET /api/files/content?jar=&class=&dataset=original|localization
 * → { content: string }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jar = searchParams.get('jar');
  const cls = searchParams.get('class');
  const dataset = searchParams.get('dataset') as Dataset | null;

  if (!jar || !cls || !dataset) {
    return NextResponse.json({ error: 'BAD_PAYLOAD' }, { status: 400 });
  }
  if (dataset !== 'original' && dataset !== 'localization') {
    return NextResponse.json({ error: 'BAD_PAYLOAD' }, { status: 400 });
  }

  try {
    const row = getDb().prepare(`
      SELECT fc.source_code
      FROM file_contents fc
      JOIN source_files sf ON fc.source_file_id = sf.id
      WHERE sf.jar_name = ? AND sf.source_path = ? AND fc.dataset = ?
      LIMIT 1
    `).get(jar, toSourcePath(cls), dataset) as { source_code: string } | undefined;

    if (!row) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ content: row.source_code });
  } catch (err) {
    console.error('[api/files/content]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
