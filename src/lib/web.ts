/** Pomocné funkce pro odkazy a formátování. */

export const NAZEV_WEBU = "Kniha4U";
export const POPIS_WEBU =
  "Antikvariát Kniha4U – tisíce knih skladem. Romány, historie, odborná literatura i sběratelské kousky za příznivé ceny.";

/**
 * Odkaz uvnitř webu s ohledem na `base` (dnes /kniha4-feed/, po přechodu na doménu /).
 * Vždy s lomítkem na konci, protože stránky jsou složky (`trailingSlash: "always"`).
 */
export function odkaz(cesta = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const cista = cesta.replace(/^\/+|\/+$/g, "");
  return cista === "" ? `${base}/` : `${base}/${cista}/`;
}

/** Odkaz na soubor (bez lomítka na konci), např. `zbozi.xml`. */
export function soubor(cesta: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/${cesta.replace(/^\/+/, "")}`;
}

/** Absolutní adresa – kanonické odkazy, sitemap, strukturovaná data. */
export function absolutni(cesta: string, site: URL | undefined): string {
  return new URL(cesta, site).toString();
}

const kc = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });

export function formatCena(cena: number): string {
  return kc.format(cena);
}

export function formatPocet(n: number): string {
  return new Intl.NumberFormat("cs-CZ").format(n);
}

/** 1 kniha, 2 knihy, 5 knih. */
export function pocetKnih(n: number): string {
  const slovo = n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih";
  return `${formatPocet(n)} ${slovo}`;
}

/** Zkrácený text pro meta description. */
export function zkratit(text: string, max = 158): string {
  const cisty = text.replace(/\s+/g, " ").trim();
  if (cisty.length <= max) return cisty;
  const rez = cisty.slice(0, max);
  const mezera = rez.lastIndexOf(" ");
  return (mezera > 60 ? rez.slice(0, mezera) : rez) + "…";
}
