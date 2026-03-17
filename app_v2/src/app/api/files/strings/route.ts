import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { StringEntry } from '@/lib/types';

/** com/fs/A$1.class → com/fs/A.java */
function toSourcePath(className: string): string {
  return className
    .replace(/\$[^/]+(?=\.(class|java)$)/, '')
    .replace(/\.class$/, '.java');
}

type DbRow = {
  id: number;
  owner_class_name: string;
  cp_index: number | null;
  utf8_index: number;
  const_table: string;
  value: string;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
};

function rowToEntry(r: DbRow): StringEntry {
  return {
    id: r.id,
    ownerClassName: r.owner_class_name,
    cpIndex: r.cp_index,
    utf8Index: r.utf8_index,
    constTable: r.const_table,
    value: r.value,
    startLine: r.start_line,
    startCol: r.start_col,
    endLine: r.end_line,
    endCol: r.end_col,
  };
}

const STMT = `
  SELECT se.id, se.owner_class_name, se.cp_index, se.utf8_index,
         se.const_table, se.value,
         se.start_line, se.start_col, se.end_line, se.end_col
  FROM string_entries se
  JOIN file_contents fc ON se.file_content_id = fc.id
  JOIN source_files sf ON fc.source_file_id = sf.id
  WHERE sf.jar_name = ? AND sf.source_path = ? AND fc.dataset = ?
  ORDER BY se.start_line, se.start_col
`;

/**
 * GET /api/files/strings?jar=&class=
 * → { original: StringEntry[] | null, localization: StringEntry[] | null }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jar = searchParams.get('jar');
  const cls = searchParams.get('class');

  if (!jar || !cls) {
    return NextResponse.json({ error: 'BAD_PAYLOAD' }, { status: 400 });
  }

  try {
    const db = getDb();
    const sourcePath = toSourcePath(cls);
    const stmt = db.prepare(STMT);

    const origRows = stmt.all(jar, sourcePath, 'original') as DbRow[];
    const locRows = stmt.all(jar, sourcePath, 'localization') as DbRow[];

    return NextResponse.json({
      original: origRows.length > 0 ? origRows.map(rowToEntry) : null,
      localization: locRows.length > 0 ? locRows.map(rowToEntry) : null,
    });
  } catch (err) {
    console.error('[api/files/strings]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
