// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";

/**
 * Adresa webu je v `web.config.json` – stejný soubor čte i generátor feedu, aby odkazy
 * ve feedu vedly na tyhle stránky. Při přechodu na vlastní doménu stačí změnit tam:
 *   { "site": "https://kniha4u.cz", "base": "/" }   + přidat soubor public/CNAME
 */
const web = JSON.parse(readFileSync(new URL("./web.config.json", import.meta.url), "utf8"));

export default defineConfig({
  site: web.site,
  base: web.base,
  trailingSlash: "always",
  build: { format: "directory" },
  compressHTML: true,
  // OCR vlákno (scripts/ocr-vlakno.ts) načítá ONNX Runtime jako ES modul.
  vite: { worker: { format: "es" } },
});
