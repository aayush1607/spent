import Database from 'better-sqlite3';
import path from 'path';
import { env } from '../config.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = path.resolve(env.DB_PATH);
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}
