/**
 * Filtr knih (komponenta FiltrKnih.astro): hledání, cena, doba vydání, nakladatelství, řazení.
 * Stav je v adrese (?q=…&cena=…&obdobi=…&nakladatel=…&razeni=…), takže jde sdílet.
 * Výsledky se dočítají po 48 při scrollování.
 */

import { bezDiakritiky, fotka, hledej, kc, nactiRejstrik, prvek, type Polozka } from "./rejstrik";

const NA_DAVKU = 48;
const POLE = ["q", "cena", "obdobi", "nakladatel", "razeni"] as const;
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

const pocet = (n: number) => `${new Intl.NumberFormat("cs-CZ").format(n)} ${n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih"}`;

/** Karta knihy – stejné značky jako KnihaKarta.astro. */
function karta(p: Polozka, knihy: string) {
  const a = prvek("a", "karta");
  a.href = `${knihy}${p.slug}/`;
  const obalka = prvek("div", `obalka v${p.id % 6}`);
  if (p.obrazek) {
    obalka.append(Object.assign(prvek("img"), { src: fotka(p.obrazek, "f_webp,q_auto,c_limit,w_400"), alt: `Obálka knihy ${p.nazev}`, loading: "lazy", width: 400, height: 600 }));
  } else {
    obalka.append(prvek("span", "obalka-znacka", "Kniha4U"), prvek("span", "obalka-linka"), prvek("p", "obalka-nazev", p.nazev));
    if (p.autor) obalka.append(prvek("span", "obalka-autor", p.autor));
  }
  const spodek = prvek("span", "karta-spodek");
  spodek.append(prvek("span", "karta-rok", p.rok ? String(p.rok) : ""), prvek("span", "cena", kc.format(p.cena)));
  const text = prvek("span", "karta-text");
  text.append(prvek("span", "karta-nazev", p.nazev), prvek("span", "karta-autor", p.autor || " "), spodek);
  a.append(obalka, text);
  return a;
}

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
  const stav: Stav = { q: "", cena: "", obdobi: "", nakladatel: "", razeni: "" };

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
      const datalist = koren.querySelector("datalist")!;
      datalist.replaceChildren(...[...new Set(rejstrik.map((p) => p.nakladatel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs")).map((n) => Object.assign(prvek("option"), { value: n })));
    }

    const cena = ceny.find((c) => c.slug === stav.cena);
    const nakladatel = bezDiakritiky(stav.nakladatel.trim());
    nalezene = hledej(rejstrik, stav.q).filter((p) =>
      (!cena || (p.cena >= cena.od && p.cena <= cena.do)) &&
      vObdobi(p, stav.obdobi) &&
      (!nakladatel || bezDiakritiky(p.nakladatel).includes(nakladatel)));
    if (RAZENI[stav.razeni]) nalezene.sort(RAZENI[stav.razeni]);

    vysledky.replaceChildren();
    zobrazeno = 0;
    dalsiDavka();
    prazdno.hidden = nalezene.length > 0;
    vykresliSouhrn();

    const parametry = new URLSearchParams(POLE.filter((k) => stav[k]).map((k) => [k, stav[k]]));
    history.replaceState(null, "", parametry.size ? `?${parametry}` : location.pathname);
  }

  /** Stav → formulář (po změně z adresy nebo ze štítku v souhrnu). */
  function synchronizuj() {
    pole("q").value = stav.q;
    pole("nakladatel").value = stav.nakladatel;
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
  for (const nazev of ["q", "nakladatel"] as const) {
    pole(nazev).addEventListener("input", (e) => {
      clearTimeout(casovac);
      casovac = window.setTimeout(() => ((stav[nazev] = (e.target as HTMLInputElement).value), aktualizuj()), 160);
    });
  }
  pole("razeni").addEventListener("change", (e) => zmen("razeni", (e.target as HTMLSelectElement).value));
  koren.querySelectorAll<HTMLElement>("[data-skupina]").forEach((skupina) =>
    skupina.addEventListener("click", (e) => {
      const tl = (e.target as HTMLElement).closest("button");
      if (!tl) return;
      const klic = skupina.dataset.skupina as "cena" | "obdobi";
      zmen(klic, tl.getAttribute("aria-pressed") === "true" ? "" : tl.value);
    }));
  vymazat.addEventListener("click", () => (zmen("q", ""), pole("q").focus()));
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
