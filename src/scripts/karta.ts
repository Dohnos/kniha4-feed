/**
 * Karta knihy skládaná v prohlížeči (filtr, hledání, oblíbené) – stejné značky jako components/KnihaKarta.astro.
 * Stav tlačítek „Koupit“ a srdíčka doplní scripts/objednavka.ts a scripts/oblibene.ts (hlídají nové karty).
 */
import { kc, prvek, type Polozka } from "./rejstrik";

// Stejné ikony jako <Ikona nazev="kosik" /> a <Ikona nazev="srdce" /> (Ikona.astro)
const svg = (cesta: string, velikost: number) =>
  `<svg class="ikona" width="${velikost}" height="${velikost}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cesta}</svg>`;
export const IKONA_KOSIK = svg('<path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>', 16);
export const IKONA_SRDCE = svg('<path d="M12 20.3s-7.6-4.6-9.4-9.6A5.1 5.1 0 0 1 12 6.1a5.1 5.1 0 0 1 9.4 4.6c-1.8 5-9.4 9.6-9.4 9.6Z"/>', 18);

/** Údaje pro košík a oblíbené (data-kniha) – stejný tvar jako doKosiku() v lib/knihy.ts. */
export const dataKnihy = (p: Polozka) =>
  JSON.stringify({ id: p.id, slug: p.slug, nazev: p.nazev, autor: p.autor, cena: p.cena, obalka: p.obrazek, box: p.box });

export function karta(p: Polozka, knihy: string) {
  // Košík je zapnutý, když je na stránce okno objednávky (components/Objednavka.astro).
  const sKosikem = !!document.getElementById("objednavka");
  const a = prvek("a", "karta-odkaz");
  a.href = `${knihy}${p.slug}/`;
  const obalka = prvek("div", `obalka v${p.id % 6}`);
  if (p.obrazek) {
    obalka.append(Object.assign(prvek("img"), { src: p.obrazek, alt: `Obálka knihy ${p.nazev}`, loading: "lazy", width: 400, height: 600 }));
  } else {
    obalka.append(prvek("span", "obalka-znacka", "Kniha4U"), prvek("span", "obalka-linka"), prvek("p", "obalka-nazev", p.nazev));
    if (p.autor) obalka.append(prvek("span", "obalka-autor", p.autor));
  }
  const text = prvek("span", "karta-text");
  text.append(prvek("span", "karta-nazev", p.nazev), prvek("span", "karta-autor", p.autor || " "), prvek("span", "karta-rok", p.rok ? String(p.rok) : " "));
  a.append(obalka, text);

  const srdce = prvek("button", "karta-srdce");
  srdce.type = "button";
  srdce.dataset.oblibene = "";
  srdce.dataset.kniha = dataKnihy(p);
  srdce.setAttribute("aria-label", `Uložit do oblíbených: ${p.nazev}`);
  srdce.innerHTML = IKONA_SRDCE;

  const spodek = prvek("div", "karta-spodek");
  spodek.append(prvek("span", "cena", kc.format(p.cena)));
  if (sKosikem) {
    const tl = prvek("button", "karta-koupit");
    tl.type = "button";
    tl.dataset.doKosiku = "";
    tl.dataset.kniha = dataKnihy(p);
    tl.setAttribute("aria-label", `Koupit: ${p.nazev}`);
    tl.innerHTML = IKONA_KOSIK;
    tl.append(prvek("span", "", "Koupit"));
    spodek.append(tl);
  }
  const karta = prvek("article", "karta");
  karta.append(a, srdce, spodek);
  return karta;
}
