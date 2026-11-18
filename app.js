/* Karbé 2 — vanilla JS, zéro dépendance au chargement (MapLibre chargé à la demande). */
(() => {
"use strict";
const D = window.KARBE;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let view = $("#view");
const sheet = $("#sheet"), sheetBody = $(".sheet-body", sheet), panel = $(".sheet-panel", sheet);
const TZ = "America/Cayenne";
const CONTACT_EMAIL = ""; // à renseigner pour l'envoi direct des demandes partenaires
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const spotById = Object.fromEntries(D.spots.map(s => [s.id, s]));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const ic = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const buzz = () => { try { navigator.vibrate?.(8); } catch {} };
const CATC = { plage:"var(--c-plage)", nature:"var(--c-nature)", faune:"var(--c-faune)", patrimoine:"var(--c-patrimoine)", culture:"var(--c-culture)", espace:"var(--c-espace)", fleuve:"var(--c-fleuve)" };
const ACCESS = { voiture:["car","Voiture"], "4x4":["car","4x4"], bateau:["fleuve","Bateau"], avion:["plane","Avion"], pied:["walk","À pied"] };

/* ---------- stockage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("karbe:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("karbe:" + k, JSON.stringify(v)); } catch {} },
};
let favs = new Set(store.get("favs", []));
const toggleFav = id => { favs.has(id) ? favs.delete(id) : favs.add(id); store.set("favs", [...favs]); buzz(); };
const state = { q: "", cat: "all", zone: "all", userPos: null, wxPoint: store.get("wxPoint", "cayenne") };

/* ---------- temps (heure de Guyane) ---------- */
const part = (o) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", ...o }).formatToParts(new Date()).map(p => [p.type, p.value]));
const nowG = () => { const p = part({ month: "numeric", weekday: "short", hour: "numeric", minute: "numeric" }); return { m: +p.month, wd: p.weekday, h: +p.hour + (+p.minute) / 60 }; };
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const hm = t => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const local = s => new Date(s + "-03:00").getTime(); // horodatages Open-Meteo en heure de Guyane
const dayShort = s => new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(new Date(s + "T12:00:00Z")).replace(".", "");
const weekdayFR = () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: TZ }).format(new Date());

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
    ${cap ? `<span class="cap">Illustration</span>` : ""}</div>`;
}

/* ---------- réseau & cache ---------- */
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
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m/60)} h` : `il y a ${Math.round(m/1440)} j`; };
let toastT;
function toast(msg, icon = "check") { const t = $("#toast"); t.innerHTML = ic(icon, "ic-s") + esc(msg); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ---------- géo ---------- */
function distKm(a, b) { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2; return 2 * R * Math.asin(Math.sqrt(h)); }
const fmtKm = d => d < 10 ? d.toFixed(1).replace(".", ",") + " km" : Math.round(d) + " km";
const navUrl = s => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.nav + ", Guyane")}`;
const wazeUrl = s => `https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`;
function locate() {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error("geo"));
    navigator.geolocation.getCurrentPosition(p => { state.userPos = { lat: p.coords.latitude, lon: p.coords.longitude }; ok(state.userPos); }, ko, { timeout: 10000, maximumAge: 300000 });
  });
}

/* ---------- météo, mer, lancements ---------- */
const WMO = c => c === 0 ? ["☀️","Grand soleil"] : c <= 2 ? ["🌤️","Éclaircies"] : c === 3 ? ["☁️","Couvert"] : c <= 48 ? ["🌫️","Brume"] :
  c <= 57 ? ["🌦️","Bruine"] : c <= 67 ? ["🌧️","Pluie"] : c <= 77 ? ["🌧️","Pluie"] : c <= 82 ? ["🌦️","Averses"] : ["⛈️","Orages"];
async function getWeather() {
  const P = D.weatherPoints;
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + P.map(p => p.lat).join(",") + "&longitude=" + P.map(p => p.lon).join(",") +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
    "&hourly=precipitation_probability&forecast_hours=24" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max" +
    "&timezone=" + encodeURIComponent(TZ) + "&forecast_days=5";
  const r = await cachedJSON("wx2", url, 40);
  const arr = Array.isArray(r.data) ? r.data : [r.data];
  return { t: r.t, stale: r.stale, byId: Object.fromEntries(P.map((p, i) => [p.id, arr[i]])) };
}
async function getMarine() {
  const P = D.weatherPoints.filter(p => p.marine);
  const url = "https://marine-api.open-meteo.com/v1/marine?latitude=" + P.map(p => p.marine.lat).join(",") + "&longitude=" + P.map(p => p.marine.lon).join(",") +
    "&hourly=sea_level_height_msl,wave_height&timezone=" + encodeURIComponent(TZ) + "&forecast_days=3";
  const r = await cachedJSON("marine", url, 180);
  const arr = Array.isArray(r.data) ? r.data : [r.data];
  return { t: r.t, stale: r.stale, byId: Object.fromEntries(P.map((p, i) => [p.id, arr[i]])) };
}
async function getLaunches() {
  const r = await cachedJSON("launches", "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?location__ids=13&limit=6&mode=list", 180);
  return { t: r.t, stale: r.stale, list: (r.data?.results || []).filter(l => new Date(l.net).getTime() > Date.now() - 3 * 3600e3) };
}
function seaWindow(m, hours = 30) {
  const h = m?.hourly; if (!h?.sea_level_height_msl) return null;
  const now = Date.now(), pts = [];
  h.time.forEach((t, i) => { const T = local(t), L = h.sea_level_height_msl[i]; if (L != null && T >= now - 3600e3 && T <= now + hours * 3600e3) pts.push({ T, L, W: h.wave_height?.[i] }); });
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
  const rows = h.time.map((t, i) => ({ T: local(t), p: h.precipitation_probability[i] })).filter(r => r.T >= now - 3600e3).slice(0, 12);
  return rows;
}

/* ---------- moteur « maintenant » ---------- */
function suggestions(wx, launches) {
  const { m, wd, h } = nowG(), out = [], seen = new Set();
  const add = (id, why, icon, score) => { if (!seen.has(id) && spotById[id]) { seen.add(id); out.push({ s: spotById[id], why, icon, score }); } };
  const cay = wx?.byId?.cayenne, rainToday = cay?.daily?.precipitation_probability_max?.[0];
  const rows = nextRain(cay), dryMorning = rows && rows.slice(0, 4).every(r => (r.p ?? 100) < 40);
  const sunset = cay?.daily?.sunset?.[0] ? hm(local(cay.daily.sunset[0])) : "18 h";
  const L = launches?.list?.[0];
  if (L) { const dh = (new Date(L.net) - Date.now()) / 3600e3; if (dh > -2 && dh < 72) add("kourou-plage", dh < 24 ? `Lancement aujourd'hui à ${hm(L.net)}` : `Lancement dans ${Math.round(dh / 24)} j`, "espace", 100); }
  if (wd === "Sun" && h < 13) { add("cacao", "C'est dimanche : jour de marché", "culture", 95); add("javouhey", "Marché du dimanche matin", "culture", 70); }
  if (wd === "Sat") add("cacao", "Demain dimanche : marché de Cacao", "culture", 45);
  const turtle = D.seasons.filter(s => s.cat === "faune" && s.months.includes(m));
  if (turtle.length) { add(turtle[0].spot, h >= 15 ? "Saison des tortues : sortie ce soir" : "Saison des tortues en cours", "moon", h >= 15 ? 90 : 60); if (turtle[1]) add(turtle[1].spot, "Saison des tortues en cours", "moon", 55); }
  if (rainToday != null && rainToday >= 65) { add("musee-cultures", "Journée pluvieuse : une visite à l'abri", "drop", 80); add("transportation", "Visite guidée à l'abri", "drop", 50); add("zoo", "Circuit ombragé, même sous les averses", "drop", 40); }
  if (dryMorning && h < 11) { add("rorota", "Pas de pluie annoncée ce matin", "sun", 85); add("matoury", "Matinée sèche, idéale pour marcher", "sun", 60); }
  if (h >= 15 && h < 18.5) add("ceperou", `Coucher du soleil à ${sunset}`, "sun", 75);
  if (h >= 5 && h < 9) add("marche-cayenne", "Le marché s'anime tôt le matin", "clock", 65);
  if ([8,9,10,11].includes(m)) add("kaw", "Saison sèche : le marais est plus accessible", "fleuve", 50);
  add("salut", "Le grand classique, à faire au moins une fois", "spark", 30);
  add("palmistes", "Au cœur du vieux Cayenne", "spark", 20);
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ---------- composants ---------- */
const inSeason = s => { const m = nowG().m; return D.seasons.find(x => x.spot === s.id && x.months.includes(m)); };
function placeRow(s) {
  const se = inSeason(s), d = state.userPos ? distKm(state.userPos, s) : null;
  return `<div class="place" data-spot="${s.id}" role="button" tabindex="0">
    ${pic(s.img, "76px")}
    <div><h3>${esc(s.name)}</h3><div class="sub">${esc(D.zones[s.zone].label)}</div>
      <div class="tags">${d != null ? `<span class="tag near">${ic("locate")}${fmtKm(d)}</span>` : ""}${se ? `<span class="tag hot">${ic("moon")}En saison</span>` : ""}${s.when ? `<span class="tag hot">${ic("clock")}${esc(s.when.split(" (")[0])}</span>` : ""}<span class="tag">${ic("clock")}${esc(s.dur)}</span>${s.free ? `<span class="tag free">Gratuit</span>` : ""}</div></div>
    <button class="fav ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-label="${favs.has(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}" aria-pressed="${favs.has(s.id)}">${ic("heart")}</button></div>`;
}
const norm = s => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
function filtered() {
  const q = norm(state.q.trim());
  let L = D.spots.filter(s => (state.cat === "all" || (state.cat === "fav" ? favs.has(s.id) : s.cat.includes(state.cat))) &&
    (state.zone === "all" || s.zone === state.zone) && (!q || norm(s.name + " " + s.desc + " " + D.zones[s.zone].label + " " + s.cat.join(" ")).includes(q)));
  if (state.userPos) L = L.slice().sort((a, b) => distKm(state.userPos, a) - distKm(state.userPos, b));
  return L;
}
const markSVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3c9.6 0 17 6.8 17 16.4C37 30 29.2 37 20 37S3 30 3 19.4C3 9.8 10.4 3 20 3z" fill="#F2A33A"/><path d="M8.5 23L20 11.5 31.5 23M12 23v8M28 23v8" fill="none" stroke="#0F3D2E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- vue : Aujourd'hui ---------- */
function vExplorer() {
  const { m, h } = nowG();
  const clim = D.climate.find(c => c.months.includes(m));
  const hello = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const wday = weekdayFR();
  view.innerHTML = `
  <section class="hero">
    ${pic("hero", "100vw", { eager: true })}
    <div class="hero-top"><div class="mark">${markSVG}Karbé</div><div class="live" id="live" hidden></div></div>
    <div class="hero-copy"><div class="wrap">
      <p>${hello}</p>
      <h1>La Guyane, ce ${esc(wday)}.</h1>
      <p>${esc(clim.label)} en ${MONTHS[m-1]}. ${esc(clim.note)}</p>
    </div></div>
  </section>
  <div class="wrap">
    <div class="searchbar"><label>${ic("search")}<span class="vh">Rechercher</span>
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Plage, sentier, Cacao, bagne…" value="${esc(state.q)}">
      <button class="iconbtn ${state.userPos ? "on" : ""}" id="near" type="button" aria-label="Trier par distance">${ic("locate")}</button></label></div>

    <section class="sec" id="now-sec">
      <div class="sec-h"><h2>À faire maintenant</h2></div>
      <p class="note" id="now-src" style="margin:-8px 0 14px">Selon l'heure, la météo et la saison.</p>
      <div class="rail" id="now">${[0,1,2].map(() => `<div class="now-card sk"></div>`).join("")}</div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Par territoire</h2></div>
      <div class="rail">${Object.entries(D.zones).map(([k, z]) => `<button class="zone-card ${state.zone === k ? "on" : ""}" data-zone="${k}" aria-pressed="${state.zone === k}">${pic(z.img, "150px")}<span>${esc(z.label)}<small>${D.spots.filter(s => s.zone === k).length} lieux</small></span></button>`).join("")}</div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Envies</h2>${state.zone !== "all" || state.cat !== "all" ? `<button class="link" id="reset">Tout afficher</button>` : ""}</div>
      <div class="cats" id="cats">
        <button class="cat all ${state.cat === "all" ? "on" : ""}" data-cat="all" style="--k:var(--canopee)"><span class="galet">${ic("explore")}</span>Tout</button>
        ${Object.entries(D.categories).map(([k, c]) => `<button class="cat ${state.cat === k ? "on" : ""}" data-cat="${k}" style="--k:${CATC[k]}" aria-pressed="${state.cat === k}"><span class="galet">${ic(k)}</span>${esc(c.label.split(" & ")[0])}</button>`).join("")}
      </div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2 id="list-t">Les lieux</h2><button class="link" id="favs">${state.cat === "fav" ? "Tous les lieux" : "Mes favoris"}</button></div>
      <div class="places" id="spots"></div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Sur le terrain</h2></div>
      <div class="tools">
        <button class="tool red" id="t-red">${ic("torch")}<b>Lumière rouge</b><span>Pour observer les tortues sans les déranger.</span></button>
        <button class="tool sos" id="t-sos">${ic("sos")}<b>Urgences</b><span>Numéros et message « je pars en sortie ».</span></button>
        <button class="tool wide" id="t-off">${ic("download")}<span><b>Emporter hors-ligne</b><br><span id="off-txt">Toutes les fiches et illustrations, pour la forêt et le fleuve.</span></span>${ic("next")}<div class="bar" hidden><i></i></div></button>
        <button class="tool wide" id="t-part">${ic("culture")}<span><b>Vous êtes prestataire ?</b><br><span>Guides, carbets, restaurants : rejoignez Karbé.</span></span>${ic("next")}</button>
      </div>
    </section>

    <p class="footer">Karbé ${esc(D.version)}. Contenus vérifiés sur sources publiques, à confirmer sur place.<br>
      Illustrations originales créées pour Karbé. Météo et mer <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, lancements <a href="https://thespacedevs.com" target="_blank" rel="noopener">The Space Devs</a>, carte <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> et © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.</p>
  </div>`;

  const renderList = () => {
    const L = filtered();
    const t = state.cat === "fav" ? "Mes favoris" : state.zone !== "all" ? D.zones[state.zone].label : state.cat !== "all" ? D.categories[state.cat].label : "Les lieux";
    $("#list-t").textContent = `${t} (${L.length})`;
    $("#spots").innerHTML = L.length ? L.map(placeRow).join("") : `<div class="empty">${state.cat === "fav" ? "Touchez le cœur d'un lieu pour le retrouver ici." : "Aucun lieu ne correspond. Essayez un autre mot ou une autre envie."}</div>`;
  };
  renderList();
  $("#q").addEventListener("input", e => { state.q = e.target.value; renderList(); });
  $("#near").onclick = async () => { buzz(); try { await locate(); $("#near").classList.add("on"); renderList(); toast("Lieux triés par distance", "locate"); } catch { toast("Position indisponible. Autorisez la localisation.", "info"); } };
  view.addEventListener("click", e => {
    const z = e.target.closest("[data-zone]"); if (z) { buzz(); state.zone = state.zone === z.dataset.zone ? "all" : z.dataset.zone; rerender("#spots"); return; }
    const c = e.target.closest("[data-cat]"); if (c) { buzz(); state.cat = c.dataset.cat; rerender("#spots"); return; }
  });
  $("#favs").onclick = () => { state.cat = state.cat === "fav" ? "all" : "fav"; rerender("#spots"); };
  $("#reset") && ($("#reset").onclick = () => { state.cat = "all"; state.zone = "all"; rerender("#spots"); });
  $("#t-red").onclick = openRedLight;
  $("#t-sos").onclick = openSafety;
  $("#t-part").onclick = openPartner;
  $("#t-off").onclick = offlinePack;
  offlineStatus();

  Promise.allSettled([getWeather(), getLaunches()]).then(([w, l]) => {
    const wx = w.status === "fulfilled" ? w.value : null, la = l.status === "fulfilled" ? l.value : null;
    const live = $("#live");
    if (wx && live) { const c = wx.byId.cayenne.current; live.innerHTML = `${WMO(c.weather_code)[0]} ${Math.round(c.temperature_2m)}° Cayenne`; live.hidden = false; }
    const S = suggestions(wx, la), now = $("#now"); if (!now) return;
    if (!wx) $("#now-src").textContent = "Selon l'heure et la saison.";
    now.innerHTML = S.map(x => `<button class="now-card" data-spot="${x.s.id}">${pic(x.s.img, "330px")}<div class="in"><span class="why">${ic(x.icon)}${esc(x.why)}</span><h3>${esc(x.s.name)}</h3><p>${esc(D.zones[x.s.zone].label)}, ${esc(x.s.dur)}</p></div></button>`).join("");
  });
}
function rerender(anchor) {
  const y = scrollY, el = $(anchor), top = el ? el.getBoundingClientRect().top + y : y;
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
function closeSheet() { sheet.hidden = true; panel.style.transform = ""; document.body.style.overflow = ""; }
function closeSheetUI() { if (history.state?.sheet) history.back(); else closeSheet(); }
addEventListener("popstate", () => { if (!sheet.hidden) closeSheet(); });
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheetUI(); });
addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSheetUI(); });
// glisser vers le bas pour fermer
(() => { let y0 = null, dy = 0;
  panel.addEventListener("pointerdown", e => { if (sheetBody.scrollTop > 0 || e.target.closest("input,select,textarea,button,a")) return; y0 = e.clientY; dy = 0; panel.style.transition = "none"; });
  addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
  addEventListener("pointerup", () => { if (y0 == null) return; panel.style.transition = ""; if (dy > 120) closeSheetUI(); else panel.style.transform = ""; y0 = null; });
})();

function openSpot(id) {
  const s = spotById[id]; if (!s) return; buzz();
  const near = D.weatherPoints.slice().sort((a, b) => distKm(a, s) - distKm(b, s))[0];
  const its = D.itineraries.filter(i => i.steps.some(st => st.spot === id));
  const d = state.userPos ? distKm(state.userPos, s) : null;
  openSheet(`
    <div class="sheet-hero">${pic(s.img, "720px", { eager: true, cap: true })}
      <button class="sheet-x" aria-label="Fermer">${ic("close")}</button>
      <div class="wrap"><div class="cats-line">${s.cat.map(k => `<span class="tag" style="background:${CATC[k]};color:#fff">${ic(k)}${esc(D.categories[k].label)}</span>`).join("")}</div>
      <h1 style="font-size:34px">${esc(s.name)}</h1></div></div>
    <div class="wrap">
      <p class="lead">${esc(s.desc)}</p>
      <div class="btns" style="margin-top:18px">
        <a class="btn" href="${navUrl(s)}" target="_blank" rel="noopener">${ic("go")}Y aller</a>
        <a class="btn ghost" href="${wazeUrl(s)}" target="_blank" rel="noopener">Waze</a>
        <button class="btn ghost sq ${favs.has(id) ? "on" : ""}" id="favbtn" aria-label="Favori" aria-pressed="${favs.has(id)}" style="${favs.has(id) ? "color:var(--ibis)" : ""}">${ic("heart")}</button>
        <button class="btn ghost sq" id="sharebtn" aria-label="Partager">${ic("share")}</button>
      </div>
      <div class="facts">
        <div class="fact"><small>Zone</small><b>${esc(D.zones[s.zone].label)}</b></div>
        <div class="fact"><small>Durée</small><b>${esc(s.dur)}</b></div>
        <div class="fact"><small>Accès</small><b>${s.access.map(a => ACCESS[a][1]).join(", ")}</b></div>
        <div class="fact"><small>${d != null ? "Distance" : "Prix"}</small><b>${d != null ? fmtKm(d) + " à vol d'oiseau" : s.free ? "Gratuit" : "Payant ou à vérifier"}</b></div>
        ${s.when ? `<div class="fact wide"><small>Quand</small><b>${esc(s.when)}</b></div>` : ""}
        ${s.season ? `<div class="fact wide"><small>Saison</small><b>${esc(s.season)}</b></div>` : ""}
      </div>
      <div class="wxline" id="spotwx"><span class="big">…</span><p>Météo à ${esc(near.label)}</p></div>
      <h2 class="h3m">Conseils terrain</h2>
      <ul class="tips">${s.tips.map(t => `<li>${ic("check")}<span>${esc(t)}</span></li>`).join("")}</ul>
      ${its.length ? `<h2 class="h3m">Dans un itinéraire</h2><div class="btns" style="margin-top:12px">${its.map(i => `<button class="chip" data-it="${i.id}">${ic("route")}${esc(i.title)}</button>`).join("")}</div>` : ""}
      <p class="note">${s.prec === "zone" ? "Sur la carte, la position est approximative. " : ""}Horaires, tarifs et accès à confirmer avant de partir. L'image est une illustration d'ambiance.</p>
    </div>`);
  $("#favbtn").onclick = e => { toggleFav(id); const on = favs.has(id); e.currentTarget.style.color = on ? "var(--ibis)" : ""; e.currentTarget.setAttribute("aria-pressed", on); toast(on ? "Ajouté aux favoris" : "Retiré des favoris", "heart"); syncFavs(); };
  $("#sharebtn").onclick = () => share(s.name, `${s.name} (${D.zones[s.zone].label}) : ${s.desc}`);
  $$("[data-it]", sheet).forEach(b => b.onclick = () => openItinerary(b.dataset.it));
  getWeather().then(w => { const x = w.byId[near.id], el = $("#spotwx"); if (!x || !el) return; const [e, l] = WMO(x.current.weather_code);
    el.innerHTML = `<span class="big">${e} ${Math.round(x.current.temperature_2m)}°</span><p>${l} à ${esc(near.label)}<br>Risque de pluie aujourd'hui : ${x.daily.precipitation_probability_max[0] ?? "?"} %${w.stale ? ` (données ${ago(w.t)})` : ""}</p>`; })
    .catch(() => { const el = $("#spotwx"); if (el) el.innerHTML = `${ic("offline")}<p>Météo indisponible sans réseau.</p>`; });
}
function syncFavs() { $$(`#view [data-fav]`).forEach(b => { const on = favs.has(b.dataset.fav); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); }
async function share(title, text) {
  const url = location.origin + "/";
  try { if (navigator.share) { await navigator.share({ title, text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Lien copié", "copy"); } catch { toast(url, "info"); }
}

/* ---------- vue : Carte (MapLibre + OpenFreeMap, chargés à la demande) ---------- */
let map;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, ko) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"; js.onload = ok; js.onerror = ko; document.head.appendChild(js);
  });
}
async function vCarte() {
  view.innerHTML = `<div class="map-wrap"><div id="map" aria-label="Carte des lieux"></div>
    <div class="map-top"><div class="chips" id="mcats"><button class="chip ${state.cat === "all" || state.cat === "fav" ? "on" : ""}" data-cat="all">${ic("explore")}Tout</button>
      ${Object.entries(D.categories).map(([k, c]) => `<button class="chip ${state.cat === k ? "on" : ""}" data-cat="${k}" style="--k:${CATC[k]}">${ic(k)}${esc(c.label.split(" & ")[0])}</button>`).join("")}</div></div>
    <button class="iconbtn map-loc" id="mloc" aria-label="Me localiser">${ic("locate")}</button>
    <div class="map-msg" id="mmsg">Chargement de la carte…</div></div>`;
  try { await loadMapLib(); } catch { $("#mmsg") && ($("#mmsg").textContent = "Carte indisponible sans réseau à la première ouverture. Ouvrez-la une fois connecté pour la garder."); return; }
  if (!$("#map")) return;
  map = new maplibregl.Map({ container: "map", style: "https://tiles.openfreemap.org/styles/liberty", bounds: [[-54.6, 2.1], [-51.6, 5.9]], fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
  map.touchZoomRotate.disableRotation();
  map.on("load", () => { const m = $("#mmsg"); m && m.remove(); });
  map.on("error", () => { const m = $("#mmsg"); if (m) m.textContent = "Certaines zones de la carte ne sont pas disponibles hors-ligne."; });
  let markers = [];
  const draw = () => {
    markers.forEach(x => x.remove()); markers = [];
    D.spots.filter(s => state.cat === "all" || state.cat === "fav" || s.cat.includes(state.cat)).forEach(s => {
      const el = document.createElement("button"); el.className = "mk"; el.style.setProperty("--k", CATC[s.cat[0]]); el.innerHTML = ic(s.cat[0]); el.setAttribute("aria-label", s.name);
      el.addEventListener("click", e => { e.stopPropagation(); openSpot(s.id); });
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map));
    });
  };
  draw();
  $("#mcats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; buzz(); state.cat = b.dataset.cat; $$("#mcats .chip").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  let me;
  $("#mloc").onclick = async () => { try { const p = await locate(); if (!me) { const el = document.createElement("div"); el.className = "me"; me = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map); } else me.setLngLat([p.lon, p.lat]); map.flyTo({ center: [p.lon, p.lat], zoom: 11 }); } catch { toast("Position indisponible", "info"); } };
}

/* ---------- vue : Itinéraires ---------- */
function vItineraires() {
  view.innerHTML = `<div class="banner">${pic("route", "100vw", { eager: true })}<div class="wrap"><h1>Itinéraires</h1><p>${D.itineraries.length} circuits pensés pour le terrain, de la journée en ville à la forêt profonde.</p></div></div>
  <div class="wrap" style="margin-top:20px"><div class="it-list">${D.itineraries.map(i => `<button class="it-card" data-it="${i.id}">${pic(i.img, "(min-width:720px) 684px, 100vw")}
    <span class="days">${i.days} jour${i.days > 1 ? "s" : ""}</span>
    <div class="in"><h2>${esc(i.title)}</h2><p>${esc(i.pitch)}</p><div class="meta"><span>${esc(D.zones[i.zone].label)}</span><span>Niveau ${esc(i.level)}</span>${i.startDay ? `<span>Départ un ${esc(i.startDay)}</span>` : ""}</div></div></button>`).join("")}</div>
  <p class="note">Les horaires sont indicatifs. En forêt et sur le fleuve, partez tôt : la chaleur et les averses arrivent l'après-midi.</p></div>`;
  view.addEventListener("click", e => { const b = e.target.closest("[data-it]"); if (b) openItinerary(b.dataset.it); });
}
function openItinerary(id) {
  const it = D.itineraries.find(i => i.id === id); if (!it) return; buzz();
  const uniq = [...new Map(it.steps.map(st => [st.spot, spotById[st.spot]])).values()];
  const dirUrl = uniq.length > 1 ? "https://www.google.com/maps/dir/" + uniq.map(p => encodeURIComponent(p.nav + ", Guyane")).join("/") : navUrl(uniq[0]);
  openSheet(`<div class="sheet-hero">${pic(it.img, "720px", { eager: true, cap: true })}<button class="sheet-x" aria-label="Fermer">${ic("close")}</button>
      <div class="wrap"><div class="cats-line"><span class="tag" style="background:var(--awara);color:var(--encre)">${it.days} jour${it.days > 1 ? "s" : ""}</span><span class="tag" style="background:#ffffff2b;color:#fff">Niveau ${esc(it.level)}</span></div><h1 style="font-size:32px">${esc(it.title)}</h1></div></div>
    <div class="wrap"><p class="lead">${esc(it.pitch)}</p>
      <div class="facts"><div class="fact"><small>Accès</small><b>${esc(it.access)}</b></div><div class="fact"><small>Départ</small><b>${it.startDay ? "Un " + esc(it.startDay) : "Quand vous voulez"}</b></div></div>
      <ol class="timeline">${it.steps.map(st => { const s = spotById[st.spot]; return `<li><span class="dot" style="--k:${CATC[s.cat[0]]}">${ic(s.cat[0])}</span><div><small>${esc(st.t)}</small><button data-spot="${s.id}">${esc(s.name)}</button><p>${esc(st.note)}</p></div></li>`; }).join("")}</ol>
      <div class="btns"><a class="btn" href="${dirUrl}" target="_blank" rel="noopener">${ic("go")}Ouvrir le trajet</a><button class="btn ghost" id="itshare">${ic("share")}Partager</button></div></div>`);
  $$(".timeline [data-spot]", sheet).forEach(b => b.onclick = () => openSpot(b.dataset.spot));
  $("#itshare").onclick = () => share(it.title, `${it.title} : ${uniq.map(s => s.name).join(", ")}`);
}

/* ---------- vue : Météo ---------- */
function tideSVG(sw) {
  const P = sw.pts, W = 340, H = 100, t0 = P[0].T, t1 = P[P.length - 1].T;
  const lo = Math.min(...P.map(p => p.L)), hi = Math.max(...P.map(p => p.L)), x = T => (T - t0) / (t1 - t0) * W, y = L => H - 12 - (L - lo) / ((hi - lo) || 1) * (H - 30);
  const d = P.map((p, i) => `${i ? "L" : "M"}${x(p.T).toFixed(1)} ${y(p.L).toFixed(1)}`).join("");
  const nx = x(Date.now());
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Courbe de marée sur 30 heures">
    <path d="${d}L${W} ${H}L0 ${H}Z" fill="#2A767222"/><path d="${d}" fill="none" stroke="#2A7672" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="${nx}" x2="${nx}" y1="0" y2="${H}" stroke="#F2A33A" stroke-width="2" stroke-dasharray="4 4"/>
    ${sw.ev.map(e => `<circle cx="${x(e.T)}" cy="${y(e.L)}" r="4" fill="${e.type === "Pleine mer" ? "#0F3D2E" : "#fff"}" stroke="#0F3D2E" stroke-width="2"/>`).join("")}</svg>`;
}
async function vMeteo() {
  const P = D.weatherPoints;
  view.innerHTML = `<div class="wrap"><div class="page-h"><h1>Météo et mer</h1><p id="wxt">Prévisions locales, pluie heure par heure et marées.</p></div>
    <div class="chips" id="wxsel" style="margin-top:12px">${P.map(p => `<button class="chip ${p.id === state.wxPoint ? "on" : ""}" data-p="${p.id}">${esc(p.label)}</button>`).join("")}</div>
    <div id="wxmain" style="margin-top:12px"><div class="sk" style="height:320px;border-radius:28px"></div></div>
    <section class="sec"><div class="sec-h"><h2>Partout en Guyane</h2></div><div class="grid-wx" id="wxall"></div></section>
    <p class="note">Marées déduites du modèle Open-Meteo : indicatives, elles ne remplacent pas un annuaire officiel pour naviguer.</p></div>`;
  const pick = e => { const b = e.target.closest("[data-p]"); if (!b) return; buzz(); state.wxPoint = b.dataset.p; store.set("wxPoint", state.wxPoint); vMeteoRender(); };
  $("#wxsel").addEventListener("click", pick); $("#wxall").addEventListener("click", pick);
  vMeteoRender();
}
async function vMeteoRender() {
  $$("#wxsel .chip").forEach(c => c.classList.toggle("on", c.dataset.p === state.wxPoint));
  let w, m;
  try { w = await getWeather(); } catch { $("#wxmain") && ($("#wxmain").innerHTML = `<div class="empty">${ic("offline", "ic-l")}<p>Météo indisponible : pas de réseau et aucune donnée enregistrée. Ouvrez cet onglet une fois connecté.</p></div>`); return; }
  try { m = await getMarine(); } catch { m = null; }
  if (!$("#wxmain")) return;
  $("#wxt").textContent = (w.stale ? "Hors-ligne, données " : "Mis à jour ") + ago(w.t) + ".";
  const P = D.weatherPoints, p = P.find(x => x.id === state.wxPoint) || P[0], d = w.byId[p.id];
  const [e, lab] = WMO(d.current.weather_code), rows = nextRain(d) || [];
  const sw = m && p.marine ? seaWindow(m.byId[p.id]) : null;
  const firstRain = rows.find(r => (r.p ?? 0) >= 50);
  $("#wxmain").innerHTML = `<div class="wx-hero">
      <div class="row"><div><div class="temp">${Math.round(d.current.temperature_2m)}°</div><div class="cond">${lab} à ${esc(p.label)}</div></div><div class="wx-emoji" aria-hidden="true">${e}</div></div>
      <div class="meta"><span>${ic("sun")}Ressenti ${Math.round(d.current.apparent_temperature)}°</span><span>${ic("drop")}${d.current.relative_humidity_2m} %</span><span>${ic("wind")}${Math.round(d.current.wind_speed_10m)} km/h</span><span>${ic("moon")}Coucher ${hm(local(d.daily.sunset[0]))}</span></div>
      ${rows.length ? `<div class="rain-bars" aria-label="Risque de pluie heure par heure">${rows.map(r => `<div><i style="height:${Math.max(4, r.p ?? 0)}%"></i>${hm(r.T).slice(0, 2)}h</div>`).join("")}</div>
      <p class="rain-cap">${firstRain ? `Averse probable vers ${hm(firstRain.T)} (${firstRain.p} %).` : "Pas d'averse probable dans les 12 prochaines heures."}</p>` : ""}
    </div>
    <div class="days5">${d.daily.time.map((t, i) => `<div><b>${i ? dayShort(t) : "Auj."}</b><div class="e">${WMO(d.daily.weather_code[i])[0]}</div>${Math.round(d.daily.temperature_2m_max[i])}° ${Math.round(d.daily.temperature_2m_min[i])}°<div class="r">${d.daily.precipitation_probability_max[i] ?? "?"} %</div></div>`).join("")}</div>
    ${sw ? `<div class="tide"><div class="sec-h" style="margin:0"><h3>${ic("tide", "ic-s")} Marée et houle</h3><p>${sw.wave != null ? "Houle " + sw.wave.toFixed(1).replace(".", ",") + " m" : ""}</p></div>${tideSVG(sw)}
      <div class="ev">${sw.ev.slice(0, 4).map(x => `<span>${x.type} ${hm(x.T)}</span>`).join("")}</div></div>` : p.marine ? "" : `<p class="note">Pas de données de mer pour ce point, situé dans les terres.</p>`}`;
  $("#wxall").innerHTML = P.map(x => { const dd = w.byId[x.id]; if (!dd) return ""; return `<button class="mini-wx" data-p="${x.id}"><b>${esc(x.label)}</b><span>${WMO(dd.current.weather_code)[0]} ${Math.round(dd.current.temperature_2m)}°</span></button>`; }).join("");
}

/* ---------- vue : Agenda ---------- */
let cdTimer;
function countdown(t) { const s = Math.max(0, (t - Date.now()) / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return s <= 0 ? "En cours ou passé" : d ? `Dans ${d} j ${h} h` : `Dans ${h} h ${String(m).padStart(2, "0")} min`; }
async function vAgenda() {
  const { m } = nowG();
  const bar = (months, k) => `<div class="months" style="--k:${k}">${MONTHS.map((x, i) => `<span class="${months.includes(i+1) ? "in" : ""} ${i+1 === m ? "cur" : ""}">${x[0].toUpperCase()}</span>`).join("")}</div>`;
  view.innerHTML = `<div class="banner">${pic("lancement", "100vw", { eager: true })}<div class="wrap"><h1>Agenda</h1><p>Lancements, saisons de la faune et fêtes.</p></div></div>
  <div class="wrap">
    <section class="sec"><div class="sec-h"><h2>Décollages à Kourou</h2><p id="lt"></p></div><div class="launches" id="launches"><div class="sk" style="height:96px"></div></div>
      <p class="note">Les dates bougent souvent jusqu'au dernier moment. Les jours de tir, certaines zones de Kourou et les Îles du Salut sont fermées.</p></section>
    <section class="sec"><div class="sec-h"><h2>Nature et fêtes</h2></div><div class="seasons">${D.seasons.map(s => `<button class="season" ${s.spot ? `data-spot="${s.spot}"` : ""}><b>${esc(s.label)}</b>${bar(s.months, s.cat === "faune" ? "var(--c-faune)" : "var(--c-culture)")}</button>`).join("")}</div></section>
    <section class="sec"><div class="sec-h"><h2>Climat</h2></div><div class="seasons">${D.climate.map(c => `<div class="season"><b>${c.tone === "sec" ? "☀️" : "🌧️"} ${esc(c.label)}</b><p class="note" style="margin-top:4px">${esc(c.note)}</p>${bar(c.months, c.tone === "sec" ? "var(--awara-2)" : "#2b6f9f")}</div>`).join("")}</div></section>
  </div>`;
  view.addEventListener("click", e => { const b = e.target.closest("[data-spot]"); if (b && !e.target.closest(".place")) openSpot(b.dataset.spot); });
  try {
    const r = await getLaunches(); const el = $("#launches"); if (!el) return;
    $("#lt").textContent = (r.stale ? "hors-ligne, " : "") + ago(r.t);
    el.innerHTML = r.list.length ? r.list.map(l => { const d = new Date(l.net), go = /^go$/i.test(l.status?.abbrev || "");
      return `<div class="launch"><div class="d"><b>${new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric" }).format(d)}</b><small>${new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, month: "short" }).format(d)}</small></div>
        <div><b>${esc(l.name)}</b><div class="cd" data-t="${d.getTime()}">${countdown(d.getTime())}</div><div class="st">${hm(d)} heure de Guyane, ${go ? "date confirmée" : "date à confirmer"}</div></div></div>`; }).join("")
      : `<div class="empty">Aucun lancement annoncé pour l'instant.</div>`;
    clearInterval(cdTimer); cdTimer = setInterval(() => { const c = $$(".cd[data-t]"); if (!c.length) return clearInterval(cdTimer); c.forEach(x => x.textContent = countdown(+x.dataset.t)); }, 30000);
  } catch { const el = $("#launches"); if (el) el.innerHTML = `<div class="empty">Lancements indisponibles sans réseau.</div>`; }
}

/* ---------- Lumière rouge (observation des tortues) ---------- */
let wakeLock;
async function openRedLight() {
  const r = $("#redlight");
  r.innerHTML = `${ic("torch", "ic-l")}<h2>Lumière rouge</h2><p>Baissez la luminosité au minimum. Gardez l'écran tourné vers le sol, jamais vers la tortue, et restez derrière elle.</p><button class="btn" id="red-x">Quitter</button>`;
  r.hidden = false; buzz();
  try { await r.requestFullscreen?.(); } catch {}
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  $("#red-x").onclick = async () => { r.hidden = true; try { await wakeLock?.release(); } catch {} try { document.fullscreenElement && await document.exitFullscreen(); } catch {} };
}

/* ---------- Sécurité ---------- */
function openSafety() {
  const last = store.get("trip", {});
  openSheet(`<button class="sheet-x" aria-label="Fermer" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">Urgences</h1>
    <div class="nums">${D.safety.numbers.map(x => `<a href="tel:${x.n}"><b>${x.n}</b><span>${esc(x.l)}</span></a>`).join("")}</div>
    <h2 class="h3m">Les règles qui sauvent</h2>
    <ul class="tips">${D.safety.rules.map(r => `<li>${ic("info")}<span>${esc(r)}</span></li>`).join("")}</ul>
    <h2 class="h3m">Je pars en sortie</h2>
    <p class="note" style="margin-top:6px">Préparez un message pour un proche avec votre destination et l'heure de retour. Sans nouvelles, il saura quoi dire aux secours.</p>
    <form class="form" id="trip">
      <label>Votre prénom<input name="who" required autocomplete="given-name" value="${esc(last.who || "")}"></label>
      <label>Destination<select name="spot">${D.spots.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Nombre de personnes<input name="n" type="number" min="1" inputmode="numeric" value="${esc(last.n || 2)}"></label>
      <label>Retour prévu au plus tard<input name="back" type="datetime-local" required></label>
      <label>Téléphone du proche (facultatif)<input name="phone" type="tel" autocomplete="tel" value="${esc(last.phone || "")}" placeholder="0694…"></label>
      <button class="btn red" type="submit">${ic("sms")}Préparer le message</button>
    </form><div id="tripout"></div></div>`);
  $("#trip").addEventListener("submit", e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)); store.set("trip", { who: f.who, n: f.n, phone: f.phone });
    const s = spotById[f.spot], back = new Date(f.back).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
    const msg = `Je pars en sortie à ${f.n} : ${s.name} (${D.zones[s.zone].label}).\nRetour prévu au plus tard : ${back}.\nSans nouvelles 2 h après, appelle le 112 et indique : ${s.nav}, GPS environ ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}.\n${f.who}`;
    $("#tripout").innerHTML = `<div class="out">${esc(msg)}</div><div class="btns" style="margin-top:10px">
      ${f.phone ? `<a class="btn red" href="sms:${encodeURIComponent(f.phone)}?&body=${encodeURIComponent(msg)}">${ic("sms")}Envoyer par SMS</a>` : ""}
      <button class="btn ghost" id="tripcopy">${ic("copy")}Copier</button>${navigator.share ? `<button class="btn ghost" id="tripshare">${ic("share")}Partager</button>` : ""}</div>`;
    $("#tripcopy").onclick = async () => { try { await navigator.clipboard.writeText(msg); toast("Message copié", "copy"); } catch {} };
    $("#tripshare") && ($("#tripshare").onclick = async () => { try { await navigator.share({ text: msg }); } catch {} });
  });
}

/* ---------- Partenaires ---------- */
function openPartner() {
  openSheet(`<button class="sheet-x" aria-label="Fermer" style="background:var(--canopee)">${ic("close")}</button><div class="wrap sheet-plain">
    <h1 style="font-size:32px">Rejoindre Karbé</h1>
    <p class="lead">Guides agréés, carbets, restaurants, loueurs de pirogues ou de vélos, artisans : présentez votre activité aux visiteurs et aux habitants.</p>
    <form class="form" id="pform">
      <label>Nom de l'activité<input name="name" required></label>
      <label>Type<select name="type"><option>Guide ou excursion</option><option>Hébergement ou carbet</option><option>Restauration</option><option>Location</option><option>Artisanat ou boutique</option><option>Autre</option></select></label>
      <label>Commune<input name="town" required></label>
      <label>Votre offre pour les utilisateurs<textarea name="offer" rows="3"></textarea></label>
      <label>Contact (téléphone ou e-mail)<input name="contact" required></label>
      <button class="btn dark" type="submit">Préparer ma demande</button></form><div id="pout"></div></div>`);
  $("#pform").addEventListener("submit", e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const txt = `Demande partenaire Karbé\nActivité : ${f.name}\nType : ${f.type}\nCommune : ${f.town}\nOffre : ${f.offer}\nContact : ${f.contact}`;
    $("#pout").innerHTML = `<div class="out">${esc(txt)}</div><div class="btns" style="margin-top:10px">
      ${CONTACT_EMAIL ? `<a class="btn dark" href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Partenaire Karbé : " + f.name)}&body=${encodeURIComponent(txt)}">Envoyer par e-mail</a>` : ""}
      <button class="btn ghost" id="pcopy">${ic("copy")}Copier la demande</button></div>${CONTACT_EMAIL ? "" : `<p class="note">L'envoi direct arrive bientôt. En attendant, copiez votre demande.</p>`}`;
    $("#pcopy").onclick = async () => { try { await navigator.clipboard.writeText(txt); toast("Demande copiée", "copy"); } catch {} };
  });
}

/* ---------- Hors-ligne complet ---------- */
const MEDIA = "karbe-media";
function offlineUrls() {
  const keys = Object.keys(D.images), u = [];
  keys.forEach(k => { u.push(opt(k, 320), opt(k, 640)); });
  u.push(opt("hero", 1080), "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js", "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css", "https://tiles.openfreemap.org/styles/liberty");
  return [...new Set(u)];
}
async function offlineStatus() {
  const t = $("#off-txt"); if (!t || !window.caches) return;
  try { const c = await caches.open(MEDIA), have = (await c.keys()).length, need = offlineUrls().length;
    if (have >= need) t.textContent = "Prêt : tout est disponible sans réseau."; } catch {}
}
async function offlinePack() {
  const btn = $("#t-off"), bar = $(".bar", btn), fill = $(".bar i", btn), txt = $("#off-txt");
  if (!window.caches) { toast("Ce navigateur ne permet pas le hors-ligne", "info"); return; }
  if (!navigator.onLine) { toast("Connectez-vous pour télécharger", "offline"); return; }
  buzz(); bar.hidden = false;
  const c = await caches.open(MEDIA), urls = offlineUrls(); let n = 0, fail = 0;
  await Promise.all(urls.map(async u => { try { if (!(await c.match(u))) { const r = await fetch(u, { mode: u.startsWith("/") ? "same-origin" : "cors" }); if (!r.ok) throw 0; await c.put(u, r); } } catch { fail++; } n++; fill.style.width = (n / urls.length * 100) + "%"; txt.textContent = `Téléchargement… ${n} / ${urls.length}`; }));
  getWeather().catch(() => {}); getMarine().catch(() => {}); getLaunches().catch(() => {});
  txt.textContent = fail ? `${urls.length - fail} éléments enregistrés, ${fail} à réessayer.` : "Prêt : tout est disponible sans réseau.";
  toast(fail ? "Téléchargement partiel" : "Karbé est prêt pour le hors-ligne", fail ? "info" : "check");
  setTimeout(() => bar.hidden = true, 1200);
}

/* ---------- routeur ---------- */
const routes = { explorer: vExplorer, carte: vCarte, itineraires: vItineraires, meteo: vMeteo, agenda: vAgenda };
function route() {
  const r = routes[location.hash.slice(1)] ? location.hash.slice(1) : "explorer";
  const run = () => {
    if (!sheet.hidden) closeSheet();
    if (map) { map.remove(); map = null; }
    clearInterval(cdTimer);
    const fresh = view.cloneNode(false); view.replaceWith(fresh); view = fresh;
    $$(".tabs a").forEach(a => { const on = a.dataset.tab === r; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    document.title = r === "explorer" ? "Karbé, la Guyane à portée de main" : `${$(`.tabs a[data-tab=${r}] span:last-child`).textContent}, Karbé`;
    routes[r](); scrollTo(0, 0);
  };
  if (document.startViewTransition && !RM && view.childElementCount) document.startViewTransition(run); else run();
}
document.addEventListener("click", e => {
  const f = e.target.closest("[data-fav]");
  if (f) { e.stopPropagation(); toggleFav(f.dataset.fav); syncFavs(); toast(favs.has(f.dataset.fav) ? "Ajouté aux favoris" : "Retiré des favoris", "heart"); if (state.cat === "fav") rerender("#spots"); return; }
  const c = e.target.closest(".place[data-spot], .now-card[data-spot]");
  if (c && !sheet.contains(c)) openSpot(c.dataset.spot);
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".place[data-spot]")) { e.preventDefault(); openSpot(e.target.dataset.spot); } });
addEventListener("hashchange", route);
$$(".tabs a").forEach(a => a.addEventListener("click", buzz));

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
route();
})();
