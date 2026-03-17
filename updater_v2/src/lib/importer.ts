import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { Database } from './db';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// CFR strings.json 格式（新版，含精确范围）
// ---------------------------------------------------------------------------

interface Position {
  line: number;
  col:  number;
}

interface RawStringEntry {
  cp_index?:   number;
  utf8_index:  number;
  const_table?: string;
  value:       string;
  start:       Position;
  end:         Position;
}

interface PerClassStrings {
  class:   string;
  strings: RawStringEntry[];
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 将 class 名映射到对应的 .java 源码路径。
 *
 * 规则：取第一个 $ 之前的部分，替换 .class 后缀为 .java。
 *
 * 示例：
 *   "com/example/A$Inner$Deep" → "com/example/A.java"
 *   "com/example/B"           → "com/example/B.java"
 *   "com/example/B.class"     → "com/example/B.java"
 */
function classNameToSourcePath(className: string): string {
  const withoutClass = className.replace(/\.class$/, '');
  const outerClass   = withoutClass.split('$')[0];
  return `${outerClass}.java`;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// 主导出函数
// ---------------------------------------------------------------------------

/**
 * 解析单个 CFR 反编译 zip，在已开启的外层事务内批量写入 SQLite。
 *
 * 调用方应在外层 db.transaction() 中调用此函数，本函数不自行开启事务。
 *
 * @param db      already-open better-sqlite3 Database
 * @param zipPath CFR 输出的 zip 文件路径
 * @param jarName 原始 jar 文件名，例如 "starfarer.api.jar"
 * @param dataset "original" | "localization"
 */
export function importZipToDb(
  db:      Database.Database,
  zipPath: string,
  jarName: string,
  dataset: 'original' | 'localization',
): void {
  const zip = new AdmZip(zipPath);

  // --- 预编译语句 -----------------------------------------------------------

  const upsertSourceFile = db.prepare<[string, string, number, number]>(`
    INSERT INTO source_files (jar_name, source_path, has_original, has_localization)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (jar_name, source_path) DO UPDATE SET
      has_original     = has_original     | excluded.has_original,
      has_localization = has_localization | excluded.has_localization
  `);

  const getSourceFileId = db.prepare<[string, string], { id: number }>(`
    SELECT id FROM source_files WHERE jar_name = ? AND source_path = ?
  `);

  const insertFileContent = db.prepare<[number, string, string, string]>(`
    INSERT INTO file_contents (source_file_id, dataset, source_code, source_hash)
    VALUES (?, ?, ?, ?)
  `);

  const getFileContentId = db.prepare<[number, string], { id: number }>(`
    SELECT id FROM file_contents WHERE source_file_id = ? AND dataset = ?
  `);

  const insertStringEntry = db.prepare<[number, string, number | null, number, string, string, number, number, number, number]>(`
    INSERT INTO string_entries
      (file_content_id, owner_class_name, cp_index, utf8_index, const_table,
       value, start_line, start_col, end_line, end_col)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const hasOriginal     = dataset === 'original'     ? 1 : 0;
  const hasLocalization = dataset === 'localization' ? 1 : 0;

  // -------------------------------------------------------------------------
  // 阶段 1：遍历 .java 条目，写入 source_files + file_contents
  // -------------------------------------------------------------------------

  // 用 Map 缓存 source_path → file_content_id，避免重复查询
  const contentIdCache = new Map<string, number>();

  let javaCount = 0;

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.java')) continue;

    const sourcePath  = entry.entryName;
    const sourceCode  = entry.getData().toString('utf8');
    const sourceHash  = sha256(sourceCode);

    upsertSourceFile.run(jarName, sourcePath, hasOriginal, hasLocalization);

    const row = getSourceFileId.get(jarName, sourcePath);
    if (!row) continue; // 理论上不应发生

    insertFileContent.run(row.id, dataset, sourceCode, sourceHash);

    const contentRow = getFileContentId.get(row.id, dataset);
    if (contentRow) {
      contentIdCache.set(sourcePath, contentRow.id);
    }

    javaCount++;
  }

  logger.info(`  [${dataset}] ${jarName}: 写入 ${javaCount} 个源码文件`);

  // -------------------------------------------------------------------------
  // 阶段 2：遍历 .strings.json 条目，写入 string_entries
  // -------------------------------------------------------------------------

  let stringsCount = 0;

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.strings.json')) continue;

    let parsed: PerClassStrings;
    try {
      parsed = JSON.parse(entry.getData().toString('utf8')) as PerClassStrings;
    } catch {
      logger.warn(`  解析 .strings.json 失败，跳过: ${entry.entryName}`);
      continue;
    }

    if (!parsed.class || !Array.isArray(parsed.strings)) continue;

    const sourcePath   = classNameToSourcePath(parsed.class);
    const ownerClass   = parsed.class.replace(/\.class$/, '');

    let fileContentId = contentIdCache.get(sourcePath);

    // 如果缓存未命中（例如内部类对应的 .java 在 zip 中缺失），尝试从 DB 查
    if (fileContentId === undefined) {
      const sfRow = getSourceFileId.get(jarName, sourcePath);
      if (sfRow) {
        const fcRow = getFileContentId.get(sfRow.id, dataset);
        if (fcRow) {
          fileContentId = fcRow.id;
          contentIdCache.set(sourcePath, fileContentId);
        }
      }
    }

    if (fileContentId === undefined) {
      // .java 文件在 zip 中缺失（极少数情况），跳过该 class 的字符串
      logger.warn(`  找不到对应 file_content，跳过字符串: ${parsed.class} → ${sourcePath}`);
      continue;
    }

    for (const s of parsed.strings) {
      insertStringEntry.run(
        fileContentId,
        ownerClass,
        s.cp_index ?? null,
        s.utf8_index,
        s.const_table ?? '',
        s.value,
        s.start.line,
        s.start.col,
        s.end.line,
        s.end.col,
      );
      stringsCount++;
    }
  }

  logger.info(`  [${dataset}] ${jarName}: 写入 ${stringsCount} 条字符串索引`);
}
