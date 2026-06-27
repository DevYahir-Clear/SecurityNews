import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, RefreshCw, Mail, Plus, Trash2, ExternalLink, Search,
  Check, Clock, Bookmark, BookmarkCheck, Loader2, Rss, Database,
  AlertTriangle, Settings as SettingsIcon, Send,
} from "lucide-react";

const API = "/api";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const SEV = {
  exploited: { label: "Actively exploited", bg: "#FCEBEB", fg: "#791F1F", dot: "#E24B4A" },
  critical: { label: "Critical", bg: "#FCEBEB", fg: "#791F1F", dot: "#A32D2D" },
  high: { label: "High", bg: "#FAEEDA", fg: "#633806", dot: "#BA7517" },
  medium: { label: "Medium", bg: "#FAEEDA", fg: "#854F0B", dot: "#EF9F27" },
  low: { label: "Low", bg: "#EAF3DE", fg: "#27500A", dot: "#639922" },
  info: { label: "Info", bg: "#E6F1FB", fg: "#0C447C", dot: "#378ADD" },
  news: { label: "News", bg: "#EEEDFE", fg: "#3C3489", dot: "#7F77DD" },
};
const sevMeta = (s) => SEV[s] || SEV.info;

function timeAgo(d) {
  const t = new Date(d).getTime();
  if (isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 0) return "just now";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

const SCHEDULE_PRESETS = [
  { label: "Daily at 8am", value: "0 8 * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every Monday at 8am", value: "0 8 * * 1" },
  { label: "Twice daily (8am & 6pm)", value: "0 8,18 * * *" },
];

export default function App() {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const [tab, setTab] = useState("feed");
  const [query, setQuery] = useState("");
  const [sevFilter, setSevFilter] = useState("all");
  const [newSrc, setNewSrc] = useState({ name: "", url: "" });
  const [settings, setSettings] = useState({ digestEmail: "", digestSchedule: "0 8 * * *", digestEnabled: false });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (sevFilter !== "all") params.set("severity", sevFilter);
    if (query.trim()) params.set("q", query.trim());
    if (tab === "saved") params.set("saved", "1");
    const rows = await api(`/items?${params.toString()}`);
    setItems(rows);
  }, [sevFilter, query, tab]);

  const loadSources = useCallback(async () => setSources(await api("/sources")), []);
  const loadLastScan = useCallback(async () => setScanInfo(await api("/scan/last")), []);
  const loadSettings = useCallback(async () => setSettings(await api("/settings")), []);

  useEffect(() => { loadSources(); loadLastScan(); loadSettings(); }, []);
  useEffect(() => { loadItems().catch((e) => setError(e.message)); }, [loadItems]);

  const scan = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api("/scan", { method: "POST" });
      setScanInfo(r);
      await loadItems();
      setNotice(`Scan complete — ${r.fresh} new item(s) found.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    await api(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
  };
  const toggleSaved = async (id, current) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_saved: !current } : i)));
    await api(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_saved: !current }) });
  };
  const markAllRead = async () => {
    await api("/items/mark-all-read", { method: "POST" });
    loadItems();
  };

  const addSource = async () => {
    if (!newSrc.name.trim() || !newSrc.url.trim()) return;
    await api("/sources", { method: "POST", body: JSON.stringify({ name: newSrc.name, url: newSrc.url, type: "rss" }) });
    setNewSrc({ name: "", url: "" });
    loadSources();
  };
  const toggleSource = async (id, enabled) => {
    await api(`/sources/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) });
    loadSources();
  };
  const removeSource = async (id) => {
    await api(`/sources/${id}`, { method: "DELETE" });
    loadSources();
  };

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await api("/settings", { method: "POST", body: JSON.stringify(patch) });
  };

  const sendNow = async () => {
    setNotice("");
    setError("");
    try {
      const r = await api("/digest/send-now", { method: "POST" });
      setNotice(r.sent ? `Sent digest with ${r.sent} item(s) to ${settings.digestEmail}.` : "Nothing new to send.");
    } catch (e) {
      setError(e.message);
    }
  };

  const unreadCount = items.filter((i) => !i.is_read).length;
  const counts = useMemo(() => {
    const c = { all: items.length };
    items.forEach((i) => (c[i.severity] = (c[i.severity] || 0) + 1));
    return c;
  }, [items]);

  return (
    <div style={S.page}>
      <div style={S.app}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          * { box-sizing: border-box; }
          .ss-card:hover { border-color: #c9c9c9; }
          .ss-tab { cursor:pointer; }
          .ss-icon-btn:hover { background:#f3f3f1; }
          input:focus, select:focus, textarea:focus { outline:2px solid #7F77DD; outline-offset:0; }
        `}</style>

        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={S.logoBox}><Shield size={20} color="#fff" /></div>
            <div>
              <div style={S.title}>SecurityScope</div>
              <div style={S.subtitle}>
                {scanInfo?.ran_at || scanInfo?.scannedAt ? `Last scan ${timeAgo(scanInfo.ran_at || scanInfo.scannedAt)} · ` : ""}
                {unreadCount} new
              </div>
            </div>
          </div>
          <button style={S.scanBtn} onClick={scan} disabled={loading}>
            {loading ? <Loader2 size={15} style={S.spin} /> : <RefreshCw size={15} />}
            {loading ? "Scanning…" : "Scan now"}
          </button>
        </div>

        <div style={S.tabBar}>
          {[
            ["feed", "Feed", Rss, items.length],
            ["saved", "Saved", Bookmark, 0],
            ["sources", "Sources", Database, sources.filter((s) => s.enabled).length],
            ["digest", "Email digest", Mail, 0],
          ].map(([key, label, Icon, n]) => (
            <div key={key} className="ss-tab" style={{ ...S.tab, ...(tab === key ? S.tabActive : {}) }} onClick={() => setTab(key)}>
              <Icon size={15} /><span>{label}</span>
              {n > 0 && <span style={S.tabCount}>{n}</span>}
            </div>
          ))}
        </div>

        {notice && <div style={S.noticeBar}><Check size={14} color="#27500A" /><span>{notice}</span></div>}
        {error && <div style={S.errBar}><AlertTriangle size={14} color="#A32D2D" /><span>{error}</span></div>}

        {(tab === "feed" || tab === "saved") && (
          <>
            <div style={S.controls}>
              <div style={S.searchWrap}>
                <Search size={15} color="#888" />
                <input style={S.search} placeholder="Search vulnerabilities, CVEs, keywords…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select style={S.select} value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
                <option value="all">All severities ({counts.all || 0})</option>
                <option value="exploited">Actively exploited ({counts.exploited || 0})</option>
                <option value="critical">Critical ({counts.critical || 0})</option>
                <option value="high">High ({counts.high || 0})</option>
                <option value="medium">Medium ({counts.medium || 0})</option>
                <option value="news">News ({counts.news || 0})</option>
              </select>
              {tab === "feed" && <button style={S.ghostBtn} onClick={markAllRead}><Check size={14} /> Mark all read</button>}
            </div>

            {items.length === 0 ? (
              <div style={S.empty}><Shield size={26} color="#bbb" /><div>{tab === "saved" ? "Nothing saved yet." : "No items yet — try Scan now."}</div></div>
            ) : (
              <div style={S.list}>
                {items.map((it) => {
                  const m = sevMeta(it.severity);
                  return (
                    <div key={it.id} className="ss-card" style={{ ...S.card, opacity: it.is_read ? 0.62 : 1 }}>
                      <div style={S.cardTop}>
                        <span style={{ ...S.sevPill, background: m.bg, color: m.fg }}>
                          <span style={{ ...S.dot, background: m.dot }} />{m.label}
                        </span>
                        <span style={S.metaText}>{it.source_name}</span>
                        {it.published && <span style={S.metaText}><Clock size={11} style={{ verticalAlign: -1 }} /> {timeAgo(it.published)}</span>}
                        <div style={{ flex: 1 }} />
                        <button className="ss-icon-btn" style={S.iconBtn} onClick={() => toggleSaved(it.id, it.is_saved)}>
                          {it.is_saved ? <BookmarkCheck size={15} color="#534AB7" /> : <Bookmark size={15} />}
                        </button>
                      </div>
                      <div style={S.cardTitle}>{it.title}</div>
                      <div style={S.cardSummary}>{it.summary}</div>
                      {it.extra && <div style={S.cardExtra}>{it.extra}</div>}
                      <div style={S.cardActions}>
                        <a href={it.link} target="_blank" rel="noreferrer" style={S.readLink} onClick={() => markRead(it.id)}>
                          Read full article <ExternalLink size={13} />
                        </a>
                        {!it.is_read && <button style={S.markBtn} onClick={() => markRead(it.id)}>Mark read</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "sources" && (
          <div style={{ paddingTop: 4 }}>
            <div style={S.addBox}>
              <div style={S.addTitle}>Add a data source</div>
              <div style={S.addHint}>Paste any RSS/Atom feed from a security blog, vendor advisory, or forum.</div>
              <div style={S.addRow}>
                <input style={{ ...S.search, flex: "0 0 38%" }} placeholder="Source name" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} />
                <input style={{ ...S.search, flex: 1 }} placeholder="https://example.com/feed.xml" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} />
                <button style={S.scanBtn} onClick={addSource}><Plus size={15} /> Add</button>
              </div>
            </div>
            <div style={S.list}>
              {sources.map((s) => (
                <div key={s.id} className="ss-card" style={S.srcRow}>
                  <button style={{ ...S.toggle, background: s.enabled ? "#534AB7" : "#d6d6d2" }} onClick={() => toggleSource(s.id, s.enabled)}>
                    <span style={{ ...S.knob, left: s.enabled ? 18 : 2 }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.srcName}>{s.name}{s.builtin && <span style={S.builtinTag}>built-in</span>}</div>
                    <div style={S.srcUrl}>{s.url}</div>
                  </div>
                  {!s.builtin && <button className="ss-icon-btn" style={S.iconBtn} onClick={() => removeSource(s.id)}><Trash2 size={15} color="#A32D2D" /></button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "digest" && (
          <div style={{ paddingTop: 4 }}>
            <div style={S.addBox}>
              <div style={S.addTitle}><SettingsIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Scheduled email digest</div>
              <div style={S.addHint}>New items are emailed automatically on the schedule below, via Azure Communication Services.</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                <label style={S.label}>Send digest to</label>
                <input style={S.search2} placeholder="you@example.com" value={settings.digestEmail} onChange={(e) => setSettings({ ...settings, digestEmail: e.target.value })} onBlur={() => saveSettings({ digestEmail: settings.digestEmail })} />

                <label style={S.label}>Schedule</label>
                <select style={S.select} value={settings.digestSchedule} onChange={(e) => saveSettings({ digestSchedule: e.target.value })}>
                  {SCHEDULE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <button style={{ ...S.toggle, background: settings.digestEnabled ? "#534AB7" : "#d6d6d2" }} onClick={() => saveSettings({ digestEnabled: !settings.digestEnabled })}>
                    <span style={{ ...S.knob, left: settings.digestEnabled ? 18 : 2 }} />
                  </button>
                  <span style={{ fontSize: 13.5 }}>{settings.digestEnabled ? "Scheduled digest is ON" : "Scheduled digest is OFF"}</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button style={S.scanBtn} onClick={sendNow}><Send size={14} /> Send digest now</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={S.footer}>Backend scans on a schedule and emails via Azure Communication Services.</div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100vh", background: "#f1f1ed", padding: "24px 14px" },
  app: { fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", maxWidth: 860, margin: "0 auto", color: "#1c1c1a", background: "#fbfbf9", borderRadius: 14, border: "1px solid #e7e7e2", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #ececE6" },
  logoBox: { width: 36, height: 36, borderRadius: 9, background: "#534AB7", display: "flex", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" },
  subtitle: { fontSize: 12.5, color: "#777", marginTop: 1 },
  scanBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "#534AB7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13.5, fontWeight: 500, cursor: "pointer" },
  spin: { animation: "spin 1s linear infinite" },
  tabBar: { display: "flex", gap: 4, padding: "10px 14px 0", borderBottom: "1px solid #ececE6" },
  tab: { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", fontSize: 13.5, color: "#666", borderBottom: "2px solid transparent", marginBottom: -1 },
  tabActive: { color: "#534AB7", borderBottomColor: "#534AB7", fontWeight: 500 },
  tabCount: { fontSize: 11, background: "#eeedfe", color: "#3C3489", borderRadius: 20, padding: "1px 7px", fontWeight: 600 },
  errBar: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#791F1F", background: "#FCEBEB", padding: "8px 16px" },
  noticeBar: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#27500A", background: "#EAF3DE", padding: "8px 16px" },
  controls: { display: "flex", gap: 10, padding: "14px 18px 6px", alignItems: "center", flexWrap: "wrap" },
  searchWrap: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220, background: "#fff", border: "1px solid #e2e2dc", borderRadius: 8, padding: "0 11px" },
  search: { border: "none", outline: "none", background: "transparent", padding: "9px 0", fontSize: 13.5, width: "100%", color: "#1c1c1a" },
  search2: { border: "1px solid #e2e2dc", outline: "none", background: "#fff", padding: "9px 11px", fontSize: 13.5, width: "100%", color: "#1c1c1a", borderRadius: 8 },
  label: { fontSize: 12.5, fontWeight: 600, color: "#555" },
  select: { border: "1px solid #e2e2dc", borderRadius: 8, padding: "9px 11px", fontSize: 13, background: "#fff", color: "#333", cursor: "pointer" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e2dc", background: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#444", cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 18px 18px" },
  card: { background: "#fff", border: "1px solid #ececE6", borderRadius: 11, padding: "13px 15px", transition: "border-color .15s, opacity .2s" },
  cardTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  sevPill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: "50%" },
  metaText: { fontSize: 12, color: "#999" },
  iconBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 5, borderRadius: 6, display: "inline-flex" },
  cardTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginBottom: 5, color: "#161614" },
  cardSummary: { fontSize: 13.5, color: "#555", lineHeight: 1.55 },
  cardExtra: { fontSize: 12.5, color: "#854F0B", background: "#FAEEDA", padding: "6px 9px", borderRadius: 7, marginTop: 8 },
  cardActions: { display: "flex", alignItems: "center", gap: 14, marginTop: 11 },
  readLink: { display: "inline-flex", alignItems: "center", gap: 5, color: "#534AB7", fontSize: 13, fontWeight: 500, textDecoration: "none" },
  markBtn: { border: "none", background: "transparent", color: "#999", fontSize: 12.5, cursor: "pointer", padding: 0 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 20px", color: "#999", fontSize: 14 },
  addBox: { margin: "14px 18px 4px", background: "#fff", border: "1px solid #ececE6", borderRadius: 11, padding: "15px 16px" },
  addTitle: { fontSize: 14.5, fontWeight: 600, marginBottom: 4 },
  addHint: { fontSize: 12.5, color: "#888", lineHeight: 1.5, marginBottom: 12 },
  addRow: { display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" },
  srcRow: { display: "flex", alignItems: "center", gap: 13, padding: "12px 14px" },
  toggle: { position: "relative", width: 34, height: 18, borderRadius: 20, border: "none", cursor: "pointer", flex: "0 0 auto", padding: 0 },
  knob: { position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .15s" },
  srcName: { fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 },
  builtinTag: { fontSize: 10.5, background: "#eeedfe", color: "#3C3489", padding: "1px 7px", borderRadius: 12, fontWeight: 600 },
  srcUrl: { fontSize: 12, color: "#999", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  footer: { fontSize: 11.5, color: "#aaa", textAlign: "center", padding: "12px 16px", borderTop: "1px solid #ececE6" },
};
