# Karbé, la Guyane à portée de main

Application web progressive (PWA) de découverte de la Guyane : lieux, itinéraires, météo, marées, lancements, sécurité. Fonctionne hors-ligne.

- Production : https://karbe-guyane.vercel.app
- Build : `npm install && node build.mjs` (génère `public/`, récupère et vérifie les images par empreinte SHA-256, voir `assets.json`).
- Contenu : `data.js`. Aucun prestataire référencé sans vérification.
