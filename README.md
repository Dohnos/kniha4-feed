# Kniha4U – veřejný katalog a XML feed

- Web: **https://dohnos.github.io/kniha4-feed/**
- Feed pro Zboží.cz: **https://dohnos.github.io/kniha4-feed/zbozi.xml**
- Testovací feed (prvních 20 knih): **https://dohnos.github.io/kniha4-feed/zbozitest.xml**

Statický web v [Astro](https://astro.build). Po každém nahrání ho GitHub Actions
(`.github/workflows/web.yml`) sestaví a zveřejní na GitHub Pages.

## Odkud jsou data

Nic tady se needituje ručně. Knihy se spravují v lokální aplikaci Kniha4U
(evidence `data/knihy.db`), tlačítko **Publikovat** vytvoří tyhle soubory a nahraje je sem:

| Soubor | Co to je |
| --- | --- |
| `public/zbozi.xml` | feed pro Zboží.cz |
| `public/zbozitest.xml` | prvních 20 knih z feedu na zkoušku |
| `src/data/knihy.json` | knihy z feedu – z nich se staví všechny stránky |

## Stránky

| Adresa | Obsah |
| --- | --- |
| `/` | úvod: vějíř obálek, novinky, ceny, období, autoři |
| `/katalog/`, `/katalog/2/` … | celý katalog po 48 knihách |
| `/kniha/<slug>/` | detail knihy (schema.org Book + Offer) |
| `/cena/<rozsah>/`, `/vydani/<období>/` | kolekce podle ceny a doby vydání (stránkované) |
| `/autori/`, `/autor/<slug>/` | rejstřík a stránky autorů s ≥ 2 knihami |
| `/hledat/?q=…` | rozšířené hledání s filtry (v prohlížeči, noindex) |
| `/sitemap.xml`, `/robots.txt`, `/hledani.json` | SEO a rejstřík pro hledání |

## Vlastní doména

1. V `web.config.json` nastavit `"site": "https://kniha4u.cz"` a `"base": "/"`.
2. Přidat soubor `public/CNAME` s textem `kniha4u.cz`.
3. V aplikaci kliknout na Publikovat (odkazy ve feedu se přepíšou na novou adresu).
4. GitHub → Settings → Pages → Custom domain; u registrátora nastavit DNS.

Kontakt pro tlačítko „Mám zájem“ u knihy: `web.config.json` → `kontakt.email` / `kontakt.telefon`
(dokud je prázdný, tlačítko se nezobrazuje).

## Vývoj

```
npm install
npm run dev       # http://localhost:4321/kniha4-feed/
npm run build     # sestaví web do dist/
```
