// Soubory pro OCR (modely PaddleOCR) do public/ocr/ – servírují se z našeho webu, ne z cizí CDN.
// Modely jsou v ocr-modely/ (z huggingface.co/monkt/paddleocr-onnx, Apache-2.0):
//   det.onnx = PP-OCRv3 mobile detekce, rec.onnx + dict.txt = PP-OCRv5 latin (čeština).
// Spouští se samo před `npm run build` / `npm run dev`; public/ocr/ je v .gitignore.
import fs from "node:fs";
import path from "node:path";

const cil = path.resolve("public/ocr");
const soubory = {
  "det.onnx": "ocr-modely/det.onnx",
  "rec.onnx": "ocr-modely/rec.onnx",
  "dict.txt": "ocr-modely/dict.txt",
};
fs.rmSync(cil, { recursive: true, force: true });
fs.mkdirSync(cil, { recursive: true });
for (const [jmeno, zdroj] of Object.entries(soubory)) fs.copyFileSync(zdroj, path.join(cil, jmeno));
console.log(`OCR: ${Object.keys(soubory).length} souborů → public/ocr/`);
