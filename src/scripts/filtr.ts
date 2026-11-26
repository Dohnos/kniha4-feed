/**
 * Filtr knih (komponenta FiltrKnih.astro): hledání, cena, doba vydání, nakladatelství, autor, řazení.
 * Stav je v adrese (?q=…&cena=…&obdobi=…&nakladatel=…&autor=…&razeni=…), takže jde sdílet.
 * Výsledky se dočítají po 48 při scrollování. Nakladatelství a autor se vybírají v okně se seznamem.
 */

import { bezDiakritiky, hledej, nactiRejstrik, prvek, type Polozka } from "./rejstrik";
import { karta } from "./karta";

const NA_DAVKU = 48;
const POLE = ["q", "cena", "obdobi", "nakladatel", "autor", "razeni"] as const;
type Stav = Record<(typeof POLE)[number], string>;

const RAZENI: Record<string, (a: Polozka, b: Polozka) => number> = {
  "cena-": (a, b) => a.cena - b.cena,
  "cena+": (a, b) => b.cena - a.cena,
  "rok+": (a, b) => b.rok - a.rok,
  "rok-": (a, b) => (a.rok || 9999) - (b.rok || 9999),
  nazev: (a, b) => a.nazev.localeCompare(b.nazev, "cs"),
};
const POPIS_RAZENI: Record<string, string> = { "cena-": "nejlevnější", "cena+": "nejdražší", "rok+": "nejnovější", "rok-": "nejstarší", nazev: "A–Z" };

function vObdobi(p: Polozka, slug: string) {
  if (!slug) return true;
  if (!p.rok) return false;
  if (slug === "pred-1950") return p.rok < 1950;
  const od = Number(slug.slice(0, 4));
  return p.rok >= od && p.rok <= od + 9;
}

const autoriKnihy = (p: Polozka) => p.autor.split(", ").filter(Boolean);
const stejne = (a: string, b: string) => bezDiakritiky(a) === bezDiakritiky(b);

const pocet = (n: number) => `${new Intl.NumberFormat("cs-CZ").format(n)} ${n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih"}`;

for (const koren of document.querySelectorAll<HTMLElement>("[data-filtr]")) {
  const rezim = koren.dataset.filtr;
  const formular = koren.querySelector("form")!;
  const pole = (nazev: string) => formular.elements.namedItem(nazev) as HTMLInputElement | HTMLSelectElement;
  const vysledky = koren.querySelector<HTMLElement>("[data-vysledky]")!;
  const souhrn = koren.querySelector<HTMLElement>("[data-souhrn]")!;
  const prazdno = koren.querySelector<HTMLElement>("[data-prazdno]")!;
  const vymazat = koren.querySelector<HTMLButtonElement>("[data-vymazat]")!;
  const staticky = koren.dataset.staticky ? document.querySelector<HTMLElement>(koren.dataset.staticky) : null;
  const ceny: { slug: string; nazev: string; od: number; do: number }[] = JSON.parse(koren.dataset.ceny!);
  const stav: Stav = { q: "", cena: "", obdobi: "", nakladatel: "", autor: "", razeni: "" };

  let rejstrik: Polozka[] | null = null;
  let nalezene: Polozka[] = [];
  let zobrazeno = 0;

  const aktivni = () => POLE.some((k) => stav[k]);
  const cip = (skupina: string, hodnota: string) => {
    const rada = koren.querySelector<HTMLElement>(`[data-skupina="${skupina}"]`)!;
    rada.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === hodnota)));
    // Na mobilu je řada čipů posuvná – vybraný čip posunout do viditelné části.
    const vybrany = rada.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (vybrany) rada.scrollLeft = Math.max(0, vybrany.offsetLeft - rada.offsetLeft - 24);
  };

  function dalsiDavka() {
    vysledky.append(...nalezene.slice(zobrazeno, zobrazeno + NA_DAVKU).map((p) => karta(p, koren.dataset.knihy!)));
    zobrazeno = Math.min(nalezene.length, zobrazeno + NA_DAVKU);
  }

  /** Souhrn: počet + odebíratelné štítky aktivních filtrů. */
  function vykresliSouhrn() {
    const stitky: [keyof Stav, string][] = [];
    if (stav.q) stitky.push(["q", `„${stav.q}“`]);
    if (stav.cena) stitky.push(["cena", ceny.find((c) => c.slug === stav.cena)?.nazev ?? stav.cena]);
    if (stav.obdobi) stitky.push(["obdobi", koren.querySelector(`[data-skupina="obdobi"] button[value="${stav.obdobi}"]`)?.textContent ?? stav.obdobi]);
    if (stav.nakladatel) stitky.push(["nakladatel", stav.nakladatel]);
    if (stav.autor) stitky.push(["autor", stav.autor]);
    if (stav.razeni) stitky.push(["razeni", `řazení: ${POPIS_RAZENI[stav.razeni]}`]);

    souhrn.replaceChildren(prvek("strong", "", pocet(nalezene.length)));
    for (const [klic, text] of stitky) {
      const tl = prvek("button", "filtr-stitek", text);
      tl.type = "button";
      tl.setAttribute("aria-label", `Zrušit filtr ${text}`);
      tl.onclick = () => zmen(klic, "");
      souhrn.append(tl);
    }
    if (stitky.length > 1) {
      const vse = prvek("button", "filtr-zrusit", "Zrušit vše");
      vse.type = "button";
      vse.onclick = () => (POLE.forEach((k) => (stav[k] = "")), synchronizuj(), aktualizuj());
      souhrn.append(vse);
    }
  }

  async function aktualizuj() {
    const ukazat = rezim === "hledat" || aktivni();
    if (staticky) staticky.hidden = ukazat;
    souhrn.hidden = !ukazat;
    vymazat.hidden = !stav.q;
    if (!ukazat) {
      vysledky.replaceChildren();
      prazdno.hidden = true;
      history.replaceState(null, "", location.pathname);
      return;
    }

    if (!rejstrik) {
      souhrn.replaceChildren(prvek("strong", "", "Načítám nabídku…"));
      try {
        rejstrik = await nactiRejstrik(koren.dataset.zdroj!);
      } catch {
        souhrn.replaceChildren(prvek("strong", "", "Nabídku se nepodařilo načíst. Zkuste stránku obnovit."));
        return;
      }
    }

    nalezene = vyfiltruj();
    if (RAZENI[stav.razeni]) nalezene.sort(RAZENI[stav.razeni]);

    vysledky.replaceChildren();
    zobrazeno = 0;
    dalsiDavka();
    prazdno.hidden = nalezene.length > 0;
    vykresliSouhrn();

    const parametry = new URLSearchParams(POLE.filter((k) => stav[k]).map((k) => [k, stav[k]]));
    history.replaceState(null, "", parametry.size ? `?${parametry}` : location.pathname);
  }

  /** Knihy podle hledání a filtrů; `bez` = filtr, který se vynechá (počty ve výběru nakladatele / autora). */
  function vyfiltruj(bez?: "nakladatel" | "autor") {
    const cena = ceny.find((c) => c.slug === stav.cena);
    return hledej(rejstrik!, stav.q).filter((p) =>
      (!cena || (p.cena >= cena.od && p.cena <= cena.do)) &&
      vObdobi(p, stav.obdobi) &&
      (bez === "nakladatel" || !stav.nakladatel || stejne(p.nakladatel, stav.nakladatel)) &&
      (bez === "autor" || !stav.autor || autoriKnihy(p).some((a) => stejne(a, stav.autor))));
  }

  /** Stav → formulář (po změně z adresy nebo ze štítku v souhrnu). */
  function synchronizuj() {
    pole("q").value = stav.q;
    for (const v of koren.querySelectorAll<HTMLElement>("[data-vyber]")) {
      const hodnota = stav[v.dataset.vyber as "nakladatel" | "autor"];
      const text = v.querySelector<HTMLElement>("[data-vyber-text]")!;
      pole(v.dataset.vyber!).value = hodnota;
      text.textContent = hodnota || text.dataset.prazdny!;
      v.classList.toggle("vybrano", !!hodnota);
      v.querySelector<HTMLElement>("[data-vyber-zrusit]")!.hidden = !hodnota;
    }
    pole("razeni").value = stav.razeni;
    cip("cena", stav.cena);
    cip("obdobi", stav.obdobi);
  }

  function zmen(klic: keyof Stav, hodnota: string) {
    stav[klic] = hodnota;
    synchronizuj();
    aktualizuj();
  }

  let casovac: number | undefined;
  pole("q").addEventListener("input", (e) => {
    clearTimeout(casovac);
    casovac = window.setTimeout(() => ((stav.q = (e.target as HTMLInputElement).value), aktualizuj()), 160);
  });
  pole("razeni").addEventListener("change", (e) => zmen("razeni", (e.target as HTMLSelectElement).value));
  koren.querySelectorAll<HTMLElement>("[data-skupina]").forEach((skupina) =>
    skupina.addEventListener("click", (e) => {
      const tl = (e.target as HTMLElement).closest("button");
      if (!tl) return;
      const klic = skupina.dataset.skupina as "cena" | "obdobi";
      zmen(klic, tl.getAttribute("aria-pressed") === "true" ? "" : tl.value);
    }));
  vymazat.addEventListener("click", () => (zmen("q", ""), pole("q").focus()));

  /* ---------- okno výběru nakladatelství / autora ---------- */

  const okno = koren.querySelector<HTMLDialogElement>("[data-vyber-okno]")!;
  const hledatVe = okno.querySelector<HTMLInputElement>("[data-vyber-hledat]")!;
  const seznam = okno.querySelector<HTMLElement>("[data-vyber-seznam]")!;
  const info = okno.querySelector<HTMLElement>("[data-vyber-info]")!;
  const NAZVY = { nakladatel: ["Nakladatelství", "Všechna nakladatelství"], autor: ["Autor", "Všichni autoři"] } as const;
  const TVARY = { nakladatel: ["nakladatelství", "nakladatelství", "nakladatelství"], autor: ["autor", "autoři", "autorů"] } as const;
  const kolik = (n: number) => `${new Intl.NumberFormat("cs-CZ").format(n)} ${TVARY[vyberPole][n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2]}`;
  const NA_STRANKU_VYBERU = 60;
  let vyberPole: "nakladatel" | "autor" = "nakladatel";
  let moznosti: { nazev: string; pocet: number; hledany: string }[] = [];
  let vyberNalez: typeof moznosti = [];
  let vyberZobrazeno = 0;

  function polozkaVyberu(nazev: string, popis: string, hodnota: string) {
    const li = prvek("li");
    const tl = prvek("button", "vyber-polozka");
    tl.type = "button";
    tl.setAttribute("role", "option");
    tl.setAttribute("aria-selected", String(stejne(hodnota, stav[vyberPole])));
    tl.append(prvek("span", "", nazev), prvek("small", "", popis));
    tl.onclick = () => (okno.close(), zmen(vyberPole, hodnota));
    li.append(tl);
    return li;
  }
  function dalsiVyber() {
    seznam.append(...vyberNalez.slice(vyberZobrazeno, vyberZobrazeno + NA_STRANKU_VYBERU).map((m) => polozkaVyberu(m.nazev, pocet(m.pocet), m.nazev)));
    vyberZobrazeno = Math.min(vyberNalez.length, vyberZobrazeno + NA_STRANKU_VYBERU);
  }
  /** Seznam podle textu v hledání: nejdřív jména začínající dotazem, pak obsahující; bez dotazu podle počtu knih. */
  function vykresliVyber() {
    const q = bezDiakritiky(hledatVe.value.trim());
    vyberNalez = q
      ? moznosti.filter((m) => m.hledany.includes(q)).sort((a, b) => Number(!a.hledany.startsWith(q)) - Number(!b.hledany.startsWith(q)) || b.pocet - a.pocet)
      : moznosti;
    info.textContent = vyberNalez.length ? `${q ? "Nalezeno" : "Celkem"}: ${kolik(vyberNalez.length)}${q ? "" : " · řazeno podle počtu knih"}` : "Nic jsme nenašli – zkuste jiné slovo.";
    seznam.replaceChildren();
    if (stav[vyberPole] && !q) seznam.append(polozkaVyberu(NAZVY[vyberPole][1], "zrušit výběr", ""));
    vyberZobrazeno = 0;
    dalsiVyber();
    seznam.scrollTop = 0;
  }
  async function otevriVyber(co: "nakladatel" | "autor") {
    vyberPole = co;
    okno.querySelector("[data-vyber-nadpis]")!.textContent = NAZVY[co][0];
    hledatVe.placeholder = co === "autor" ? "Hledat autora – např. Dumas" : "Hledat nakladatelství – např. Albatros";
    hledatVe.value = "";
    seznam.replaceChildren();
    info.textContent = "Načítám nabídku…";
    okno.showModal();
    if (matchMedia("(hover: hover)").matches) hledatVe.focus(); // na telefonu hned neotvírat klávesnici
    try {
      rejstrik ??= await nactiRejstrik(koren.dataset.zdroj!);
    } catch {
      info.textContent = "Nabídku se nepodařilo načíst. Zkuste to prosím znovu.";
      return;
    }
    // Počty knih v rámci ostatních filtrů – nabízí se jen to, co opravdu něco najde. Stejné jméno v různém
    // zápisu („Mladá fronta“ / „Mladá Fronta“) je jedna položka s nejčastějším zápisem (filtr je porovnává stejně).
    const skupiny = new Map<string, { pocet: number; zapisy: Map<string, number> }>();
    for (const p of vyfiltruj(co)) {
      for (const jmeno of co === "autor" ? autoriKnihy(p) : [p.nakladatel]) {
        if (!jmeno) continue;
        const klic = bezDiakritiky(jmeno);
        const g = skupiny.get(klic) ?? skupiny.set(klic, { pocet: 0, zapisy: new Map() }).get(klic)!;
        g.pocet++;
        g.zapisy.set(jmeno, (g.zapisy.get(jmeno) ?? 0) + 1);
      }
    }
    moznosti = [...skupiny].map(([hledany, g]) => ({ nazev: [...g.zapisy].sort((a, b) => b[1] - a[1])[0][0], pocet: g.pocet, hledany }))
      .sort((a, b) => b.pocet - a.pocet || a.nazev.localeCompare(b.nazev, "cs"));
    vykresliVyber();
  }

  let casVyberu = 0;
  hledatVe.addEventListener("input", () => {
    cancelAnimationFrame(casVyberu);
    casVyberu = requestAnimationFrame(vykresliVyber);
  });
  hledatVe.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (e.preventDefault(), seznam.querySelector<HTMLButtonElement>(".vyber-polozka")?.click());
  });
  okno.querySelector("[data-vyber-zavrit]")!.addEventListener("click", () => okno.close());
  okno.addEventListener("click", (e) => e.target === okno && okno.close()); // klik vedle okna
  new IntersectionObserver(([z]) => z.isIntersecting && vyberZobrazeno < vyberNalez.length && dalsiVyber(), { root: okno, rootMargin: "400px" })
    .observe(okno.querySelector("[data-vyber-dalsi]")!);
  for (const v of koren.querySelectorAll<HTMLElement>("[data-vyber]")) {
    const co = v.dataset.vyber as "nakladatel" | "autor";
    v.querySelector(".filtr-vyber-tl")!.addEventListener("click", () => otevriVyber(co));
    v.querySelector("[data-vyber-zrusit]")!.addEventListener("click", () => zmen(co, ""));
  }
  // V katalogu se rejstřík začne stahovat už při kliknutí do pole – než uživatel dopíše, je tu.
  pole("q").addEventListener("focus", () => nactiRejstrik(koren.dataset.zdroj!).catch(() => {}), { once: true });

  new IntersectionObserver(([z]) => z.isIntersecting && zobrazeno < nalezene.length && dalsiDavka(), { rootMargin: "900px" })
    .observe(koren.querySelector("[data-dalsi]")!);

  const zAdresy = new URLSearchParams(location.search);
  for (const k of POLE) stav[k] = zAdresy.get(k) ?? "";
  synchronizuj();
  if (rezim === "hledat" || aktivni()) aktualizuj();
  if (rezim === "hledat" && !stav.q) (pole("q") as HTMLInputElement).focus();
}
