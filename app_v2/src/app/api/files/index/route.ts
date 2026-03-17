import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Dataset } from '@/lib/types';

function toSourcePath(className: string): string {
  return className
    .replace(/\$[^/]+(?=\.(class|java)$)/, '')
    .replace(/\.class$/, '.java');
}

function parseConstTable(className: string): string {
  return className.match(/(\$[^/]+)(?=\.(class|java)$)/)?.[1] ?? '';
}

/**
 * GET /api/files/index?jar=&class=&dataset=&utf8ConstId=
 * → { lines: number[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jar = searchParams.get('jar');
  const cls = searchParams.get('class');
  const dataset = searchParams.get('dataset') as Dataset | null;
  const utf8ConstId = searchParams.get('utf8ConstId');

  if (!jar || !cls || !dataset || !utf8ConstId) {
    return NextResponse.json({ error: 'BAD_PAYLOAD' }, { status: 400 });
  }

  const utf8Index = parseInt(utf8ConstId.replace('#', ''), 10);
  if (isNaN(utf8Index)) return NextResponse.json({ lines: [] });

  try {
    const rows = getDb().prepare(`
      SELECT DISTINCT se.start_line
      FROM string_entries se
      JOIN file_contents fc ON se.file_content_id = fc.id
      JOIN source_files sf ON fc.source_file_id = sf.id
      WHERE sf.jar_name = ?
        AND sf.source_path = ?
        AND fc.dataset = ?
        AND se.utf8_index = ?
        AND se.const_table = ?
      ORDER BY se.start_line
    `).all(jar, toSourcePath(cls), dataset, utf8Index, parseConstTable(cls)) as Array<{ start_line: number }>;

    return NextResponse.json({ lines: rows.map(r => r.start_line) });
  } catch (err) {
    console.error('[api/files/index]', err);
    return NextResponse.json({ lines: [] }, { status: 500 });
  }
}
