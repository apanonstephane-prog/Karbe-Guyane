// État des lieux en direct : signalements à choix fermé, conservés 48 h.
import { kv, ready, json, who, body, fail, monthKey } from "../lib/kv.js";

const CODES = new Set(["ok", "monde", "boue", "crue", "sargasses", "mer", "moustiques", "tortues", "ferme", "route"]);
const TTL = 48 * 3600e3;

export async function GET() {
  if (!ready) return json({ ready: false, items: [] }, 200, "public, s-maxage=60");
  try {
    const now = Date.now();
    const [, raw] = await kv([["ZREMRANGEBYSCORE", "etat", "-inf", String(now - TTL)], ["ZRANGEBYSCORE", "etat", String(now - TTL), "+inf"]]);
    const items = raw.map(x => { try { const { s, c, t } = JSON.parse(x); return { s, c, t }; } catch { return null; } }).filter(Boolean);
    return json({ ready: true, items }, 200, "public, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return fail(e); }
}

export async function POST(req) {
  try {
    const { s, c } = await body(req, 300);
    if (!/^[a-z0-9-]{2,40}$/.test(s || "") || !CODES.has(c)) return json({ error: "invalide" }, 400);
    const h = who(req), t = Date.now();
    const [okSpot, okHour] = await kv([["SET", `rl:e:${h}:${s}`, "1", "NX", "EX", "900"], ["INCR", `rl:eh:${h}`], ["EXPIRE", `rl:eh:${h}`, "3600"]]);
    if (okSpot !== "OK") return json({ error: "deja" }, 429);
    if (okHour > 30) return json({ error: "trop" }, 429);
    await kv([["ZADD", "etat", String(t), JSON.stringify({ s, c, t, r: h.slice(0, 4) })], ["HINCRBY", `stats:${monthKey(t)}`, `etat:${c}`, "1"], ["HINCRBY", `stats:${monthKey(t)}`, `etatlieu:${s}`, "1"]]);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
