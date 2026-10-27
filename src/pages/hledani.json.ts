import type { APIRoute } from "astro";
import { knihy } from "../lib/knihy";

/**
 * Rejstřík pro hledání: [id, slug, název, autor, cena, rok, nakladatel + ISBN, fotka].
 * Pole místo objektů, ať je soubor co nejmenší – stahuje se až při prvním hledání.
 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(knihy.map((k) => [k.id, k.slug, k.nazev, k.autor, k.cena, k.rok, `${k.nakladatel} ${k.isbn}`.trim(), k.obrazek])), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
