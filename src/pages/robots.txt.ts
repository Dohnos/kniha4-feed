import type { APIRoute } from "astro";
import { absolutni, soubor } from "../lib/web";

/**
 * Pozor: Google čte robots.txt jen z kořene domény. Na dohnos.github.io/kniha4-feed/ ho
 * tedy nenajde – začne platit až po přechodu na vlastní doménu. Sitemapu jde mezitím
 * přidat ručně v Google Search Console.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absolutni(soubor("sitemap.xml"), site)}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
