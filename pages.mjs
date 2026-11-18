// Karbé — pages statiques indexables : une page par lieu et par itinéraire, en 4 langues,
// + index des lieux, image de partage 1200×630, données structurées, plan du site.
// Ces pages sont des portes d'entrée (Google, partages) ; l'app reste l'expérience complète.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SITE = "https://karbe-guyane.vercel.app";
const LANGS = ["fr", "en", "pt", "es"];
const HTML_LANG = { fr: "fr", en: "en", pt: "pt-BR", es: "es" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pre = lg => (lg === "fr" ? "" : `/${lg}`);
const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2)); };
const LVL = { f: "Facile", m: "Modéré", s: "Sportif" };
const SWIM = { o: "Site de baignade", p: "Avec prudence, demandez sur place", n: "Non" };
const ACCESS = { voiture: "Voiture", "4x4": "4x4", bateau: "Bateau", avion: "Avion", pied: "À pied" };
// Libellés propres aux pages (le reste vient des traductions de l'app)
const P = {
  "Ouvrir dans Karbé": { en: "Open in Karbé", pt: "Abrir no Karbé", es: "Abrir en Karbé" },
  "Tous les lieux": { en: "All places", pt: "Todos os lugares", es: "Todos los lugares" },
  "Lieux à visiter en Guyane": { en: "Places to visit in French Guiana", pt: "Lugares para visitar na Guiana Francesa", es: "Lugares para visitar en la Guayana Francesa" },
  "{n} lieux vérifiés sur sources publiques, avec conseils terrain, météo et état en direct dans l'app.": {
    en: "{n} places checked against public sources, with field tips, weather and live status in the app.",
    pt: "{n} lugares verificados em fontes públicas, com dicas de campo, clima e situação ao vivo no app.",
    es: "{n} lugares verificados en fuentes públicas, con consejos de terreno, clima y estado en directo en la app." },
  "À proximité": { en: "Nearby", pt: "Por perto", es: "Cerca" },
  "Itinéraires": { en: "Routes", pt: "Roteiros", es: "Itinerarios" },
  "Étapes": { en: "Stops", pt: "Paradas", es: "Etapas" },
  "Dans l'app : état du lieu signalé par les visiteurs, météo du jour, carte hors-ligne et passeport.": {
    en: "In the app: live status reported by visitors, today's weather, offline map and passport.",
    pt: "No app: situação relatada pelos visitantes, clima do dia, mapa offline e passaporte.",
    es: "En la app: estado del lugar informado por visitantes, clima del día, mapa sin conexión y pasaporte." },
  "{d} jour": { en: "{d} day", pt: "{d} dia", es: "{d} día" }, "{d} jours": { en: "{d} days", pt: "{d} dias", es: "{d} días" },
  "à {d}": { en: "{d} away", pt: "a {d}", es: "a {d}" },
  "Accueil": { en: "Home", pt: "Início", es: "Inicio" },
  "Contenus vérifiés sur sources publiques, à confirmer sur place.": { en: "Content checked against public sources; confirm on site.", pt: "Conteúdo verificado em fontes públicas; confirme no local.", es: "Contenido verificado en fuentes públicas; confírmalo en el lugar." },
  "Langue": { en: "Language", pt: "Idioma", es: "Idioma" },
  "La Guyane à portée de main": { en: "French Guiana at your fingertips", pt: "A Guiana Francesa na palma da mão", es: "La Guayana Francesa en tu mano" },
};

export async function buildPages({ D, OUT, root = "." }) {
  const TR = { fr: null };
  for (const lg of LANGS.slice(1)) TR[lg] = JSON.parse(await fs.readFile(path.join(root, "i18n", `${lg}.json`), "utf8"));
  const t = (lg, s, v = {}) => { let r = lg === "fr" ? s : (P[s]?.[lg] || TR[lg].ui?.[s] || s); for (const [k, x] of Object.entries(v)) r = r.replaceAll(`{${k}}`, x); return r; };
  const L = (lg, s) => (lg === "fr" ? s : { ...s, ...(TR[lg].spots?.[s.id] || {}) });
  const LI = (lg, i) => { if (lg === "fr") return i; const x = TR[lg].its?.[i.id] || {};
    return { ...i, ...x, steps: i.steps.map((st, k) => ({ ...st, t: x.times?.[k] ?? st.t, note: x.notes?.[k] ?? st.note })) }; };
  const zoneL = (lg, z) => (lg === "fr" ? D.zones[z].label : TR[lg].zones?.[z] || D.zones[z].label);
  const catL = (lg, c) => (lg === "fr" ? D.categories[c].label : TR[lg].cats?.[c] || D.categories[c].label);
  const spotUrl = (lg, id) => `${pre(lg)}/lieu/${id}/`, itUrl = (lg, id) => `${pre(lg)}/itineraire/${id}/`, hubUrl = lg => `${pre(lg)}/lieux/`;
  const appUrl = (lg, h) => `/${lg === "fr" ? "" : `?lang=${lg}`}#${h}`;
  const img = (k, w) => `/_vercel/image?url=${encodeURIComponent("/img/src/" + D.images[k].f)}&w=${w}&q=70`;
  const picture = (k, alt, eager) => { const I = D.images[k];
    return `<div class="ph" style="background:${I.c} url(${I.lqip}) center/cover"><img src="${img(k, 1080)}" srcset="${img(k, 640)} 640w, ${img(k, 1080)} 1080w" sizes="(min-width:760px) 720px, 100vw" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='/img/src/${I.f}'"></div>`; };
  const credit = (lg, k) => { const c = D.images[k].cr;
    if (!c) return `<p class="cr">${esc(t(lg, "Illustration originale : ce lieu n'a pas de photo libre exploitable."))}</p>`;
    return `<p class="cr">${esc(t(lg, "Aquarelle d'après une photo de {a}", { a: t(lg, c.a) }))}, <a href="${c.u}" rel="noopener">Wikimedia Commons</a>, ${esc(c.l)}${/SA/.test(c.l) ? ` (${esc(t(lg, "aquarelle sous la même licence"))})` : ""}.${c.n ? ` ${esc(t(lg, "Note"))}${lg === "fr" ? " :" : ":"} ${esc(t(lg, c.n))}.` : ""}</p>`; };

  // Images de partage 1200×630
  await fs.mkdir(path.join(OUT, "og"), { recursive: true });
  const ogKeys = new Set([...D.spots.map(s => s.img), ...D.itineraries.map(i => i.img), "hero"]);
  await Promise.all([...ogKeys].map(k => sharp(path.join(root, "img/src", D.images[k].f)).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(OUT, "og", `${k}.jpg`))));

  const alts = fn => LANGS.map(l => `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE}${fn(l)}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${SITE}${fn("fr")}">`;
  const page = ({ lg, title, desc, url, og, alt, ld, body }) => `<!DOCTYPE html>
<html lang="${HTML_LANG[lg]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${url}">${alts(alt)}
<meta name="theme-color" content="#0F3D2E"><link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website"><meta property="og:site_name" content="Karbé"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${url}"><meta property="og:image" content="${SITE}/og/${og}.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="${HTML_LANG[lg].replace("-", "_")}"><meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,700..800&display=swap">
<link rel="stylesheet" href="/page.css"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script></head>
<body><header class="top"><a class="logo" href="${appUrl(lg, "explorer")}">Karbé</a><nav><a href="${hubUrl(lg)}">${esc(t(lg, "Tous les lieux"))}</a>
<details class="lg"><summary aria-label="${esc(t(lg, "Langue"))}">${lg.toUpperCase()}</summary><div>${LANGS.map(l => `<a href="${alt(l)}" hreflang="${HTML_LANG[l]}" ${l === lg ? 'aria-current="page"' : ""}>${l.toUpperCase()}</a>`).join("")}</div></details></nav></header>
<main>${body}</main>
<footer class="foot"><p>Karbé — ${esc(t(lg, "La Guyane à portée de main"))}. ${esc(t(lg, "Contenus vérifiés sur sources publiques, à confirmer sur place."))} <a href="/opendata/lieux.json">Open data</a> · Licence Ouverte 2.0</p></footer></body></html>`;
  const crumbs = (lg, items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: SITE + u })) });
  const write = async (u, html) => { const f = path.join(OUT, u, "index.html"); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, html); };
  const urls = [];

  for (const lg of LANGS) {
    // --- lieux
    for (const s0 of D.spots) {
      const s = L(lg, s0), [lv, kids, swim] = (D.meta[s0.id] || "f y n").split(" ");
      const near = D.spots.filter(x => x.id !== s0.id).map(x => [x, km(s0, x)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
      const its = D.itineraries.filter(i => i.steps.some(st => st.spot === s0.id));
      const desc = s.desc.length > 155 ? s.desc.slice(0, 152).replace(/\s+\S*$/, "") + "…" : s.desc;
      const facts = [[t(lg, "Zone"), zoneL(lg, s0.zone)], [t(lg, "Durée"), s.dur], [t(lg, "Niveau"), t(lg, LVL[lv])], [t(lg, "Enfants"), kids === "y" ? t(lg, "Adapté") : t(lg, "Peu adapté")],
        [t(lg, "Accès"), s0.access.map(a => t(lg, ACCESS[a])).join(", ")], [t(lg, "Prix"), s0.free ? t(lg, "Gratuit") : t(lg, "Payant ou à vérifier")], [t(lg, "Baignade"), t(lg, SWIM[swim])],
        ...(s.when ? [[t(lg, "Quand"), s.when]] : []), ...(s.season ? [[t(lg, "Saison"), s.season]] : [])];
      const ld = { "@context": "https://schema.org", "@graph": [
        { "@type": "TouristAttraction", name: s.name, description: s.desc, url: SITE + spotUrl(lg, s0.id), image: `${SITE}/og/${s0.img}.jpg`, inLanguage: HTML_LANG[lg],
          isAccessibleForFree: !!s0.free, geo: { "@type": "GeoCoordinates", latitude: s0.lat, longitude: s0.lon },
          address: { "@type": "PostalAddress", addressRegion: "Guyane", addressCountry: "FR" }, touristType: s0.cat.map(c => catL(lg, c)) },
        crumbs(lg, [[t(lg, "Accueil"), appUrl(lg, "explorer")], [t(lg, "Tous les lieux"), hubUrl(lg)], [s.name, spotUrl(lg, s0.id)]]) ] };
      const body = `<article class="wrap">
<nav class="bc"><a href="${hubUrl(lg)}">${esc(t(lg, "Tous les lieux"))}</a> / <a href="${hubUrl(lg)}#${s0.zone}">${esc(zoneL(lg, s0.zone))}</a></nav>
<div class="hero">${picture(s0.img, s.name, true)}</div>
<p class="tags">${s0.cat.map(c => `<span class="tag" style="--k:var(--c-${c})">${esc(catL(lg, c))}</span>`).join("")}</p>
<h1>${esc(s.name)}</h1><p class="lead">${esc(s.desc)}</p>
<p class="cta"><a class="btn" href="${appUrl(lg, "lieu/" + s0.id)}">${esc(t(lg, "Ouvrir dans Karbé"))}</a><a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s0.nav + ", Guyane")}" rel="noopener">${esc(t(lg, "Y aller"))}</a></p>
<p class="note">${esc(t(lg, "Dans l'app : état du lieu signalé par les visiteurs, météo du jour, carte hors-ligne et passeport."))}</p>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
<h2>${esc(t(lg, "Conseils terrain"))}</h2><ul class="tips">${s.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
${its.length ? `<h2>${esc(t(lg, "Dans un itinéraire"))}</h2><ul class="links">${its.map(i => `<li><a href="${itUrl(lg, i.id)}">${esc(LI(lg, i).title)}</a></li>`).join("")}</ul>` : ""}
<h2>${esc(t(lg, "À proximité"))}</h2><ul class="near">${near.map(([x, d]) => `<li><a href="${spotUrl(lg, x.id)}">${picture(x.img, "", false)}<b>${esc(L(lg, x).name)}</b><span>${esc(t(lg, "à {d}", { d: d < 10 ? d.toFixed(1).replace(".", lg === "en" ? "." : ",") + " km" : Math.round(d) + " km" }))}</span></a></li>`).join("")}</ul>
<p class="note">${esc(t(lg, "Horaires, tarifs et accès à confirmer avant de partir."))} ${s0.prec === "zone" ? esc(t(lg, "Sur la carte, la position est approximative.")) : ""}</p>
${credit(lg, s0.img)}</article>`;
      const u = spotUrl(lg, s0.id); urls.push([u, l => spotUrl(l, s0.id)]);
      await write(u, page({ lg, title: `${s.name} — ${zoneL(lg, s0.zone)}, Guyane | Karbé`, desc, url: u, og: s0.img, alt: l => spotUrl(l, s0.id), ld, body }));
    }
    // --- itinéraires
    for (const i0 of D.itineraries) {
      const it = LI(lg, i0), u = itUrl(lg, i0.id);
      const dd = t(lg, i0.days > 1 ? "{d} jours" : "{d} jour", { d: i0.days });
      const ld = { "@context": "https://schema.org", "@graph": [
        { "@type": "TouristTrip", name: it.title, description: it.pitch, url: SITE + u, image: `${SITE}/og/${i0.img}.jpg`, inLanguage: HTML_LANG[lg],
          itinerary: { "@type": "ItemList", itemListElement: it.steps.map((st, k) => ({ "@type": "ListItem", position: k + 1, item: { "@type": "TouristAttraction", name: L(lg, D.spots.find(x => x.id === st.spot)).name, url: SITE + spotUrl(lg, st.spot) } })) } },
        crumbs(lg, [[t(lg, "Accueil"), appUrl(lg, "explorer")], [t(lg, "Itinéraires"), appUrl(lg, "itineraires")], [it.title, u]]) ] };
      const body = `<article class="wrap"><nav class="bc"><a href="${appUrl(lg, "itineraires")}">${esc(t(lg, "Itinéraires"))}</a> / ${esc(zoneL(lg, i0.zone))}</nav>
<div class="hero">${picture(i0.img, it.title, true)}</div><p class="tags"><span class="tag" style="--k:var(--canopee-3)">${esc(dd)}</span><span class="tag" style="--k:var(--fleuve)">${esc(t(lg, "Niveau {l}", { l: t(lg, i0.level) }))}</span></p>
<h1>${esc(it.title)}</h1><p class="lead">${esc(it.pitch)}</p>
<p class="cta"><a class="btn" href="${appUrl(lg, "itineraires")}">${esc(t(lg, "Ouvrir dans Karbé"))}</a></p>
<dl class="facts"><div><dt>${esc(t(lg, "Accès"))}</dt><dd>${esc(it.access)}</dd></div><div><dt>${esc(t(lg, "Zone"))}</dt><dd>${esc(zoneL(lg, i0.zone))}</dd></div></dl>
<h2>${esc(t(lg, "Étapes"))}</h2><ol class="steps">${it.steps.map(st => { const x = D.spots.find(y => y.id === st.spot);
  return `<li><small>${esc(st.t)}</small><a href="${spotUrl(lg, st.spot)}">${esc(L(lg, x).name)}</a><p>${esc(st.note)}</p></li>`; }).join("")}</ol>
<p class="note">${esc(t(lg, "Les horaires sont indicatifs. En forêt et sur le fleuve, partez tôt : la chaleur et les averses arrivent l'après-midi."))}</p>${credit(lg, i0.img)}</article>`;
      urls.push([u, l => itUrl(l, i0.id)]);
      await write(u, page({ lg, title: `${it.title} — ${dd} | Karbé`, desc: it.pitch, url: u, og: i0.img, alt: l => itUrl(l, i0.id), ld, body }));
    }
    // --- index des lieux
    const hu = hubUrl(lg);
    const body = `<div class="wrap"><h1>${esc(t(lg, "Lieux à visiter en Guyane"))}</h1><p class="lead">${esc(t(lg, "{n} lieux vérifiés sur sources publiques, avec conseils terrain, météo et état en direct dans l'app.", { n: D.spots.length }))}</p>
${Object.keys(D.zones).map(z => `<section id="${z}"><h2>${esc(zoneL(lg, z))}</h2><ul class="near grid">${D.spots.filter(s => s.zone === z).map(s => `<li><a href="${spotUrl(lg, s.id)}">${picture(s.img, "", false)}<b>${esc(L(lg, s).name)}</b><span>${esc(s.cat.map(c => catL(lg, c).split(" & ")[0]).join(" · "))}</span></a></li>`).join("")}</ul></section>`).join("")}
<h2>${esc(t(lg, "Itinéraires"))}</h2><ul class="links">${D.itineraries.map(i => `<li><a href="${itUrl(lg, i.id)}">${esc(LI(lg, i).title)}</a></li>`).join("")}</ul></div>`;
    const ld = { "@context": "https://schema.org", "@type": "ItemList", name: t(lg, "Lieux à visiter en Guyane"), itemListElement: D.spots.map((s, k) => ({ "@type": "ListItem", position: k + 1, url: SITE + spotUrl(lg, s.id) })) };
    urls.push([hu, hubUrl]);
    await write(hu, page({ lg, title: `${t(lg, "Lieux à visiter en Guyane")} | Karbé`, desc: t(lg, "{n} lieux vérifiés sur sources publiques, avec conseils terrain, météo et état en direct dans l'app.", { n: D.spots.length }), url: hu, og: "hero", alt: hubUrl, ld, body }));
  }

  // Plan du site + robots
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set(), entries = [[`/`, () => "/"], ...urls].filter(([u]) => !seen.has(u) && seen.add(u));
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries.map(([u, fn]) => `<url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod>${u === "/" ? "" : LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE}${fn(l)}"/>`).join("")}</url>`).join("\n") + "\n</urlset>\n";
  await fs.writeFile(path.join(OUT, "sitemap.xml"), sm);
  await fs.writeFile(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);
  return entries.length;
}
