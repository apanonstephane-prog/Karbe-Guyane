// Mesure d'audience anonyme et agrégée : aucun identifiant, aucun cookie, uniquement des compteurs
// par mois (fiches vues, lieux validés, langues, sources QR). Lecture publique pour le CTG.
import { kv, ready, json, body, fail, monthKey, dayKey } from "../lib/kv.js";

const ID = /^[a-z0-9-]{2,40}$/;

export async function POST(req) {
  if (!ready) return new Response(null, { status: 204 });
  try {
    const d = await body(req, 4000), m = monthKey(), K = `stats:${m}`, cmds = [];
    for (const [id, n] of Object.entries(d.v || {}).slice(0, 60)) if (ID.test(id)) cmds.push(["HINCRBY", K, `vue:${id}`, String(Math.max(1, Math.min(20, +n || 1)))]);
    for (const id of (d.c || []).slice(0, 20)) if (ID.test(id)) cmds.push(["HINCRBY", K, `checkin:${id}`, "1"]);
    if (d.s) { cmds.push(["HINCRBY", K, "sessions", "1"], ["HINCRBY", `jours:${m}`, dayKey(), "1"]); if (/^(fr|en|pt|es)$/.test(d.l)) cmds.push(["HINCRBY", K, `lang:${d.l}`, "1"]); }
    if (d.nw) { cmds.push(["HINCRBY", K, "nouveaux", "1"]); if (/^[\w-]{1,40}$/.test(d.src || "")) cmds.push(["HINCRBY", K, `src:${d.src}`, "1"]); }
    if (cmds.length) await kv(cmds);
    return new Response(null, { status: 204 });
  } catch (e) { return fail(e); }
}

export async function GET(req) {
  if (!ready) return json({ ready: false }, 200, "public, s-maxage=60");
  try {
    const q = new URL(req.url).searchParams.get("m");
    const now = monthKey(), prev = monthKey(Date.now() - 32 * 86400e3);
    const months = q && /^\d{4}-\d{2}$/.test(q) ? [q] : [now, prev];
    const res = await kv(months.flatMap(m => [["HGETALL", `stats:${m}`], ["HGETALL", `jours:${m}`]]));
    const toObj = a => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = +a[i + 1]; return o; };
    const out = {};
    months.forEach((m, i) => { out[m] = { compteurs: toObj(res[i * 2]), jours: toObj(res[i * 2 + 1]) }; });
    return json({ ready: true, mois: out, genere: Date.now() }, 200, "public, s-maxage=300, stale-while-revalidate=900");
  } catch (e) { return fail(e); }
}
