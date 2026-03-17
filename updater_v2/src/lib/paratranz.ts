import fs from 'fs';
import type { Database } from './db';
import { logger } from './logger';

interface RawJarClassFile {
  path?: string;
  include_strings?: unknown;
}

interface RawMapEntry {
  type?: string;
  path?: string;
  class_files?: RawJarClassFile[];
}

export interface ParatranzJarTarget {
  jarName: string;
  ownerClassName: string;
  value: string;
  sourceMapPath: string;
}

function normalizeOwnerClassName(classPath: string): string {
  return classPath.replace(/\.class$/, '');
}

export function loadParatranzJarTargets(mapPath: string): ParatranzJarTarget[] {
  if (!fs.existsSync(mapPath)) {
    throw new Error(`ParaTranz map not found: ${mapPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`ParaTranz map root must be an array: ${mapPath}`);
  }

  const dedup = new Map<string, ParatranzJarTarget>();

  for (const item of parsed as RawMapEntry[]) {
    if (item.type !== 'jar' || !item.path || !Array.isArray(item.class_files)) continue;

    for (const classFile of item.class_files) {
      if (!classFile.path || !Array.isArray(classFile.include_strings)) continue;

      const ownerClassName = normalizeOwnerClassName(classFile.path);
      for (const value of classFile.include_strings) {
        if (typeof value !== 'string') continue;
        const key = `${item.path}\n${ownerClassName}\n${value}`;
        dedup.set(key, {
          jarName: item.path,
          ownerClassName,
          value,
          sourceMapPath: classFile.path,
        });
      }
    }
  }

  const targets = [...dedup.values()];
  logger.info(`加载 ParaTranz JAR 子集: ${targets.length} 条目标字符串`);
  return targets;
}

export function importParatranzJarTargets(
  db: Database.Database,
  targets: ParatranzJarTarget[],
): void {
  const insertTarget = db.prepare<[string, string, string, string]>(`
    INSERT INTO paratranz_jar_targets (jar_name, owner_class_name, value, source_map_path)
    VALUES (?, ?, ?, ?)
  `);

  for (const target of targets) {
    insertTarget.run(
      target.jarName,
      target.ownerClassName,
      target.value,
      target.sourceMapPath,
    );
  }
}

export function applyParatranzMatches(db: Database.Database): void {
  const matchOriginal = db.prepare(`
    INSERT OR IGNORE INTO string_entry_paratranz
      (string_entry_id, paratranz_target_id, match_method)
    SELECT se.id, pjt.id, 'original_value'
    FROM string_entries se
    JOIN file_contents fc
      ON se.file_content_id = fc.id
    JOIN source_files sf
      ON fc.source_file_id = sf.id
    JOIN paratranz_jar_targets pjt
      ON pjt.jar_name = sf.jar_name
     AND pjt.owner_class_name = se.owner_class_name
     AND pjt.value = se.value
    WHERE fc.dataset = 'original'
  `);

  const propagateToLocalization = db.prepare(`
    INSERT OR IGNORE INTO string_entry_paratranz
      (string_entry_id, paratranz_target_id, match_method)
    SELECT se_loc.id, sep.paratranz_target_id, 'propagated'
    FROM string_entry_paratranz sep
    JOIN string_entries se_orig
      ON sep.string_entry_id = se_orig.id
    JOIN file_contents fc_orig
      ON se_orig.file_content_id = fc_orig.id
     AND fc_orig.dataset = 'original'
    JOIN source_files sf
      ON fc_orig.source_file_id = sf.id
    JOIN file_contents fc_loc
      ON fc_loc.source_file_id = sf.id
     AND fc_loc.dataset = 'localization'
    JOIN string_entries se_loc
      ON se_loc.file_content_id = fc_loc.id
     AND se_loc.owner_class_name = se_orig.owner_class_name
     AND se_loc.utf8_index = se_orig.utf8_index
     AND se_loc.const_table = se_orig.const_table
  `);

  matchOriginal.run();
  propagateToLocalization.run();

  const stats = db.prepare<[], {
    target_count: number;
    matched_entry_count: number;
    included_target_count: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM paratranz_jar_targets) AS target_count,
      (SELECT COUNT(*) FROM string_entry_paratranz) AS matched_entry_count,
      (
        SELECT COUNT(DISTINCT sep.paratranz_target_id)
        FROM string_entry_paratranz sep
      ) AS included_target_count
  `).get();

  if (!stats) {
    throw new Error('Failed to collect ParaTranz match stats');
  }

  logger.info(
    `ParaTranz 匹配完成: 目标 ${stats.target_count}，命中条目 ${stats.matched_entry_count}，命中目标 ${stats.included_target_count}`,
  );
}
