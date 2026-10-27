/**
 * OCR ve vlastním vlákně (Web Worker), aby telefon během čtení nezamrzal.
 * PaddleOCR (github.com/PaddlePaddle/PaddleOCR): detekce PP-OCRv3 mobile + rozpoznávání
 * PP-OCRv5 latin (umí češtinu včetně háčků a čárek). Modely jsou na našem webu v /ocr/, runtime (wasm) v /_astro/.
 */
import * as ort from "onnxruntime-web/wasm";
import { PaddleOcrService } from "paddleocr";
import runtimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

type Zprava = { cesta: string; sirka: number; vyska: number; data: Uint8ClampedArray };

let sluzba: Promise<PaddleOcrService> | null = null;
const stav = (text: string) => postMessage({ typ: "stav", text });

/** Stáhne soubor a hlásí průběh (celková velikost je známá předem – jen poprvé, pak je v mezipaměti). */
async function stahni(url: string, hotovo: { b: number }, celkem: number) {
  const odpoved = await fetch(url);
  if (!odpoved.ok || !odpoved.body) throw new Error(`${url}: ${odpoved.status}`);
  const kusy: Uint8Array[] = [];
  const cteni = odpoved.body.getReader();
  for (let r = await cteni.read(); !r.done; r = await cteni.read()) {
    kusy.push(r.value);
    hotovo.b += r.value.length;
    stav(`Připravuji čtení textu… ${Math.min(99, Math.round((hotovo.b / celkem) * 100))} %`);
  }
  const vysledek = new Uint8Array(kusy.reduce((s, k) => s + k.length, 0));
  let pozice = 0;
  for (const k of kusy) (vysledek.set(k, pozice), (pozice += k.length));
  return vysledek.buffer;
}

function priprav(cesta: string) {
  sluzba ??= (async () => {
    // GitHub Pages neposílá hlavičky pro sdílenou paměť → jedno vlákno (stačí, OCR běží jen na pár řádků).
    ort.env.wasm.numThreads = 1;
    const hotovo = { b: 0 };
    const celkem = 14_848_852 + 2_429_873 + 7_862_832;
    const [runtime, det, rec, slovnik] = await Promise.all([
      stahni(runtimeUrl, hotovo, celkem),
      stahni(`${cesta}/det.onnx`, hotovo, celkem),
      stahni(`${cesta}/rec.onnx`, hotovo, celkem),
      fetch(`${cesta}/dict.txt`).then((r) => r.text()),
    ]);
    ort.env.wasm.wasmBinary = runtime;
    stav("Připravuji čtení textu… 99 %");
    return PaddleOcrService.createInstance({
      ort: ort as never,
      modelPreset: "PP-OCRv5_mobile",
      detection: { modelBuffer: det },
      // Model má o mezeru víc než slovník (PaddleOCR use_space_char) – mezera se přidá na konec.
      recognition: { modelBuffer: rec, charactersDictionary: [...slovnik.split(/\r?\n/).filter(Boolean), " "] },
    });
  })().catch((chyba) => {
    sluzba = null;
    throw chyba;
  });
  return sluzba;
}

onmessage = async ({ data }: MessageEvent<Zprava | { cesta: string; jenPriprav: true }>) => {
  try {
    const ocr = await priprav(data.cesta);
    if ("jenPriprav" in data) return postMessage({ typ: "vysledek", radky: [] });
    stav("Čtu text…");
    const vysledky = await ocr.recognize(
      { width: data.sirka, height: data.vyska, data: new Uint8Array(data.data.buffer) },
      {
        onProgress: (u) => {
          if (u.type === "rec" && u.progress.total) stav(`Čtu text… ${Math.round((u.progress.current / u.progress.total) * 100)} %`);
        },
      }
    );
    postMessage({
      typ: "vysledek",
      radky: vysledky.map((v) => ({ text: v.text, jistota: v.confidence, x: v.box.x, y: v.box.y, sirka: v.box.width, vyska: v.box.height })),
    });
  } catch (chyba) {
    postMessage({ typ: "chyba", text: String(chyba) });
  }
};
