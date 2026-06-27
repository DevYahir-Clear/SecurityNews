import Parser from "rss-parser";

const rssParser = new Parser({ timeout: 15000 });

function sevFromScore(s) {
  if (s == null) return "info";
  if (s >= 9) return "critical";
  if (s >= 7) return "high";
  if (s >= 4) return "medium";
  return "low";
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "SecurityScope/1.0" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function fetchCISA(src) {
  const data = await fetchJson(src.url);
  return (data.vulnerabilities || []).slice(0, 60).map((v) => ({
    id: `cisa:${v.cveID}`,
    sourceId: src.id,
    sourceName: src.name,
    title: `${v.cveID} — ${v.vulnerabilityName}`,
    summary: v.shortDescription || "",
    severity: "exploited",
    published: v.dateAdded,
    link: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
    extra: v.requiredAction ? `Action: ${v.requiredAction}` : "",
  }));
}

export async function fetchNVD(src) {
  const data = await fetchJson(src.url);
  return (data.vulnerabilities || []).map((w) => {
    const c = w.cve;
    const desc = (c.descriptions || []).find((d) => d.lang === "en");
    const metrics = c.metrics || {};
    const cvss =
      metrics.cvssMetricV31?.[0]?.cvssData ||
      metrics.cvssMetricV30?.[0]?.cvssData ||
      metrics.cvssMetricV2?.[0]?.cvssData;
    const sev = cvss?.baseSeverity?.toLowerCase() || sevFromScore(cvss?.baseScore);
    return {
      id: `nvd:${c.id}`,
      sourceId: src.id,
      sourceName: src.name,
      title: `${c.id}${cvss?.baseScore ? ` (CVSS ${cvss.baseScore})` : ""}`,
      summary: desc?.value || "No description available.",
      severity: sev,
      published: c.published,
      link: `https://nvd.nist.gov/vuln/detail/${c.id}`,
      extra: "",
    };
  });
}

export async function fetchRSS(src) {
  const feed = await rssParser.parseURL(src.url);
  return (feed.items || []).slice(0, 30).map((it, i) => {
    const raw = it.contentSnippet || it.content || it.summary || "";
    return {
      id: `${src.id}:${it.guid || it.link || it.title || i}`,
      sourceId: src.id,
      sourceName: src.name,
      title: it.title || "(untitled)",
      summary: raw.slice(0, 320),
      severity: "news",
      published: it.isoDate || it.pubDate || "",
      link: it.link || "",
      extra: "",
    };
  });
}

export async function fetchSource(src) {
  if (src.type === "cisa") return fetchCISA(src);
  if (src.type === "nvd") return fetchNVD(src);
  return fetchRSS(src);
}
