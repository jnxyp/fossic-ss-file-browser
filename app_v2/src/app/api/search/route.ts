import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { SearchResult, SearchMatch } from '@/lib/types';

const MAX_RESULTS = 200;

/**
 * GET /api/search?q=&type=class|string
 * → { results: SearchResult[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const type = searchParams.get('type') as 'class' | 'string' | null;

  if (!q || (type !== 'class' && type !== 'string')) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getDb();
    const like = `%${q}%`;

    if (type === 'class') {
      // Match against source_path (file path) or owner_class_name in string_entries
      const rows = db.prepare(`
        SELECT DISTINCT sf.jar_name, sf.source_path, sf.has_original, sf.has_localization
        FROM source_files sf
        WHERE sf.source_path LIKE ?
        ORDER BY sf.jar_name, sf.source_path
        LIMIT ?
      `).all(like, MAX_RESULTS) as Array<{
        jar_name: string; source_path: string;
        has_original: number; has_localization: number;
      }>;

      const results: SearchResult[] = rows.map(r => ({
        jarName: r.jar_name,
        sourcePath: r.source_path,
        hasOriginal: r.has_original === 1,
        hasLocalization: r.has_localization === 1,
        matches: [{ type: 'class', matchedPath: r.source_path }] satisfies SearchMatch[],
      }));
      return NextResponse.json({ results });
    }

    // type === 'string'
    const rows = db.prepare(`
      SELECT
        sf.jar_name, sf.source_path, sf.has_original, sf.has_localization,
        se.value, se.utf8_index, se.owner_class_name, se.start_line,
        fc.dataset
      FROM string_entries se
      JOIN file_contents fc ON se.file_content_id = fc.id
      JOIN source_files sf ON fc.source_file_id = sf.id
      WHERE se.value LIKE ?
      ORDER BY sf.jar_name, sf.source_path, fc.dataset, se.start_line
      LIMIT ?
    `).all(like, MAX_RESULTS) as Array<{
      jar_name: string; source_path: string;
      has_original: number; has_localization: number;
      value: string; utf8_index: number;
      owner_class_name: string; start_line: number;
      dataset: string;
    }>;

    // Group by jar+path
    const map = new Map<string, SearchResult>();
    for (const r of rows) {
      const key = `${r.jar_name}\0${r.source_path}`;
      if (!map.has(key)) {
        map.set(key, {
          jarName: r.jar_name,
          sourcePath: r.source_path,
          hasOriginal: r.has_original === 1,
          hasLocalization: r.has_localization === 1,
          matches: [],
        });
      }
      map.get(key)!.matches.push({
        type: 'string',
        dataset: r.dataset as 'original' | 'localization',
        value: r.value,
        utf8Index: r.utf8_index,
        ownerClassName: r.owner_class_name,
        startLine: r.start_line,
      });
    }

    return NextResponse.json({ results: [...map.values()] });
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
