// Agenda participatif + demandes partenaires : tout passe par une modération avant publication.
// Modération : /admin.html avec le code KARBE_ADMIN (variable d'environnement Vercel).
import { kv, ready, json, who, body, fail, rid, clean, sameCode } from "../lib/kv.js";

const pub = e => ({ id: e.id, title: e.title, start: e.start, end: e.end, town: e.town, place: e.place, desc: e.desc, url: e.url || "" });

export async function GET(req) {
  const u = new URL(req.url);
  if (!ready) return json({ ready: false, items: [] }, 200, "public, s-maxage=60");
  try {
    if (u.searchParams.get("admin")) {
      if (!sameCode(u.searchParams.get("admin"), process.env.KARBE_ADMIN)) return json({ error: "code" }, 403);
      const [props, ok] = await kv([["LRANGE", "ev:prop", "0", "199"], ["HVALS", "ev:ok"]]);
      return json({ props: props.map(x => JSON.parse(x)), ok: ok.map(x => JSON.parse(x)).sort((a, b) => a.start - b.start) });
    }
    const [ok] = await kv([["HVALS", "ev:ok"]]);
    const now = Date.now();
    const items = ok.map(x => JSON.parse(x)).filter(e => e.kind !== "partenaire" && (e.end || e.start) > now - 86400e3).sort((a, b) => a.start - b.start).map(pub);
    return json({ ready: true, items }, 200, "public, s-maxage=120, stale-while-revalidate=600");
  } catch (e) { return fail(e); }
}

export async function POST(req) {
  try {
    const d = await body(req, 3000);
    if (d.admin) {
      if (!sameCode(d.admin, process.env.KARBE_ADMIN)) return json({ error: "code" }, 403);
      const props = (await kv([["LRANGE", "ev:prop", "0", "199"]]))[0];
      const raw = props.find(x => JSON.parse(x).id === d.id);
      if (d.action === "suppr") { await kv([["HDEL", "ev:ok", d.id]]); return json({ ok: true }); }
      if (!raw) return json({ error: "inconnu" }, 404);
      const cmds = [["LREM", "ev:prop", "1", raw]];
      if (d.action === "ok") { const e = JSON.parse(raw); delete e.contact; delete e.h; cmds.push(["HSET", "ev:ok", e.id, JSON.stringify(e)]); }
      await kv(cmds);
      return json({ ok: true });
    }
    const e = {
      id: rid(10), kind: d.kind === "partenaire" ? "partenaire" : "evenement",
      title: clean(d.title, 80), start: +d.start, end: +d.end || 0, town: clean(d.town, 40), place: clean(d.place, 80),
      desc: clean(d.desc, 400), url: /^https?:\/\/[^\s<>"]{3,200}$/.test(d.url || "") ? d.url : "", contact: clean(d.contact, 120), lang: clean(d.lang, 2), recu: Date.now(),
    };
    if (!e.title || !e.town || !(e.start > 0)) return json({ error: "invalide" }, 400);
    if (e.kind === "evenement" && (e.start < Date.now() - 86400e3 || e.start > Date.now() + 400 * 86400e3)) return json({ error: "date" }, 400);
    const h = who(req);
    const [n] = await kv([["INCR", `rl:ev:${h}`], ["EXPIRE", `rl:ev:${h}`, "86400"]]);
    if (n > 5) return json({ error: "trop" }, 429);
    await kv([["LPUSH", "ev:prop", JSON.stringify(e)], ["LTRIM", "ev:prop", "0", "199"]]);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
