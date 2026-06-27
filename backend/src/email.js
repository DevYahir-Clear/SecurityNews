import { EmailClient } from "@azure/communication-email";

let client = null;
function getClient() {
  const conn = process.env.ACS_CONNECTION_STRING;
  if (!conn) return null;
  if (!client) client = new EmailClient(conn);
  return client;
}

const SEV_LABEL = {
  exploited: "ACTIVELY EXPLOITED",
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
  news: "NEWS",
};

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function buildDigestHtml(items) {
  const rows = items
    .map(
      (it) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #ececE6;">
        <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.02em;
          padding:2px 8px;border-radius:10px;background:#EEEDFE;color:#3C3489;margin-bottom:6px;">
          ${SEV_LABEL[it.severity] || "INFO"}
        </span>
        <div style="font-size:15px;font-weight:600;color:#161614;margin:4px 0 4px;">
          ${escapeHtml(it.title)}
        </div>
        <div style="font-size:13px;color:#555;line-height:1.5;margin-bottom:6px;">
          ${escapeHtml((it.summary || "").slice(0, 240))}
        </div>
        <a href="${it.link}" style="font-size:13px;color:#534AB7;text-decoration:none;font-weight:500;">
          Read full article &rarr;
        </a>
        <span style="font-size:12px;color:#999;margin-left:10px;">${escapeHtml(it.sourceName || it.source_name || "")}</span>
      </td>
    </tr>`
    )
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;">
    <div style="padding:20px 0 10px;border-bottom:2px solid #534AB7;margin-bottom:10px;">
      <span style="font-size:18px;font-weight:700;color:#161614;">🛡 SecurityScope Digest</span>
      <div style="font-size:13px;color:#888;margin-top:4px;">
        ${items.length} new item${items.length === 1 ? "" : "s"} · ${new Date().toLocaleString()}
      </div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <div style="padding:16px 0;font-size:11.5px;color:#aaa;">
      Sent by your SecurityScope instance.
    </div>
  </div>`;
}

export function buildDigestText(items) {
  const lines = [`SecurityScope digest — ${new Date().toLocaleString()}`, `${items.length} new items`, ""];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. [${SEV_LABEL[it.severity] || "INFO"}] ${it.title}`);
    lines.push(`   ${(it.summary || "").slice(0, 160)}`);
    lines.push(`   ${it.link}`);
    lines.push("");
  });
  return lines.join("\n");
}

export async function sendDigestEmail({ to, items }) {
  const c = getClient();
  if (!c) throw new Error("ACS_CONNECTION_STRING not configured");
  const sender = process.env.ACS_SENDER_ADDRESS;
  if (!sender) throw new Error("ACS_SENDER_ADDRESS not configured");

  const poller = await c.beginSend({
    senderAddress: sender,
    content: {
      subject: `SecurityScope: ${items.length} new security item${items.length === 1 ? "" : "s"}`,
      plainText: buildDigestText(items),
      html: buildDigestHtml(items),
    },
    recipients: { to: [{ address: to }] },
  });
  const result = await poller.pollUntilDone();
  return result;
}
