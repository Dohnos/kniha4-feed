/**
 * Kniha4U Sken – logika telefonní aplikace.
 * Data drží IndexedDB (přežijí zavření prohlížeče), fotky jako WebP Bloby.
 * Export = ZIP { skeny.json, fotky/<id>.webp }, který načte aplikace Kniha4U na PC.
 */

import { strToU8, zipSync } from "fflate";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

type Sken = {
  id: string;
  typ: "kod" | "nazev";
  ean: string;
  nazev: string;
  autor: string;
  rok: string;
  box: string;
  cena: string;
  poznamka: string;
  foto: Blob | null;
  kdy: string;
};

const $ = <T extends HTMLElement>(vyber: string) => document.querySelector<T>(vyber)!;
const formular = $<HTMLDialogElement>("#formular");
const pole = (nazev: string) => $<HTMLFormElement>("#formular-obsah").elements.namedItem(nazev) as HTMLInputElement;
const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cislice = (s: string) => s.replace(/[^0-9Xx]/g, "").toUpperCase();

/* ---------- úložiště (IndexedDB) ---------- */

const db = new Promise<IDBDatabase>((hotovo, chyba) => {
  const pozadavek = indexedDB.open("kniha4u-sken", 1);
  pozadavek.onupgradeneeded = () => pozadavek.result.createObjectStore("skeny", { keyPath: "id" });
  pozadavek.onsuccess = () => hotovo(pozadavek.result);
  pozadavek.onerror = () => chyba(pozadavek.error);
});

async function uloziste<T>(rezim: IDBTransactionMode, akce: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const s = (await db).transaction("skeny", rezim).objectStore("skeny");
  return new Promise((hotovo, chyba) => {
    const p = akce(s);
    p.onsuccess = () => hotovo(p.result as T);
    p.onerror = () => chyba(p.error);
  });
}
const vsechny = async () => (await uloziste<Sken[]>("readonly", (s) => s.getAll())).sort((a, b) => b.kdy.localeCompare(a.kdy));
const uloz = (sken: Sken) => uloziste("readwrite", (s) => s.put(sken));
const smaz = (id: string) => uloziste("readwrite", (s) => s.delete(id));

/* ---------- veřejný katalog (upozornění „tuhle už máte“) ---------- */

let katalog: { nazev: string; text: string; kody: string }[] = [];
fetch(document.body.dataset.rejstrik!)
  .then((r) => r.json())
  .then((data: (string | number)[][]) => {
    // Formát hledani.json: [id, slug, název, autor, cena, rok, nakladatel, isbn, fotka]
    katalog = data.map((z) => ({ nazev: String(z[2]), text: bezDiakritiky(String(z[2])), kody: cislice(String(z[7])) }));
  })
  .catch(() => {});

function uzMate(s: Pick<Sken, "typ" | "ean" | "nazev">): string | null {
  if (s.typ === "kod") {
    const kod = cislice(s.ean);
    return kod.length >= 10 ? katalog.find((k) => k.kody.includes(kod))?.nazev ?? null : null;
  }
  const hledany = bezDiakritiky(s.nazev);
  return hledany ? katalog.find((k) => k.text === hledany)?.nazev ?? null : null;
}

/* ---------- drobnosti ---------- */

function toast(text: string) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(Number(el.dataset.casovac));
  el.dataset.casovac = String(setTimeout(() => (el.hidden = true), 2200));
}

let zvuk: AudioContext | null = null;
function pipni() {
  navigator.vibrate?.(60);
  try {
    zvuk ??= new AudioContext();
    const o = zvuk.createOscillator();
    const g = zvuk.createGain();
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.15, zvuk.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, zvuk.currentTime + 0.12);
    o.connect(g).connect(zvuk.destination);
    o.start();
    o.stop(zvuk.currentTime + 0.12);
  } catch {
    // bez zvuku – vibrace stačí
  }
}

const posledniBoxy = (): string[] => JSON.parse(localStorage.getItem("boxy") ?? "[]");
function zapamatujBox(box: string) {
  if (box) localStorage.setItem("boxy", JSON.stringify([box, ...posledniBoxy().filter((b) => b !== box)].slice(0, 6)));
}

/** Fotka z fotoaparátu → max. 1200 px, WebP (kde ho prohlížeč neumí, JPEG). */
async function zmensi(soubor: File): Promise<Blob> {
  const obraz = await createImageBitmap(soubor, { imageOrientation: "from-image" });
  const pomer = Math.min(1, 1200 / Math.max(obraz.width, obraz.height));
  const platno = Object.assign(document.createElement("canvas"), { width: Math.round(obraz.width * pomer), height: Math.round(obraz.height * pomer) });
  platno.getContext("2d")!.drawImage(obraz, 0, 0, platno.width, platno.height);
  const naBlob = (typ: string, kvalita: number) => new Promise<Blob | null>((r) => platno.toBlob(r, typ, kvalita));
  const webp = await naBlob("image/webp", 0.8);
  return webp?.type === "image/webp" ? webp : (await naBlob("image/jpeg", 0.82))!;
}

/* ---------- seznam ---------- */

const urlFotek = new Map<string, string>();

async function vykresli() {
  const skeny = await vsechny();
  $("#pocet").textContent = skeny.length ? `${skeny.length} ${skeny.length === 1 ? "kniha" : skeny.length < 5 ? "knihy" : "knih"} připraveno` : "Zatím nic";
  $<HTMLButtonElement>("#odeslat").disabled = !skeny.length;
  $("#prazdno").hidden = skeny.length > 0;

  $("#seznam").replaceChildren(...skeny.map((s) => {
    const tl = Object.assign(document.createElement("button"), { className: "polozka", onclick: () => otevriFormular(s) });
    const nahled = Object.assign(document.createElement("span"), { className: "nahled" });
    if (s.foto) {
      if (!urlFotek.has(s.id)) urlFotek.set(s.id, URL.createObjectURL(s.foto));
      nahled.append(Object.assign(document.createElement("img"), { src: urlFotek.get(s.id), alt: "" }));
    } else if (s.typ === "kod") {
      nahled.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M20 6v12"/></svg>';
    } else nahled.append(Object.assign(document.createElement("b"), { textContent: s.nazev.charAt(0).toUpperCase() }));

    const text = Object.assign(document.createElement("span"), { className: "polozka-text" });
    const nazev = s.typ === "kod" ? `EAN ${s.ean}` : s.nazev;
    const detail = s.typ === "kod" ? "údaje doplní PC" : [s.autor, s.rok].filter(Boolean).join(" · ") || "bez autora a roku";
    const stitky = Object.assign(document.createElement("span"), { className: "stitky" });
    for (const [t, pozor] of [[s.box || "bez boxu", !s.box], [s.cena ? `${s.cena} Kč` : "", false], [uzMate(s) ? "už máte" : "", true]] as const) {
      if (t) stitky.append(Object.assign(document.createElement("span"), { className: `stitek${pozor ? " stitek-pozor" : ""}`, textContent: t }));
    }
    text.append(Object.assign(document.createElement("strong"), { textContent: nazev }), Object.assign(document.createElement("small"), { textContent: detail }), stitky);
    tl.append(nahled, text);
    return tl;
  }));
}

/* ---------- formulář ---------- */

let upravovany: Sken | null = null;
let novaFoto: Blob | null | undefined;

function otevriFormular(sken: Partial<Sken> & Pick<Sken, "typ">) {
  upravovany = { id: crypto.randomUUID(), ean: "", nazev: "", autor: "", rok: "", box: posledniBoxy()[0] ?? "", cena: "", poznamka: "", foto: null, kdy: new Date().toISOString(), ...sken };
  novaFoto = undefined;
  const novy = !sken.id;
  $("#formular-nadpis").textContent = novy ? (sken.typ === "kod" ? "Naskenovaná kniha" : "Kniha bez kódu") : "Upravit";
  $("#pole-kod").hidden = sken.typ !== "kod";
  $("#pole-nazev").hidden = sken.typ !== "nazev";
  pole("nazev").required = sken.typ === "nazev";
  $("#formular-smazat").hidden = novy;
  $("#formular-dalsi").textContent = sken.typ === "kod" ? "Uložit + skenovat" : "Uložit + další";
  for (const k of ["ean", "nazev", "autor", "rok", "box", "cena", "poznamka"] as const) pole(k).value = upravovany[k];
  ukazFoto(upravovany.foto);
  aktualizujUpozorneni();

  $("#posledni-boxy").replaceChildren(...posledniBoxy().map((b) =>
    Object.assign(document.createElement("button"), { type: "button", textContent: b, onclick: () => (pole("box").value = b) })));
  formular.showModal();
  if (sken.typ === "nazev" && novy) pole("nazev").focus();
}

function ukazFoto(foto: Blob | null) {
  const img = $<HTMLImageElement>("#foto-nahled");
  img.hidden = !foto;
  $("#foto-text").hidden = !!foto;
  if (foto) img.src = URL.createObjectURL(foto);
}

function aktualizujUpozorneni() {
  const shoda = upravovany && uzMate({ typ: upravovany.typ, ean: pole("ean").value, nazev: pole("nazev").value });
  const el = $("#upozorneni");
  el.hidden = !shoda;
  el.textContent = shoda ? `Tuhle už máte v nabídce: „${shoda}“. PC nabídne přidat kus.` : "";
}
pole("nazev").addEventListener("input", aktualizujUpozorneni);
pole("ean").addEventListener("input", aktualizujUpozorneni);

$<HTMLInputElement>("#foto-vstup").addEventListener("change", async (e) => {
  const soubor = (e.target as HTMLInputElement).files?.[0];
  if (!soubor) return;
  toast("Zpracovávám fotku…");
  novaFoto = await zmensi(soubor);
  ukazFoto(novaFoto);
  (e.target as HTMLInputElement).value = "";
});

formular.addEventListener("close", async () => {
  const akce = formular.returnValue;
  formular.returnValue = "";
  if (!upravovany || !akce) return;
  if (akce === "smazat") {
    await smaz(upravovany.id);
    toast("Smazáno");
    return vykresli();
  }
  const sken: Sken = { ...upravovany, foto: novaFoto === undefined ? upravovany.foto : novaFoto };
  for (const k of ["ean", "nazev", "autor", "rok", "box", "cena", "poznamka"] as const) sken[k] = pole(k).value.trim();
  sken.box = sken.box.toUpperCase();
  sken.cena = sken.cena.replace(/\D/g, "");
  if (sken.typ === "kod" && !cislice(sken.ean)) return toast("Chybí kód");
  if (sken.typ === "nazev" && !sken.nazev) return toast("Chybí název");
  urlFotek.delete(sken.id);
  await uloz(sken);
  zapamatujBox(sken.box);
  toast("Uloženo");
  await vykresli();
  if (akce === "dalsi") sken.typ === "kod" ? spustKameru() : otevriFormular({ typ: "nazev" });
});

/* ---------- kamera a čtení čárových kódů ---------- */

type Detektor = { detect(zdroj: CanvasImageSource): Promise<{ rawValue: string }[]> };
let detektor: Promise<Detektor> | null = null;
let proud: MediaStream | null = null;
let bezi = false;

const FORMATY = ["ean_13", "ean_8", "upc_a", "upc_e"];

/** Chrome na Androidu čte kódy sám; jinde (iPhone) se načte ZXing ve WebAssembly z našeho webu. */
function nactiDetektor(): Promise<Detektor> {
  detektor ??= (async () => {
    const vestaveny = (globalThis as { BarcodeDetector?: { new (o: object): Detektor; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (vestaveny && (await vestaveny.getSupportedFormats()).includes("ean_13")) return new vestaveny({ formats: FORMATY });
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    prepareZXingModule({ overrides: { locateFile: (cesta: string, prefix: string) => (cesta.endsWith(".wasm") ? wasmUrl : prefix + cesta) } });
    return new BarcodeDetector({ formats: FORMATY as never });
  })();
  return detektor;
}

async function spustKameru() {
  $("#kamera").hidden = false;
  $("#kamera-napoveda").textContent = "Namiřte na čárový kód";
  const video = $<HTMLVideoElement>("#video");
  try {
    proud = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch {
    zastavKameru();
    toast("Kamera není povolená – zadejte kód ručně");
    return otevriFormular({ typ: "kod" });
  }
  video.srcObject = proud;
  await video.play();
  const stopa = proud.getVideoTracks()[0];
  const svetlo = $<HTMLButtonElement>("#kamera-svetlo");
  svetlo.hidden = !("torch" in ((stopa.getCapabilities?.() ?? {}) as object));
  svetlo.setAttribute("aria-pressed", "false");

  const cteni = await nactiDetektor();
  bezi = true;
  let posledni = "";
  while (bezi) {
    const kody = await cteni.detect(video).catch(() => []);
    const kod = kody[0]?.rawValue ?? "";
    // Kód musí přijít dvakrát po sobě – odfiltruje chybná čtení.
    if (kod && kod === posledni) {
      $(".ramecek").classList.add("nalezeno");
      pipni();
      await new Promise((r) => setTimeout(r, 180));
      zastavKameru();
      return otevriFormular({ typ: "kod", ean: kod });
    }
    posledni = kod;
    await new Promise((r) => setTimeout(r, 120));
  }
}

function zastavKameru() {
  bezi = false;
  proud?.getTracks().forEach((t) => t.stop());
  proud = null;
  $(".ramecek").classList.remove("nalezeno");
  $("#kamera").hidden = true;
}

$("#skenovat").addEventListener("click", spustKameru);
$("#bez-kodu").addEventListener("click", () => otevriFormular({ typ: "nazev" }));
$("#kamera-zavrit").addEventListener("click", zastavKameru);
$("#kamera-rucne").addEventListener("click", () => (zastavKameru(), otevriFormular({ typ: "kod" })));
$("#kamera-svetlo").addEventListener("click", async (e) => {
  const tl = e.currentTarget as HTMLButtonElement;
  const zapnout = tl.getAttribute("aria-pressed") !== "true";
  await proud?.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: zapnout } as MediaTrackConstraintSet] }).catch(() => {});
  tl.setAttribute("aria-pressed", String(zapnout));
});

/* ---------- odeslání: ZIP ---------- */

$("#odeslat").addEventListener("click", async () => {
  const skeny = await vsechny();
  if (!skeny.length) return;
  const soubory: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const polozky = await Promise.all(skeny.map(async (s, i) => {
    let foto: string | null = null;
    if (s.foto) {
      foto = `fotky/${i + 1}.${s.foto.type === "image/webp" ? "webp" : "jpg"}`;
      soubory[foto] = [new Uint8Array(await s.foto.arrayBuffer()), { level: 0 }]; // fotky už jsou komprimované
    }
    const { foto: _, ...data } = s;
    return { ...data, foto };
  }));
  soubory["skeny.json"] = strToU8(JSON.stringify({ verze: 1, vytvoreno: new Date().toISOString(), polozky }, null, 1));

  const nazev = `skeny-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.zip`;
  const zip = new File([zipSync(soubory)], nazev, { type: "application/zip" });

  let odeslano = false;
  if (navigator.canShare?.({ files: [zip] })) {
    try {
      await navigator.share({ files: [zip], title: nazev });
      odeslano = true;
    } catch {
      return; // uživatel sdílení zrušil
    }
  } else {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(zip), download: nazev });
    a.click();
    odeslano = true;
  }
  if (odeslano && confirm(`Odesláno ${skeny.length} knih.\n\nVymazat je z telefonu? (Zrušit = nechat, kdyby se přenos nepovedl.)`)) {
    await Promise.all(skeny.map((s) => smaz(s.id)));
    vykresli();
  }
});

/* ---------- start ---------- */

vykresli();
// Offline režim: service worker ukládá stránku a soubory pro práci bez signálu.
navigator.serviceWorker?.register(document.body.dataset.sw!, { scope: document.body.dataset.scope }).catch(() => {});
