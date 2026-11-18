// Karbé — build Vercel : assemble le site dans public/ et y héberge toutes les images.
// Chaque image est récupérée d'abord depuis la production Vercel (copie déjà hébergée),
// puis depuis son origine en secours, et vérifiée par empreinte SHA-256 : on ne publie
// jamais une image absente ou altérée. Si une image manque partout, le build échoue.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const OUT = "public";
const PROD = "https://karbe-guyane.vercel.app/";
const STATIC = ["index.html", "styles.css", "app.js", "data.js", "sw.js", "manifest.webmanifest", "icon.svg", "assets.json"];
const assets = JSON.parse(await fs.readFile("assets.json", "utf8"));

const sha = b => crypto.createHash("sha256").update(b).digest("hex");
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) return null;
    } catch {}
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  return null;
}
async function secure(item) {
  for (const [label, url] of [["vercel", PROD + item.file], ["origine", item.origin]]) {
    const b = await get(url);
    if (b && sha(b) === item.sha256) { console.log(`✓ ${item.file} (${label}, ${(b.length / 1e3).toFixed(0)} ko)`); return b; }
    if (b) console.warn(`! ${item.file} : empreinte différente depuis ${label}, ignoré`);
  }
  throw new Error(`Image introuvable ou altérée : ${item.file}`);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "img/src"), { recursive: true });
for (const f of STATIC) await fs.copyFile(f, path.join(OUT, f));

const all = [...assets.images, ...(assets.icon ? [assets.icon] : [])];
const bufs = await Promise.all(all.map(secure));
await Promise.all(all.map((it, i) => fs.writeFile(path.join(OUT, it.file), bufs[i])));

if (assets.icon) {
  const src = bufs[all.length - 1];
  const out = (name, size) => sharp(src).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  await Promise.all([out("icon-512.png", 512), out("icon-192.png", 192), out("apple-touch-icon.png", 180), out("favicon-32.png", 32)]);
  console.log("✓ icônes générées");
}
console.log(`Build terminé : ${all.length} images hébergées sur Vercel.`);
