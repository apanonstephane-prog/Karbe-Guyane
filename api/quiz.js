// Quiz du jour : taux de bonnes réponses par question, anonyme et agrégé.
// On ne stocke que deux compteurs par question (joueurs, bonnes réponses) : aucun identifiant.
import { kv, ready, json, who, body, fail, monthKey, dayKey } from "../lib/kv.js";

const KEY = /^(b\d{1,4}|[iz]:[a-z0-9-]{2,40})$/;

export async function GET() {
  if (!ready) return json({ ready: false, q: {} }, 200, "public, s-maxage=60");
  try {
    const [raw] = await kv([["HGETALL", "quizq"]]);
    const q = {};
    for (let i = 0; i < (raw || []).length; i += 2) { const [k, f] = raw[i].split("|"); (q[k] ||= { n: 0, ok: 0 })[f] = +raw[i + 1]; }
    return json({ ready: true, q }, 200, "public, s-maxage=60, stale-while-revalidate=300");
  } catch (e) { return fail(e); }
}

export async function POST(req) {
  try {
    const { d, r } = await body(req, 1500);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "") || !Array.isArray(r) || r.length !== 5) return json({ error: "invalide" }, 400);
    const today = dayKey(), yday = dayKey(Date.now() - 864e5);
    if (d !== today && d !== yday) return json({ error: "date" }, 400);
    if (!r.every(x => KEY.test(x?.k || "") && typeof x.ok === "boolean") || new Set(r.map(x => x.k)).size !== 5) return json({ error: "invalide" }, 400);
    const h = who(req), [n] = await kv([["INCR", `rl:q:${h}:${d}`], ["EXPIRE", `rl:q:${h}:${d}`, "172800"]]);
    if (n > 40) return json({ error: "trop" }, 429); // réseaux partagés : plusieurs joueurs par adresse, mais pas d'inondation
    const m = monthKey(), good = r.filter(x => x.ok).length, cmds = [];
    r.forEach(x => { cmds.push(["HINCRBY", "quizq", `${x.k}|n`, "1"]); if (x.ok) cmds.push(["HINCRBY", "quizq", `${x.k}|ok`, "1"]); });
    cmds.push(["HINCRBY", `stats:${m}`, "quiz:joues", "1"], ["HINCRBY", `stats:${m}`, "quiz:bonnes", String(good)]);
    if (good === 5) cmds.push(["HINCRBY", `stats:${m}`, "quiz:parfaits", "1"]);
    await kv(cmds);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
