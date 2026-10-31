import type { APIRoute } from "astro";
import { absolutni, soubor } from "../lib/web";

/** robots.txt v kořeni domény (kniha4u.cz/robots.txt) – vyhledávače z něj najdou i mapu webu. */
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absolutni(soubor("sitemap.xml"), site)}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
