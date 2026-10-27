// Soubory pro OCR (Tesseract.js) do public/ocr/ – servírují se z našeho webu, ne z cizí CDN.
// Spouští se samo před `npm run build` / `npm run dev`; složka je v .gitignore.
import fs from "node:fs";
import path from "node:path";

const cil = path.resolve("public/ocr");
const soubory = {
  "worker.min.js": "node_modules/tesseract.js/dist/worker.min.js",
  "tesseract-core-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "ces.traineddata.gz": "node_modules/@tesseract.js-data/ces/4.0.0_best_int/ces.traineddata.gz",
};
fs.mkdirSync(cil, { recursive: true });
for (const [jmeno, zdroj] of Object.entries(soubory)) fs.copyFileSync(zdroj, path.join(cil, jmeno));
console.log(`OCR: ${Object.keys(soubory).length} souborů → public/ocr/`);
