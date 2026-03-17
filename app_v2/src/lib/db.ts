import Database from 'better-sqlite3';
import path from 'path';

const DATA_ROOT = process.env.DATA_ROOT ?? '/app/data';
const DB_PATH = path.join(DATA_ROOT, 'ssfb.sqlite');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}
