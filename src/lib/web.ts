/** Odkazy, formátování a nastavení webu. */

import nastaveni from "../../web.config.json";

export const NAZEV_WEBU = "Kniha4U";
export const POPIS_WEBU =
  "Antikvariát Kniha4U – tisíce knih skladem. Romány, historie, odborná literatura i sběratelské kousky za příznivé ceny.";

/** Kontakt z `web.config.json`. Když je prázdný, tlačítko „Mám zájem“ se nezobrazuje. */
export const KONTAKT: { email?: string; telefon?: string } = (nastaveni as { kontakt?: object }).kontakt ?? {};

const base = () => import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Odkaz uvnitř webu, vždy s lomítkem na konci (stránky jsou složky). */
export function odkaz(cesta = ""): string {
  const cista = cesta.replace(/^\/+|\/+$/g, "");
  return cista ? `${base()}/${cista}/` : `${base()}/`;
}

/** Odkaz na soubor (bez lomítka na konci), např. `zbozi.xml`. */
export const soubor = (cesta: string) => `${base()}/${cesta.replace(/^\/+/, "")}`;

export const absolutni = (cesta: string, site: URL | undefined) => new URL(cesta, site).toString();

const kc = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
export const formatCena = (cena: number) => kc.format(cena);
export const formatPocet = (n: number) => new Intl.NumberFormat("cs-CZ").format(n);

/** 1 kniha, 2 knihy, 5 knih. */
export function pocetKnih(n: number): string {
  return `${formatPocet(n)} ${n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih"}`;
}

/** Zkrácený text pro meta description. */
export function zkratit(text: string, max = 158): string {
  const cisty = text.replace(/\s+/g, " ").trim();
  if (cisty.length <= max) return cisty;
  const rez = cisty.slice(0, max);
  const mezera = rez.lastIndexOf(" ");
  return (mezera > 60 ? rez.slice(0, mezera) : rez) + "…";
}
