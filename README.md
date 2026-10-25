# Kniha4U – XML feed pro Zboží.cz

Adresa feedu: **https://feed.kniha4u.cz/zbozi.xml**

Soubor `zbozi.xml` se negeneruje ručně. Vytváří ho skript v aplikaci:

```
cd "Kniha4u - App"
npm run feed
```

Pak se nový `zbozi.xml` nahraje sem do repozitáře (GitHub → Add file → Upload files).

- `CNAME` – vlastní doména pro GitHub Pages
- `.nojekyll` – GitHub Pages soubory jen servíruje, nic nepřekládá
