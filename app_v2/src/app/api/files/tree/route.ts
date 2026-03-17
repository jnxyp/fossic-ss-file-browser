import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { JarInfo, FileInfo } from '@/lib/types';

/**
 * GET /api/files/tree
 * → { jars: JarInfo[] }
 *
 * GET /api/files/tree?jar=starfarer.api.jar
 * → { files: FileInfo[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jar = searchParams.get('jar');

  try {
    const db = getDb();

    if (jar) {
      const rows = db.prepare(`
        SELECT source_path, has_original, has_localization
        FROM source_files
        WHERE jar_name = ?
        ORDER BY source_path
      `).all(jar) as Array<{ source_path: string; has_original: number; has_localization: number }>;

      const files: FileInfo[] = rows.map(r => ({
        path: r.source_path,
        hasOriginal: r.has_original === 1,
        hasLocalization: r.has_localization === 1,
      }));
      return NextResponse.json({ files });
    }

    const rows = db.prepare(`
      SELECT
        jar_name,
        MAX(has_original)     AS has_original,
        MAX(has_localization) AS has_localization
      FROM source_files
      GROUP BY jar_name
      ORDER BY jar_name
    `).all() as Array<{ jar_name: string; has_original: number; has_localization: number }>;

    const jars: JarInfo[] = rows.map(r => ({
      jarName: r.jar_name,
      name: r.jar_name.replace(/\.jar$/, ''),
      hasOriginal: r.has_original === 1,
      hasLocalization: r.has_localization === 1,
    }));
    return NextResponse.json({ jars });
  } catch (err) {
    console.error('[api/files/tree]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
