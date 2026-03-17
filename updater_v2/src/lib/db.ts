import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type { Database };

export const SCHEMA_VERSION = '1';

/**
 * 打开（或创建）SQLite 数据库，确保父目录存在。
 */
export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  // WAL 模式：写入时读取不阻塞
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * 建表 + 建索引，幂等（IF NOT EXISTS）。
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_files (
      id               INTEGER PRIMARY KEY,
      jar_name         TEXT    NOT NULL,
      source_path      TEXT    NOT NULL,
      has_original     INTEGER NOT NULL DEFAULT 0,
      has_localization INTEGER NOT NULL DEFAULT 0,
      UNIQUE (jar_name, source_path)
    );

    CREATE TABLE IF NOT EXISTS file_contents (
      id             INTEGER PRIMARY KEY,
      source_file_id INTEGER NOT NULL,
      dataset        TEXT    NOT NULL CHECK (dataset IN ('original', 'localization')),
      source_code    TEXT    NOT NULL,
      source_hash    TEXT,
      UNIQUE (source_file_id, dataset),
      FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS string_entries (
      id               INTEGER PRIMARY KEY,
      file_content_id  INTEGER NOT NULL,
      owner_class_name TEXT    NOT NULL,
      cp_index         INTEGER,
      utf8_index       INTEGER NOT NULL,
      const_table      TEXT    NOT NULL DEFAULT '',
      value            TEXT    NOT NULL,
      start_line       INTEGER NOT NULL,
      start_col        INTEGER NOT NULL,
      end_line         INTEGER NOT NULL,
      end_col          INTEGER NOT NULL,
      FOREIGN KEY (file_content_id) REFERENCES file_contents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_se_content_utf8
      ON string_entries (file_content_id, utf8_index, const_table);

    CREATE INDEX IF NOT EXISTS idx_se_content_owner
      ON string_entries (file_content_id, owner_class_name, utf8_index);

    CREATE INDEX IF NOT EXISTS idx_se_content_range
      ON string_entries (file_content_id, start_line, start_col);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/**
 * 清空业务数据表（保留 schema_version），用于导入前的全量重写。
 * 因为 FK + CASCADE，只需删 source_files 即可级联清理子表。
 */
export function clearData(db: Database.Database): void {
  db.exec(`
    DELETE FROM source_files;
    DELETE FROM meta WHERE key != 'schema_version';
  `);
}
