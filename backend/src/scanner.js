import db from "./db.js";
import { fetchSource } from "./fetchers.js";

const upsertStmt = db.prepare(`
  INSERT INTO items (id, source_id, source_name, title, summary, severity, link, published, extra)
  VALUES (@id, @sourceId, @sourceName, @title, @summary, @severity, @link, @published, @extra)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    summary = excluded.summary,
    severity = excluded.severity,
    link = excluded.link
`);

const existsStmt = db.prepare(`SELECT 1 FROM items WHERE id = ?`);
const logStmt = db.prepare(
  `INSERT INTO scan_log (items_found, new_items, errors) VALUES (?, ?, ?)`
);

export async function runScan() {
  const sources = db.prepare(`SELECT * FROM sources WHERE enabled = 1`).all();
  const results = await Promise.allSettled(sources.map(fetchSource));

  let found = 0;
  let fresh = 0;
  const errors = [];

  const tx = db.transaction((allItems) => {
    for (const it of allItems) {
      const isNew = !existsStmt.get(it.id);
      if (isNew) fresh++;
      upsertStmt.run(it);
    }
  });

  const allItems = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      found += r.value.length;
      allItems.push(...r.value);
    } else {
      errors.push(`${sources[i].name}: ${r.reason?.message || "failed"}`);
    }
  });

  tx(allItems);
  logStmt.run(found, fresh, errors.join("; ") || null);

  return { found, fresh, errors, scannedAt: new Date().toISOString() };
}
