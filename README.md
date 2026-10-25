# Kniha4U – XML feed pro Zboží.cz

Adresa feedu: **https://dohnos.github.io/kniha4-feed/zbozi.xml**

Testovací feed (prvních 20 knih): **https://dohnos.github.io/kniha4-feed/zbozitest.xml**

Soubor `zbozi.xml` se negeneruje ručně. Vytváří ho skript v aplikaci:

```
cd "Kniha4u - App"
npm run feed
```

Celé to (vytvoření feedu i nahrání sem) dělá dvojklik na `Kniha4U\Aktualizovat feed.cmd`.

- `.nojekyll` – GitHub Pages soubory jen servíruje, nic nepřekládá
