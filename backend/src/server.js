import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cron from "node-cron";

import db from "./db.js";
import { runScan } from "./scanner.js";
import { sendDigestEmail } from "./email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ---------- helpers ----------
function getSetting(key, fallback = null) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

// ---------- health ----------
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- sources ----------
app.get("/api/sources", (req, res) => {
  const rows = db.prepare(`SELECT * FROM sources ORDER BY builtin DESC, created_at ASC`).all();
  res.json(rows.map((r) => ({ ...r, enabled: !!r.enabled, builtin: !!r.builtin })));
});

app.post("/api/sources", (req, res) => {
  const { name, url, type } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  const id = `custom:${Date.now()}`;
  db.prepare(
    `INSERT INTO sources (id, name, type, url, enabled, builtin) VALUES (?, ?, ?, ?, 1, 0)`
  ).run(id, name, type || "rss", url);
  res.json({ id, name, url, type: type || "rss", enabled: true, builtin: false });
});

app.patch("/api/sources/:id", (req, res) => {
  const { enabled } = req.body || {};
  db.prepare(`UPDATE sources SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/sources/:id", (req, res) => {
  const row = db.prepare(`SELECT builtin FROM sources WHERE id = ?`).get(req.params.id);
  if (row?.builtin) return res.status(400).json({ error: "Cannot delete a built-in source" });
  db.prepare(`DELETE FROM sources WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- items / feed ----------
app.get("/api/items", (req, res) => {
  const { severity, q, saved, limit = 200 } = req.query;
  let sql = `SELECT * FROM items WHERE 1=1`;
  const params = [];
  if (severity && severity !== "all") {
    sql += ` AND severity = ?`;
    params.push(severity);
  }
  if (saved === "1") {
    sql += ` AND is_saved = 1`;
  }
  if (q) {
    sql += ` AND (title LIKE ? OR summary LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY datetime(published) DESC LIMIT ?`;
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r) => ({ ...r, is_read: !!r.is_read, is_saved: !!r.is_saved })));
});

app.patch("/api/items/:id", (req, res) => {
  const { is_read, is_saved } = req.body || {};
  const fields = [];
  const params = [];
  if (is_read !== undefined) { fields.push("is_read = ?"); params.push(is_read ? 1 : 0); }
  if (is_saved !== undefined) { fields.push("is_saved = ?"); params.push(is_saved ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: "nothing to update" });
  params.push(req.params.id);
  db.prepare(`UPDATE items SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

app.post("/api/items/mark-all-read", (req, res) => {
  db.prepare(`UPDATE items SET is_read = 1 WHERE is_read = 0`).run();
  res.json({ ok: true });
});

// ---------- scanning ----------
app.post("/api/scan", async (req, res) => {
  try {
    const result = await runScan();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/scan/last", (req, res) => {
  const row = db.prepare(`SELECT * FROM scan_log ORDER BY id DESC LIMIT 1`).get();
  res.json(row || null);
});

// ---------- digest / email settings ----------
app.get("/api/settings", (req, res) => {
  res.json({
    digestEmail: getSetting("digest_email", ""),
    digestSchedule: getSetting("digest_schedule", "0 8 * * *"),
    digestEnabled: getSetting("digest_enabled", "false") === "true",
  });
});

app.post("/api/settings", (req, res) => {
  const { digestEmail, digestSchedule, digestEnabled } = req.body || {};
  if (digestEmail !== undefined) setSetting("digest_email", digestEmail);
  if (digestSchedule !== undefined) setSetting("digest_schedule", digestSchedule);
  if (digestEnabled !== undefined) setSetting("digest_enabled", String(!!digestEnabled));
  scheduleDigestJob();
  res.json({ ok: true });
});

app.post("/api/digest/send-now", async (req, res) => {
  try {
    const to = req.body?.to || getSetting("digest_email");
    if (!to) return res.status(400).json({ error: "No recipient email configured" });
    const items = db.prepare(`SELECT * FROM items WHERE digested = 0 ORDER BY datetime(published) DESC LIMIT 40`).all();
    if (!items.length) return res.json({ ok: true, sent: 0, message: "Nothing new to send" });
    await sendDigestEmail({ to, items: items.map((i) => ({ ...i, sourceName: i.source_name })) });
    const ids = items.map((i) => i.id);
    db.prepare(`UPDATE items SET digested = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    res.json({ ok: true, sent: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- cron: scan + digest ----------
let digestTask = null;
function scheduleDigestJob() {
  if (digestTask) digestTask.stop();
  const enabled = getSetting("digest_enabled", "false") === "true";
  const schedule = getSetting("digest_schedule", "0 8 * * *");
  const email = getSetting("digest_email", "");
  if (!enabled || !email) return;
  digestTask = cron.schedule(schedule, async () => {
    try {
      const items = db.prepare(`SELECT * FROM items WHERE digested = 0 ORDER BY datetime(published) DESC LIMIT 40`).all();
      if (!items.length) return;
      await sendDigestEmail({ to: email, items: items.map((i) => ({ ...i, sourceName: i.source_name })) });
      const ids = items.map((i) => i.id);
      db.prepare(`UPDATE items SET digested = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      console.log(`[digest] sent ${items.length} items to ${email}`);
    } catch (e) {
      console.error("[digest] failed:", e.message);
    }
  });
}

// scan every 30 minutes
cron.schedule("*/30 * * * *", () => {
  runScan().then((r) => console.log(`[scan] found=${r.found} new=${r.fresh} errors=${r.errors.length}`))
    .catch((e) => console.error("[scan] failed:", e.message));
});
scheduleDigestJob();
// initial scan on boot
runScan().catch((e) => console.error("[scan:init] failed:", e.message));

// ---------- serve frontend build ----------
// In GitHub Actions "Code" deploy mode, the frontend's built files are copied
// into backend/public before deployment (see .github/workflows/deploy.yml).
const FRONTEND_DIST = path.join(__dirname, "../public");
app.use(express.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.listen(PORT, () => console.log(`SecurityScope backend listening on :${PORT}`));
