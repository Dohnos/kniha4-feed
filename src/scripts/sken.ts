/**
 * Kniha4U Sken – logika telefonní aplikace.
 * Data drží IndexedDB (přežijí zavření prohlížeče), fotky jako WebP Bloby.
 * Export = ZIP { skeny.json, fotky/<n>.webp }, který načte aplikace Kniha4U na PC.
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
  kusu: number;
  poznamka: string;
  foto: Blob | null;
  kdy: string;
};

const TEXTOVA_POLE = ["ean", "nazev", "autor", "rok", "box", "cena", "poznamka"] as const;

const $ = <T extends HTMLElement>(vyber: string) => document.querySelector<T>(vyber)!;
const formular = $<HTMLDialogElement>("#formular");
const kamera = $("#kamera");
const pole = (nazev: string) => $<HTMLFormElement>("#formular-obsah").elements.namedItem(nazev) as HTMLInputElement;
const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cislice = (s: string) => s.replace(/[^0-9Xx]/g, "").toUpperCase();
const knih = (n: number) => `${n} ${n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih"}`;

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
// Starší záznamy (před přidáním kusů) dostanou 1 kus.
const vsechny = async () =>
  (await uloziste<Sken[]>("readonly", (s) => s.getAll())).map((s) => ({ ...s, kusu: s.kusu || 1 })).sort((a, b) => b.kdy.localeCompare(a.kdy));
const uloz = (sken: Sken) => uloziste("readwrite", (s) => s.put(sken));
const smaz = (id: string) => uloziste("readwrite", (s) => s.delete(id));

/* ---------- veřejný katalog (upozornění „tuhle už máte“) ---------- */

let katalog: { nazev: string; autor: string; text: string; kody: string }[] = [];
fetch(document.body.dataset.rejstrik!)
  .then((r) => r.json())
  .then((data: (string | number)[][]) => {
    // Formát hledani.json: [id, slug, název, autor, cena, rok, nakladatel, isbn, fotka]
    katalog = data.map((z) => ({ nazev: String(z[2]), autor: String(z[3]), text: bezDiakritiky(String(z[2])), kody: cislice(String(z[7])) }));
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

function toast(text: string, akce?: { text: string; fn: () => void }) {
  const el = $("#toast");
  el.replaceChildren(text);
  if (akce) el.append(Object.assign(document.createElement("button"), { textContent: akce.text, onclick: () => ((el.hidden = true), akce.fn()) }));
  el.hidden = false;
  clearTimeout(Number(el.dataset.casovac));
  el.dataset.casovac = String(setTimeout(() => (el.hidden = true), akce ? 5000 : 2200));
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

/** Plátno → WebP (kde ho prohlížeč neumí, JPEG). */
async function naObrazek(platno: HTMLCanvasElement): Promise<Blob> {
  const naBlob = (typ: string, kvalita: number) => new Promise<Blob | null>((r) => platno.toBlob(r, typ, kvalita));
  const webp = await naBlob("image/webp", 0.82);
  return webp?.type === "image/webp" ? webp : (await naBlob("image/jpeg", 0.85))!;
}

/** Obrázek na plátno: delší strana nejvýš `max`, malé obrázky se zvětší aspoň na `min`. */
async function naPlatno(soubor: Blob, max: number, min = 0) {
  const obraz = await createImageBitmap(soubor, { imageOrientation: "from-image" });
  const delsi = Math.max(obraz.width, obraz.height);
  const pomer = Math.min(max / delsi, Math.max(1, min / delsi));
  const platno = Object.assign(document.createElement("canvas"), { width: Math.round(obraz.width * pomer), height: Math.round(obraz.height * pomer) });
  platno.getContext("2d")!.drawImage(obraz, 0, 0, platno.width, platno.height);
  return platno;
}

/* ---------- tlačítko Zpět (Android) / gesto zpět (iPhone) zavře okno nebo kameru ---------- */

// Úrovně v historii: 1 = formulář nebo kamera, 2 = ořez obálky nad formulářem.
const orez = $<HTMLDialogElement>("#orez");
const otevrenaVrstva = () => formular.open || !kamera.hidden;
function vrstvaOtevrena() {
  if (!history.state?.k4u) history.pushState({ k4u: 1 }, "");
}
function vrstvaZavrena() {
  // Když se hned otevře další vrstva (sken → formulář), záznam v historii zůstane.
  setTimeout(() => !otevrenaVrstva() && history.state?.k4u && history.back(), 60);
}
addEventListener("popstate", (e) => {
  const uroven = e.state?.k4u ?? 0;
  if (uroven < 2 && orez.open) orez.close();
  if (uroven >= 1) return;
  if (formular.open) zavritFormular();
  if (!kamera.hidden) zastavKameru();
});

/* ---------- seznam ---------- */

const urlFotek = new Map<string, string>();

async function vykresli() {
  const skeny = await vsechny();
  const kusu = skeny.reduce((s, k) => s + k.kusu, 0);
  const cena = skeny.reduce((s, k) => s + (Number(k.cena) || 0) * k.kusu, 0);
  $("#pocet").textContent = skeny.length ? `${knih(skeny.length)}${kusu > skeny.length ? ` · ${kusu} ks` : ""}${cena ? ` · ${cena.toLocaleString("cs-CZ")} Kč` : ""}` : "Zatím nic";
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
    for (const [t, pozor] of [[s.box || "bez boxu", !s.box], [s.kusu > 1 ? `${s.kusu} ks` : "", false], [s.cena ? `${s.cena} Kč` : "", false], [uzMate(s) ? "už máte" : "", true]] as const) {
      if (t) stitky.append(Object.assign(document.createElement("span"), { className: `stitek${pozor ? " stitek-pozor" : ""}`, textContent: t }));
    }
    text.append(Object.assign(document.createElement("strong"), { textContent: nazev }), Object.assign(document.createElement("small"), { textContent: detail }), stitky);
    tl.append(nahled, text);
    return tl;
  }));
}

/* ---------- formulář (spodní list) ---------- */

let upravovany: Sken | null = null;
let novaFoto: Blob | null | undefined;

function otevriFormular(sken: Partial<Sken> & Pick<Sken, "typ">, zprava?: string) {
  upravovany = { id: crypto.randomUUID(), ean: "", nazev: "", autor: "", rok: "", box: posledniBoxy()[0] ?? "", cena: "", kusu: 1, poznamka: "", foto: null, kdy: new Date().toISOString(), ...sken };
  novaFoto = undefined;
  zdrojObalky = null;
  const novy = !sken.id;
  $("#formular-nadpis").textContent = novy ? (sken.typ === "kod" ? "Naskenovaná kniha" : "Kniha bez kódu") : "Upravit";
  $("#pole-kod").hidden = sken.typ !== "kod";
  $("#pole-nazev").hidden = sken.typ !== "nazev";
  pole("nazev").required = sken.typ === "nazev";
  $("#formular-smazat").hidden = novy;
  $("#formular-dalsi").textContent = sken.typ === "kod" ? "Uložit + skenovat" : "Uložit + další";
  for (const k of TEXTOVA_POLE) pole(k).value = upravovany[k];
  pole("kusu").value = String(upravovany.kusu);
  $("#ocr-radky").hidden = true;
  $("#ocr-stav").textContent = "Vyfoťte obálku nebo titulní stranu";
  ukazFoto(upravovany.foto);
  aktualizujUpozorneni(zprava);

  $("#posledni-boxy").replaceChildren(...posledniBoxy().map((b) =>
    Object.assign(document.createElement("button"), { type: "button", textContent: b, onclick: () => ((pole("box").value = b), oznacBox(), navigator.vibrate?.(15)) })));
  oznacBox();
  formular.returnValue = "";
  formular.classList.remove("odjezd", "navrat");
  formular.style.transform = "";
  formular.showModal();
  $("#list-telo").scrollTop = 0;
  vrstvaOtevrena();
  if (sken.typ === "nazev" && novy) pole("nazev").focus();
}

/** Zvýrazní čip boxu, který je zrovna vyplněný. */
function oznacBox() {
  const box = pole("box").value.trim().toUpperCase();
  for (const c of $("#posledni-boxy").children) c.setAttribute("aria-pressed", String(c.textContent === box));
}
pole("box").addEventListener("input", oznacBox);

// Pole, do kterého se píše, se posune doprostřed – nezakryje ho klávesnice ani tlačítka dole.
$("#list-telo").addEventListener("focusin", (e) => {
  const prvek = e.target as HTMLElement;
  if (prvek.matches("input")) setTimeout(() => prvek.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
});

/** Zavře bez uložení – s animací sjetí dolů. */
function zavritFormular() {
  if (!formular.open) return;
  formular.classList.add("odjezd");
  setTimeout(() => formular.close(""), 230);
}

let urlNahledu = "";
function ukazFoto(foto: Blob | null) {
  $("#foto-prazdne").hidden = !!foto;
  $("#foto-karta").hidden = !foto;
  URL.revokeObjectURL(urlNahledu);
  urlNahledu = foto ? URL.createObjectURL(foto) : "";
  if (foto) $<HTMLImageElement>("#foto-nahled").src = urlNahledu;
}

function aktualizujUpozorneni(zprava?: string) {
  const shoda = upravovany && uzMate({ typ: upravovany.typ, ean: pole("ean").value, nazev: pole("nazev").value });
  const text = zprava ?? (shoda ? `Tuhle už máte v nabídce: „${shoda}“. PC nabídne přidat kus.` : "");
  const el = $("#upozorneni");
  el.hidden = !text;
  el.textContent = text;
}
pole("nazev").addEventListener("input", () => aktualizujUpozorneni());
pole("ean").addEventListener("input", () => aktualizujUpozorneni());

const nastavKusy = (n: number) => (pole("kusu").value = String(Math.max(1, Math.min(99, n || 1))));
$("#kusu-minus").addEventListener("click", () => nastavKusy(Number(pole("kusu").value) - 1));
$("#kusu-plus").addEventListener("click", () => nastavKusy(Number(pole("kusu").value) + 1));
pole("kusu").addEventListener("change", () => nastavKusy(Number(pole("kusu").value)));

/* Obálka: vyfotit → oříznout na 2 : 3. Původní fotka zůstane v paměti, aby šel ořez kdykoli upravit. */
let zdrojObalky: ZdrojObalky | null = null;

async function upravObalku(zdroj: ZdrojObalky) {
  const vysledek = await oriznout(zdroj);
  if (!vysledek) return;
  zdrojObalky = vysledek.zdroj;
  novaFoto = vysledek.foto;
  ukazFoto(novaFoto);
}

const vyfotitObalku = () => $<HTMLInputElement>("#foto-vstup").click();
$("#foto-prazdne").addEventListener("click", vyfotitObalku);
$("#foto-znovu").addEventListener("click", vyfotitObalku);
$<HTMLInputElement>("#foto-vstup").addEventListener("change", (e) => {
  const vstup = e.target as HTMLInputElement;
  const soubor = vstup.files?.[0];
  vstup.value = "";
  if (soubor) upravObalku({ foto: soubor, otoceni: 0, vyrez: null });
});

const upravitOrez = () => {
  const foto = novaFoto === undefined ? upravovany?.foto : novaFoto;
  if (foto) upravObalku(zdrojObalky ?? { foto, otoceni: 0, vyrez: null });
};
$("#foto-obalka").addEventListener("click", upravitOrez);
$("#foto-oriznout").addEventListener("click", upravitOrez);
$("#foto-odebrat").addEventListener("click", () => {
  novaFoto = null;
  zdrojObalky = null;
  ukazFoto(null);
});

// Zavření: ×, klepnutí na ztmavené pozadí, Esc (nativně) – vše bez uložení.
$("#formular-zavrit").addEventListener("click", zavritFormular);
formular.addEventListener("click", (e) => e.target === formular && zavritFormular());

// Stažení listu prstem dolů za horní část (úchyt + nadpis).
(() => {
  const hlava = $("#list-hlava");
  let start = 0;
  let posun = 0;
  let cas = 0;
  hlava.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    start = e.clientY;
    posun = 0;
    cas = performance.now();
    hlava.setPointerCapture(e.pointerId);
    formular.classList.remove("navrat");
    formular.classList.add("tazeni");
  });
  hlava.addEventListener("pointermove", (e) => {
    if (!formular.classList.contains("tazeni")) return;
    posun = Math.max(0, e.clientY - start);
    formular.style.transform = `translateY(${posun}px)`;
  });
  const konec = () => {
    if (!formular.classList.contains("tazeni")) return;
    formular.classList.remove("tazeni");
    const rychlost = posun / Math.max(1, performance.now() - cas);
    if (posun > 110 || (posun > 40 && rychlost > 0.6)) return zavritFormular();
    formular.classList.add("navrat");
    formular.style.transform = "";
  };
  hlava.addEventListener("pointerup", konec);
  hlava.addEventListener("pointercancel", konec);
})();

formular.addEventListener("close", async () => {
  const akce = formular.returnValue;
  formular.returnValue = "";
  formular.classList.remove("odjezd", "tazeni");
  formular.style.transform = "";
  vrstvaZavrena();
  if (!upravovany || !akce) return;

  if (akce === "smazat") {
    const smazany = { ...upravovany };
    await smaz(smazany.id);
    await vykresli();
    return toast("Smazáno", { text: "Vrátit", fn: async () => (await uloz(smazany), vykresli()) });
  }
  const sken: Sken = { ...upravovany, foto: novaFoto === undefined ? upravovany.foto : novaFoto };
  for (const k of TEXTOVA_POLE) sken[k] = pole(k).value.trim();
  sken.box = sken.box.toUpperCase();
  sken.cena = sken.cena.replace(/\D/g, "");
  sken.kusu = Math.max(1, Number(pole("kusu").value) || 1);
  if (sken.typ === "kod" && !cislice(sken.ean)) return toast("Chybí kód");
  if (sken.typ === "nazev" && !sken.nazev) return toast("Chybí název");
  urlFotek.delete(sken.id);
  await uloz(sken);
  zapamatujBox(sken.box);
  navigator.vibrate?.(25);
  toast("Uloženo");
  await vykresli();
  if (akce === "dalsi") sken.typ === "kod" ? spustKameru() : otevriFormular({ typ: "nazev" });
});

/* ---------- ořez obálky na poměr 2 : 3 (jako obálky na webu) ---------- */

const POMER = 3 / 2; // výška ku šířce
/** Výřez v pixelech (otočené) zdrojové fotky. */
type Vyrez = { x: number; y: number; sirka: number };
type ZdrojObalky = { foto: Blob; otoceni: number; vyrez: Vyrez | null };

const orezPlatno = $<HTMLCanvasElement>("#orez-platno");
const kresba = orezPlatno.getContext("2d")!;
let zdroj: HTMLCanvasElement | null = null; // fotka v editoru, delší strana max. 2000 px
let otoceni = 0; // ve čtvrtotáčkách po směru hodin
// Rámeček a střed fotky v CSS pixelech plátna, m = kolik pixelů obrazovky na pixel fotky.
const ramecek = { x: 0, y: 0, s: 0, v: 0 };
const fotka = { cx: 0, cy: 0, m: 1 };
const prsty = new Map<number, { x: number; y: number }>();
let orezHotovo = (_: boolean) => {};

/** „Celá fotka“ = vejde se do rámečku celá (zbytek bílý), „vyplnit“ = vyplní rámeček bez okrajů. */
const meritka = () => ({
  cela: Math.min(ramecek.s / zdroj!.width, ramecek.v / zdroj!.height),
  vyplnit: Math.max(ramecek.s / zdroj!.width, ramecek.v / zdroj!.height),
});

function otoc(platno: HTMLCanvasElement, ctvrtin: number) {
  if (!(ctvrtin % 4)) return platno;
  const nove = Object.assign(document.createElement("canvas"), ctvrtin % 2 ? { width: platno.height, height: platno.width } : { width: platno.width, height: platno.height });
  const k = nove.getContext("2d")!;
  k.translate(nove.width / 2, nove.height / 2);
  k.rotate((ctvrtin * Math.PI) / 2);
  k.drawImage(platno, -platno.width / 2, -platno.height / 2);
  return nove;
}

const vyrez = (): Vyrez => ({
  x: (ramecek.x - fotka.cx) / fotka.m + zdroj!.width / 2,
  y: (ramecek.y - fotka.cy) / fotka.m + zdroj!.height / 2,
  sirka: ramecek.s / fotka.m,
});
function nastavVyrez(v: Vyrez) {
  fotka.m = ramecek.s / v.sirka;
  fotka.cx = ramecek.x + (zdroj!.width / 2 - v.x) * fotka.m;
  fotka.cy = ramecek.y + (zdroj!.height / 2 - v.y) * fotka.m;
  omez();
}

/** Fotka nesmí v rámečku nechat díru – menší než rámeček zůstane uprostřed. */
function omez() {
  const { cela, vyplnit } = meritka();
  fotka.m = Math.min(Math.max(fotka.m, cela), vyplnit * 6);
  const osa = (stred: number, delka: number, zacatek: number, okno: number) =>
    delka <= okno ? zacatek + okno / 2 : Math.min(Math.max(stred, zacatek + okno - delka / 2), zacatek + delka / 2);
  fotka.cx = osa(fotka.cx, zdroj!.width * fotka.m, ramecek.x, ramecek.s);
  fotka.cy = osa(fotka.cy, zdroj!.height * fotka.m, ramecek.y, ramecek.v);
  $("#orez-cela").setAttribute("aria-pressed", String(fotka.m <= cela * 1.001));
}

function vycentruj(m: number) {
  fotka.m = m;
  fotka.cx = ramecek.x + ramecek.s / 2;
  fotka.cy = ramecek.y + ramecek.v / 2;
  omez();
  kresli();
}

/** Velikost plátna a rámečku podle obrazovky; `zachovat` = stejný výřez i po otočení telefonu. */
function rozmer(zachovat = true) {
  const v = zachovat ? vyrez() : null;
  const { clientWidth: s, clientHeight: h } = orezPlatno;
  orezPlatno.width = Math.round(s * devicePixelRatio);
  orezPlatno.height = Math.round(h * devicePixelRatio);
  ramecek.v = Math.max(60, Math.min(h - 32, (s - 88) * POMER));
  ramecek.s = ramecek.v / POMER;
  ramecek.x = (s - ramecek.s) / 2;
  ramecek.y = (h - ramecek.v) / 2;
  if (v) nastavVyrez(v);
  kresli();
}

function kresli() {
  if (!zdroj) return;
  const k = kresba;
  const { clientWidth: s, clientHeight: v } = orezPlatno;
  const { x, y, s: rs, v: rv } = ramecek;
  k.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  k.fillStyle = "#000";
  k.fillRect(0, 0, s, v);
  k.fillStyle = "#fff"; // bílé okraje, když je vidět celá fotka
  k.fillRect(x, y, rs, rv);
  const w = zdroj.width * fotka.m;
  const h = zdroj.height * fotka.m;
  k.imageSmoothingQuality = "high";
  k.drawImage(zdroj, fotka.cx - w / 2, fotka.cy - h / 2, w, h);
  // Mimo rámeček je fotka vidět celá, jen ztmavená.
  k.fillStyle = "rgba(0,0,0,0.6)";
  k.beginPath();
  k.rect(0, 0, s, v);
  k.rect(x, y, rs, rv);
  k.fill("evenodd");
  // Při posouvání pomocné třetiny.
  if (prsty.size) {
    k.strokeStyle = "rgba(255,255,255,0.35)";
    k.lineWidth = 1;
    k.beginPath();
    for (const t of [1 / 3, 2 / 3]) {
      k.moveTo(x + rs * t, y);
      k.lineTo(x + rs * t, y + rv);
      k.moveTo(x, y + rv * t);
      k.lineTo(x + rs, y + rv * t);
    }
    k.stroke();
  }
  k.strokeStyle = "rgba(255,255,255,0.9)";
  k.lineWidth = 1.5;
  k.strokeRect(x, y, rs, rv);
  // Silné rohy.
  const r = 22;
  k.lineWidth = 4;
  k.lineCap = "round";
  k.beginPath();
  for (const [rx, ry, sx, sy] of [[x, y, 1, 1], [x + rs, y, -1, 1], [x, y + rv, 1, -1], [x + rs, y + rv, -1, -1]]) {
    k.moveTo(rx + sx * r, ry);
    k.lineTo(rx, ry);
    k.lineTo(rx, ry + sy * r);
  }
  k.stroke();
}

/** Přiblížení `k`× kolem bodu (x, y) a posun o (dx, dy). */
function zmen(k: number, x: number, y: number, dx = 0, dy = 0) {
  const { cela, vyplnit } = meritka();
  const m = Math.min(Math.max(fotka.m * k, cela), vyplnit * 6);
  k = m / fotka.m;
  fotka.m = m;
  fotka.cx = x + (fotka.cx + dx - x) * k;
  fotka.cy = y + (fotka.cy + dy - y) * k;
  omez();
  kresli();
}

const bodPrstu = (e: PointerEvent | WheelEvent) => {
  const o = orezPlatno.getBoundingClientRect();
  return { x: e.clientX - o.left, y: e.clientY - o.top };
};
function gesto() {
  const b = [...prsty.values()].slice(0, 2);
  return {
    x: b.reduce((s, p) => s + p.x, 0) / b.length,
    y: b.reduce((s, p) => s + p.y, 0) / b.length,
    vzdalenost: b.length > 1 ? Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y) : 0,
  };
}
orezPlatno.addEventListener("pointerdown", (e) => {
  orezPlatno.setPointerCapture(e.pointerId);
  prsty.set(e.pointerId, bodPrstu(e));
  kresli();
});
orezPlatno.addEventListener("pointermove", (e) => {
  if (!prsty.has(e.pointerId)) return;
  const pred = gesto();
  prsty.set(e.pointerId, bodPrstu(e));
  const po = gesto();
  zmen(pred.vzdalenost && po.vzdalenost ? po.vzdalenost / pred.vzdalenost : 1, po.x, po.y, po.x - pred.x, po.y - pred.y);
});
for (const udalost of ["pointerup", "pointercancel"]) {
  orezPlatno.addEventListener(udalost, (e) => {
    prsty.delete((e as PointerEvent).pointerId);
    kresli();
  });
}
// Na počítači kolečkem myši.
orezPlatno.addEventListener("wheel", (e) => {
  e.preventDefault();
  const { x, y } = bodPrstu(e);
  zmen(Math.exp(-e.deltaY * 0.0015), x, y);
}, { passive: false });

$("#orez-otocit").addEventListener("click", () => {
  otoceni = (otoceni + 1) % 4;
  zdroj = otoc(zdroj!, 1);
  vycentruj(meritka().vyplnit);
});
$("#orez-cela").addEventListener("click", () => {
  const { cela, vyplnit } = meritka();
  vycentruj(fotka.m <= cela * 1.001 ? vyplnit : cela);
});
$("#orez-zrusit").addEventListener("click", () => orez.close());
$("#orez-hotovo").addEventListener("click", () => orez.close("ok"));
orez.addEventListener("close", () => {
  prsty.clear();
  if (history.state?.k4u === 2) history.back();
  orezHotovo(orez.returnValue === "ok");
  orez.returnValue = "";
});
addEventListener("resize", () => orez.open && rozmer());

/** Výřez do obrázku: šířka nejvýš 800 px (na webu stačí), poměr 2 : 3. */
function vyriznout() {
  const v = vyrez();
  const sirka = Math.max(1, Math.round(Math.min(800, v.sirka)));
  const vystup = Object.assign(document.createElement("canvas"), { width: sirka, height: Math.round(sirka * POMER) });
  const k = vystup.getContext("2d")!;
  k.fillStyle = "#fff";
  k.fillRect(0, 0, vystup.width, vystup.height);
  k.imageSmoothingQuality = "high";
  const n = sirka / v.sirka;
  k.drawImage(zdroj!, -v.x * n, -v.y * n, zdroj!.width * n, zdroj!.height * n);
  return naObrazek(vystup);
}

/** Otevře editor ořezu; vrátí oříznutou obálku a stav pro pozdější úpravu, nebo null (Zrušit). */
async function oriznout(z: ZdrojObalky): Promise<{ foto: Blob; zdroj: ZdrojObalky } | null> {
  toast("Načítám fotku…");
  try {
    otoceni = z.otoceni;
    zdroj = otoc(await naPlatno(z.foto, 2000), otoceni);
  } catch {
    toast("Fotku se nepodařilo načíst");
    return null;
  }
  $("#toast").hidden = true;
  orez.returnValue = "";
  orez.showModal();
  history.pushState({ k4u: 2 }, "");
  rozmer(false);
  if (z.vyrez) nastavVyrez(z.vyrez);
  else vycentruj(meritka().vyplnit);
  kresli();
  const ok = await new Promise<boolean>((r) => (orezHotovo = r));
  const vysledek = ok ? { foto: await vyriznout(), zdroj: { foto: z.foto, otoceni, vyrez: vyrez() } } : null;
  zdroj = null;
  return vysledek;
}

/* ---------- OCR: název z fotky (PaddleOCR ve vlastním vlákně, čeština, vše z našeho webu) ---------- */

type OcrRadek = { text: string; jistota: number; y: number; vyska: number };

let ocr: Worker | null = null;
let ocrPrubeh = (_: string) => {};

function vlakno() {
  ocr ??= new Worker(new URL("./ocr-vlakno.ts", import.meta.url), { type: "module" });
  return ocr;
}

/** Pošle obrázek do vlákna a počká na řádky textu (průběh hlásí přes ocrPrubeh). */
function ocrUloha(zprava: object, prenos: Transferable[] = []): Promise<OcrRadek[]> {
  const w = vlakno();
  return new Promise((hotovo, chyba) => {
    w.onmessage = ({ data }) => {
      if (data.typ === "stav") ocrPrubeh(data.text);
      else if (data.typ === "vysledek") hotovo(data.radky);
      else chyba(new Error(data.text));
    };
    w.postMessage({ cesta: document.body.dataset.ocr, ...zprava }, prenos);
  });
}

/** „BYLO NÁS PĚT“ → „Bylo nás pět“; odstraní šum na krajích. */
function vycisti(text: string) {
  let t = text.replace(/[|_~^*<>{}[\]\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}„"(]+|[^\p{L}\p{N}.!?)"“]+$/gu, "");
  const pismena = t.replace(/[^\p{L}]/gu, "");
  // Velkými písmeny (i kapitálky, kde OCR pár písmen přečte jako malá: „POSlEdNÍ“).
  const velkych = pismena.replace(/[^\p{Lu}]/gu, "").length;
  if (pismena.length > 3 && velkych >= pismena.length * 0.7) t = t.charAt(0) + t.slice(1).toLocaleLowerCase("cs");
  return t;
}

/* Oprava češtiny: model čte latinku pro desítky jazyků a u velkých písmen plete háčky a čárky
   (PĚT → PÉT, Ď → D, Ž → Ż). Cizí znaky se převedou na české a slova se porovnají se slovy
   z názvů a autorů v katalogu – když se liší jen diakritikou, vezme se česká podoba z katalogu. */
const CIZI_ZNAKY: Record<string, string> = {
  ż: "ž", ź: "ž", ś: "š", ć: "č", ń: "ň", ñ: "ň", ł: "l", ľ: "l", ĺ: "l", ŕ: "ř", ç: "c", ÿ: "ý",
  à: "á", â: "á", ã: "á", ä: "a", ą: "a", è: "é", ê: "ě", ë: "e", ę: "e", ì: "í", î: "í", ï: "i",
  ò: "ó", ô: "ó", õ: "ó", ö: "o", ő: "ó", ù: "ú", û: "ů", ü: "u", ű: "ů",
};
let slova: { zname: Set<string>; podle: Map<string, string> } | null = null;

function ceskaSlova() {
  if (slova || !katalog.length) return slova;
  const pocty = new Map<string, Map<string, number>>();
  for (const k of katalog) {
    for (const slovo of `${k.nazev} ${k.autor}`.toLocaleLowerCase("cs").match(/\p{L}{2,}/gu) ?? []) {
      const varianty = pocty.get(bezDiakritiky(slovo)) ?? new Map<string, number>();
      varianty.set(slovo, (varianty.get(slovo) ?? 0) + 1);
      pocty.set(bezDiakritiky(slovo), varianty);
    }
  }
  const podle = new Map([...pocty].map(([klic, v]) => [klic, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
  slova = { zname: new Set([...pocty.values()].flatMap((v) => [...v.keys()])), podle };
  return slova;
}

function opravCestinu(text: string) {
  const t = text
    .replace(/([dt])[’'](?=\p{Ll})/gu, (_, p: string) => (p === "d" ? "ď" : "ť"))
    .replace(/\p{L}/gu, (z) => CIZI_ZNAKY[z] ?? CIZI_ZNAKY[z.toLowerCase()]?.toUpperCase() ?? z);
  const s = ceskaSlova();
  if (!s) return t;
  return t.replace(/\p{L}{2,}/gu, (slovo) => {
    const male = slovo.toLocaleLowerCase("cs");
    const ceske = s.zname.has(male) ? null : s.podle.get(bezDiakritiky(slovo));
    if (!ceske) return slovo;
    if (slovo === slovo.toLocaleUpperCase("cs")) return ceske.toLocaleUpperCase("cs");
    return slovo[0] === slovo[0].toLocaleUpperCase("cs") ? ceske[0].toLocaleUpperCase("cs") + ceske.slice(1) : ceske;
  });
}

/** Řádky textu seřazené podle velikosti písma – název bývá na obálce největší. */
async function prectiText(soubor: File) {
  const platno = await naPlatno(soubor, 1600, 1200);
  const { data, width, height } = platno.getContext("2d")!.getImageData(0, 0, platno.width, platno.height);
  const radky = await ocrUloha({ sirka: width, vyska: height, data }, [data.buffer]);
  return radky
    .map((r, poradi) => ({ text: vycisti(opravCestinu(r.text)), surovy: opravCestinu(r.text), vyska: r.vyska, jistota: r.jistota, poradi }))
    .filter((r) => r.text.length >= 2 && r.jistota > 0.6 && (r.text.match(/\p{L}/gu)?.length ?? 0) >= r.text.length * 0.5)
    .sort((a, b) => b.vyska - a.vyska);
}

function ukazRadky(radky: { text: string }[]) {
  const kontejner = $("#ocr-radky");
  kontejner.replaceChildren(...radky.slice(0, 6).map((r) => {
    const radek = Object.assign(document.createElement("div"), { className: "ocr-radek" });
    const tlacitko = (popis: string, klic: "nazev" | "autor") =>
      Object.assign(document.createElement("button"), { type: "button", textContent: popis, onclick: () => ((pole(klic).value = r.text), aktualizujUpozorneni(), navigator.vibrate?.(15)) });
    radek.append(Object.assign(document.createElement("span"), { textContent: r.text }), tlacitko("Název", "nazev"), tlacitko("Autor", "autor"));
    return radek;
  }));
  kontejner.hidden = !radky.length;
}

// Modely (~25 MB, jen poprvé) se začnou stahovat už při klepnutí – než se vyfotí, bývají připravené.
$("#ocr-tl").addEventListener("click", () => {
  if (!ocr) ocrUloha({ jenPriprav: true }).catch(() => {});
  $<HTMLInputElement>("#ocr-vstup").click();
});

$<HTMLInputElement>("#ocr-vstup").addEventListener("change", async (e) => {
  const vstup = e.target as HTMLInputElement;
  const soubor = vstup.files?.[0];
  vstup.value = "";
  if (!soubor) return;
  const tl = $<HTMLButtonElement>("#ocr-tl");
  const stav = $("#ocr-stav");
  tl.disabled = true;
  ocrPrubeh = (t) => (stav.textContent = t);
  ocrPrubeh("Připravuji čtení textu…");
  // Fotka pro OCR se jen přečte – obálka se fotí zvlášť tlačítkem „Vyfotit obálku“.
  try {
    const radky = await prectiText(soubor);
    if (!radky.length) {
      stav.textContent = "Text se nepodařilo přečíst – zkuste ostřejší fotku zblízka";
      return;
    }
    // Název = největší text; když je na dvou řádcích stejně velkým písmem, spojí se v pořadí čtení.
    // Velká písmena se převádí až na celém názvu („BYLO NÁS“ + „PĚT“ → „Bylo nás pět“).
    const nejvetsi = radky[0].vyska;
    const nazev = vycisti(radky.filter((r) => r.vyska >= nejvetsi * 0.7).sort((a, b) => a.poradi - b.poradi).slice(0, 3).map((r) => r.surovy).join(" "));
    // OCR občas ztratí háčky – když stejný název (bez diakritiky) je v katalogu, vezme se odtud přesně.
    pole("nazev").value = katalog.find((k) => k.text === bezDiakritiky(nazev))?.nazev ?? nazev;
    aktualizujUpozorneni();
    ukazRadky(radky);
    stav.textContent = "Hotovo – zkontrolujte název, případně vyberte jiný řádek";
    navigator.vibrate?.([30, 40, 30]);
  } catch {
    stav.textContent = "Čtení textu se nepovedlo – zkontrolujte připojení a zkuste znovu";
  } finally {
    tl.disabled = false;
  }
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
  kamera.hidden = false;
  vrstvaOtevrena();
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
      // Stejná kniha znovu → v seznamu jen přibude kus.
      const stejna = (await vsechny()).find((s) => s.typ === "kod" && cislice(s.ean) === cislice(kod));
      return stejna
        ? otevriFormular({ ...stejna, kusu: stejna.kusu + 1 }, `Tuhle už v seznamu máte – přidán kus (teď ${stejna.kusu + 1} ks).`)
        : otevriFormular({ typ: "kod", ean: kod });
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
  if (kamera.hidden) return;
  kamera.hidden = true;
  vrstvaZavrena();
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

  if (navigator.canShare?.({ files: [zip] })) {
    try {
      await navigator.share({ files: [zip], title: nazev });
    } catch {
      return; // uživatel sdílení zrušil
    }
  } else {
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(zip), download: nazev }).click();
  }
  if (confirm(`Odesláno: ${knih(skeny.length)}.\n\nVymazat je z telefonu? (Zrušit = nechat, kdyby se přenos nepovedl.)`)) {
    await Promise.all(skeny.map((s) => smaz(s.id)));
    vykresli();
  }
});

/* ---------- start ---------- */

vykresli();
// Offline režim: service worker ukládá stránku a soubory pro práci bez signálu (včetně OCR po prvním použití).
navigator.serviceWorker?.register(document.body.dataset.sw!, { scope: document.body.dataset.scope }).catch(() => {});
