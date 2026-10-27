import type { APIRoute } from "astro";
import { NA_STRANKU, autoriSeStrankou, knihy, kolekceCen, kolekceObdobi, vygenerovano } from "../lib/knihy";
import { absolutni, odkaz } from "../lib/web";

/** Mapa webu: úvod, katalog, kolekce (všechny strany), autoři a stránka každé knihy s datem poslední změny. */
export const GET: APIRoute = ({ site }) => {
  const dnes = vygenerovano.toISOString().slice(0, 10);
  const strany = (zaklad: string, pocet: number) =>
    Array.from({ length: Math.ceil(pocet / NA_STRANKU) }, (_, i) => odkaz(i === 0 ? zaklad : `${zaklad}/${i + 1}`));

  const adresy: [string, string][] = [
    ...[odkaz(), odkaz("autori")].map((a) => [a, dnes] as [string, string]),
    ...strany("katalog", knihy.length).map((a) => [a, dnes] as [string, string]),
    ...kolekceCen.flatMap((k) => strany(`cena/${k.slug}`, k.knihy.length)).map((a) => [a, dnes] as [string, string]),
    ...kolekceObdobi.flatMap((k) => strany(`vydani/${k.slug}`, k.knihy.length)).map((a) => [a, dnes] as [string, string]),
    ...autoriSeStrankou.map((a) => [odkaz(`autor/${a.slug}`), dnes] as [string, string]),
    ...knihy.map((k) => [odkaz(`kniha/${k.slug}`), k.upraveno.slice(0, 10)] as [string, string]),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    adresy.map(([a, datum]) => `  <url><loc>${absolutni(a, site)}</loc><lastmod>${datum}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
