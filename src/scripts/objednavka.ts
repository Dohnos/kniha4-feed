/**
 * Nákupní košík a objednávka více knih najednou.
 * Košík je v localStorage („kosik“), sdílí se mezi záložkami. Knihy přidávají tlačítka data-do-kosiku.
 * Doprava = výdejní místo z mapy Zaslat (app.zaslat.cz) za celou objednávku, platba předem (QR Platba,
 * VS = číslo objednávky) nebo na dobírku. Odeslání přes EmailJS REST API: e-mail obchodu (s tlačítkem
 * „Potvrdit objednávku“ = předvyplněný e-mail zákazníkovi) a potvrzení o přijetí zákazníkovi.
 */

type Nastaveni = {
  publicKey: string; serviceId: string; templateId: string;
  iban: string; ucet: string; doprava: Record<string, number>; dobirka: number; email: string;
  podminky: string; ochrana: string; web: string; knihy: string; rejstrik: string; prodavajici: string;
};
type Kniha = { id: number; slug: string; nazev: string; autor: string; cena: number; obalka: string; box: string };
type Misto = { id: number; name: string; street: string; city: string; zip: string; is_locker?: number; is_post_office?: number; carriers: Record<string, { code: string }> };

const okno = document.querySelector<HTMLDialogElement>("#objednavka");
const DOPRAVCI: Record<string, string> = { zasilkovna: "Zásilkovna", balikovna: "Balíkovna", ppl: "PPL", dpd: "DPD", gls: "GLS" };

if (okno) {
  const nastaveni: Nastaveni = JSON.parse(okno.dataset.nastaveni || "null");
  const $ = <T extends HTMLElement>(vyber: string) => okno.querySelector<T>(vyber)!;
  const formular = $<HTMLFormElement>("#obj-formular");
  const pole = (nazev: string) => formular.elements.namedItem(nazev) as HTMLInputElement;
  const kc = (n: number) => `${n.toLocaleString("cs-CZ")} Kč`;
  const html = (t: string) => t.replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]!);
  const knih = (n: number) => `${n} ${n === 1 ? "kniha" : n >= 2 && n <= 4 ? "knihy" : "knih"}`;
  const adresa = (k: Kniha) => `${nastaveni.knihy}${k.slug}/`;

  // Zkušební účet (kód banky 0000 neexistuje – platba nikam neodejde): zákazník dostane upozornění.
  const zkusebniUcet = nastaveni.ucet.trim().endsWith("/0000");
  const UPOZORNENI = "Číslo účtu je zatím zkušební – prosím neplaťte, platební údaje vám pošleme e-mailem.";

  /* ---------- košík ---------- */

  const KLIC = "kosik";
  function kosik(): Kniha[] {
    try {
      const data = JSON.parse(localStorage.getItem(KLIC) ?? "[]");
      return Array.isArray(data) ? data.filter((k) => k && typeof k.id === "number") : [];
    } catch {
      return [];
    }
  }
  function ulozKosik(knihy: Kniha[]) {
    try {
      localStorage.setItem(KLIC, JSON.stringify(knihy));
    } catch {
      // bez úložiště košík vydrží jen do obnovení stránky
      pametKosik = knihy;
    }
    stavStranky();
  }
  let pametKosik: Kniha[] | null = null;
  const polozky = () => pametKosik ?? kosik();
  const vKosiku = (id: number) => polozky().some((k) => k.id === id);

  /** Počet v liště a stav tlačítek „Koupit“ / „Do košíku“ na stránce. */
  function stavStranky() {
    const pocet = polozky().length;
    for (const el of document.querySelectorAll<HTMLElement>("[data-kosik-pocet]")) {
      el.textContent = String(pocet);
      el.hidden = !pocet;
    }
    for (const tl of document.querySelectorAll<HTMLButtonElement>("[data-do-kosiku]")) {
      const id = JSON.parse(tl.dataset.kniha!).id as number;
      const je = vKosiku(id);
      const text = tl.querySelector("span");
      tl.dataset.puvodni ??= text?.textContent ?? "";
      const popis = je ? "V košíku" : tl.dataset.puvodni;
      // Měnit jen při změně – jinak by hlídač karet níže reagoval sám na sebe.
      if (tl.classList.contains("v-kosiku") !== je) tl.classList.toggle("v-kosiku", je);
      if (text && text.textContent !== popis) text.textContent = popis;
    }
  }
  window.addEventListener("storage", (e) => e.key === KLIC && (stavStranky(), okno.open && vykresliKosik()));
  // Karty dočítané do katalogu za běhu (scripts/filtr.ts) – stav tlačítek doplnit i jim.
  new MutationObserver(() => stavStranky()).observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
  stavStranky();

  let casToastu: ReturnType<typeof setTimeout>;
  function toast(text: string) {
    const el = document.getElementById("kosik-toast")!;
    document.getElementById("kosik-toast-text")!.textContent = text;
    el.hidden = false;
    clearTimeout(casToastu);
    casToastu = setTimeout(() => (el.hidden = true), 4500);
  }

  function pridej(k: Kniha) {
    if (!vKosiku(k.id)) ulozKosik([...polozky(), k]);
    toast(`„${k.nazev}“ je v košíku`);
  }
  function odeber(id: number) {
    ulozKosik(polozky().filter((k) => k.id !== id));
    vykresliKosik();
  }

  /**
   * Kontrola proti aktuální nabídce (hledani.json): prodané knihy z košíku zmizí, změněná cena se opraví.
   * Rejstřík: [id, slug, název, autor, cena, rok, nakladatel, isbn, fotka, box].
   */
  let nabidka: Promise<Map<number, (string | number)[]>> | null = null;
  async function zkontrolujNabidku() {
    nabidka ??= fetch(nastaveni.rejstrik).then((r) => r.json()).then((data: (string | number)[][]) => new Map(data.map((z) => [z[0] as number, z])));
    let mapa: Map<number, (string | number)[]>;
    try {
      mapa = await nabidka;
    } catch {
      nabidka = null;
      return; // bez kontroly – objednávku stejně potvrzujeme ručně
    }
    const zpravy: string[] = [];
    const nove = polozky().flatMap((k) => {
      const z = mapa.get(k.id);
      if (!z) return zpravy.push(`„${k.nazev}“ už není v nabídce – odebrali jsme ji z košíku.`), [];
      if (z[4] !== k.cena) zpravy.push(`U knihy „${k.nazev}“ se změnila cena na ${kc(z[4] as number)}.`);
      return [{ ...k, cena: z[4] as number, box: String(z[9] ?? k.box) }];
    });
    if (JSON.stringify(nove) !== JSON.stringify(polozky())) ulozKosik(nove);
    $("#obj-zmeny").textContent = zpravy.join(" ");
    $("#obj-zmeny").hidden = !zpravy.length;
    vykresliKosik();
  }

  function vykresliKosik() {
    const knihy = polozky();
    $("#obj-nadpis").textContent = knihy.length ? `Košík (${knihy.length})` : "Košík";
    $("#obj-prazdny").hidden = knihy.length > 0;
    $("#obj-pokladna").hidden = !knihy.length;
    $("#obj-polozky").replaceChildren(...knihy.map((k) => {
      const li = document.createElement("li");
      li.className = "obj-kniha";
      const obr = k.obalka
        ? Object.assign(document.createElement("img"), { src: k.obalka, alt: "", loading: "lazy" })
        : Object.assign(document.createElement("span"), { className: `mini-obalka v${k.id % 6}`, textContent: k.nazev.charAt(0) });
      const text = document.createElement("div");
      const nazev = Object.assign(document.createElement("a"), { href: adresa(k), textContent: k.nazev });
      text.append(nazev, Object.assign(document.createElement("span"), { textContent: k.autor }));
      const cena = Object.assign(document.createElement("b"), { textContent: kc(k.cena) });
      const pryc = Object.assign(document.createElement("button"), { type: "button", className: "obj-odebrat", textContent: "×", title: "Odebrat z košíku" });
      pryc.setAttribute("aria-label", `Odebrat z košíku: ${k.nazev}`);
      pryc.addEventListener("click", () => odeber(k.id));
      li.append(obr, text, cena, pryc);
      return li;
    }));
    souhrn();
  }

  /* ---------- doprava, platba, souhrn ---------- */

  let misto: Misto | null = null;
  const dopravce = () => $<HTMLSelectElement>("#obj-dopravce").value;
  const platba = () => (formular.elements.namedItem("platba") as RadioNodeList).value as "predem" | "dobirka";
  const cenaKnih = () => polozky().reduce((s, k) => s + k.cena, 0);
  const cenaDopravy = () => (misto ? nastaveni.doprava[dopravce()] ?? 0 : 0);
  const celkem = () => cenaKnih() + cenaDopravy() + (platba() === "dobirka" ? nastaveni.dobirka : 0);

  /** „Zásilkovna – výdejní místo, Míni market, Petrohradská 403/50, 10100 Praha (kód 32596)“ */
  const popisMista = () =>
    misto ? `${DOPRAVCI[dopravce()]} – ${misto.is_locker ? "výdejní box" : misto.is_post_office ? "pošta" : "výdejní místo"}, ${misto.name}, ${misto.street}, ${misto.zip} ${misto.city} (kód ${misto.carriers[dopravce()].code})` : "";

  function souhrn() {
    const radky: [string, string][] = [[knih(polozky().length), kc(cenaKnih())]];
    radky.push(["Doprava", misto ? kc(cenaDopravy()) : "vyberte výdejní místo"]);
    if (platba() === "dobirka" && nastaveni.dobirka) radky.push(["Dobírka", kc(nastaveni.dobirka)]);
    radky.push(["Celkem", kc(celkem())]);
    $("#obj-souhrn").replaceChildren(...radky.flatMap(([a, b]) => [Object.assign(document.createElement("dt"), { textContent: a }), Object.assign(document.createElement("dd"), { textContent: b })]));
  }

  function ukazMisto() {
    $("#obj-misto").hidden = !misto;
    $("#obj-misto").textContent = popisMista();
    $("#obj-mapa span").textContent = misto ? "Změnit výdejní místo" : "Vybrat výdejní místo na mapě";
    souhrn();
  }

  /* ---------- mapa výdejních míst Zaslat (načte se až při prvním otevření) ---------- */

  type Zslt = { openMap(volby: object): Promise<Misto> };
  let mapa: Promise<Zslt> | null = null;
  function nactiMapu() {
    mapa ??= new Promise((hotovo, chyba) => {
      const okno_ = window as unknown as { zslt: Zslt };
      okno_.zslt ??= {} as Zslt;
      const skript = Object.assign(document.createElement("script"), { id: "zaslat-map", async: true, src: "https://app.zaslat.cz/map/zaslat-map.umd.min.js" });
      skript.onload = () => hotovo(okno_.zslt);
      skript.onerror = () => ((mapa = null), chyba(new Error("Mapu se nepodařilo načíst")));
      document.head.append(skript);
    });
    return mapa;
  }

  /**
   * Okno objednávky je „top layer“ – mapa by byla pod ním, proto se na dobu výběru zavře. Zpět se otevře,
   * jakmile mapa ze stránky zmizí (výběrem, křížkem, Esc…) – zavření bez výběru knihovna jinak nehlásí.
   */
  function schovejNaDobuMapy() {
    okno.close("mapa");
    let videna = false;
    const vratit = () => {
      hlidac.disconnect();
      clearTimeout(pojistka);
      if (!okno.open) okno.showModal();
    };
    const hlidac = new MutationObserver(() => {
      const je = !!document.querySelector("#parcel-point-map-component");
      if (je) videna = true;
      else if (videna) vratit();
    });
    hlidac.observe(document.body, { childList: true, subtree: true });
    const pojistka = setTimeout(() => !videna && vratit(), 6000); // mapa se vůbec neukázala
  }

  function vybranoMisto(vybrane: Misto | null) {
    const naMiste = Object.keys(vybrane?.carriers ?? {}).filter((d) => d in nastaveni.doprava);
    if (!okno.open) okno.showModal(); // výběrem se mapa zavřela
    if (!vybrane || !naMiste.length) return;
    misto = vybrane;
    $<HTMLSelectElement>("#obj-dopravce").replaceChildren(...naMiste.map((d) => new Option(`${DOPRAVCI[d]} (${kc(nastaveni.doprava[d])})`, d)));
    $("#obj-dopravce-pole").hidden = naMiste.length < 2;
    ukazMisto();
    chyba("");
  }

  $("#obj-mapa").addEventListener("click", async () => {
    const tl = $<HTMLButtonElement>("#obj-mapa");
    let zslt: Zslt;
    tl.disabled = true;
    try {
      zslt = await nactiMapu();
    } catch {
      return chyba("Mapu výdejních míst se nepodařilo načíst – zkontrolujte připojení a zkuste to znovu.");
    } finally {
      tl.disabled = false;
    }
    const dopravci = Object.keys(nastaveni.doprava);
    schovejNaDobuMapy();
    zslt
      .openMap({
        addressType: "recipient",
        territory: "cz",
        carriers: dopravci,
        lang: "cz",
        prices: Object.fromEntries(dopravci.map((d) => [d, kc(nastaveni.doprava[d])])),
        style: { colorPrimary: "#0c0c0c" },
        value: misto?.id ?? null,
      })
      .then(vybranoMisto, () => {});
  });

  $("#obj-dopravce").addEventListener("change", ukazMisto);
  formular.addEventListener("change", (e) => (e.target as HTMLInputElement).name === "platba" && souhrn());

  /* ---------- otevření a zavření ---------- */

  const ZAPAMATOVAT = ["jmeno", "email", "telefon"];
  let vyplneno = false;
  function otevri() {
    if (!vyplneno) {
      // Kontakt z minulé objednávky; zbytek formuláře zůstává, i když okno mezitím zavřete.
      try {
        const ulozene = JSON.parse(localStorage.getItem("objednavka-kontakt") ?? "{}");
        for (const k of ZAPAMATOVAT) if (ulozene[k] && !pole(k).value) pole(k).value = ulozene[k];
      } catch {
        // bez úložiště se kontakt vyplní ručně
      }
      $("#obj-dobirka-popis").textContent = `Zaplatíte při převzetí${nastaveni.dobirka ? ` (+ ${kc(nastaveni.dobirka)})` : ""}.`;
      vyplneno = true;
    }
    formular.hidden = false;
    $("#obj-hotovo").hidden = true;
    chyba("");
    vykresliKosik();
    ukazMisto();
    if (!okno.open) okno.showModal();
    zkontrolujNabidku();
  }

  function chyba(text: string) {
    $("#obj-chyba").textContent = text;
    $("#obj-chyba").hidden = !text;
  }

  document.addEventListener("click", (e) => {
    const cil = e.target as HTMLElement;
    const tl = cil.closest<HTMLElement>("[data-do-kosiku]");
    if (tl) {
      e.preventDefault();
      const k: Kniha = JSON.parse(tl.dataset.kniha!);
      return vKosiku(k.id) ? otevri() : pridej(k); // podruhé tlačítko „V košíku“ otevře košík
    }
    if (cil.closest("[data-kosik-otevrit]")) {
      document.getElementById("kosik-toast")!.hidden = true;
      return otevri();
    }
    if (cil.closest("[data-obj-zavrit]")) okno.close();
  });
  okno.addEventListener("click", (e) => e.target === okno && okno.close()); // klik vedle okna

  /* ---------- číslo objednávky a QR Platba (SPAYD) ---------- */

  /** Číslo objednávky = variabilní symbol: RRMMDDhhmm (10 číslic, čas odeslání). */
  const noveCislo = () => {
    const d = new Date();
    return [d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, "0")).join("");
  };
  const zprava = (cislo: string) => `Kniha4U objednavka ${cislo}`;
  const spayd = (castka: number, cislo: string) => `SPD*1.0*ACC:${nastaveni.iban}*AM:${castka.toFixed(2)}*CC:CZK*X-VS:${cislo}*MSG:${zprava(cislo)}`;
  const qrObrazek = (castka: number, cislo: string) =>
    `https://api.paylibo.com/paylibo/generator/image?${new URLSearchParams({ iban: nastaveni.iban, amount: castka.toFixed(2), currency: "CZK", vs: cislo, message: zprava(cislo), size: "220" })}`;

  /* ---------- e-maily ---------- */

  /*
   * E-maily ve stylu webu: krémové pozadí, bílá karta se zakulacenými rohy, nadpisy patkovým písmem,
   * černá „pilulková“ tlačítka. Tabulky a styly přímo v prvcích – tak to zobrazí všechny poštovní programy.
   */
  const BARVY = { pozadi: "#f5f4f0", plocha: "#ffffff", panel: "#f5f4f0", linka: "#dfded8", text: "#0c0c0c", slaby: "#67665f", pozor: "#fff1c2", pozorText: "#5c4300" };
  const PISMO = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const NADPIS = "Georgia,'Times New Roman',serif";

  const tlacitko = (href: string, text: string, plne = true) =>
    `<a href="${html(href)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 26px;border-radius:999px;border:2px solid ${BARVY.text};background:${plne ? BARVY.text : "transparent"};color:${plne ? "#fafaf7" : BARVY.text};font-weight:700;font-size:15px;text-decoration:none">${text}</a>`;
  const radek = (popis: string, hodnota: string, posledni = false) =>
    `<tr><td style="padding:10px 0;${posledni ? "" : `border-bottom:1px solid ${BARVY.linka};`}color:${BARVY.slaby};font-size:14px;vertical-align:top;width:42%">${popis}</td>
     <td style="padding:10px 0;${posledni ? "" : `border-bottom:1px solid ${BARVY.linka};`}font-size:15px;vertical-align:top">${hodnota}</td></tr>`;
  const panel = (obsah: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BARVY.panel};border-radius:18px"><tr><td style="padding:6px 20px">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${obsah}</table></td></tr></table>`;

  /** Karta knihy: obálka + název, autor, kód (a u obchodu box). */
  const kartaKnihy = (k: Kniha, sBoxem: boolean) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BARVY.linka};border-radius:18px;margin-bottom:10px"><tr>
      ${k.obalka ? `<td style="padding:14px 0 14px 14px;width:56px"><img src="${html(k.obalka)}" width="56" alt="" style="display:block;width:56px;border-radius:8px"></td>` : ""}
      <td style="padding:14px 16px">
        <a href="${html(adresa(k))}" style="color:${BARVY.text};font-family:${NADPIS};font-size:18px;font-weight:600;text-decoration:none">${html(k.nazev)}</a>
        ${k.autor ? `<div style="color:${BARVY.slaby};font-size:14px;margin-top:2px">${html(k.autor)}</div>` : ""}
        <div style="color:${BARVY.slaby};font-size:13px;margin-top:6px">Kód knihy ${k.id}${sBoxem ? ` · <b style="color:${BARVY.text}">${html(k.box || "bez boxu")}</b>` : ""}</div>
      </td>
      <td style="padding:14px 16px 14px 0;text-align:right;font-weight:700;font-size:16px;white-space:nowrap">${kc(k.cena)}</td>
    </tr></table>`;

  /** Obal e-mailu: logo, karta s obsahem, patička s prodávajícím a odkazy na podmínky. */
  const obalEmailu = (obsah: string, paticka: string) =>
    `<div style="margin:0;padding:24px 12px;background:${BARVY.pozadi};font-family:${PISMO};color:${BARVY.text};line-height:1.55">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">
        <tr><td style="padding:4px 8px 18px"><a href="${html(nastaveni.web)}" style="color:${BARVY.text};font-family:${NADPIS};font-size:26px;font-weight:600;text-decoration:none">Kniha4U</a>
          <span style="color:${BARVY.slaby};font-size:13px;margin-left:6px">antikvariát</span></td></tr>
        <tr><td style="background:${BARVY.plocha};border:1px solid ${BARVY.linka};border-radius:28px;padding:30px 28px">${obsah}</td></tr>
        <tr><td style="padding:20px 12px;color:${BARVY.slaby};font-size:12px;line-height:1.6;text-align:center">${paticka}</td></tr>
      </table>
    </div>`;

  type Objednavka = { cislo: string; knihy: Kniha[]; castka: number; predem: boolean; misto: string; doprava: number; z: Record<"jmeno" | "email" | "telefon" | "poznamka", string> };

  /** Text e-mailu, kterým obchod objednávku potvrdí (tlačítko „Potvrdit objednávku“ = mailto zákazníkovi). */
  function textPotvrzeni(o: Objednavka) {
    return [
      "Dobrý den,",
      "",
      `potvrzujeme Vaši objednávku č. ${o.cislo} z kniha4u.cz:`,
      ...o.knihy.map((k) => `- ${k.nazev}${k.autor ? ` (${k.autor})` : ""} – ${kc(k.cena)}`),
      `Doprava: ${o.misto} – ${kc(o.doprava)}`,
      ...(!o.predem && nastaveni.dobirka ? [`Dobírka: ${kc(nastaveni.dobirka)}`] : []),
      `Celkem: ${kc(o.castka)}`,
      "",
      o.predem
        ? `Prosíme o platbu ${kc(o.castka)} na účet ${nastaveni.ucet}, variabilní symbol ${o.cislo}. Knihy odešleme do 3 pracovních dnů od připsání platby.`
        : `Knihy odešleme do 3 pracovních dnů, ${kc(o.castka)} zaplatíte při převzetí zásilky.`,
      "",
      "Děkujeme a přejeme příjemné čtení,",
      "Kniha4U",
    ].join("\n");
  }

  function obsahEmailu(pro: "obchod" | "zakaznik", o: Objednavka) {
    const { z } = o;
    const zpusob = o.predem ? `Platba PŘEDEM převodem (VS ${o.cislo})` : `Platba na DOBÍRKU${nastaveni.dobirka ? ` (+ ${kc(nastaveni.dobirka)})` : ""}`;
    const kontakt = `${html(z.jmeno)}<br>${html(z.telefon)}<br><a href="mailto:${html(z.email)}" style="color:${BARVY.text}">${html(z.email)}</a>`;
    const poznamka = z.poznamka ? html(z.poznamka).replace(/\n/g, "<br>") : "";
    const pravni = `${html(nastaveni.prodavajici)} · <a href="mailto:${html(nastaveni.email)}" style="color:${BARVY.slaby}">${html(nastaveni.email)}</a><br>
      <a href="${html(nastaveni.podminky)}" style="color:${BARVY.slaby}">Obchodní podmínky</a> ·
      <a href="${html(nastaveni.podminky)}#odstoupeni" style="color:${BARVY.slaby}">Odstoupení od smlouvy</a> ·
      <a href="${html(nastaveni.ochrana)}" style="color:${BARVY.slaby}">Ochrana osobních údajů</a>`;
    const dopravaRadek = radek("Doprava", `${html(o.misto)}<br><span style="color:${BARVY.slaby}">${kc(o.doprava)}</span>`);

    if (pro === "obchod") {
      // Kde knihy najít – hned pod nadpisem, každá na svém řádku: „BOX111 | Vyšší život“
      const umisteni = o.knihy.map((k) => html(`${k.box || "bez boxu"} | ${k.nazev}`)).join("<br>");
      const potvrdit = `mailto:${z.email}?subject=${encodeURIComponent(`Potvrzení objednávky č. ${o.cislo} – Kniha4U`)}&body=${encodeURIComponent(textPotvrzeni(o))}`;
      return obalEmailu(
        `<div style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BARVY.panel};font-size:13px;font-weight:700;letter-spacing:.02em">Nová objednávka z webu kniha4u.cz · č. ${o.cislo}</div>
         <div style="margin:14px 0 20px;padding:16px 20px;border-radius:18px;background:${BARVY.text};color:#fafaf7;font-size:19px;font-weight:700;line-height:1.5">${umisteni}</div>
         ${o.knihy.map((k) => kartaKnihy(k, true)).join("")}
         <div style="height:8px"></div>
         ${panel(
           radek("Celková cena objednávky", `<b style="font-size:17px">${o.castka},- Kč</b> <span style="color:${BARVY.slaby}">(${knih(o.knihy.length)})</span>`) +
           dopravaRadek +
           radek("Zvolený způsob platby", zpusob) +
           radek("Fakturační adresa", kontakt, !poznamka) +
           (poznamka ? radek("Poznámka", poznamka, true) : ""),
         )}
         <div style="margin-top:24px">
           ${tlacitko(potvrdit, "Potvrdit objednávku")}
           ${tlacitko(`mailto:${z.email}?subject=${encodeURIComponent(`Objednávka č. ${o.cislo} – Kniha4U`)}`, "Odpovědět zákazníkovi", false)}
         </div>
         <p style="margin:6px 0 0;color:${BARVY.slaby};font-size:13px">„Potvrdit objednávku“ otevře předvyplněný e-mail zákazníkovi – zkontrolujte ho a odešlete.</p>`,
        pravni,
      );
    }

    const cekejte = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${BARVY.pozor};border-radius:18px"><tr>
        <td style="padding:18px 20px;color:${BARVY.pozorText}">
          <div style="font-size:19px;font-weight:800;margin-bottom:4px">⏳ Počkejte prosím na potvrzení objednávky</div>
          <div style="font-size:15px">Ověříme, že jsou knihy skladem, a objednávku vám potvrdíme dalším e-mailem.${o.predem ? " <b>Platbu prosím pošlete až po našem potvrzení.</b>" : ""}</div>
        </td></tr></table>`;
    const platbaBlok = o.predem
      ? `<h2 style="margin:28px 0 12px;font-family:${NADPIS};font-size:22px;font-weight:600">Platba předem – až po potvrzení</h2>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BARVY.panel};border-radius:18px"><tr>
           <td style="padding:18px;width:200px;vertical-align:top"><img src="${qrObrazek(o.castka, o.cislo)}" width="180" height="180" alt="QR kód pro platbu" style="display:block;border-radius:12px;background:#fff;padding:8px"></td>
           <td style="padding:18px 18px 18px 0;vertical-align:top;font-size:15px">
             <div style="color:${BARVY.slaby};font-size:13px">Částka</div><div style="font-weight:700;font-size:18px;margin-bottom:8px">${kc(o.castka)}</div>
             <div style="color:${BARVY.slaby};font-size:13px">Číslo účtu</div><div style="font-weight:700;margin-bottom:8px">${html(nastaveni.ucet)}</div>
             <div style="color:${BARVY.slaby};font-size:13px">Variabilní symbol</div><div style="font-weight:700">${o.cislo}</div>
           </td></tr></table>
         <p style="margin:10px 0 0;color:${BARVY.slaby};font-size:14px">QR kód naskenujte v aplikaci banky, až objednávku potvrdíme. Knihy odešleme po připsání platby.</p>
         ${zkusebniUcet ? `<p style="margin:10px 0 0;padding:12px 16px;border-radius:14px;background:#fdecea;color:#b42318;font-weight:700">${UPOZORNENI}</p>` : ""}`
      : `<p style="margin:24px 0 0;padding:14px 18px;border-radius:18px;background:${BARVY.panel}">Platíte <b>na dobírku ${kc(o.castka)}</b> při převzetí zásilky.</p>`;

    return obalEmailu(
      `<h1 style="margin:0 0 8px;font-family:${NADPIS};font-size:30px;font-weight:600;line-height:1.2">Děkujeme za objednávku</h1>
       <p style="margin:0 0 18px;color:${BARVY.slaby}">Dobrý den, ${html(z.jmeno)}, objednávku č. <b style="color:${BARVY.text}">${o.cislo}</b> jsme přijali. Kupní smlouva vzniká naším potvrzením, nejpozději odesláním knih.</p>
       ${cekejte}
       ${o.knihy.map((k) => kartaKnihy(k, false)).join("")}
       <div style="height:8px"></div>
       ${panel(
         radek(knih(o.knihy.length), kc(o.knihy.reduce((s, k) => s + k.cena, 0))) +
         dopravaRadek +
         (!o.predem && nastaveni.dobirka ? radek("Dobírka", kc(nastaveni.dobirka)) : "") +
         radek("Platba", o.predem ? "Předem převodem" : "Na dobírku") +
         radek("Kontakt", kontakt, !poznamka) +
         (poznamka ? radek("Poznámka", poznamka, true) : ""),
       )}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
         <td style="font-size:16px;font-weight:700">Celkem</td><td style="text-align:right;font-size:22px;font-weight:700">${kc(o.castka)}</td></tr></table>
       ${platbaBlok}
       <p style="margin:26px 0 0;font-size:14px;color:${BARVY.slaby}">Jako spotřebitel můžete od smlouvy odstoupit bez udání důvodu do 14 dnů od převzetí – postup a formulář najdete v <a href="${html(nastaveni.podminky)}#odstoupeni" style="color:${BARVY.text}">obchodních podmínkách</a>. S dotazy stačí odpovědět na tento e-mail.</p>`,
      pravni,
    );
  }

  async function posli(parametry: Record<string, string>) {
    const odpoved = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: nastaveni.serviceId, template_id: nastaveni.templateId, user_id: nastaveni.publicKey, template_params: parametry }),
    });
    if (!odpoved.ok) throw new Error(await odpoved.text());
  }

  /* ---------- odeslání ---------- */

  formular.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pole("web").value) return; // robot vyplnil past
    const email = pole("email").value.trim();
    if (!polozky().length) return chyba("Košík je prázdný.");
    if (!pole("jmeno").value.trim()) return chyba("Vyplňte jméno a příjmení."), pole("jmeno").focus();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return chyba("Zkontrolujte e-mail."), pole("email").focus();
    if (pole("telefon").value.replace(/\D/g, "").length < 9) return chyba("Zkontrolujte telefon (aspoň 9 číslic)."), pole("telefon").focus();
    if (!misto) return chyba("Vyberte výdejní místo na mapě.");
    if (!pole("souhlas").checked) return chyba("Pro odeslání potvrďte souhlas s obchodními podmínkami."), pole("souhlas").focus();
    chyba("");

    const o: Objednavka = {
      cislo: noveCislo(),
      knihy: polozky(),
      castka: celkem(),
      predem: platba() === "predem",
      misto: popisMista(),
      doprava: cenaDopravy(),
      z: { jmeno: pole("jmeno").value.trim(), email, telefon: pole("telefon").value.trim(), poznamka: pole("poznamka").value.trim() },
    };
    const tl = $<HTMLButtonElement>("#obj-odeslat");
    tl.disabled = true;
    $("#obj-odeslat span").textContent = "Odesílám…";
    const nazvy = o.knihy.length === 1 ? o.knihy[0].nazev : knih(o.knihy.length);
    try {
      await posli({ to_email: nastaveni.email, reply_to: email, from_name: o.z.jmeno, predmet: `Objednávka č. ${o.cislo}: ${nazvy} – ${o.z.jmeno}`, obsah: obsahEmailu("obchod", o) });
      let potvrzeni = true;
      try {
        await posli({ to_email: email, reply_to: nastaveni.email, from_name: "Kniha4U", predmet: `Přijali jsme objednávku č. ${o.cislo} – Kniha4U`, obsah: obsahEmailu("zakaznik", o) });
      } catch {
        potvrzeni = false; // objednávka u nás je – jen potvrzení zákazníkovi nedošlo
      }
      try {
        localStorage.setItem("objednavka-kontakt", JSON.stringify(Object.fromEntries(ZAPAMATOVAT.map((k) => [k, pole(k).value.trim()]))));
      } catch {
        // nevadí
      }
      ulozKosik([]);
      hotovo(o, potvrzeni);
    } catch {
      chyba(`Objednávku se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám napište na ${nastaveni.email}.`);
    } finally {
      tl.disabled = false;
      $("#obj-odeslat span").textContent = "Objednat s povinností platby";
    }
  });

  async function hotovo(o: Objednavka, potvrzeni: boolean) {
    formular.reset();
    misto = null;
    vyplneno = false;
    formular.hidden = true;
    $("#obj-hotovo").hidden = false;
    $("#obj-hotovo-text").textContent = potvrzeni
      ? `Objednávka č. ${o.cislo} (${knih(o.knihy.length)}) je u nás. Shrnutí jsme poslali na ${o.z.email}.`
      : `Objednávka č. ${o.cislo} je u nás, shrnutí na ${o.z.email} se ale nepodařilo odeslat – ozveme se vám.`;
    $("#obj-cekejte-platba").hidden = !o.predem;
    $("#obj-platba").hidden = !o.predem;
    $("#obj-zkusebni").hidden = !(o.predem && zkusebniUcet);
    if (o.predem) {
      $("#obj-platba-udaje").replaceChildren(
        ...[["Částka", kc(o.castka)], ["Účet", nastaveni.ucet], ["Variabilní symbol", o.cislo]].flatMap(([a, b]) => [
          Object.assign(document.createElement("dt"), { textContent: a }),
          Object.assign(document.createElement("dd"), { textContent: b }),
        ]),
      );
      // Knihovna pro QR kód se stahuje až tady – na ostatních stránkách by zbytečně zdržovala.
      const { default: qrcode } = await import("qrcode-generator");
      const qr = qrcode(0, "M");
      qr.addData(spayd(o.castka, o.cislo));
      qr.make();
      $("#obj-qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    }
  }
}
