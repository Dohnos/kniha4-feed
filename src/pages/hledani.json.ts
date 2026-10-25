import type { APIRoute } from "astro";
import { autor, knihy } from "../lib/knihy";

/**
 * Rejstřík pro našeptávač: [slug, název, autor, cena, rok, nakladatel + ISBN].
 * Pole místo objektů, ať je soubor co nejmenší – stahuje se až při kliknutí do hledání.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      knihy.map((k) => [k.slug, k.nazev, autor(k), k.cena, k.rok, `${k.nakladatel} ${k.isbn}`.trim()])
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
