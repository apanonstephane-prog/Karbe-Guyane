// Accès Upstash Redis par son API REST (aucune dépendance). Les variables sont injectées
// automatiquement par l'intégration Vercel « Upstash for Redis » : rien à configurer à la main.
import crypto from "node:crypto";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const ready = Boolean(URL_ && TOKEN);

export async function kv(cmds) {
  if (!ready) throw Object.assign(new Error("store"), { status: 503 });
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw Object.assign(new Error("kv " + r.status), { status: 502 });
  return (await r.json()).map(x => { if (x.error) throw Object.assign(new Error(x.error), { status: 502 }); return x.result; });
}

export const json = (data, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

// Empreinte d'IP salée par jour : sert uniquement à limiter les abus, jamais stockée en clair.
export function who(req) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0";
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(ip + day + (process.env.KARBE_SALT || "karbe")).digest("hex").slice(0, 16);
}

export async function body(req, max = 4000) {
  const txt = await req.text();
  if (txt.length > max) throw Object.assign(new Error("trop long"), { status: 413 });
  try { return JSON.parse(txt || "{}"); } catch { throw Object.assign(new Error("json"), { status: 400 }); }
}

export const fail = e => json({ error: e.message || "erreur" }, e.status || 500);
export const rid = (n = 10) => crypto.randomBytes(n * 2).toString("base64url").replace(/[-_]/g, "").slice(0, n);
export const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export function sameCode(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
export const monthKey = (t = Date.now()) => new Date(t - 3 * 3600e3).toISOString().slice(0, 7); // heure de Guyane (UTC-3)
export const dayKey = (t = Date.now()) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
