import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "securityscope.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  published TEXT,
  extra TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_saved INTEGER NOT NULL DEFAULT 0,
  digested INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL DEFAULT (datetime('now')),
  items_found INTEGER,
  new_items INTEGER,
  errors TEXT
);
`);

const DEFAULT_SOURCES = [
  { id: "cisa-kev", name: "CISA Known Exploited Vulnerabilities", type: "cisa", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", builtin: 1 },
  { id: "nvd-recent", name: "NVD Recent CVEs", type: "nvd", url: "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=40", builtin: 1 },
  { id: "hn-rss", name: "The Hacker News", type: "rss", url: "https://feeds.feedburner.com/TheHackersNews", builtin: 1 },
  { id: "bleeping-rss", name: "BleepingComputer", type: "rss", url: "https://www.bleepingcomputer.com/feed/", builtin: 1 },
];

const seedStmt = db.prepare(
  `INSERT OR IGNORE INTO sources (id, name, type, url, enabled, builtin) VALUES (?, ?, ?, ?, 1, ?)`
);
for (const s of DEFAULT_SOURCES) seedStmt.run(s.id, s.name, s.type, s.url, s.builtin);

export default db;
