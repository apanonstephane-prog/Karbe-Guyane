/* Karbé 3 — vanilla JS. Langues, état des lieux en direct, passeport GPS, suivi de sortie,
   agenda participatif, carte auto-hébergée téléchargeable par zone. */
(async () => {
"use strict";
const D = window.KARBE;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let view = $("#view");
const sheet = $("#sheet"), sheetBody = $(".sheet-body", sheet), panel = $(".sheet-panel", sheet);
const TZ = "America/Cayenne";
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const spotById = Object.fromEntries(D.spots.map(s => [s.id, s]));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const ic = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const buzz = () => { try { navigator.vibrate?.(8); } catch {} };
const CATC = { plage:"var(--c-plage)", nature:"var(--c-nature)", faune:"var(--c-faune)", patrimoine:"var(--c-patrimoine)", culture:"var(--c-culture)", espace:"var(--c-espace)", fleuve:"var(--c-fleuve)" };

/* ---------- stockage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("karbe:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("karbe:" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("karbe:" + k); } catch {} },
};

/* ---------- langues ---------- */
const LANGS = { fr: ["Français", "fr-FR"], en: ["English", "en-GB"], pt: ["Português (Brasil)", "pt-BR"], es: ["Español", "es-ES"] };
const qs = new URLSearchParams(location.search);
let lang = qs.get("lang") in LANGS ? qs.get("lang") : store.get("lang") || (navigator.languages || [navigator.language]).map(l => l.slice(0, 2)).find(l => l in LANGS) || "fr";
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
async function loadLang(l) {
  if (l === "fr") { window.KARBE_TR = null; return; }
  try { await loadScript(`i18n/${l}.js?v=${D.version}`); } catch { l = "fr"; window.KARBE_TR = null; }
  lang = l;
}
await loadLang(lang);
const TR = () => (lang !== "fr" && window.KARBE_TR) || {};
const t = (s, v) => { let r = TR().ui?.[s] || s; if (v) r = r.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ""); return r; };
const LOC = () => LANGS[lang][1];
const L = s => s && lang !== "fr" ? { ...s, ...(TR().spots?.[s.id] || {}) } : s;            // lieu traduit
const LI = it => { if (lang === "fr") return it; const x = TR().its?.[it.id] || {}; return { ...it, ...x, steps: it.steps.map((st, i) => ({ ...st, note: x.notes?.[i] ?? st.note, t: x.times?.[i] ?? st.t })) }; };
const zoneLabel = k => TR().zones?.[k] || D.zones[k].label;
const catLabel = k => TR().cats?.[k] || D.categories[k].label;
const plural = (n, one, many) => n > 1 ? t(many, { n }) : t(one, { n });
document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;

/* ---------- état local ---------- */
let favs = new Set(store.get("favs", []));
const toggleFav = id => { favs.has(id) ? favs.delete(id) : favs.add(id); store.set("favs", [...favs]); buzz(); };
const state = { q: "", cat: "all", zone: "all", kids: false, swim: false, easy: false, userPos: null, wxPoint: store.get("wxPoint", "cayenne") };
const META = id => { const [l, k, b] = (D.meta[id] || "f y n").split(" "); return { lvl: l, kids: k === "y", swim: b }; };
const LVL = { f: "Facile", m: "Modéré", s: "Sportif" };
const SWIM = { o: "Site de baignade", p: "Avec prudence, demandez sur place", n: "Non" };
const ACCESS = { voiture: ["car", "Voiture"], "4x4": ["car", "4x4"], bateau: ["fleuve", "Bateau"], avion: ["plane", "Avion"], pied: ["walk", "À pied"] };
if (qs.get("src")) store.set("src", qs.get("src").slice(0, 40).replace(/[^\w-]/g, ""));

/* ---------- temps (heure de Guyane) ---------- */
const part = o => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", ...o }).formatToParts(new Date()).map(p => [p.type, p.value]));
const nowG = () => { const p = part({ month: "numeric", weekday: "short", hour: "numeric", minute: "numeric", day: "numeric", year: "numeric" }); return { m: +p.month, wd: p.weekday, h: +p.hour + (+p.minute) / 60, ym: `${p.year}-${p.month.padStart(2, "0")}` }; };
const MONTHS = () => [...Array(12)].map((_, i) => new Intl.DateTimeFormat(LOC(), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15))));
const hm = t => new Intl.DateTimeFormat(LOC(), { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const dfull = t => new Intl.DateTimeFormat(LOC(), { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const dday = t => new Intl.DateTimeFormat(LOC(), { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(t));
const local = s => new Date(s + "-03:00").getTime();
const dayShort = s => new Intl.DateTimeFormat(LOC(), { weekday: "short", timeZone: "UTC" }).format(new Date(s + "T12:00:00Z")).replace(".", "");
const weekday = () => new Intl.DateTimeFormat(LOC(), { weekday: "long", timeZone: TZ }).format(new Date());
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? t("à l'instant") : m < 60 ? t("il y a {n} min", { n: m }) : m < 1440 ? t("il y a {n} h", { n: Math.round(m / 60) }) : t("il y a {n} j", { n: Math.round(m / 1440) }); };

/* ---------- images ---------- */
const onVercel = /vercel\.app$|karbe/.test(location.hostname) && location.hostname !== "localhost";
const raw = k => D.imgBase + D.images[k].f;
const opt = (k, w) => onVercel ? `/_vercel/image?url=${encodeURIComponent(raw(k))}&w=${w}&q=70` : raw(k);
function pic(k, sizes = "100vw", { eager = false, cap = false } = {}) {
  const I = D.images[k]; if (!I) return `<div class="pic"></div>`;
  return `<div class="pic" style="--c:${I.c};background-image:url(${I.lqip})">
    <img alt="" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} sizes="${sizes}"
      src="${opt(k, 640)}" srcset="${opt(k, 320)} 320w, ${opt(k, 640)} 640w, ${opt(k, 1080)} 1080w"
      onload="this.classList.add('on')" onerror="if(!this.dataset.r){this.dataset.r=1;this.removeAttribute('srcset');this.src='${raw(k)}'}">
    ${cap ? `<span class="cap">${I.cr ? t("Aquarelle d'après photo") : t("Illustration")}</span>` : ""}</div>`;
}
const licUrl = l => { const m = /^CC (BY(?:-SA)?) (\d\.\d)$/.exec(l); return l === "CC0" ? "https://creativecommons.org/publicdomain/zero/1.0/deed.fr" : m ? `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/deed.fr` : ""; };
function credit(k) {
  const I = D.images[k]; if (!I) return "";
  if (!I.cr) return `<p class="credit">${t("Illustration originale : ce lieu n'a pas de photo libre exploitable.")}</p>`;
  const c = I.cr, lu = licUrl(c.l);
  return `<p class="credit">${t("Aquarelle d'après une photo de {a}", { a: esc(t(c.a)) })}, <a href="${c.u}" target="_blank" rel="noopener">Wikimedia Commons</a>, ${lu ? `<a href="${lu}" target="_blank" rel="noopener">${c.l}</a>` : c.l}${/SA/.test(c.l) ? ` (${t("aquarelle sous la même licence")})` : ""}.${c.n ? ` ${t("Note")}${lang === "fr" ? " :" : ":"} ${esc(t(c.n))}.` : ""}</p>`;
}
function openCredits() {
  const names = { hero: t("Accueil"), route: t("Itinéraires"), lancement: t("Lancements") };
  Object.entries(D.zones).forEach(([k, z]) => names[z.img] = zoneLabel(k));
  D.itineraries.forEach(i => names[i.img] = LI(i).title);
  D.spots.forEach(sp => names[sp.img] = L(sp).name);
  const rows = Object.entries(D.images).map(([k, I]) => [names[k] || k, k, I]).sort((a, b) => a[0].localeCompare(b[0], LOC())).map(([n, k, I]) => {
    const c = I.cr, lu = c && licUrl(c.l);
    return `<li><div class="cr-thumb">${pic(k, "64px")}</div><div><b>${esc(n)}</b><br>${c
      ? `${esc(t(c.a))} · <a href="${c.u}" target="_blank" rel="noopener">${t("source")}</a> · ${lu ? `<a href="${lu}" target="_blank" rel="noopener">${c.l}</a>` : c.l}${c.n ? `<br><i>${esc(t(c.n))}</i>` : ""}`
      : t("Illustration originale, sans photo source.")}</div></li>`;
  }).join("");
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h2 class="h2">${t("Crédits photos")}</h2>
    <p class="note">${t("Chaque image de Karbé est une aquarelle peinte d'après une vraie photo du lieu, publiée sous licence libre sur Wikimedia Commons. Les aquarelles dérivées de photos CC BY-SA sont diffusées sous la même licence. Deux lieux sans photo libre sont des illustrations.")}</p>
    <ul class="credits">${rows}</ul></div>`);
}

/* ---------- réseau ---------- */
async function cachedJSON(key, url, maxAgeMin) {
  const c = store.get("cache:" + key);
  if (c && (Date.now() - c.t) / 60000 < maxAgeMin) return { data: c.d, t: c.t, stale: false };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout?.(9000) });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    store.set("cache:" + key, { t: Date.now(), d });
    return { data: d, t: Date.now(), stale: false };
  } catch (e) { if (c) return { data: c.d, t: c.t, stale: true }; throw e; }
}
async function api(path, body) {
  const r = await fetch("/api/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout?.(10000) } : { signal: AbortSignal.timeout?.(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || r.status); e.status = r.status; e.code = j.error; throw e; }
  return j;
}
let toastT;
function toast(msg, icon = "check") { const el = $("#toast"); el.innerHTML = ic(icon, "ic-s") + esc(msg); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }

/* ---------- géo ---------- */
function distKm(a, b) { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2; return 2 * R * Math.asin(Math.sqrt(h)); }
const fmtKm = d => d < 10 ? d.toLocaleString(LOC(), { maximumFractionDigits: 1 }) + " km" : Math.round(d) + " km";
const navUrl = s => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.nav + ", Guyane")}`;
const wazeUrl = s => `https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`;
function locate(fresh = false) {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error("geo"));
    navigator.geolocation.getCurrentPosition(p => { state.userPos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; ok(state.userPos); }, ko,
      { timeout: 15000, maximumAge: fresh ? 0 : 300000, enableHighAccuracy: fresh });
  });
}

/* ---------- météo, mer, lancements ---------- */
const WMO = c => c === 0 ? ["☀️","Grand soleil"] : c <= 2 ? ["🌤️","Éclaircies"] : c === 3 ? ["☁️","Couvert"] : c <= 48 ? ["🌫️","Brume"] :
  c <= 57 ? ["🌦️","Bruine"] : c <= 67 ? ["🌧️","Pluie"] : c <= 77 ? ["🌧️","Pluie"] : c <= 82 ? ["🌦️","Averses"] : ["⛈️","Orages"];
const wmo = c => { const [e, l] = WMO(c); return [e, t(l)]; };
async function getWeather() {
  const P = D.weatherPoints;
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + P.map(p => p.lat).join(",") + "&longitude=" + P.map(p => p.lon).join(",") +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m" +
    "&hourly=precipitation_probability&forecast_hours=24" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max&forecast_days=5&timezone=America%2FCayenne";
  const r = await cachedJSON("wx2", url, 40);
  const arr = Array.isArray(r.data) ? r.data : [r.data];
  return { byId: Object.fromEntries(P.map((p, i) => [p.id, arr[i]])), t: r.t, stale: r.stale };
}
async function getMarine() {
  const P = D.weatherPoints.filter(p => p.marine);
  const url = "https://marine-api.open-meteo.com/v1/marine?latitude=" + P.map(p => p.marine.lat).join(",") + "&longitude=" + P.map(p => p.marine.lon).join(",") +
    "&hourly=sea_level_height_msl,wave_height&forecast_days=2&timezone=America%2FCayenne";
  const r = await cachedJSON("marine", url, 180);
  const arr = Array.isArray(r.data) ? r.data : [r.data];
  return { byId: Object.fromEntries(P.map((p, i) => [p.id, arr[i]])), t: r.t, stale: r.stale };
}
async function getLaunches() {
  const r = await cachedJSON("launches", "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?location__ids=13&limit=6&mode=list", 180);
  return { list: (r.data.results || []).filter(l => l.net), t: r.t, stale: r.stale };
}
function seaWindow(m, hours = 30) {
  const h = m?.hourly; if (!h?.sea_level_height_msl) return null;
  const now = Date.now(), pts = [];
  h.time.forEach((tt, i) => { const T = local(tt), Lv = h.sea_level_height_msl[i]; if (Lv != null && T >= now - 3600e3 && T <= now + hours * 3600e3) pts.push({ T, L: Lv, W: h.wave_height?.[i] }); });
  if (pts.length < 6) return null;
  const ev = [];
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i].L > pts[i-1].L && pts[i].L >= pts[i+1].L) ev.push({ type: "Pleine mer", ...pts[i] });
    if (pts[i].L < pts[i-1].L && pts[i].L <= pts[i+1].L) ev.push({ type: "Basse mer", ...pts[i] });
  }
  return { pts, ev, wave: pts.find(p => p.W != null)?.W };
}
function nextRain(d) {
  const h = d?.hourly; if (!h?.precipitation_probability) return null;
  const now = Date.now();
  return h.time.map((tt, i) => ({ T: local(tt), p: h.precipitation_probability[i] })).filter(r => r.T >= now - 3600e3).slice(0, 12);
}

/* ---------- état des lieux en direct ---------- */
const ETAT_FR = { ok: "Accessible, rien à signaler", monde: "Beaucoup de monde", boue: "Piste ou sentier boueux", crue: "Crique en crue, passage difficile",
  sargasses: "Sargasses sur la plage", mer: "Mer agitée", moustiques: "Beaucoup de moustiques", tortues: "Tortues observées", ferme: "Fermé ou accès interdit", route: "Route ou piste coupée" };
const etatLabel = c => t(ETAT_FR[c] || c);
let etatsCache = null;
async function getEtats(force = false) {
  if (!force && etatsCache && Date.now() - etatsCache.t < 60000) return etatsCache;
  try { const j = await api("etat"); etatsCache = { t: Date.now(), ready: j.ready, items: j.items || [] }; store.set("etats", etatsCache); }
  catch { etatsCache = store.get("etats", { t: 0, ready: false, items: [] }); etatsCache.offline = true; }
  return etatsCache;
}
const etatsOf = (E, id) => (E?.items || []).filter(x => x.s === id && Date.now() - x.t < 48 * 3600e3).sort((a, b) => b.t - a.t);
function etatSummary(list) {
  if (!list.length) return null;
  const last = list[0], n = list.filter(x => x.c === last.c).length;
  return { ...last, n, ton: D.etats[last.c]?.ton || "info" };
}
// File d'attente hors-ligne : les signalements faits sans réseau partent au retour du réseau.
async function flushQueue() {
  const q = store.get("queue", []); if (!q.length || !navigator.onLine) return;
  const rest = [];
  for (const it of q) { try { await api(it.path, it.body); } catch (e) { if (!e.status || e.status >= 500) rest.push(it); } }
  store.set("queue", rest);
  if (q.length !== rest.length) { etatsCache = null; }
}
addEventListener("online", flushQueue);

/* ---------- passeport ---------- */
let passport = store.get("passport", {}); // { id: timestamp }
const visited = () => Object.keys(passport).filter(id => spotById[id]);
function badgeState(b) {
  const V = visited(), Vs = V.map(id => spotById[id]);
  if (b.n && !b.cat && !b.spots) return { got: V.length >= b.n, p: Math.min(V.length, b.n), of: b.n };
  if (b.zones) { const z = new Set(Vs.map(s => s.zone)).size; return { got: z >= b.zones, p: Math.min(z, b.zones), of: b.zones }; }
  if (b.cat) { const k = Vs.filter(s => s.cat.includes(b.cat)).length; return { got: k >= b.n, p: Math.min(k, b.n), of: b.n }; }
  if (b.spots) {
    const ok = b.spots.filter(id => passport[id] && (!b.months || b.months.includes(new Date(passport[id]).getMonth() + 1)));
    const need = b.n || 1; return { got: ok.length >= need, p: Math.min(ok.length, need), of: need };
  }
  return { got: false, p: 0, of: 1 };
}
const BADGE_FR = { premier: ["Premier pas", "Valider un premier lieu"], cinq: ["Curieux", "5 lieux validés"], quinze: ["Explorateur", "15 lieux validés"],
  trente: ["Grand explorateur", "30 lieux validés"], zones: ["Tour de Guyane", "Un lieu dans chacun des 6 territoires"], bagne: ["Mémoire du bagne", "4 lieux de patrimoine"],
  foret: ["Coureur des bois", "5 sentiers ou lieux de nature"], fleuve: ["Gens du fleuve", "3 lieux sur les fleuves et les îles"], plages: ["Bain de mer", "3 plages"],
  tortues: ["Gardien des tortues", "Montjoly ou Les Hattes en saison de ponte"], espace: ["Vers l'espace", "Un lieu du spatial à Kourou"], marches: ["Au marché", "2 marchés différents"] };

async function checkIn(id) {
  const s = spotById[id]; if (!s) return;
  if (passport[id]) { toast(t("Déjà validé le {d}", { d: dday(passport[id]) }), "check"); return; }
  toast(t("Recherche de votre position…"), "locate");
  let p; try { p = await locate(true); } catch { toast(t("Position indisponible. Autorisez la localisation."), "info"); return; }
  const d = distKm(p, s), max = (s.prec === "site" ? 0.6 : 2) + Math.min((p.acc || 0) / 1000, 1);
  if (d > max) { toast(t("Vous êtes à {d} du lieu. Validez sur place.", { d: fmtKm(d) }), "info"); return; }
  const before = new Set(D.badges.filter(b => badgeState(b).got).map(b => b.id));
  passport[id] = Date.now(); store.set("passport", passport); buzz();
  stat.c.add(id);
  const won = D.badges.filter(b => badgeState(b).got && !before.has(b.id));
  if (won.length) openBadge(won[0]); else toast(t("Lieu validé dans votre passeport"), "check");
  const btn = $("#cibtn"); if (btn) { btn.classList.add("on"); btn.innerHTML = `${ic("check")}${t("Validé le {d}", { d: dday(passport[id]) })}`; }
}
function openBadge(b) {
  const [n, d] = BADGE_FR[b.id];
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain badge-won">
    <div class="medal big">${b.e}</div><h1>${esc(t(n))}</h1><p class="lead">${esc(t(d))}</p>
    <div class="btns" style="justify-content:center"><a class="btn" href="#passeport">${ic("spark")}${t("Voir mon passeport")}</a></div></div>`);
}

/* ---------- statistiques anonymes (agrégées, sans identifiant ni cookie) ---------- */
const stat = { v: {}, c: new Set(), sent: false };
const statsOn = () => store.get("stats", true);
function sendStats() {
  if (!statsOn() || (!Object.keys(stat.v).length && !stat.c.size && stat.sent)) return;
  const today = new Date().toISOString().slice(0, 10), first = store.get("seen") == null, newDay = store.get("day") !== today;
  const body = JSON.stringify({ v: stat.v, c: [...stat.c], l: lang, src: store.get("src") || "", s: newDay ? 1 : 0, nw: first ? 1 : 0 });
  try { if (navigator.sendBeacon?.("/api/stats", new Blob([body], { type: "text/plain" }))) { store.set("day", today); store.set("seen", 1); stat.v = {}; stat.c.clear(); stat.sent = true; } } catch {}
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sendStats(); });
addEventListener("pagehide", sendStats);

/* ---------- moteur « maintenant » ---------- */
function suggestions(wx, launches, E) {
  const { m, wd, h } = nowG(), out = [], seen = new Set();
  const add = (id, why, icon, score) => {
    if (seen.has(id) || !spotById[id]) return;
    const e = etatSummary(etatsOf(E, id)); if (e && (e.ton === "bad")) return; // lieu signalé fermé : on ne le propose pas
    seen.add(id); out.push({ s: spotById[id], why, icon, score });
  };
  const cay = wx?.byId?.cayenne, rainToday = cay?.daily?.precipitation_probability_max?.[0];
  const rows = nextRain(cay), dryMorning = rows && rows.slice(0, 4).every(r => (r.p ?? 100) < 40);
  const sunset = cay?.daily?.sunset?.[0] ? hm(local(cay.daily.sunset[0])) : "18:00";
  const La = launches?.list?.[0];
  if (La) { const dh = (new Date(La.net) - Date.now()) / 3600e3; if (dh > -2 && dh < 72) add("kourou-plage", dh < 24 ? t("Lancement aujourd'hui à {h}", { h: hm(La.net) }) : t("Lancement dans {n} j", { n: Math.round(dh / 24) }), "espace", 100); }
  (E?.items || []).filter(x => x.c === "tortues" && Date.now() - x.t < 24 * 3600e3).slice(0, 1).forEach(x => add(x.s, t("Tortues signalées {a}", { a: ago(x.t) }), "faune", 98));
  if (wd === "Sun" && h < 13) { add("cacao", t("C'est dimanche : jour de marché"), "culture", 95); add("javouhey", t("Marché du dimanche matin"), "culture", 70); }
  if ((wd === "Wed" || wd === "Sat") && h < 12) add("marche-slm", t("Jour de marché à Saint-Laurent"), "culture", 55);
  if (wd === "Sat") add("cacao", t("Demain dimanche : marché de Cacao"), "culture", 45);
  const turtle = D.seasons.filter(s => s.cat === "faune" && s.months.includes(m));
  if (turtle.length) { add(turtle[0].spot, h >= 15 ? t("Saison des tortues : sortie ce soir") : t("Saison des tortues en cours"), "moon", h >= 15 ? 90 : 60); if (turtle[1]) add(turtle[1].spot, t("Saison des tortues en cours"), "moon", 55); }
  if (rainToday != null && rainToday >= 65) { add("musee-cultures", t("Journée pluvieuse : une visite à l'abri"), "drop", 80); add("franconie", t("Une visite à l'abri"), "drop", 52); add("transportation", t("Visite guidée à l'abri"), "drop", 50); }
  if (dryMorning && h < 11) { add("rorota", t("Pas de pluie annoncée ce matin"), "sun", 85); add("montagne-singes", t("Matinée sèche, idéale pour marcher"), "sun", 62); add("matoury", t("Matinée sèche, idéale pour marcher"), "sun", 60); }
  if (h >= 15 && h < 18.5) add("ceperou", t("Coucher du soleil à {h}", { h: sunset }), "sun", 75);
  if (h >= 5 && h < 9) add("marche-cayenne", t("Le marché s'anime tôt le matin"), "clock", 65);
  if ([8,9,10,11].includes(m)) { add("kaw", t("Saison sèche : le marais est plus accessible"), "fleuve", 50); add("roche-virginie", t("Saison sèche : roche moins glissante"), "sun", 40); }
  add("salut", t("Le grand classique, à faire au moins une fois"), "spark", 30);
  add("palmistes", t("Au cœur du vieux Cayenne"), "spark", 20);
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ---------- composants ---------- */
const inSeason = s => { const m = nowG().m; return D.seasons.find(x => x.spot === s.id && x.months.includes(m)); };
function etatChip(E, id) {
  const e = etatSummary(etatsOf(E, id)); if (!e) return "";
  return `<span class="etat ${e.ton}">${D.etats[e.c]?.e || ""} ${esc(etatLabel(e.c))} <small>${ago(e.t)}</small></span>`;
}
function placeRow(s0, E) {
  const s = L(s0), se = inSeason(s0), d = state.userPos ? distKm(state.userPos, s0) : null, M = META(s0.id);
  return `<div class="place" data-spot="${s.id}">
    ${pic(s0.img, "112px")}
    <div class="in"><h3><button class="open">${esc(s.name)}</button></h3>
      <p>${esc(zoneLabel(s0.zone))}${d != null ? " · " + fmtKm(d) : ""}</p>
      <div class="tags">${se ? `<span class="tag season">${ic("spark")}${t("En saison")}</span>` : ""}${passport[s0.id] ? `<span class="tag done">${ic("check")}${t("Visité")}</span>` : ""}<span class="tag">${t(LVL[M.lvl])}</span>${s0.free ? `<span class="tag">${t("Gratuit")}</span>` : ""}</div>
      ${etatChip(E, s0.id)}
    </div>
    <button class="fav ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-pressed="${favs.has(s.id)}" aria-label="${t("Favori")}">${ic("heart")}</button></div>`;
}
const norm = s => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
function filtered() {
  const q = norm(state.q.trim());
  let out = D.spots.filter(s0 => { const s = L(s0), M = META(s0.id);
    return (state.cat === "all" || (state.cat === "fav" ? favs.has(s0.id) : s0.cat.includes(state.cat))) &&
      (state.zone === "all" || s0.zone === state.zone) && (!state.kids || M.kids) && (!state.swim || M.swim !== "n") && (!state.easy || M.lvl === "f") &&
      (!q || norm(s.name + " " + s0.name + " " + s.desc + " " + zoneLabel(s0.zone) + " " + s0.cat.map(catLabel).join(" ")).includes(q)); });
  if (state.userPos) out = out.slice().sort((a, b) => distKm(state.userPos, a) - distKm(state.userPos, b));
  return out;
}
const markSVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3c9.6 0 17 6.8 17 16.4C37 30 29.2 37 20 37S3 30 3 19.4C3 9.8 10.4 3 20 3z" fill="#F2A33A"/><path d="M8.5 23L20 11.5 31.5 23M12 23v8M28 23v8" fill="none" stroke="#0F3D2E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- vue : Explorer ---------- */
function vExplorer() {
  const { m, h } = nowG();
  const clim = D.climate.find(c => c.months.includes(m)), climT = TR().climate?.[D.climate.indexOf(clim)] || clim;
  const hello = h < 12 ? t("Bonjour") : h < 18 ? t("Bon après-midi") : t("Bonsoir");
  const trip = store.get("activeTrip");
  view.innerHTML = `
  <section class="hero">
    ${pic("hero", "100vw", { eager: true })}
    <div class="hero-top"><div class="mark">${markSVG}Karbé</div><div class="hero-r"><div class="live" id="live" hidden></div><button class="langbtn" id="langbtn" aria-label="${lang.toUpperCase()}, ${t("Langue")}">${lang.toUpperCase()}</button></div></div>
    <div class="hero-copy"><div class="wrap">
      <p>${hello}</p>
      <h1>${t("La Guyane, ce {d}.", { d: esc(weekday()) })}</h1>
      <p>${esc(t(climT.label))} — ${esc(MONTHS()[m-1])}. ${esc(t(climT.note))}</p>
    </div></div>
  </section>
  <div class="wrap">
    ${trip ? `<div class="trip-live">${ic("sos")}<div><b>${t("Sortie en cours : {p}", { p: esc(L(spotById[trip.spot])?.name || "") })}</b><span>${t("Retour prévu {d}", { d: dfull(trip.back) })}</span></div><button class="btn red" id="tripdone">${ic("check")}${t("Je suis rentré")}</button></div>` : ""}
    <div class="searchbar"><label>${ic("search")}<span class="vh">${t("Rechercher")}</span>
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t("Plage, sentier, Cacao, bagne…")}" value="${esc(state.q)}">
      <button class="iconbtn ${state.userPos ? "on" : ""}" id="near" type="button" aria-label="${t("Trier par distance")}">${ic("locate")}</button></label></div>

    <section class="sec" id="now-sec">
      <div class="sec-h"><h2>${t("À faire maintenant")}</h2></div>
      <p class="note" id="now-src" style="margin:-8px 0 14px">${t("Selon l'heure, la météo, la saison et les signalements.")}</p>
      <div class="rail" id="now">${[0,1,2].map(() => `<div class="now-card sk"></div>`).join("")}</div>
    </section>

    <a class="pass-card" href="#passeport">${ic("spark")}<div><b>${t("Mon passeport")}</b><span>${t("{n} lieux validés sur {t}", { n: visited().length, t: D.spots.length })} · ${D.badges.filter(b => badgeState(b).got).length} ${t("badges")}</span></div>${ic("next")}</a>

    <section class="sec">
      <div class="sec-h"><h2>${t("Par territoire")}</h2></div>
      <div class="rail">${Object.entries(D.zones).map(([k, z]) => `<button class="zone-card ${state.zone === k ? "on" : ""}" data-zone="${k}" aria-pressed="${state.zone === k}">${pic(z.img, "150px")}<span>${esc(zoneLabel(k))}<small>${plural(D.spots.filter(s => s.zone === k).length, "{n} lieu", "{n} lieux")}</small></span></button>`).join("")}</div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>${t("Envies")}</h2>${state.zone !== "all" || state.cat !== "all" || state.kids || state.swim || state.easy ? `<button class="link" id="reset">${t("Tout afficher")}</button>` : ""}</div>
      <div class="cats" id="cats">
        <button class="cat all ${state.cat === "all" ? "on" : ""}" data-cat="all" style="--k:var(--canopee)"><span class="galet">${ic("explore")}</span>${t("Tout")}</button>
        ${Object.keys(D.categories).map(k => `<button class="cat ${state.cat === k ? "on" : ""}" data-cat="${k}" style="--k:${CATC[k]}" aria-pressed="${state.cat === k}"><span class="galet">${ic(k)}</span>${esc(catLabel(k).split(" & ")[0])}</button>`).join("")}
      </div>
      <div class="chips" id="filters" style="margin-top:14px">
        <button class="chip ${state.kids ? "on" : ""}" data-f="kids" aria-pressed="${state.kids}">${t("Avec enfants")}</button>
        <button class="chip ${state.swim ? "on" : ""}" data-f="swim" aria-pressed="${state.swim}">${t("Baignade")}</button>
        <button class="chip ${state.easy ? "on" : ""}" data-f="easy" aria-pressed="${state.easy}">${t("Facile")}</button>
      </div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2 id="list-t">${t("Les lieux")}</h2><button class="link" id="favs">${state.cat === "fav" ? t("Tous les lieux") : t("Mes favoris")}</button></div>
      <div class="places" id="spots"></div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>${t("Sur le terrain")}</h2></div>
      <div class="tools">
        <button class="tool red" id="t-red">${ic("torch")}<b>${t("Lumière rouge")}</b><span>${t("Pour observer les tortues sans les déranger.")}</span></button>
        <button class="tool sos" id="t-sos">${ic("sos")}<b>${t("Urgences")}</b><span>${t("Numéros et suivi de sortie partagé avec un proche.")}</span></button>
        <button class="tool wide" id="t-off">${ic("download")}<span><b>${t("Emporter hors-ligne")}</b><br><span id="off-txt">${t("Fiches, aquarelles et cartes par territoire.")}</span></span>${ic("next")}<div class="bar" hidden><i></i></div></button>
        <button class="tool wide" id="t-part">${ic("culture")}<span><b>${t("Vous êtes prestataire ?")}</b><br><span>${t("Guides, carbets, restaurants : rejoignez Karbé.")}</span></span>${ic("next")}</button>
      </div>
    </section>

    <p class="footer">Karbé ${esc(D.version)}. ${t("Contenus vérifiés sur sources publiques, à confirmer sur place. États des lieux signalés par les utilisateurs.")}<br>
      ${t("Aquarelles d'après des photos libres de Wikimedia Commons.")} <button class="link" id="credits">${t("Crédits photos")}</button>. ${t("Météo et mer")} <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, ${t("lancements")} <a href="https://thespacedevs.com" target="_blank" rel="noopener">The Space Devs</a>, ${t("carte")} <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.<br>
      <a href="${lang === "fr" ? "" : "/" + lang}/lieux/">${t("Tous les lieux, page par page")}</a> · <a href="/stats.html">${t("Fréquentation et données ouvertes")}</a> · <button class="link" id="statopt">${statsOn() ? t("Statistiques anonymes : activées") : t("Statistiques anonymes : désactivées")}</button></p>
  </div>`;

  let E = etatsCache;
  const renderList = () => {
    const Ls = filtered();
    const ttl = state.cat === "fav" ? t("Mes favoris") : state.zone !== "all" ? zoneLabel(state.zone) : state.cat !== "all" ? catLabel(state.cat) : t("Les lieux");
    $("#list-t").textContent = `${ttl} (${Ls.length})`;
    $("#spots").innerHTML = Ls.length ? Ls.map(s => placeRow(s, E)).join("") : `<div class="empty">${state.cat === "fav" ? t("Touchez le cœur d'un lieu pour le retrouver ici.") : t("Aucun lieu ne correspond. Essayez un autre mot ou une autre envie.")}</div>`;
  };
  renderList();
  $("#q").addEventListener("input", e => { state.q = e.target.value; renderList(); });
  $("#near").onclick = async () => { buzz(); try { await locate(); $("#near").classList.add("on"); renderList(); toast(t("Lieux triés par distance"), "locate"); } catch { toast(t("Position indisponible. Autorisez la localisation."), "info"); } };
  view.addEventListener("click", e => {
    const z = e.target.closest("[data-zone]"); if (z) { buzz(); state.zone = state.zone === z.dataset.zone ? "all" : z.dataset.zone; rerender("#spots"); return; }
    const c = e.target.closest("[data-cat]"); if (c) { buzz(); state.cat = c.dataset.cat; rerender("#spots"); return; }
    const f = e.target.closest("[data-f]"); if (f) { buzz(); state[f.dataset.f] = !state[f.dataset.f]; rerender("#spots"); return; }
  });
  $("#favs").onclick = () => { state.cat = state.cat === "fav" ? "all" : "fav"; rerender("#spots"); };
  $("#reset") && ($("#reset").onclick = () => { Object.assign(state, { cat: "all", zone: "all", kids: false, swim: false, easy: false }); rerender("#spots"); });
  $("#t-red").onclick = openRedLight;
  $("#t-sos").onclick = openSafety;
  $("#t-part").onclick = openPartner;
  $("#t-off").onclick = openOffline;
  $("#langbtn").onclick = openLang;
  $("#statopt").onclick = () => { store.set("stats", !statsOn()); rerender(); };
  $("#credits").onclick = openCredits;
  $("#tripdone") && ($("#tripdone").onclick = tripDone);

  Promise.allSettled([getWeather(), getLaunches(), getEtats()]).then(([w, l, e]) => {
    const wx = w.status === "fulfilled" ? w.value : null, la = l.status === "fulfilled" ? l.value : null;
    E = e.value; if (E?.items?.length && $("#spots")) renderList();
    const live = $("#live");
    if (wx && live) { const c = wx.byId.cayenne.current; live.innerHTML = `${wmo(c.weather_code)[0]} ${Math.round(c.temperature_2m)}° Cayenne`; live.hidden = false; }
    const S = suggestions(wx, la, E), now = $("#now"); if (!now) return;
    if (!wx) $("#now-src").textContent = t("Selon l'heure et la saison.");
    now.innerHTML = S.map(x => `<button class="now-card" data-spot="${x.s.id}">${pic(x.s.img, "330px")}<div class="in"><span class="why">${ic(x.icon)}${esc(x.why)}</span><h3>${esc(L(x.s).name)}</h3><p>${esc(zoneLabel(x.s.zone))}, ${esc(L(x.s).dur)}</p></div></button>`).join("");
  });
}
function rerender(anchor) {
  const y = scrollY, el = anchor && $(anchor), top = el ? el.getBoundingClientRect().top + y : y;
  const run = () => { const fresh = view.cloneNode(false); view.replaceWith(fresh); view = fresh; vExplorer(); scrollTo(0, anchor ? Math.min(y, top - 160) : y); };
  if (document.startViewTransition && !RM) document.startViewTransition(run); else run();
}

/* ---------- feuille ---------- */
function openSheet(html) {
  sheetBody.innerHTML = html; sheetBody.scrollTop = 0;
  if (sheet.hidden) { sheet.hidden = false; sheet.classList.remove("in"); void sheet.offsetWidth; sheet.classList.add("in"); history.pushState({ sheet: 1 }, ""); }
  document.body.style.overflow = "hidden";
  $(".sheet-x", sheet)?.addEventListener("click", closeSheetUI);
  $(".sheet-x", sheet)?.focus({ preventScroll: true });
}
let afterClose = null;
function closeSheet() { sheet.hidden = true; panel.style.transform = ""; document.body.style.overflow = ""; if (afterClose) { const f = afterClose; afterClose = null; f(); } }
function closeSheetUI() { if (history.state?.sheet) history.back(); else closeSheet(); }
addEventListener("popstate", () => { if (!sheet.hidden) closeSheet(); });
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheetUI(); if (e.target.closest('a[href^="#"]')) closeSheet(); });
addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSheetUI(); });
(() => { let y0 = null, dy = 0;
  panel.addEventListener("pointerdown", e => { if (sheetBody.scrollTop > 0 || e.target.closest("input,select,textarea,button,a")) return; y0 = e.clientY; dy = 0; panel.style.transition = "none"; });
  addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
  addEventListener("pointerup", () => { if (y0 == null) return; panel.style.transition = ""; if (dy > 120) closeSheetUI(); else panel.style.transform = ""; y0 = null; });
})();

/* ---------- fiche lieu ---------- */
function openSpot(id) {
  const s0 = spotById[id]; if (!s0) return; buzz();
  const s = L(s0), M = META(id);
  stat.v[id] = (stat.v[id] || 0) + 1;
  const near = D.weatherPoints.slice().sort((a, b) => distKm(a, s0) - distKm(b, s0))[0];
  const its = D.itineraries.filter(i => i.steps.some(st => st.spot === id));
  const d = state.userPos ? distKm(state.userPos, s0) : null;
  openSheet(`
    <div class="sheet-hero">${pic(s0.img, "720px", { eager: true, cap: true })}
      <button class="sheet-x" aria-label="${t("Fermer")}">${ic("close")}</button>
      <div class="wrap"><div class="cats-line">${s0.cat.slice(0, 3).map(k => `<span class="tag" style="background:${CATC[k]};color:#fff">${ic(k)}${esc(catLabel(k))}</span>`).join("")}</div>
      <h1 style="font-size:34px">${esc(s.name)}</h1></div></div>
    <div class="wrap">
      <p class="lead">${esc(s.desc)}</p>
      <div class="btns" style="margin-top:18px">
        <a class="btn" href="${navUrl(s0)}" target="_blank" rel="noopener">${ic("go")}${t("Y aller")}</a>
        <a class="btn ghost" href="${wazeUrl(s0)}" target="_blank" rel="noopener">Waze</a>
        <button class="btn ghost sq ${favs.has(id) ? "on" : ""}" id="favbtn" aria-label="${t("Favori")}" aria-pressed="${favs.has(id)}" style="${favs.has(id) ? "color:var(--ibis)" : ""}">${ic("heart")}</button>
        <button class="btn ghost sq" id="sharebtn" aria-label="${t("Partager")}">${ic("share")}</button>
      </div>
      <div class="etat-box" id="etatbox"><div class="sec-h" style="margin:0"><h2 class="h3">${ic("spark", "ic-s")} ${t("État en direct")}</h2><p id="etatsrc"></p></div><div id="etatlist" class="etat-list"><div class="sk" style="height:40px;border-radius:12px"></div></div>
        <details class="etat-report"><summary>${t("Signaler l'état du lieu")}</summary><p class="note">${t("Vous y êtes ou vous en revenez ? Votre signalement aide les suivants. Il disparaît après 48 h.")}</p>
          <div class="etat-grid">${Object.entries(D.etats).map(([c, x]) => `<button class="etat-b" data-etat="${c}">${x.e}<span>${esc(etatLabel(c))}</span></button>`).join("")}</div></details></div>
      <div class="facts">
        <div class="fact"><small>${t("Zone")}</small><b>${esc(zoneLabel(s0.zone))}</b></div>
        <div class="fact"><small>${t("Durée")}</small><b>${esc(s.dur)}</b></div>
        <div class="fact"><small>${t("Niveau")}</small><b>${t(LVL[M.lvl])}</b></div>
        <div class="fact"><small>${t("Enfants")}</small><b>${M.kids ? t("Adapté") : t("Peu adapté")}</b></div>
        <div class="fact"><small>${t("Accès")}</small><b>${s0.access.map(a => t(ACCESS[a][1])).join(", ")}</b></div>
        <div class="fact"><small>${d != null ? t("Distance") : t("Prix")}</small><b>${d != null ? t("{d} à vol d'oiseau", { d: fmtKm(d) }) : s0.free ? t("Gratuit") : t("Payant ou à vérifier")}</b></div>
        <div class="fact wide"><small>${t("Baignade")}</small><b>${t(SWIM[M.swim])}</b></div>
        ${s.when ? `<div class="fact wide"><small>${t("Quand")}</small><b>${esc(s.when)}</b></div>` : ""}
        ${s.season ? `<div class="fact wide"><small>${t("Saison")}</small><b>${esc(s.season)}</b></div>` : ""}
      </div>
      <button class="btn ${passport[id] ? "on" : "dark"} wide" id="cibtn" style="margin-top:14px">${passport[id] ? `${ic("check")}${t("Validé le {d}", { d: dday(passport[id]) })}` : `${ic("locate")}${t("J'y suis : valider dans mon passeport")}`}</button>
      <div class="wxline" id="spotwx"><span class="big">…</span><p>${t("Météo à {p}", { p: esc(near.label) })}</p></div>
      <h2 class="h3m">${t("Conseils terrain")}</h2>
      <ul class="tips">${s.tips.map(x => `<li>${ic("check")}<span>${esc(x)}</span></li>`).join("")}</ul>
      ${its.length ? `<h2 class="h3m">${t("Dans un itinéraire")}</h2><div class="btns" style="margin-top:12px">${its.map(i => `<button class="chip" data-it="${i.id}">${ic("route")}${esc(LI(i).title)}</button>`).join("")}</div>` : ""}
      <h2 class="h3m">${t("Sur place")}</h2>
      <div class="btns" style="margin-top:10px"><a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t("guide") + " " + s0.nav + " Guyane")}">${ic("walk")}${t("Guides et sorties à proximité")}</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("restaurant " + s0.nav + " Guyane")}">${ic("culture")}${t("Où manger à proximité")}</a></div>
      <p class="note">${t("Karbé ne référence aucun prestataire non vérifié : ces liens ouvrent une recherche sur la carte.")} ${s0.prec === "zone" ? t("Sur la carte, la position est approximative.") : ""} ${t("Horaires, tarifs et accès à confirmer avant de partir.")}</p>
      ${credit(s0.img)}
    </div>`);
  $("#favbtn").onclick = e => { toggleFav(id); const on = favs.has(id); e.currentTarget.style.color = on ? "var(--ibis)" : ""; e.currentTarget.setAttribute("aria-pressed", on); toast(on ? t("Ajouté aux favoris") : t("Retiré des favoris"), "heart"); syncFavs(); };
  $("#sharebtn").onclick = () => share(s.name, `${s.name} (${zoneLabel(s0.zone)}) : ${s.desc}`, pagePath("lieu", id));
  $("#cibtn").onclick = () => checkIn(id);
  $$("[data-it]", sheet).forEach(b => b.onclick = () => openItinerary(b.dataset.it));
  $$("[data-etat]", sheet).forEach(b => b.onclick = () => reportEtat(id, b.dataset.etat));
  renderEtatBox(id);
  getWeather().then(w => { const x = w.byId[near.id], el = $("#spotwx"); if (!x || !el) return; const [e, l] = wmo(x.current.weather_code);
    el.innerHTML = `<span class="big">${e} ${Math.round(x.current.temperature_2m)}°</span><p>${t("{l} à {p}", { l, p: esc(near.label) })}<br>${t("Risque de pluie aujourd'hui : {p} %", { p: x.daily.precipitation_probability_max[0] ?? "?" })}${w.stale ? ` (${ago(w.t)})` : ""}</p>`; })
    .catch(() => { const el = $("#spotwx"); if (el) el.innerHTML = `${ic("offline")}<p>${t("Météo indisponible sans réseau.")}</p>`; });
}
async function renderEtatBox(id) {
  const E = await getEtats(), list = etatsOf(E, id), el = $("#etatlist"); if (!el) return;
  const pending = store.get("queue", []).filter(q => q.body?.s === id);
  $("#etatsrc").textContent = E.offline ? t("hors-ligne") : E.ready === false ? t("bientôt disponible") : t("48 dernières heures");
  el.innerHTML = list.length || pending.length ? [...pending.map(q => `<div class="etat ${D.etats[q.body.c]?.ton}">${D.etats[q.body.c]?.e} ${esc(etatLabel(q.body.c))} <small>${t("en attente de réseau")}</small></div>`),
    ...Object.values(list.reduce((a, x) => { (a[x.c] ||= { ...x, n: 0 }).n++; return a; }, {})).sort((a, b) => b.t - a.t)
      .map(x => `<div class="etat ${D.etats[x.c]?.ton}">${D.etats[x.c]?.e} ${esc(etatLabel(x.c))} <small>${ago(x.t)}${x.n > 1 ? " · " + t("{n} signalements", { n: x.n }) : ""}</small></div>`)].join("")
    : `<p class="note" style="margin:0">${t("Aucun signalement récent. Soyez le premier à indiquer l'état du lieu.")}</p>`;
}
async function reportEtat(id, c) {
  buzz();
  const key = "rep:" + id + ":" + c, last = store.get(key, 0);
  if (Date.now() - last < 15 * 60000) { toast(t("Déjà signalé, merci !"), "check"); return; }
  store.set(key, Date.now());
  const body = { s: id, c };
  try { await api("etat", body); etatsCache = null; toast(t("Merci, signalement publié"), "check"); }
  catch (e) {
    if (e.status === 429) toast(t("Déjà signalé, merci !"), "check");
    else if (!e.status || e.status >= 500) { const q = store.get("queue", []); q.push({ path: "etat", body }); store.set("queue", q); toast(t("Pas de réseau : envoi au retour du réseau"), "offline"); }
    else toast(t("Signalement refusé"), "info");
  }
  $("details.etat-report", sheet)?.removeAttribute("open");
  renderEtatBox(id);
}
function syncFavs() { $$(`#view [data-fav]`).forEach(b => { const on = favs.has(b.dataset.fav); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); }
const pagePath = (kind, id) => `${lang === "fr" ? "" : "/" + lang}/${kind}/${id}/`;
async function share(title, text, p = "/") {
  const url = location.origin + p;
  try { if (navigator.share) { await navigator.share({ title, text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t("Lien copié"), "copy"); } catch { toast(url, "info"); }
}

/* ---------- carte : MapLibre auto-hébergé + tuiles OpenFreeMap, téléchargeables par territoire ---------- */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
let map;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/vendor/maplibre-gl.css"; document.head.appendChild(css);
  return loadScript("/vendor/maplibre-gl.js");
}
async function vCarte() {
  view.innerHTML = `<div class="map-wrap"><div id="map" aria-label="${t("Carte des lieux")}"></div>
    <div class="map-top"><div class="chips" id="mcats"><button class="chip ${state.cat === "all" || state.cat === "fav" ? "on" : ""}" data-cat="all">${ic("explore")}${t("Tout")}</button>
      ${Object.keys(D.categories).map(k => `<button class="chip ${state.cat === k ? "on" : ""}" data-cat="${k}" style="--k:${CATC[k]}">${ic(k)}${esc(catLabel(k).split(" & ")[0])}</button>`).join("")}</div></div>
    <button class="iconbtn map-loc" id="mloc" aria-label="${t("Me localiser")}">${ic("locate")}</button>
    <button class="iconbtn map-dl" id="mdl" aria-label="${t("Cartes hors-ligne")}">${ic("download")}</button>
    <div class="map-msg" id="mmsg">${t("Chargement de la carte…")}</div></div>`;
  $("#mdl").onclick = openOffline;
  try { await loadMapLib(); } catch { $("#mmsg") && ($("#mmsg").textContent = t("Carte indisponible sans réseau à la première ouverture. Ouvrez-la une fois connecté pour la garder.")); return; }
  if (!$("#map")) return;
  map = new maplibregl.Map({ container: "map", style: STYLE, bounds: [[-54.6, 2.1], [-51.6, 5.9]], fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
  map.touchZoomRotate.disableRotation();
  map.on("load", () => { $("#mmsg")?.remove(); });
  map.on("error", () => { const m = $("#mmsg"); if (m) m.textContent = t("Certaines zones de la carte ne sont pas disponibles hors-ligne. Téléchargez-les depuis le bouton ↓."); });
  let markers = [];
  const E = await getEtats();
  // Regroupement à l'écran : les lieux à moins de 46 px se fondent en une pastille numérotée.
  const draw = () => {
    markers.forEach(x => x.remove()); markers = [];
    const S = D.spots.filter(s => state.cat === "all" || state.cat === "fav" || s.cat.includes(state.cat)).map(s => ({ s, p: map.project([s.lon, s.lat]) }));
    const groups = [];
    S.forEach(o => { const g = groups.find(g => Math.hypot(g.p.x - o.p.x, g.p.y - o.p.y) < 46); if (g) { g.m.push(o.s); } else groups.push({ p: o.p, m: [o.s] }); });
    groups.forEach(g => {
      if (g.m.length > 1) {
        const el = document.createElement("button"); el.className = "mk mk-n"; el.textContent = g.m.length;
        el.setAttribute("aria-label", t("{n} lieux, zoomer", { n: g.m.length }));
        el.addEventListener("click", ev => { ev.stopPropagation(); buzz();
          const lo = g.m.map(x => x.lon), la = g.m.map(x => x.lat);
          map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 90, maxZoom: 14, duration: RM ? 0 : 700 }); });
        const c = g.m.reduce((a, x) => [a[0] + x.lon / g.m.length, a[1] + x.lat / g.m.length], [0, 0]);
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map));
        return;
      }
      const s = g.m[0], e = etatSummary(etatsOf(E, s.id));
      const el = document.createElement("button"); el.className = "mk" + (passport[s.id] ? " done" : "") + (e ? " e-" + e.ton : ""); el.style.setProperty("--k", CATC[s.cat[0]]); el.innerHTML = ic(s.cat[0]); el.setAttribute("aria-label", L(s).name);
      el.addEventListener("click", ev => { ev.stopPropagation(); openSpot(s.id); });
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map));
    });
  };
  map.on("zoomend", draw); map.once("load", draw);
  draw();
  $("#mcats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; buzz(); state.cat = b.dataset.cat; $$("#mcats .chip").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  let me;
  $("#mloc").onclick = async () => { try { const p = await locate(); if (!me) { const el = document.createElement("div"); el.className = "me"; me = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map); } else me.setLngLat([p.lon, p.lat]); map.flyTo({ center: [p.lon, p.lat], zoom: 11 }); } catch { toast(t("Position indisponible"), "info"); } };
}
// Calcul des tuiles d'une emprise
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
function tilesFor(b, z0, z1, cap) {
  const out = [];
  for (let z = z0; z <= z1; z++) {
    const xs = [lon2x(b[0], z), lon2x(b[2], z)], ys = [lat2y(b[3], z), lat2y(b[1], z)];
    const n = (xs[1] - xs[0] + 1) * (ys[1] - ys[0] + 1);
    if (out.length + n > cap) break;
    for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) out.push([z, x, y]);
  }
  return out;
}
function zoneBox(k) {
  const S = D.spots.filter(s => s.zone === k), pad = 0.12;
  return [Math.min(...S.map(s => s.lon)) - pad, Math.min(...S.map(s => s.lat)) - pad, Math.max(...S.map(s => s.lon)) + pad, Math.max(...S.map(s => s.lat)) + pad];
}
const PACK = "karbe-tiles-pack";
async function downloadMapZone(k, onp) {
  const c = await caches.open(PACK);
  const get = async u => { if (await c.match(u)) return; const r = await fetch(u, { mode: "cors" }); if (!r.ok) throw new Error(r.status); await c.put(u, r); };
  const styleRes = await fetch(STYLE); const style = await styleRes.clone().json(); await c.put(STYLE, styleRes);
  const extra = [];
  for (const src of Object.values(style.sources)) if (src.url) { const tj = await fetch(src.url); const j = await tj.clone().json(); await c.put(src.url, tj); src.tiles = j.tiles; src.maxzoom = j.maxzoom; }
  if (style.sprite) { const sp = Array.isArray(style.sprite) ? style.sprite.map(x => x.url) : [style.sprite]; sp.forEach(u => extra.push(u + ".json", u + ".png", u + "@2x.json", u + "@2x.png")); }
  if (style.glyphs) { const fonts = new Set(); style.layers.forEach(l => (l.layout?.["text-font"] || []).forEach(f => typeof f === "string" && fonts.add(f)));
    [...fonts].forEach(f => ["0-255", "256-511", "8192-8447"].forEach(r => extra.push(style.glyphs.replace("{fontstack}", encodeURIComponent(f)).replace("{range}", r)))); }
  const vec = Object.values(style.sources).find(s => s.type === "vector" && s.tiles);
  const tpl = vec.tiles[0], mz = Math.min(vec.maxzoom || 14, 14);
  const list = [...tilesFor([-54.7, 2.0, -51.5, 6.0], 4, 9, 400), ...tilesFor(zoneBox(k), 10, mz, 1600)].map(([z, x, y]) => tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y));
  const all = [...extra, ...list]; let done = 0, fail = 0, i = 0;
  const worker = async () => { while (i < all.length) { const u = all[i++]; try { await get(u); } catch { fail++; } done++; onp(done, all.length); } };
  await Promise.all([...Array(6)].map(worker));
  const packs = store.get("mapPacks", {}); packs[k] = { t: Date.now(), n: all.length - fail }; store.set("mapPacks", packs);
  return { total: all.length, fail };
}

/* ---------- hors-ligne : fiches + cartes par territoire ---------- */
const MEDIA = "karbe-media";
function offlineUrls() {
  const u = [];
  Object.keys(D.images).forEach(k => u.push(opt(k, 320), opt(k, 640)));
  u.push(opt("hero", 1080), "/vendor/maplibre-gl.js", "/vendor/maplibre-gl.css");
  if (lang !== "fr") u.push(`i18n/${lang}.js?v=${D.version}`);
  return [...new Set(u)];
}
function openOffline() {
  const packs = store.get("mapPacks", {});
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">${t("Emporter hors-ligne")}</h1>
    <p class="lead">${t("Le réseau disparaît dès qu'on quitte le littoral. Téléchargez avant de partir, en wifi de préférence.")}</p>
    <div class="dl-row"><div><b>${t("Fiches et aquarelles")}</b><span id="dl-base">${t("Toutes les fiches, environ 15 Mo")}</span><div class="bar" hidden><i></i></div></div><button class="btn dark" id="dlbase">${ic("download")}</button></div>
    <h2 class="h3m">${t("Cartes par territoire")}</h2>
    ${Object.keys(D.zones).map(k => `<div class="dl-row" data-z="${k}"><div><b>${esc(zoneLabel(k))}</b><span>${packs[k] ? t("Téléchargée {a}", { a: ago(packs[k].t) }) : t("Environ 10 à 30 Mo")}</span><div class="bar" hidden><i></i></div></div><button class="btn ${packs[k] ? "ghost" : "dark"}" data-dlz="${k}">${packs[k] ? ic("check") : ic("download")}</button></div>`).join("")}
    <p class="note">${t("Les cartes viennent d'OpenFreeMap (données OpenStreetMap). Elles restent sur votre téléphone jusqu'à ce que vous vidiez les données du navigateur.")}</p></div>`);
  $("#dlbase").onclick = offlinePack;
  $$("[data-dlz]", sheet).forEach(b => b.onclick = async () => {
    if (!navigator.onLine) { toast(t("Connectez-vous pour télécharger"), "offline"); return; }
    const row = b.closest(".dl-row"), bar = $(".bar", row), fill = $(".bar i", row), sp = $("span", row);
    b.disabled = true; bar.hidden = false; buzz();
    try { const r = await downloadMapZone(b.dataset.dlz, (d, n) => { fill.style.width = (d / n * 100) + "%"; sp.textContent = `${d} / ${n}`; });
      sp.textContent = r.fail ? t("{n} éléments à réessayer", { n: r.fail }) : t("Prête hors-ligne"); b.innerHTML = ic("check"); b.className = "btn ghost"; }
    catch { sp.textContent = t("Échec du téléchargement, réessayez"); }
    b.disabled = false; setTimeout(() => bar.hidden = true, 1200);
  });
}
async function offlinePack() {
  const sp = $("#dl-base"), bar = sp?.parentElement.querySelector(".bar"), fill = bar?.querySelector("i");
  if (!window.caches) { toast(t("Ce navigateur ne permet pas le hors-ligne"), "info"); return; }
  if (!navigator.onLine) { toast(t("Connectez-vous pour télécharger"), "offline"); return; }
  buzz(); if (bar) bar.hidden = false;
  const c = await caches.open(MEDIA), urls = offlineUrls(); let n = 0, fail = 0;
  await Promise.all(urls.map(async u => { try { if (!(await c.match(u))) { const r = await fetch(u); if (!r.ok) throw 0; await c.put(u, r); } } catch { fail++; } n++; if (fill) fill.style.width = (n / urls.length * 100) + "%"; if (sp) sp.textContent = `${n} / ${urls.length}`; }));
  getWeather().catch(() => {}); getMarine().catch(() => {}); getLaunches().catch(() => {}); getEtats(true);
  if (sp) sp.textContent = fail ? t("{n} éléments à réessayer", { n: fail }) : t("Prêt : tout est disponible sans réseau.");
  toast(fail ? t("Téléchargement partiel") : t("Karbé est prêt pour le hors-ligne"), fail ? "info" : "check");
  if (bar) setTimeout(() => bar.hidden = true, 1200);
}

/* ---------- vue : Itinéraires ---------- */
function vItineraires() {
  view.innerHTML = `<div class="banner">${pic("route", "100vw", { eager: true })}<div class="wrap"><h1>${t("Itinéraires")}</h1><p>${t("{n} circuits pensés pour le terrain, de la journée en ville à la forêt profonde.", { n: D.itineraries.length })}</p></div></div>
  <div class="wrap" style="margin-top:20px"><div class="it-list">${D.itineraries.map(i0 => { const i = LI(i0); return `<button class="it-card" data-it="${i.id}">${pic(i.img, "(min-width:720px) 684px, 100vw")}
    <span class="days">${plural(i.days, "{n} jour", "{n} jours")}</span>
    <div class="in"><h2>${esc(i.title)}</h2><p>${esc(i.pitch)}</p><div class="meta"><span>${esc(zoneLabel(i.zone))}</span><span>${t("Niveau {l}", { l: t(i0.level) })}</span>${i.startDay ? `<span>${t("Départ un {d}", { d: t(i0.startDay) })}</span>` : ""}</div></div></button>`; }).join("")}</div>
  <p class="note">${t("Les horaires sont indicatifs. En forêt et sur le fleuve, partez tôt : la chaleur et les averses arrivent l'après-midi.")}</p></div>`;
  view.addEventListener("click", e => { const b = e.target.closest("[data-it]"); if (b) openItinerary(b.dataset.it); });
}
function openItinerary(id) {
  const it0 = D.itineraries.find(i => i.id === id); if (!it0) return; buzz();
  const it = LI(it0);
  const uniq = [...new Map(it.steps.map(st => [st.spot, spotById[st.spot]])).values()];
  const dirUrl = uniq.length > 1 ? "https://www.google.com/maps/dir/" + uniq.map(p => encodeURIComponent(p.nav + ", Guyane")).join("/") : navUrl(uniq[0]);
  openSheet(`<div class="sheet-hero">${pic(it.img, "720px", { eager: true, cap: true })}<button class="sheet-x" aria-label="${t("Fermer")}">${ic("close")}</button>
      <div class="wrap"><div class="cats-line"><span class="tag" style="background:var(--awara);color:var(--encre)">${plural(it.days, "{n} jour", "{n} jours")}</span><span class="tag" style="background:#ffffff2b;color:#fff">${t("Niveau {l}", { l: t(it0.level) })}</span></div><h1 style="font-size:32px">${esc(it.title)}</h1></div></div>
    <div class="wrap"><p class="lead">${esc(it.pitch)}</p>
      <div class="facts"><div class="fact"><small>${t("Accès")}</small><b>${esc(it.access)}</b></div><div class="fact"><small>${t("Départ")}</small><b>${it0.startDay ? t("Un {d}", { d: t(it0.startDay) }) : t("Quand vous voulez")}</b></div></div>
      <ol class="timeline">${it.steps.map(st => { const s = spotById[st.spot]; return `<li><span class="dot" style="--k:${CATC[s.cat[0]]}">${passport[s.id] ? ic("check") : ic(s.cat[0])}</span><div><small>${esc(st.t)}</small><button data-spot="${s.id}">${esc(L(s).name)}</button><p>${esc(st.note)}</p></div></li>`; }).join("")}</ol>
      <div class="btns"><a class="btn" href="${dirUrl}" target="_blank" rel="noopener">${ic("go")}${t("Ouvrir le trajet")}</a><button class="btn ghost" id="itshare">${ic("share")}${t("Partager")}</button></div>${credit(it.img)}</div>`);
  $$(".timeline [data-spot]", sheet).forEach(b => b.onclick = () => openSpot(b.dataset.spot));
  $("#itshare").onclick = () => share(it.title, `${it.title} : ${uniq.map(s => L(s).name).join(", ")}`, pagePath("itineraire", it.id));
}

/* ---------- vue : Météo ---------- */
function tideSVG(sw) {
  const P = sw.pts, W = 340, H = 100, t0 = P[0].T, t1 = P[P.length - 1].T;
  const lo = Math.min(...P.map(p => p.L)), hi = Math.max(...P.map(p => p.L)), x = T => (T - t0) / (t1 - t0) * W, y = Lv => H - 12 - (Lv - lo) / ((hi - lo) || 1) * (H - 30);
  const d = P.map((p, i) => `${i ? "L" : "M"}${x(p.T).toFixed(1)} ${y(p.L).toFixed(1)}`).join("");
  const nx = x(Date.now());
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t("Courbe de marée sur 30 heures")}">
    <path d="${d}L${W} ${H}L0 ${H}Z" fill="#2A767222"/><path d="${d}" fill="none" stroke="#2A7672" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="${nx}" x2="${nx}" y1="0" y2="${H}" stroke="#F2A33A" stroke-width="2" stroke-dasharray="4 4"/>
    ${sw.ev.map(e => `<circle cx="${x(e.T)}" cy="${y(e.L)}" r="4" fill="${e.type === "Pleine mer" ? "#0F3D2E" : "#fff"}" stroke="#0F3D2E" stroke-width="2"/>`).join("")}</svg>`;
}
async function vMeteo() {
  const P = D.weatherPoints;
  view.innerHTML = `<div class="wrap"><div class="page-h"><h1>${t("Météo et mer")}</h1><p id="wxt">${t("Prévisions locales, pluie heure par heure et marées.")}</p></div>
    <div class="chips" id="wxsel" style="margin-top:12px">${P.map(p => `<button class="chip ${p.id === state.wxPoint ? "on" : ""}" data-p="${p.id}">${esc(p.label)}</button>`).join("")}</div>
    <div id="wxmain" style="margin-top:12px"><div class="sk" style="height:320px;border-radius:28px"></div></div>
    <section class="sec"><div class="sec-h"><h2>${t("Partout en Guyane")}</h2></div><div class="grid-wx" id="wxall"></div></section>
    <p class="note">${t("Marées déduites du modèle Open-Meteo : indicatives, elles ne remplacent pas un annuaire officiel pour naviguer.")}</p></div>`;
  const pick = e => { const b = e.target.closest("[data-p]"); if (!b) return; buzz(); state.wxPoint = b.dataset.p; store.set("wxPoint", state.wxPoint); vMeteoRender(); };
  $("#wxsel").addEventListener("click", pick); $("#wxall").addEventListener("click", pick);
  vMeteoRender();
}
async function vMeteoRender() {
  $$("#wxsel .chip").forEach(c => c.classList.toggle("on", c.dataset.p === state.wxPoint));
  let w, m;
  try { w = await getWeather(); } catch { $("#wxmain") && ($("#wxmain").innerHTML = `<div class="empty">${ic("offline", "ic-l")}<p>${t("Météo indisponible : pas de réseau et aucune donnée enregistrée. Ouvrez cet onglet une fois connecté.")}</p></div>`); return; }
  try { m = await getMarine(); } catch { m = null; }
  if (!$("#wxmain")) return;
  $("#wxt").textContent = (w.stale ? t("Hors-ligne, données {a}.", { a: ago(w.t) }) : t("Mis à jour {a}.", { a: ago(w.t) }));
  const P = D.weatherPoints, p = P.find(x => x.id === state.wxPoint) || P[0], d = w.byId[p.id];
  const [e, lab] = wmo(d.current.weather_code), rows = nextRain(d) || [];
  const sw = m && p.marine ? seaWindow(m.byId[p.id]) : null;
  const firstRain = rows.find(r => (r.p ?? 0) >= 50), uv = d.daily.uv_index_max?.[0];
  $("#wxmain").innerHTML = `<div class="wx-hero">
      <div class="row"><div><div class="temp">${Math.round(d.current.temperature_2m)}°</div><div class="cond">${t("{l} à {p}", { l: lab, p: esc(p.label) })}</div></div><div class="wx-emoji" aria-hidden="true">${e}</div></div>
      <div class="meta"><span>${ic("sun")}${t("Ressenti {n}°", { n: Math.round(d.current.apparent_temperature) })}</span><span>${ic("drop")}${d.current.relative_humidity_2m} %</span><span>${ic("wind")}${Math.round(d.current.wind_speed_10m)} km/h</span><span>${ic("moon")}${t("Coucher {h}", { h: hm(local(d.daily.sunset[0])) })}</span>${uv != null ? `<span>UV ${Math.round(uv)}</span>` : ""}</div>
      ${rows.length ? `<div class="rain-bars" aria-label="${t("Risque de pluie heure par heure")}">${rows.map(r => `<div><i style="height:${Math.max(4, r.p ?? 0)}%"></i>${hm(r.T).slice(0, 2)}h</div>`).join("")}</div>
      <p class="rain-cap">${firstRain ? t("Averse probable vers {h} ({p} %).", { h: hm(firstRain.T), p: firstRain.p }) : t("Pas d'averse probable dans les 12 prochaines heures.")}</p>` : ""}
    </div>
    <div class="days5">${d.daily.time.map((tt, i) => `<div><b>${i ? dayShort(tt) : t("Auj.")}</b><div class="e">${WMO(d.daily.weather_code[i])[0]}</div>${Math.round(d.daily.temperature_2m_max[i])}° ${Math.round(d.daily.temperature_2m_min[i])}°<div class="r">${d.daily.precipitation_probability_max[i] ?? "?"} %</div></div>`).join("")}</div>
    ${sw ? `<div class="tide"><div class="sec-h" style="margin:0"><h2 class="h3">${ic("tide", "ic-s")} ${t("Marée et houle")}</h2><p>${sw.wave != null ? t("Houle {n} m", { n: sw.wave.toLocaleString(LOC(), { maximumFractionDigits: 1 }) }) : ""}</p></div>${tideSVG(sw)}
      <div class="ev">${sw.ev.slice(0, 4).map(x => `<span>${t(x.type)} ${hm(x.T)}</span>`).join("")}</div></div>` : p.marine ? "" : `<p class="note">${t("Pas de données de mer pour ce point, situé dans les terres.")}</p>`}`;
  $("#wxall").innerHTML = P.map(x => { const dd = w.byId[x.id]; if (!dd) return ""; return `<button class="mini-wx" data-p="${x.id}"><b>${esc(x.label)}</b><span>${WMO(dd.current.weather_code)[0]} ${Math.round(dd.current.temperature_2m)}°</span></button>`; }).join("");
}

/* ---------- agenda ---------- */
// Fichier .ics (calendrier) : fonctionne avec Google Agenda, Apple Calendrier, Outlook.
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
function icsFile(name, evs) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Karbe//Guyane//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  evs.forEach(e => { lines.push("BEGIN:VEVENT", `UID:${e.uid}@karbe`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end || e.start + 3600e3)}`, `SUMMARY:${icsEsc(e.title)}`);
    if (e.desc) lines.push(`DESCRIPTION:${icsEsc(e.desc)}`); if (e.place) lines.push(`LOCATION:${icsEsc(e.place)}`);
    (e.alarms || []).forEach(a => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:${a}`, "END:VALARM"));
    lines.push("END:VEVENT"); });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w-]+/g, "-").toLowerCase() + ".ics";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t("Ouvrez le fichier pour l'ajouter à votre agenda"), "agenda");
}
let cdTimer;
function countdown(ts) { const s = Math.max(0, (ts - Date.now()) / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return s <= 0 ? t("En cours ou passé") : d ? t("Dans {d} j {h} h", { d, h }) : t("Dans {h} h {m} min", { h, m: String(m).padStart(2, "0") }); }
let evList = [];
async function vAgenda() {
  const { m } = nowG();
  const Mo = MONTHS();
  const bar = (months, k) => `<div class="months" style="--k:${k}">${Mo.map((x, i) => `<span class="${months.includes(i+1) ? "in" : ""} ${i+1 === m ? "cur" : ""}">${x[0].toUpperCase()}</span>`).join("")}</div>`;
  view.innerHTML = `<div class="banner">${pic("lancement", "100vw", { eager: true })}<div class="wrap"><h1>${t("Agenda")}</h1><p>${t("Lancements, événements, saisons de la faune et fêtes.")}</p></div></div>
  <div class="wrap">
    <section class="sec"><div class="sec-h"><h2>${t("Décollages à Kourou")}</h2><p id="lt"></p></div><div class="launches" id="launches"><div class="sk" style="height:96px"></div></div>
      <p class="note">${t("Les dates bougent souvent jusqu'au dernier moment. Les jours de tir, certaines zones de Kourou et les Îles du Salut sont fermées.")}</p></section>
    <section class="sec"><div class="sec-h"><h2>${t("Événements")}</h2><button class="link" id="evprop">${t("Proposer un événement")}</button></div><div id="evs" class="launches"><div class="sk" style="height:72px"></div></div></section>
    <section class="sec"><div class="sec-h"><h2>${t("Nature et fêtes")}</h2></div><div class="seasons">${D.seasons.map(s => `<button class="season" ${s.spot ? `data-spot="${s.spot}"` : ""}><b>${esc(TR().seasons?.[s.id] || s.label)}</b>${bar(s.months, s.cat === "faune" ? "var(--c-faune)" : "var(--c-culture)")}</button>`).join("")}</div></section>
    <section class="sec"><div class="sec-h"><h2>${t("Climat")}</h2></div><div class="seasons">${D.climate.map((c, i) => { const ct = TR().climate?.[i] || c; return `<div class="season"><b>${c.tone === "sec" ? "☀️" : "🌧️"} ${esc(t(ct.label))}</b><p class="note" style="margin-top:4px">${esc(t(ct.note))}</p>${bar(c.months, c.tone === "sec" ? "var(--awara-2)" : "#2b6f9f")}</div>`; }).join("")}</div></section>
  </div>`;
  view.addEventListener("click", e => {
    const b = e.target.closest("[data-spot]"); if (b && !e.target.closest(".place")) { openSpot(b.dataset.spot); return; }
    const l = e.target.closest("[data-ics-l]"); if (l) { const x = JSON.parse(l.dataset.icsL); icsFile(x.title, [{ uid: x.id, start: x.t, end: x.t + 3600e3, title: "🚀 " + x.title, place: "Kourou, Guyane", desc: t("Date à confirmer : vérifiez dans Karbé la veille."), alarms: ["-PT2H"] }]); return; }
    const v = e.target.closest("[data-ics-e]"); if (v) { const x = evList.find(y => y.id === v.dataset.icsE); if (x) icsFile(x.title, [{ uid: x.id, start: x.start, end: x.end || x.start + 2 * 3600e3, title: x.title, place: `${x.place}, ${x.town}`, desc: x.desc + (x.url ? "\n" + x.url : ""), alarms: ["-P1D"] }]); return; }
  });
  $("#evprop").onclick = openEventForm;
  api("evenements").then(j => {
    evList = (j.items || []).filter(x => (x.end || x.start) > Date.now() - 6 * 3600e3).sort((a, b) => a.start - b.start); store.set("evs", evList);
    renderEvents(j.ready === false);
  }).catch(() => { evList = store.get("evs", []).filter(x => (x.end || x.start) > Date.now()); renderEvents(false, true); });
  try {
    const r = await getLaunches(); const el = $("#launches"); if (!el) return;
    $("#lt").textContent = (r.stale ? t("hors-ligne") + ", " : "") + ago(r.t);
    el.innerHTML = r.list.length ? r.list.map(l => { const d = new Date(l.net), go = /^go$/i.test(l.status?.abbrev || "");
      return `<div class="launch"><div class="d"><b>${new Intl.DateTimeFormat(LOC(), { timeZone: TZ, day: "numeric" }).format(d)}</b><small>${new Intl.DateTimeFormat(LOC(), { timeZone: TZ, month: "short" }).format(d)}</small></div>
        <div><b>${esc(l.name)}</b><div class="cd" data-t="${d.getTime()}">${countdown(d.getTime())}</div><div class="st">${t("{h} heure de Guyane", { h: hm(d) })}, ${go ? t("date confirmée") : t("date à confirmer")}</div></div>
        <button class="btn ghost sq" aria-label="${t("Ajouter à mon agenda")}" data-ics-l='${esc(JSON.stringify({ id: l.id, title: l.name, t: d.getTime() }))}'>${ic("agenda")}</button></div>`; }).join("")
      : `<div class="empty">${t("Aucun lancement annoncé pour l'instant.")}</div>`;
    clearInterval(cdTimer); cdTimer = setInterval(() => { const c = $$(".cd[data-t]"); if (!c.length) return clearInterval(cdTimer); c.forEach(x => x.textContent = countdown(+x.dataset.t)); }, 30000);
  } catch { const el = $("#launches"); if (el) el.innerHTML = `<div class="empty">${t("Lancements indisponibles sans réseau.")}</div>`; }
}
function renderEvents(notReady, offline) {
  const el = $("#evs"); if (!el) return;
  el.innerHTML = evList.length ? evList.map(x => `<div class="launch"><div class="d"><b>${new Intl.DateTimeFormat(LOC(), { timeZone: TZ, day: "numeric" }).format(x.start)}</b><small>${new Intl.DateTimeFormat(LOC(), { timeZone: TZ, month: "short" }).format(x.start)}</small></div>
    <div><b>${esc(x.title)}</b><div class="st">${esc(x.town)} · ${esc(x.place)} · ${hm(x.start)}</div><p class="note" style="margin:4px 0 0">${esc(x.desc)}</p>${x.url ? `<a class="link" href="${esc(x.url)}" target="_blank" rel="noopener">${t("Site de l'organisateur")}</a>` : ""}</div>
    <button class="btn ghost sq" aria-label="${t("Ajouter à mon agenda")}" data-ics-e="${esc(x.id)}">${ic("agenda")}</button></div>`).join("")
    : `<div class="empty">${offline ? t("Événements indisponibles sans réseau.") : notReady ? t("L'agenda participatif ouvre bientôt.") : t("Aucun événement à venir pour l'instant. Organisateurs : proposez le vôtre, il sera vérifié avant publication.")}</div>`;
}
function openEventForm() {
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">${t("Proposer un événement")}</h1>
    <p class="lead">${t("Fête, concert, marché, sortie nature ouverte au public. Chaque proposition est vérifiée avant publication.")}</p>
    <form class="form" id="evform">
      <label>${t("Titre")}<input name="title" required maxlength="80"></label>
      <label>${t("Date")}<input name="date" type="date" required min="${today}"></label>
      <label>${t("Heure de début")}<input name="time" type="time" required value="18:00"></label>
      <label>${t("Durée (heures)")}<input name="dur" type="number" min="1" max="72" value="3" inputmode="numeric"></label>
      <label>${t("Commune")}<input name="town" required maxlength="40"></label>
      <label>${t("Lieu précis")}<input name="place" required maxlength="80"></label>
      <label>${t("Description")}<textarea name="desc" rows="3" required maxlength="400"></textarea></label>
      <label>${t("Lien (facultatif)")}<input name="url" type="url" maxlength="200" placeholder="https://"></label>
      <label>${t("Votre contact, non publié (facultatif)")}<input name="contact" maxlength="80"></label>
      <button class="btn dark" type="submit">${t("Envoyer pour vérification")}</button></form><div id="evout"></div></div>`);
  $("#evform").addEventListener("submit", async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = $("button[type=submit]", e.target);
    const start = new Date(`${f.date}T${f.time}:00-03:00`).getTime();
    btn.disabled = true;
    try { await api("evenements", { title: f.title, start, end: start + (+f.dur || 3) * 3600e3, town: f.town, place: f.place, desc: f.desc, url: f.url, contact: f.contact, lang });
      $("#evout").innerHTML = `<div class="out">${t("Merci ! Votre événement sera publié après vérification.")}</div>`; e.target.reset(); }
    catch (err) { $("#evout").innerHTML = `<div class="out">${err.status === 429 ? t("Trop de propositions aujourd'hui depuis ce réseau. Réessayez demain.") : err.status === 503 ? t("L'agenda participatif ouvre bientôt.") : t("Envoi impossible. Vérifiez votre connexion.")}</div>`; }
    btn.disabled = false;
  });
}

/* ---------- passeport ---------- */
function vPasseport() {
  const V = visited().sort((a, b) => passport[b] - passport[a]);
  const zones = Object.keys(D.zones);
  view.innerHTML = `<div class="wrap"><div class="page-h"><h1>${t("Mon passeport")}</h1><p>${t("Validez chaque lieu sur place grâce au GPS. Tout reste sur votre téléphone.")}</p></div>
    <div class="pass-hero"><div class="big">${V.length}<small>/ ${D.spots.length}</small></div><div>${zones.map(k => { const n = D.spots.filter(s => s.zone === k).length, v = V.filter(id => spotById[id].zone === k).length;
      return `<div class="zbar"><span>${esc(zoneLabel(k))}</span><i style="--p:${v / n * 100}%"></i><b>${v}/${n}</b></div>`; }).join("")}</div></div>
    <section class="sec"><div class="sec-h"><h2>${t("Badges")}</h2></div><div class="badges">${D.badges.map(b => { const st = badgeState(b), [n, d] = BADGE_FR[b.id];
      return `<div class="badge ${st.got ? "got" : ""}"><div class="medal">${b.e}</div><b>${esc(t(n))}</b><small>${esc(t(d))}</small>${st.got ? "" : `<div class="prog"><i style="width:${st.p / st.of * 100}%"></i></div>`}</div>`; }).join("")}</div></section>
    <section class="sec"><div class="sec-h"><h2>${t("Mon carnet")}</h2>${V.length ? `<button class="link" id="pshare">${t("Partager mon carnet")}</button>` : ""}</div>
      <div class="places">${V.length ? V.map(id => `<div class="place" data-spot="${id}" role="button" tabindex="0">${pic(spotById[id].img, "112px")}<div class="in"><h3>${esc(L(spotById[id]).name)}</h3><p>${dday(passport[id])} · ${esc(zoneLabel(spotById[id].zone))}</p></div></div>`).join("")
        : `<div class="empty">${t("Ouvrez la fiche d'un lieu une fois sur place et touchez « J'y suis ».")}</div>`}</div></section>
    <p class="note">${t("La validation demande d'être à moins de 600 m du lieu (2 km quand sa position est approximative).")}</p></div>`;
  $("#pshare") && ($("#pshare").onclick = shareCarnet);
}
async function shareCarnet() {
  // Carnet partageable : une image générée sur le téléphone (aucune donnée envoyée).
  const V = visited().sort((a, b) => passport[a] - passport[b]), got = D.badges.filter(b => badgeState(b).got);
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const img = new Image(); img.src = opt("hero", 1080); await img.decode().catch(() => {});
  x.fillStyle = "#0F3D2E"; x.fillRect(0, 0, W, H);
  if (img.complete && img.naturalWidth) { x.globalAlpha = .55; x.drawImage(img, 0, 0, W, W * img.naturalHeight / img.naturalWidth); x.globalAlpha = 1; }
  const g = x.createLinearGradient(0, 300, 0, H); g.addColorStop(0, "#0F3D2E00"); g.addColorStop(.45, "#0F3D2E"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "#F2A33A"; x.font = "800 64px 'Bricolage Grotesque', sans-serif"; x.fillText("Karbé", 80, 120);
  x.fillStyle = "#fff"; x.font = "800 96px 'Bricolage Grotesque', sans-serif"; x.fillText(t("Ma Guyane"), 80, 560);
  x.font = "600 44px 'Atkinson Hyperlegible Next', sans-serif"; x.fillStyle = "#F7E7C6";
  x.fillText(t("{n} lieux · {b} badges", { n: V.length, b: got.length }), 80, 640);
  x.font = "400 36px 'Atkinson Hyperlegible Next', sans-serif"; x.fillStyle = "#fff";
  V.slice(-12).forEach((id, i) => x.fillText("• " + L(spotById[id]).name, 80, 730 + i * 46));
  x.font = "64px sans-serif"; got.slice(0, 8).forEach((b, i) => x.fillText(b.e, 80 + i * 96, H - 90));
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const file = new File([blob], "karbe-carnet.png", { type: "image/png" });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Karbé", text: t("Ma Guyane avec Karbé"), url: location.origin }); return; } } catch { return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "karbe-carnet.png"; a.click();
}

/* ---------- Lumière rouge ---------- */
let wakeLock;
async function openRedLight() {
  const r = $("#redlight");
  r.innerHTML = `${ic("torch", "ic-l")}<h2>${t("Lumière rouge")}</h2><p>${t("Baissez la luminosité au minimum. Gardez l'écran tourné vers le sol, jamais vers la tortue, et restez derrière elle.")}</p><button class="btn" id="red-x">${t("Quitter")}</button>`;
  r.hidden = false; buzz();
  try { await r.requestFullscreen?.(); } catch {}
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  $("#red-x").onclick = async () => { r.hidden = true; try { await wakeLock?.release(); } catch {} try { document.fullscreenElement && await document.exitFullscreen(); } catch {} };
}

/* ---------- Sécurité : suivi de sortie partagé ---------- */
const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
function openSafety() {
  const last = store.get("trip", {});
  const def = new Date(Date.now() + 5 * 3600e3), pad = n => String(n).padStart(2, "0");
  const defV = `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:00`;
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">${t("Urgences")}</h1>
    <div class="nums">${D.safety.numbers.map((x, i) => `<a href="tel:${x.n}"><b>${x.n}</b><span>${esc(TR().safety?.numbers?.[i] || x.l)}</span></a>`).join("")}</div>
    <h2 class="h3m">${t("Les règles qui sauvent")}</h2>
    <ul class="tips">${(TR().safety?.rules || D.safety.rules).map(r => `<li>${ic("info")}<span>${esc(r)}</span></li>`).join("")}</ul>
    <h2 class="h3m">${t("Je pars en sortie")}</h2>
    <p class="note" style="margin-top:6px">${t("Votre proche reçoit un lien de suivi : destination, heure de retour, et une alarme dans son agenda. Quand vous rentrez, touchez « Je suis rentré » : il le voit aussitôt.")}</p>
    <form class="form" id="trip">
      <label>${t("Votre prénom")}<input name="who" required maxlength="30" autocomplete="given-name" value="${esc(last.who || "")}"></label>
      <label>${t("Destination")}<select name="spot">${D.spots.map(s => `<option value="${s.id}">${esc(L(s).name)}</option>`).join("")}</select></label>
      <label>${t("Nombre de personnes")}<input name="n" type="number" min="1" max="50" inputmode="numeric" value="${esc(last.n || 2)}"></label>
      <label>${t("Retour prévu au plus tard")}<input name="back" type="datetime-local" required value="${defV}"></label>
      <label>${t("Téléphone du proche (facultatif)")}<input name="phone" type="tel" autocomplete="tel" value="${esc(last.phone || "")}" placeholder="0694…"></label>
      <button class="btn red" type="submit">${ic("sms")}${t("Créer le lien de suivi")}</button>
    </form><div id="tripout"></div></div>`);
  $("#trip").addEventListener("submit", async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)); store.set("trip", { who: f.who, n: f.n, phone: f.phone });
    const s = spotById[f.spot], back = new Date(f.back).getTime();
    if (!(back > Date.now())) { toast(t("L'heure de retour doit être dans le futur"), "info"); return; }
    const data = { w: f.who.slice(0, 30), s: f.spot, n: +f.n || 1, b: back, c: Date.now() };
    let id = "", key = "";
    try { const r = await api("sortie", data); id = r.id; key = r.key; } catch {}
    const link = `${location.origin}/#suivi/${id ? id + "." : ""}${b64e(data)}`;
    store.set("activeTrip", { spot: f.spot, back, id, key, link });
    afterClose = () => { if (!location.hash || location.hash === "#explorer") rerender(); };
    const msg = t("Je pars en sortie à {n} : {p} ({z}). Retour prévu au plus tard : {d}. Suis ma sortie ici : {l}", { n: data.n, p: L(s).name, z: zoneLabel(s.zone), d: dfull(back), l: link }) +
      "\n" + t("Sans nouvelles 2 h après, appelle le 112 et indique : {nav}, GPS environ {gps}.", { nav: s.nav, gps: `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` }) + `\n${f.who}`;
    $("#tripout").innerHTML = `<div class="out">${esc(msg)}</div>${id ? "" : `<p class="note">${t("Suivi en direct indisponible pour l'instant : le lien fonctionne, mais votre retour ne s'affichera pas automatiquement. Envoyez aussi un message en rentrant.")}</p>`}
      <div class="btns" style="margin-top:10px">
      ${f.phone ? `<a class="btn red" href="sms:${encodeURIComponent(f.phone)}?&body=${encodeURIComponent(msg)}">${ic("sms")}${t("Envoyer par SMS")}</a>` : ""}
      ${navigator.share ? `<button class="btn ghost" id="tripshare">${ic("share")}${t("Partager")}</button>` : ""}<button class="btn ghost" id="tripcopy">${ic("copy")}${t("Copier")}</button></div>`;
    $("#tripcopy").onclick = async () => { try { await navigator.clipboard.writeText(msg); toast(t("Message copié"), "copy"); } catch {} };
    $("#tripshare") && ($("#tripshare").onclick = async () => { try { await navigator.share({ text: msg }); } catch {} });
  });
}
async function tripDone() {
  const tr = store.get("activeTrip"); if (!tr) return; buzz();
  if (tr.id) { try { await api("sortie?id=" + encodeURIComponent(tr.id), { action: "rentre", key: tr.key }); }
    catch { const q = store.get("queue", []); q.push({ path: "sortie?id=" + encodeURIComponent(tr.id), body: { action: "rentre", key: tr.key } }); store.set("queue", q); toast(t("Pas de réseau : envoi au retour du réseau"), "offline"); } }
  store.del("activeTrip"); toast(t("Bon retour ! Votre proche est prévenu."), "check");
  const ph = store.get("trip", {}).phone;
  if (ph) location.href = `sms:${encodeURIComponent(ph)}?&body=${encodeURIComponent(t("Je suis bien rentré. {w}", { w: store.get("trip", {}).who || "" }))}`;
  rerender();
}
let suiviTimer;
async function vSuivi(arg) {
  const [maybeId, enc] = arg.includes(".") ? arg.split(".") : ["", arg];
  let d; try { d = b64d(enc); } catch { view.innerHTML = `<div class="wrap"><div class="empty">${t("Lien de suivi invalide.")}</div></div>`; return; }
  const s = spotById[d.s];
  const render = async () => {
    let live = null; if (maybeId) { try { live = await api("sortie?id=" + encodeURIComponent(maybeId)); } catch {} }
    const back = live?.b || d.b, done = live?.r, late = !done && Date.now() > back, alarm = !done && Date.now() > back + 2 * 3600e3;
    const st = done ? ["ok", t("{w} est bien rentré·e {a}.", { w: esc(d.w), a: ago(done) })] : alarm ? ["bad", t("Pas de nouvelles depuis plus de 2 h après l'heure prévue.")] : late ? ["warn", t("Retour prévu dépassé. Essayez d'appeler {w}.", { w: esc(d.w) })] : ["info", t("Sortie en cours")];
    if (!$("#suivi")) return;
    $("#suivi").innerHTML = `<div class="suivi-st ${st[0]}">${st[0] === "ok" ? ic("check") : ic("sos")}<b>${st[1]}</b></div>
      <div class="facts"><div class="fact wide"><small>${t("Qui")}</small><b>${esc(d.w)}, ${plural(d.n, "{n} personne", "{n} personnes")}</b></div>
        <div class="fact wide"><small>${t("Destination")}</small><b>${esc(L(s)?.name || d.s)} (${esc(s ? zoneLabel(s.zone) : "")})</b></div>
        <div class="fact wide"><small>${t("Retour prévu au plus tard")}</small><b>${dfull(back)}</b>${!done && !late ? `<span class="cd">${countdown(back)}</span>` : ""}</div></div>
      ${alarm ? `<div class="out">${t("Appelez le 112 et indiquez : {nav}, GPS environ {gps}, {n} personne(s), parti(e)s le {c}.", { nav: esc(s?.nav || ""), gps: s ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : "", n: d.n, c: dfull(d.c) })}</div><div class="btns"><a class="btn red" href="tel:112">${ic("phone")}112</a></div>` : ""}
      ${!done ? `<div class="btns" style="margin-top:14px"><button class="btn dark" id="suivi-ics">${ic("agenda")}${t("Ajouter une alarme à mon agenda")}</button>${s ? `<a class="btn ghost" href="${navUrl(s)}" target="_blank" rel="noopener">${ic("map")}${t("Voir le lieu")}</a>` : ""}</div>` : ""}
      <p class="note">${maybeId ? t("Cette page se met à jour toute seule quand {w} confirme son retour.", { w: esc(d.w) }) : t("Ce lien n'a pas de suivi en direct : attendez un message de {w} à son retour.", { w: esc(d.w) })}</p>`;
    $("#suivi-ics") && ($("#suivi-ics").onclick = () => icsFile("sortie-" + d.w, [{ uid: (maybeId || d.c) + "-suivi", start: back + 2 * 3600e3, end: back + 2.5 * 3600e3,
      title: t("Sans nouvelles de {w} ? Appeler le 112", { w: d.w }), place: s?.nav || "", desc: t("{w} est parti·e à {p}. Retour prévu au plus tard {d}. GPS environ {gps}. Vérifiez d'abord le lien de suivi.", { w: d.w, p: L(s)?.name || "", d: dfull(back), gps: s ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : "" }) + "\n" + location.href,
      alarms: ["PT0M"] }, { uid: (maybeId || d.c) + "-retour", start: back, end: back + 1800e3, title: t("Retour prévu de {w}", { w: d.w }), desc: location.href, alarms: ["PT0M"] }]));
  };
  view.innerHTML = `<div class="wrap"><div class="page-h"><h1>${t("Suivi de sortie")}</h1><p>${t("Partagé avec vous par {w} via Karbé.", { w: esc(d.w) })}</p></div><div id="suivi"><div class="sk" style="height:200px;border-radius:24px"></div></div></div>`;
  await render();
  clearInterval(suiviTimer); if (maybeId) suiviTimer = setInterval(() => { if (!$("#suivi")) return clearInterval(suiviTimer); if (document.visibilityState === "visible") render(); }, 60000);
}

/* ---------- Langue ---------- */
function openLang() {
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">${t("Langue")}</h1><div class="lang-list">${Object.entries(LANGS).map(([k, [n]]) => `<button class="lang-b ${k === lang ? "on" : ""}" data-lang="${k}" lang="${k}"><b>${n}</b>${k === lang ? ic("check") : ""}</button>`).join("")}</div>
    <p class="note">${t("Les noms propres et certains détails pratiques restent en français.")}</p></div>`);
  $$("[data-lang]", sheet).forEach(b => b.onclick = async () => { store.set("lang", b.dataset.lang); await loadLang(b.dataset.lang); document.documentElement.lang = lang; closeSheet(); tabsI18n(); route(); });
}
function tabsI18n() { const N = { explorer: "Aujourd'hui", carte: "Carte", itineraires: "Itinéraires", meteo: "Météo", agenda: "Agenda" }; $$(".tabs a").forEach(a => { const s = $("span:last-child", a); if (s) s.textContent = t(N[a.dataset.tab]); }); }

/* ---------- Partenaires ---------- */
function openPartner() {
  openSheet(`<button class="sheet-x" aria-label="${t("Fermer")}" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">${t("Rejoindre Karbé")}</h1>
    <p class="lead">${t("Guides agréés, carbets, restaurants, loueurs de pirogues ou de vélos, artisans : présentez votre activité aux visiteurs et aux habitants.")}</p>
    <form class="form" id="pform">
      <label>${t("Nom de l'activité")}<input name="name" required maxlength="80"></label>
      <label>${t("Type")}<select name="type">${["Guide ou excursion", "Hébergement ou carbet", "Restauration", "Location", "Artisanat ou boutique", "Autre"].map(x => `<option value="${x}">${t(x)}</option>`).join("")}</select></label>
      <label>${t("Commune")}<input name="town" required maxlength="40"></label>
      <label>${t("Lieux Karbé proches (facultatif)")}<input name="near" maxlength="120"></label>
      <label>${t("Votre offre pour les utilisateurs")}<textarea name="offer" rows="3" maxlength="400"></textarea></label>
      <label>${t("Site, page ou numéro professionnel")}<input name="contact" required maxlength="120"></label>
      <button class="btn dark" type="submit">${t("Envoyer ma demande")}</button></form><div id="pout"></div></div>`);
  $("#pform").addEventListener("submit", async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = $("button[type=submit]", e.target); btn.disabled = true;
    try { await api("evenements", { kind: "partenaire", title: f.name, town: f.town, place: f.type, desc: `${f.offer}\n${t("Proche de")} : ${f.near}`, contact: f.contact, start: Date.now(), lang });
      $("#pout").innerHTML = `<div class="out">${t("Merci ! Nous vérifions chaque activité (statut, agrément) avant de la proposer dans Karbé.")}</div>`; e.target.reset(); }
    catch { const txt = `${f.name} — ${f.type} — ${f.town}\n${f.offer}\n${f.contact}`;
      $("#pout").innerHTML = `<div class="out">${esc(txt)}</div><p class="note">${t("Envoi impossible pour l'instant. Copiez votre demande et réessayez plus tard.")}</p><button class="btn ghost" id="pcopy">${ic("copy")}${t("Copier")}</button>`;
      $("#pcopy").onclick = async () => { try { await navigator.clipboard.writeText(txt); toast(t("Demande copiée"), "copy"); } catch {} }; }
    btn.disabled = false;
  });
}

/* ---------- routeur ---------- */
const routes = { explorer: vExplorer, carte: vCarte, itineraires: vItineraires, meteo: vMeteo, agenda: vAgenda, passeport: vPasseport, suivi: vSuivi, lieu: null };
function route() {
  const [r0, arg] = location.hash.slice(1).split("/");
  if (r0 === "lieu" && spotById[arg]) { if (!view.childElementCount) { routeTo("explorer"); } openSpot(arg); return; }
  routeTo(r0 in routes && routes[r0] ? r0 : "explorer", arg);
}
function routeTo(r, arg) {
  const run = () => {
    if (!sheet.hidden) closeSheet();
    if (map) { map.remove(); map = null; }
    clearInterval(cdTimer); clearInterval(suiviTimer);
    const fresh = view.cloneNode(false); view.replaceWith(fresh); view = fresh;
    const tabs = $$(".tabs a"), ti = tabs.findIndex(a => a.dataset.tab === r);
    $(".tabs").style.setProperty("--i", Math.max(ti, 0)); $(".tab-galet").style.opacity = ti < 0 ? 0 : 1;
    tabs.forEach(a => { const on = a.dataset.tab === r; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    const names = { explorer: "", carte: "Carte", itineraires: "Itinéraires", meteo: "Météo", agenda: "Agenda", passeport: "Mon passeport", suivi: "Suivi de sortie" };
    document.title = r === "explorer" ? t("Karbé, la Guyane à portée de main") : `${t(names[r])}, Karbé`;
    routes[r](arg || ""); scrollTo(0, 0);
  };
  if (document.startViewTransition && !RM && view.childElementCount) document.startViewTransition(run); else run();
}
document.addEventListener("click", e => {
  const f = e.target.closest("[data-fav]");
  if (f) { e.stopPropagation(); toggleFav(f.dataset.fav); syncFavs(); toast(favs.has(f.dataset.fav) ? t("Ajouté aux favoris") : t("Retiré des favoris"), "heart"); if (state.cat === "fav") rerender("#spots"); return; }
  const c = e.target.closest(".place[data-spot], .now-card[data-spot]");
  if (c && !sheet.contains(c)) openSpot(c.dataset.spot);
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".place[data-spot]")) { e.preventDefault(); openSpot(e.target.dataset.spot); } });
addEventListener("hashchange", route);
$$(".tabs a").forEach(a => a.addEventListener("click", buzz));

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
tabsI18n();
route();
flushQueue();
})();
