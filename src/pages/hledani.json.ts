import type { APIRoute } from "astro";
import { knihy } from "../lib/knihy";

/**
 * Rejstřík pro hledání a filtry: [id, slug, název, autor, cena, rok, nakladatel, isbn, fotka, box].
 * Pole místo objektů, ať je soubor co nejmenší – stahuje se až při prvním hledání.
 * Pozor: stejný formát čte i telefonní aplikace (`scripts/sken.ts`) a košík (kontrola, že kniha je pořád v nabídce).
 * Nové hodnoty jen přidávat na konec.
 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(knihy.map((k) => [k.id, k.slug, k.nazev, k.autor, k.cena, k.rok, k.nakladatel, k.isbn, k.obrazek, k.box ?? ""])), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
