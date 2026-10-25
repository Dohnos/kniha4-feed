/**
 * Data knih pro web. `src/data/knihy.json` generuje `npm run feed` v aplikaci Kniha4u –
 * jsou to přesně ty knihy, které jsou v XML feedu, ve stejném pořadí.
 *
 * JSON se čte jen při sestavení webu, do prohlížeče se nic z toho neposílá.
 */

import data from "../data/knihy.json";

export type Kniha = {
  id: number;
  slug: string;
  nazev: string;
  autori: string[];
  nakladatel: string;
  rok: string;
  vazba: string;
  stran: number | null;
  jazyk: string;
  /** Jen platné ISBN, číslice bez pomlček. */
  isbn: string;
  cena: number;
  /** Vlastní popis knihy, nebo prázdný řetězec. */
  popis: string;
  /** Vlastní fotka obálky, nebo prázdný řetězec – pak se kreslí typografická obálka. */
  obrazek: string;
};

export const knihy: Kniha[] = data.knihy as Kniha[];
export const vygenerovano = new Date(data.vygenerovano);

export const NA_STRANKU = 48;

export function autor(k: Kniha): string {
  return k.autori.join(", ");
}

/** Sousedé v katalogu – tipy na další knihy v detailu. */
export function podobne(k: Kniha, pocet = 4): Kniha[] {
  const i = knihy.indexOf(k);
  return [...knihy.slice(i + 1, i + 1 + pocet), ...knihy.slice(Math.max(0, i - pocet), i)].slice(0, pocet);
}

export function nejnizsiCena(): number {
  return knihy.reduce((min, k) => Math.min(min, k.cena), Number.POSITIVE_INFINITY);
}
