/** Rejstřík knih pro hledání v prohlížeči (paleta, filtr v katalogu, /hledat/). Stahuje se jednou. */

export type Polozka = {
  id: number;
  slug: string;
  nazev: string;
  autor: string;
  cena: number;
  rok: number;
  nakladatel: string;
  obrazek: string;
  text: string;
};

export const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let nacitani: Promise<Polozka[]> | null = null;

export function nactiRejstrik(zdroj: string): Promise<Polozka[]> {
  nacitani ??= fetch(zdroj)
    .then((r) => r.json())
    // [id, slug, název, autor, cena, rok, nakladatel, isbn, fotka] – viz pages/hledani.json.ts
    .then((data: [number, string, string, string, number, string, string, string, string][]) =>
      data.map(([id, slug, nazev, autor, cena, rok, nakladatel, isbn, obrazek]) => ({
        id, slug, nazev, autor, cena, nakladatel, obrazek,
        rok: Number(rok.match(/\d{4}/)?.[0] ?? 0),
        text: bezDiakritiky(`${nazev} ${autor} ${rok} ${nakladatel} ${isbn}`),
      }))
    )
    .catch((chyba) => {
      nacitani = null;
      throw chyba;
    });
  return nacitani;
}

/** Všechna slova dotazu musí sedět; nejdřív knihy, jejichž název dotazem začíná. */
export function hledej(rejstrik: Polozka[], dotaz: string): Polozka[] {
  const q = bezDiakritiky(dotaz.trim());
  if (!q) return rejstrik;
  const slova = q.split(/\s+/);
  const skore = (p: Polozka) => {
    const n = bezDiakritiky(p.nazev);
    return n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2;
  };
  return rejstrik.filter((p) => slova.every((s) => p.text.includes(s))).sort((a, b) => skore(a) - skore(b));
}

export const kc = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });

/** Varianta fotky z Cloudinary (WebP, zmenšená); jiné adresy beze změny. */
export const fotka = (url: string, transformace: string) =>
  url.replace(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/, `$1${transformace}/`);

/** Bezpečné vytvoření prvku s textem. */
export function prvek<K extends keyof HTMLElementTagNameMap>(tag: K, trida = "", text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (trida) el.className = trida;
  if (text !== undefined) el.textContent = text;
  return el;
}
