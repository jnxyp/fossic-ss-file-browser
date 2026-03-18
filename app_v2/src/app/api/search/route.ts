import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { SearchResult, SearchMatch } from '@/lib/types';

const MAX_RESULTS = 200;
const SNIPPET_CONTEXT_RADIUS = 15;

function parseFlag(value: string | null, fallback = true) {
  if (value == null) return fallback;
  return value === '1' || value === 'true';
}

function buildSnippet(text: string, query: string) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const matchIndex = normalizedText.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex < 0) return null;

  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_RADIUS);
  const end = Math.min(normalizedText.length, matchIndex + query.length + SNIPPET_CONTEXT_RADIUS);
  const snippet = normalizedText.slice(start, end);
  return `${start > 0 ? '…' : ''}${snippet}${end < normalizedText.length ? '…' : ''}`;
}

function findFirstMatchLine(sourceCode: string, query: string) {
  const lines = sourceCode.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const snippet = buildSnippet(lines[i], query);
    if (snippet) {
      return {
        startLine: i + 1,
        snippet,
      };
    }
  }
  return null;
}

/**
 * GET /api/search?q=
 * → { results: SearchResult[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const searchClasses = parseFlag(searchParams.get('class'));
  const searchStrings = parseFlag(searchParams.get('string'));
  const searchCode = parseFlag(searchParams.get('code'));

  if (!q || (!searchClasses && !searchStrings && !searchCode)) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getDb();
    const like = `%${q}%`;
    const classRows = searchClasses ? db.prepare(`
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
    }> : [];

    const stringRows = searchStrings ? db.prepare(`
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
    }> : [];

    const codeRows = searchCode ? db.prepare(`
      SELECT
        sf.jar_name,
        sf.source_path,
        sf.has_original,
        sf.has_localization,
        fc.dataset,
        fc.source_code
      FROM file_contents fc
      JOIN source_files sf ON fc.source_file_id = sf.id
      WHERE fc.source_code LIKE ?
      ORDER BY sf.jar_name, sf.source_path, fc.dataset
      LIMIT ?
    `).all(like, MAX_RESULTS) as Array<{
      jar_name: string; source_path: string;
      has_original: number; has_localization: number;
      dataset: string;
      source_code: string;
    }> : [];

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
        snippet: buildSnippet(r.value, q) ?? r.value,
        utf8Index: r.utf8_index,
        ownerClassName: r.owner_class_name,
        startLine: r.start_line,
        includedByParatranz: r.included_by_paratranz === 1,
      });
    }

    const codeMatchSeen = new Map<string, Set<string>>();

    for (const r of codeRows) {
      const located = findFirstMatchLine(r.source_code, q);
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

      const snippet = located?.snippet ?? q;
      const signature = `${located?.startLine ?? 0}\0${snippet}`;
      const seenDatasets = codeMatchSeen.get(key) ?? new Set<string>();
      if (seenDatasets.has(signature)) {
        continue;
      }

      seenDatasets.add(signature);
      codeMatchSeen.set(key, seenDatasets);
      map.get(key)!.matches.push({
        type: 'code',
        value: snippet,
        snippet,
        startLine: located?.startLine,
      });
    }

    return NextResponse.json({ results: [...map.values()] });
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
