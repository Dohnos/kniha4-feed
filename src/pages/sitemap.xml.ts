import type { APIRoute } from "astro";
import { NA_STRANKU, knihy, vygenerovano } from "../lib/knihy";
import { absolutni, odkaz } from "../lib/web";

/** Mapa webu pro Google: úvod, všechny strany katalogu a stránka každé knihy. */
export const GET: APIRoute = ({ site }) => {
  const datum = vygenerovano.toISOString().slice(0, 10);
  const stran = Math.ceil(knihy.length / NA_STRANKU);

  const adresy = [
    odkaz(),
    odkaz("katalog"),
    ...Array.from({ length: stran - 1 }, (_, i) => odkaz(`katalog/${i + 2}`)),
    ...knihy.map((k) => odkaz(`kniha/${k.slug}`)),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    adresy.map((a) => `  <url><loc>${absolutni(a, site)}</loc><lastmod>${datum}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
