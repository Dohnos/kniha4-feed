/**
 * Oblíbené knihy (wishlist): srdíčko data-oblibene na kartách a u knihy, počet v liště (data-oblibene-pocet),
 * stránka /oblibene/ (data-oblibene-stranka). Uloženo v prohlížeči (localStorage „oblibene“), sdílí se mezi záložkami.
 */
import { nactiRejstrik, type Polozka } from "./rejstrik";
import { karta } from "./karta";

type Kniha = { id: number; slug: string; nazev: string; autor: string; cena: number; obalka: string; box: string };
const KLIC = "oblibene";

function oblibene(): Kniha[] {
  try {
    const data = JSON.parse(localStorage.getItem(KLIC) ?? "[]");
    return Array.isArray(data) ? data.filter((k) => k && typeof k.id === "number") : [];
  } catch {
    return [];
  }
}
function uloz(knihy: Kniha[]) {
  try {
    localStorage.setItem(KLIC, JSON.stringify(knihy));
  } catch {
    // bez úložiště (anonymní režim) se oblíbené neuloží
  }
  stav();
}
const jeOblibena = (id: number, seznam = oblibene()) => seznam.some((k) => k.id === id);

/** Počty v liště a menu, stav srdíček na stránce. */
function stav() {
  const seznam = oblibene();
  for (const el of document.querySelectorAll<HTMLElement>("[data-oblibene-pocet]")) {
    const text = seznam.length ? String(seznam.length) : "";
    if (el.textContent !== text) el.textContent = text;
    el.hidden = !seznam.length;
  }
  for (const tl of document.querySelectorAll<HTMLElement>("[data-oblibene]")) {
    const je = jeOblibena(JSON.parse(tl.dataset.kniha!).id, seznam);
    if (tl.getAttribute("aria-pressed") !== String(je)) tl.setAttribute("aria-pressed", String(je));
    const text = tl.querySelector("span");
    const popis = je ? "Uloženo" : "Uložit";
    if (text && text.textContent !== popis) text.textContent = popis;
  }
}

document.addEventListener("click", (e) => {
  const tl = (e.target as HTMLElement).closest<HTMLElement>("[data-oblibene]");
  if (!tl) return;
  e.preventDefault();
  const k: Kniha = JSON.parse(tl.dataset.kniha!);
  const seznam = oblibene();
  const je = jeOblibena(k.id, seznam);
  uloz(je ? seznam.filter((x) => x.id !== k.id) : [k, ...seznam]);
  if (!je) {
    tl.classList.remove("srdce-pulz");
    void tl.offsetWidth; // restart animace
    tl.classList.add("srdce-pulz");
  }
  if (je && stranka) vykresliStranku(); // na stránce oblíbených kartu hned odebrat
});
window.addEventListener("storage", (e) => e.key === KLIC && (stav(), stranka && vykresliStranku()));
new MutationObserver(() => stav()).observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
stav();

/* ---------- stránka /oblibene/ ---------- */

const stranka = document.querySelector<HTMLElement>("[data-oblibene-stranka]");
let rejstrik: Map<number, Polozka> | null = null;

async function vykresliStranku() {
  if (!stranka) return;
  const mrizka = stranka.querySelector<HTMLElement>("[data-mrizka]")!;
  const info = stranka.querySelector<HTMLElement>("[data-info]")!;
  const prazdno = stranka.querySelector<HTMLElement>("[data-prazdno]")!;
  const vseDoKosiku = stranka.querySelector<HTMLButtonElement>("[data-vse-do-kosiku]");
  let seznam = oblibene();
  if (!rejstrik && seznam.length) {
    try {
      rejstrik = new Map((await nactiRejstrik(stranka.dataset.zdroj!)).map((p) => [p.id, p]));
    } catch {
      info.textContent = "Nabídku se nepodařilo načíst. Zkuste stránku obnovit.";
      info.hidden = false;
      return;
    }
  }
  // Prodané knihy (už nejsou v nabídce) z oblíbených zmizí – s upozorněním.
  const prodane = rejstrik ? seznam.filter((k) => !rejstrik!.has(k.id)) : [];
  if (prodane.length) {
    seznam = seznam.filter((k) => rejstrik!.has(k.id));
    uloz(seznam);
    info.textContent = `Už není v nabídce: ${prodane.map((k) => `„${k.nazev}“`).join(", ")} – odebrali jsme ${prodane.length === 1 ? "ji" : "je"} z oblíbených.`;
    info.hidden = false;
  }
  mrizka.replaceChildren(...seznam.map((k) => karta(rejstrik!.get(k.id)!, stranka.dataset.knihy!)));
  prazdno.hidden = seznam.length > 0;
  stranka.querySelector("[data-pocet]")!.textContent = seznam.length ? `${seznam.length} ${seznam.length === 1 ? "kniha" : seznam.length <= 4 ? "knihy" : "knih"} · ` : "";
  if (vseDoKosiku) vseDoKosiku.hidden = !seznam.length;
}

if (stranka) {
  vykresliStranku();
  // „Vše do košíku“ = kliknout na všechna tlačítka Koupit, která ještě nejsou v košíku.
  stranka.querySelector("[data-vse-do-kosiku]")?.addEventListener("click", () => {
    for (const tl of stranka.querySelectorAll<HTMLElement>("[data-mrizka] [data-do-kosiku]:not(.v-kosiku)")) tl.click();
    document.querySelector<HTMLElement>("[data-kosik-otevrit]")?.click();
  });
}
