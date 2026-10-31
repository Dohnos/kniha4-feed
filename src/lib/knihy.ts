/**
 * Data katalogu. `src/data/knihy.json` vytváří lokální aplikace Kniha4U při publikaci –
 * jsou to přesně knihy z XML feedu. Čte se jen při sestavení, do prohlížeče nejde.
 */

import data from "../data/knihy.json";

export type Kniha = {
  id: number;
  slug: string;
  nazev: string;
  /** Autoři oddělení čárkou. */
  autor: string;
  nakladatel: string;
  rok: string;
  vazba: string;
  stran: number | null;
  jazyk: string;
  /** Jen platné ISBN, číslice bez pomlček. */
  isbn: string;
  cena: number;
  kusu: number;
  /** Kde kniha leží (jen do e-mailu s objednávkou). */
  box?: string;
  popis: string;
  /** Vlastní fotka obálky, nebo "" – pak se kreslí typografická obálka. */
  obrazek: string;
  pridano: string;
  upraveno: string;
};

export const knihy = data.knihy as Kniha[];
export const vygenerovano = new Date(data.vygenerovano);
export const NA_STRANKU = 48;

export const autori = (k: Kniha) => k.autor.split(", ").filter(Boolean);

/** Adresa z textu: „Jaroslav Foglar“ → „jaroslav-foglar“. */
export const slug = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Nejnověji přidané (podle data přidání, pak podle ID). */
export const nejnovejsi = (pocet: number) =>
  [...knihy].sort((a, b) => b.pridano.localeCompare(a.pridano) || b.id - a.id).slice(0, pocet);

export const nejnizsiCena = () => Math.min(...knihy.map((k) => k.cena));

/* ---------- autoři a nakladatelství (vlastní stránka, když mají aspoň 2 knihy) ---------- */

export type Skupina = { jmeno: string; slug: string; knihy: Kniha[] };
export type Autor = Skupina;

function seskup(jmenaKnihy: (k: Kniha) => string[]): Skupina[] {
  const mapa = new Map<string, Skupina>();
  for (const k of knihy) {
    for (const jmeno of jmenaKnihy(k)) {
      const s = slug(jmeno);
      if (s) (mapa.get(s) ?? mapa.set(s, { jmeno, slug: s, knihy: [] }).get(s)!).knihy.push(k);
    }
  }
  return [...mapa.values()].filter((a) => a.knihy.length >= 2).sort((a, b) => a.jmeno.localeCompare(b.jmeno, "cs"));
}

export const autoriSeStrankou = seskup(autori);
export const nakladateleSeStrankou = seskup((k) => (k.nakladatel ? [k.nakladatel] : []));

const autorPodleSlugu = new Map(autoriSeStrankou.map((a) => [a.slug, a]));
const nakladatelPodleSlugu = new Map(nakladateleSeStrankou.map((a) => [a.slug, a]));
export const stranaAutora = (jmeno: string) => autorPodleSlugu.get(slug(jmeno));
export const stranaNakladatele = (jmeno: string) => nakladatelPodleSlugu.get(slug(jmeno));

/** Seznam všech nakladatelství (i s jednou knihou) – pro našeptávač ve filtru. */
export const vsichniNakladatele = [...new Set(knihy.map((k) => k.nakladatel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));

/* ---------- kolekce podle ceny a doby vydání ---------- */

export type Kolekce = { slug: string; nazev: string; popis: string; knihy: Kniha[] };

const CENY: [string, string, number, number][] = [
  ["do-50-kc", "Knihy do 50 Kč", 0, 50],
  ["50-az-100-kc", "Knihy za 51–100 Kč", 51, 100],
  ["100-az-300-kc", "Knihy za 101–300 Kč", 101, 300],
  ["nad-300-kc", "Knihy nad 300 Kč", 301, Number.POSITIVE_INFINITY],
];

export const kolekceCen: Kolekce[] = CENY.map(([s, nazev, od, po]) => ({
  slug: s,
  nazev,
  popis: `${nazev} z nabídky antikvariátu Kniha4U.`,
  knihy: knihy.filter((k) => k.cena >= od && k.cena <= po),
})).filter((k) => k.knihy.length);

const rokVydani = (k: Kniha) => Number(k.rok.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1] ?? 0);

export const kolekceObdobi: Kolekce[] = (() => {
  const skupiny = new Map<string, Kolekce>();
  for (const k of knihy) {
    const rok = rokVydani(k);
    if (!rok) continue;
    const dekada = Math.floor(rok / 10) * 10;
    const [s, nazev] = dekada < 1950 ? ["pred-1950", "Vydáno před rokem 1950"] : [`${dekada}-${dekada + 9}`, `Vydáno v letech ${dekada}–${dekada + 9}`];
    (skupiny.get(s) ?? skupiny.set(s, { slug: s, nazev, popis: `${nazev} – knihy z nabídky antikvariátu Kniha4U.`, knihy: [] }).get(s)!).knihy.push(k);
  }
  return [...skupiny.values()].sort((a, b) => (a.slug === "pred-1950" ? -1 : b.slug === "pred-1950" ? 1 : a.slug.localeCompare(b.slug)));
})();

/* ---------- tipy na další knihy ---------- */

/** Nejdřív další knihy stejného autora, pak sousedé v katalogu. */
export function podobne(k: Kniha, pocet = 8): { odAutora: Kniha[]; dalsi: Kniha[] } {
  const odAutora = autori(k)
    .flatMap((a) => stranaAutora(a)?.knihy ?? [])
    .filter((x, i, vse) => x.id !== k.id && vse.indexOf(x) === i)
    .slice(0, pocet);
  const i = knihy.indexOf(k);
  const dalsi = [...knihy.slice(i + 1), ...knihy.slice(0, i)].filter((x) => !odAutora.includes(x)).slice(0, pocet);
  return { odAutora, dalsi };
}
