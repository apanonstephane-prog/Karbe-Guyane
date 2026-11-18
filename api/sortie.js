// Suivi de sortie : le proche consulte l'état ; seul l'auteur (clé secrète) peut indiquer son retour.
// Données minimales (prénom, lieu, heures), effacées automatiquement 3 jours après le retour prévu.
import { kv, ready, json, who, body, fail, rid, clean, sameCode } from "../lib/kv.js";

export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9]{10}$/.test(id)) return json({ error: "id" }, 400);
  if (!ready) return json({ error: "store" }, 503);
  try {
    const [raw] = await kv([["GET", `sortie:${id}`]]);
    if (!raw) return json({ error: "inconnu" }, 404);
    const { w, s, n, b, c, r } = JSON.parse(raw);
    return json({ w, s, n, b, c, r: r || null });
  } catch (e) { return fail(e); }
}

export async function POST(req) {
  try {
    const q = new URL(req.url).searchParams.get("id");
    const d = await body(req, 600);
    if (q) {
      if (!/^[A-Za-z0-9]{10}$/.test(q) || d.action !== "rentre") return json({ error: "invalide" }, 400);
      const [raw] = await kv([["GET", `sortie:${q}`]]);
      if (!raw) return json({ error: "inconnu" }, 404);
      const o = JSON.parse(raw);
      if (!sameCode(o.k, d.key)) return json({ error: "cle" }, 403);
      o.r = Date.now();
      await kv([["SET", `sortie:${q}`, JSON.stringify(o), "EX", String(3 * 86400)]]);
      return json({ ok: true });
    }
    const w = clean(d.w, 30), s = clean(d.s, 40), n = Math.max(1, Math.min(50, +d.n || 1)), b = +d.b;
    if (!w || !/^[a-z0-9-]{2,40}$/.test(s) || !(b > Date.now() - 3600e3) || b > Date.now() + 14 * 86400e3) return json({ error: "invalide" }, 400);
    const h = who(req);
    const [cnt] = await kv([["INCR", `rl:s:${h}`], ["EXPIRE", `rl:s:${h}`, "3600"]]);
    if (cnt > 10) return json({ error: "trop" }, 429);
    const id = rid(10), key = rid(24);
    const ttl = Math.ceil((b - Date.now()) / 1000) + 3 * 86400;
    await kv([["SET", `sortie:${id}`, JSON.stringify({ w, s, n, b, c: Date.now(), k: key }), "EX", String(ttl)], ["HINCRBY", `stats:${new Date().toISOString().slice(0, 7)}`, "sorties", "1"]]);
    return json({ id, key });
  } catch (e) { return fail(e); }
}
