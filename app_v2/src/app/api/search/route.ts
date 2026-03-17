import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { SearchResult, SearchMatch } from '@/lib/types';

const MAX_RESULTS = 200;

/**
 * GET /api/search?q=
 * → { results: SearchResult[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getDb();
    const like = `%${q}%`;
    const classRows = db.prepare(`
      SELECT DISTINCT
        sf.jar_name,
        sf.source_path,
        sf.has_original,
        sf.has_localization
      FROM source_files sf
      LEFT JOIN file_contents fc ON fc.source_file_id = sf.id
      LEFT JOIN string_entries se ON se.file_content_id = fc.id
      WHERE sf.source_path LIKE ?
         OR se.owner_class_name LIKE ?
      ORDER BY sf.jar_name, sf.source_path
      LIMIT ?
    `).all(like, like, MAX_RESULTS) as Array<{
      jar_name: string; source_path: string;
      has_original: number; has_localization: number;
    }>;

    const stringRows = db.prepare(`
      SELECT
        sf.jar_name,
        sf.source_path,
        sf.has_original,
        sf.has_localization,
        se.value,
        se.utf8_index,
        se.owner_class_name,
        se.start_line,
        fc.dataset,
        CASE WHEN sep.string_entry_id IS NULL THEN 0 ELSE 1 END AS included_by_paratranz
      FROM string_entries se
      JOIN file_contents fc ON se.file_content_id = fc.id
      JOIN source_files sf ON fc.source_file_id = sf.id
      LEFT JOIN string_entry_paratranz sep ON sep.string_entry_id = se.id
      WHERE se.value LIKE ?
      ORDER BY sf.jar_name, sf.source_path,
               CASE WHEN sep.string_entry_id IS NULL THEN 1 ELSE 0 END,
               fc.dataset, se.start_line
      LIMIT ?
    `).all(like, MAX_RESULTS) as Array<{
      jar_name: string; source_path: string;
      has_original: number; has_localization: number;
      value: string; utf8_index: number;
      owner_class_name: string; start_line: number;
      dataset: string;
      included_by_paratranz: number;
    }>;

    const map = new Map<string, SearchResult>();

    for (const r of classRows) {
      const key = `${r.jar_name}\0${r.source_path}`;
      map.set(key, {
        jarName: r.jar_name,
        sourcePath: r.source_path,
        hasOriginal: r.has_original === 1,
        hasLocalization: r.has_localization === 1,
        matches: [{ type: 'class', matchedPath: r.source_path }] satisfies SearchMatch[],
      });
    }

    for (const r of stringRows) {
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
        includedByParatranz: r.included_by_paratranz === 1,
      });
    }

    return NextResponse.json({ results: [...map.values()] });
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
