/** Odkazy, formátování a nastavení webu. */

import nastaveni from "../../web.config.json";

export const NAZEV_WEBU = "Kniha4U";
export const POPIS_WEBU =
  "Antikvariát Kniha4U – tisíce knih skladem. Romány, historie, odborná literatura i sběratelské kousky za příznivé ceny.";

/** Kontakt z `web.config.json`. Když je prázdný, tlačítko „Mám zájem“ se nezobrazuje. */
export const KONTAKT: { email?: string; telefon?: string } = (nastaveni as { kontakt?: object }).kontakt ?? {};

/** Provozovatel e-shopu (obchodní podmínky, ochrana údajů, patička, e-maily). Prázdné údaje se nevypisují. */
export const PROVOZOVATEL: { jmeno: string; ico: string; adresa: string; platceDph: boolean } = {
  jmeno: "", ico: "", adresa: "", platceDph: false,
  ...(nastaveni as { provozovatel?: object }).provozovatel,
};
/** „Jan Novák, IČO 12345678, Ulice 1, 110 00 Praha“ – jen vyplněné části. */
export const identitaProvozovatele = () =>
  [PROVOZOVATEL.jmeno || NAZEV_WEBU, PROVOZOVATEL.ico && `IČO ${PROVOZOVATEL.ico}`, PROVOZOVATEL.adresa].filter(Boolean).join(", ");

/** Číslo účtu „[předčíslí-]číslo/kód banky“ → IBAN (CZ, kontrolní číslice mod 97). Neplatné → "". */
export function ucetNaIban(ucet: string): string {
  const m = ucet.replace(/\s/g, "").match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return "";
  const bban = m[3] + (m[1] ?? "").padStart(6, "0") + m[2].padStart(10, "0");
  const kontrola = 98n - (BigInt(`${bban}123500`) % 97n); // „CZ00“ → C=12, Z=35, 00
  return `CZ${String(kontrola).padStart(2, "0")}${bban}`;
}

type Objednavky = {
  emailjs: { publicKey: string; serviceId: string; templateId: string };
  ucet: string;
  doprava: Record<string, number>;
  dobirka: number;
};
const objednavky = (nastaveni as { objednavky?: Objednavky }).objednavky;

/**
 * Objednávky z webu (formulář „Mám zájem“): EmailJS, účet pro platbu předem a ceny dopravy.
 * Aktivní, jen když je vyplněno EmailJS i platné číslo účtu – jinak tlačítko otevře e-mail.
 */
export const OBJEDNAVKY = objednavky && {
  ...objednavky,
  iban: ucetNaIban(objednavky.ucet),
  email: KONTAKT.email ?? "",
  aktivni: Boolean(objednavky.emailjs.publicKey && objednavky.emailjs.serviceId && objednavky.emailjs.templateId && ucetNaIban(objednavky.ucet)),
};

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
