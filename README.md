# Kniha4U – web a XML feed pro Zboží.cz

- Web: **https://dohnos.github.io/kniha4-feed/**
- Feed: **https://dohnos.github.io/kniha4-feed/zbozi.xml**
- Testovací feed (prvních 20 knih): **https://dohnos.github.io/kniha4-feed/zbozitest.xml**

Statický web v [Astro](https://astro.build): úvod, katalog po 48 knihách a vlastní stránka
pro každou knihu (schema.org `Book` + `Offer`, sitemap.xml). Po každém nahrání ho sestaví
GitHub Actions (`.github/workflows/web.yml`) a zveřejní na GitHub Pages.

## Data

Nic tady se needituje ručně. Feed i data webu vytváří aplikace Kniha4u:

```
cd "Kniha4u - App"
npm run feed
```

| Soubor | Co to je |
| --- | --- |
| `public/zbozi.xml` | feed pro Zboží.cz |
| `public/zbozitest.xml` | prvních 20 knih z feedu na zkoušku |
| `src/data/knihy.json` | stejné knihy jako ve feedu – z nich se staví stránky |

Celé to (vytvoření feedu i nahrání sem) dělá dvojklik na `Kniha4U\Aktualizovat feed.cmd`.

## Vlastní doména

1. V `web.config.json` nastavit `{ "site": "https://kniha4u.cz", "base": "/" }`.
2. Přidat soubor `public/CNAME` s textem `kniha4u.cz`.
3. Spustit `npm run feed` (odkazy ve feedu se přepíšou na novou adresu) a nahrát.
4. V GitHubu Settings → Pages → Custom domain zadat doménu, u registrátora nastavit DNS.

## Vývoj

```
npm install
npm run dev       # http://localhost:4321/kniha4-feed/
npm run build     # sestaví web do dist/
```
