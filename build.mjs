// Karbé — build Vercel : assemble le site dans public/.
// Les images sont versionnées dans le dépôt (img/src) et vérifiées par empreinte SHA-256 :
// on ne publie jamais une image absente ou altérée. MapLibre et le générateur de QR sont
// copiés depuis npm : aucune dépendance à un CDN tiers au moment de l'usage.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import sharp from "sharp";
import { buildPages } from "./pages.mjs";

const OUT = "public";
const STATIC = ["index.html", "styles.css", "app.js", "data.js", "sw.js", "manifest.webmanifest", "icon.svg", "assets.json", "stats.html", "admin.html", "affiche.html", "page.css"];
const assets = JSON.parse(await fs.readFile("assets.json", "utf8"));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "img/src"), { recursive: true });
await fs.mkdir(path.join(OUT, "vendor"), { recursive: true });
await fs.mkdir(path.join(OUT, "i18n"), { recursive: true });
await fs.mkdir(path.join(OUT, "opendata"), { recursive: true });
for (const f of STATIC) await fs.copyFile(f, path.join(OUT, f));

// Images
const all = [...assets.images, ...(assets.icon ? [assets.icon] : [])];
for (const it of all) {
  const b = await fs.readFile(it.file);
  if (sha(b) !== it.sha256) throw new Error(`Image altérée : ${it.file}`);
  await fs.writeFile(path.join(OUT, it.file), b);
}
console.log(`✓ ${all.length} images vérifiées`);
if (assets.icon) {
  const src = await fs.readFile(assets.icon.file);
  const out = (name, size) => sharp(src).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  await Promise.all([out("icon-512.png", 512), out("icon-192.png", 192), out("apple-touch-icon.png", 180), out("favicon-32.png", 32)]);
}

// Bibliothèques auto-hébergées
await fs.copyFile("node_modules/maplibre-gl/dist/maplibre-gl.js", path.join(OUT, "vendor/maplibre-gl.js"));
await fs.copyFile("node_modules/maplibre-gl/dist/maplibre-gl.css", path.join(OUT, "vendor/maplibre-gl.css"));
await fs.copyFile("node_modules/qrcode-generator/dist/qrcode.js", path.join(OUT, "vendor/qrcode.js")).catch(() => fs.copyFile("node_modules/qrcode-generator/qrcode.js", path.join(OUT, "vendor/qrcode.js")));

// Traductions
for (const f of await fs.readdir("i18n")) if (f.endsWith(".json")) {
  const j = JSON.parse(await fs.readFile(path.join("i18n", f), "utf8"));
  await fs.writeFile(path.join(OUT, "i18n", f.replace(".json", ".js")), "window.KARBE_TR=" + JSON.stringify(j) + ";");
}

// Données ouvertes (JSON, GeoJSON, CSV) générées depuis data.js
const ctx = { window: {} }; vm.runInNewContext(await fs.readFile("data.js", "utf8"), ctx);
const D = ctx.window.KARBE, BASE = "https://karbe-guyane.vercel.app";
const rows = D.spots.map(s => { const [lvl, kids, swim] = (D.meta[s.id] || "f y n").split(" ");
  return { id: s.id, nom: s.name, zone: D.zones[s.zone].label, categories: s.cat.join("|"), latitude: s.lat, longitude: s.lon, precision: s.prec === "site" ? "~200 m" : "~2 km",
    duree: s.dur, acces: s.access.join("|"), gratuit: !!s.free, niveau: { f: "facile", m: "modéré", s: "sportif" }[lvl], enfants: kids === "y", baignade: { o: "oui", p: "prudence", n: "non" }[swim],
    quand: s.when || "", saison: s.season || "", description: s.desc, conseils: s.tips.join(" | "), url: `${BASE}/#lieu/${s.id}` }; });
const meta = { titre: "Karbé — lieux de visite en Guyane", producteur: "Karbé", licence: "Licence Ouverte / Open Licence 2.0 (Etalab)", version: D.version, genere: new Date().toISOString(),
  avertissement: "Positions approximatives (voir precision). Horaires et accès à confirmer sur place." };
await fs.writeFile(path.join(OUT, "opendata/lieux.json"), JSON.stringify({ ...meta, lieux: rows }, null, 1));
await fs.writeFile(path.join(OUT, "opendata/lieux.geojson"), JSON.stringify({ type: "FeatureCollection", metadata: meta,
  features: rows.map(r => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.longitude, r.latitude] }, properties: r })) }));
const cols = Object.keys(rows[0]), q = v => `"${String(v).replace(/"/g, '""')}"`;
await fs.writeFile(path.join(OUT, "opendata/lieux.csv"), "﻿" + [cols.join(";"), ...rows.map(r => cols.map(c => q(r[c])).join(";"))].join("\r\n"));
console.log(`✓ données ouvertes : ${rows.length} lieux`);
const nPages = await buildPages({ D, OUT });
console.log(`✓ pages indexables : ${nPages} URL dans le plan du site`);
console.log("Build terminé.");
