/**
 * Objednávka knihy z webu (okno „Mám zájem“).
 * Doprava = výdejní místo z mapy Zaslat (app.zaslat.cz), platba předem (QR Platba, VS = kód knihy)
 * nebo na dobírku. Odeslání přes EmailJS REST API: e-mail obchodu (odpověď jde zákazníkovi)
 * a potvrzení zákazníkovi (u platby předem s QR kódem jako obrázkem z api.paylibo.com).
 */
import qrcode from "qrcode-generator";

type Nastaveni = {
  publicKey: string; serviceId: string; templateId: string;
  iban: string; ucet: string; doprava: Record<string, number>; dobirka: number; email: string;
  podminky: string; ochrana: string; web: string; prodavajici: string;
};
type Kniha = { id: number; nazev: string; autor: string; cena: number; url: string; obalka: string; box: string };
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

  // Zkušební účet (kód banky 0000 neexistuje – platba nikam neodejde): zákazník dostane upozornění.
  const zkusebniUcet = nastaveni.ucet.trim().endsWith("/0000");
  const UPOZORNENI = "Číslo účtu je zatím zkušební – prosím neplaťte, platební údaje vám pošleme e-mailem.";

  let kniha: Kniha;
  let misto: Misto | null = null;

  const dopravce = () => $<HTMLSelectElement>("#obj-dopravce").value;
  const platba = () => (formular.elements.namedItem("platba") as RadioNodeList).value as "predem" | "dobirka";
  const cenaDopravy = () => (misto ? nastaveni.doprava[dopravce()] ?? 0 : 0);
  const celkem = () => kniha.cena + cenaDopravy() + (platba() === "dobirka" ? nastaveni.dobirka : 0);

  /** „Zásilkovna – výdejní místo, Míni market, Petrohradská 403/50, 10100 Praha (kód 32596)“ */
  const popisMista = () =>
    misto ? `${DOPRAVCI[dopravce()]} – ${misto.is_locker ? "výdejní box" : misto.is_post_office ? "pošta" : "výdejní místo"}, ${misto.name}, ${misto.street}, ${misto.zip} ${misto.city} (kód ${misto.carriers[dopravce()].code})` : "";

  function souhrn() {
    const radky: [string, string][] = [[kniha.nazev, kc(kniha.cena)]];
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
  function otevri(k: Kniha) {
    kniha = k;
    misto = null;
    formular.reset();
    try {
      const ulozene = JSON.parse(localStorage.getItem("objednavka-kontakt") ?? "{}");
      for (const k of ZAPAMATOVAT) if (ulozene[k]) pole(k).value = ulozene[k];
    } catch {
      // bez úložiště se kontakt vyplní ručně
    }
    $("#obj-kniha-nazev").textContent = k.nazev;
    $("#obj-kniha-autor").textContent = k.autor;
    $("#obj-kniha-cena").textContent = kc(k.cena);
    Object.assign($<HTMLImageElement>("#obj-obalka"), { src: k.obalka, hidden: !k.obalka });
    $("#obj-dobirka-popis").textContent = `Zaplatíte při převzetí${nastaveni.dobirka ? ` (+ ${kc(nastaveni.dobirka)})` : ""}.`;
    $("#obj-dopravce-pole").hidden = true;
    formular.hidden = false;
    $("#obj-hotovo").hidden = true;
    chyba("");
    ukazMisto();
    okno.showModal();
  }

  function chyba(text: string) {
    $("#obj-chyba").textContent = text;
    $("#obj-chyba").hidden = !text;
  }

  document.addEventListener("click", (e) => {
    const tl = (e.target as HTMLElement).closest<HTMLElement>("[data-objednat]");
    if (tl) otevri(JSON.parse(tl.dataset.kniha!));
    if ((e.target as HTMLElement).closest("[data-obj-zavrit]")) okno.close();
  });
  okno.addEventListener("click", (e) => e.target === okno && okno.close()); // klik vedle okna

  /* ---------- QR Platba (SPAYD) ---------- */

  const zprava = () => `Kniha4U ${kniha.id}`;
  const spayd = (castka: number) => `SPD*1.0*ACC:${nastaveni.iban}*AM:${castka.toFixed(2)}*CC:CZK*X-VS:${kniha.id}*MSG:${zprava()}`;
  const qrObrazek = (castka: number) =>
    `https://api.paylibo.com/paylibo/generator/image?${new URLSearchParams({ iban: nastaveni.iban, amount: castka.toFixed(2), currency: "CZK", vs: String(kniha.id), message: zprava(), size: "220" })}`;

  /* ---------- e-maily ---------- */

  /*
   * E-maily ve stylu webu: krémové pozadí, bílá karta se zakulacenými rohy, nadpisy patkovým písmem,
   * černá „pilulková“ tlačítka. Tabulky a styly přímo v prvcích – tak to zobrazí všechny poštovní programy.
   */
  const BARVY = { pozadi: "#f5f4f0", plocha: "#ffffff", panel: "#f5f4f0", linka: "#dfded8", text: "#0c0c0c", slaby: "#67665f" };
  const PISMO = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const NADPIS = "Georgia,'Times New Roman',serif";

  const tlacitko = (href: string, text: string) =>
    `<a href="${html(href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${BARVY.text};color:#fafaf7;font-weight:700;font-size:15px;text-decoration:none">${text}</a>`;
  const radek = (popis: string, hodnota: string, posledni = false) =>
    `<tr><td style="padding:10px 0;${posledni ? "" : `border-bottom:1px solid ${BARVY.linka};`}color:${BARVY.slaby};font-size:14px;vertical-align:top;width:42%">${popis}</td>
     <td style="padding:10px 0;${posledni ? "" : `border-bottom:1px solid ${BARVY.linka};`}font-size:15px;vertical-align:top">${hodnota}</td></tr>`;
  const panel = (obsah: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BARVY.panel};border-radius:18px"><tr><td style="padding:6px 20px">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${obsah}</table></td></tr></table>`;

  /** Karta knihy: obálka + název, autor, kód. */
  const kartaKnihy = () =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BARVY.linka};border-radius:18px"><tr>
      ${kniha.obalka ? `<td style="padding:14px 0 14px 14px;width:64px"><img src="${html(kniha.obalka)}" width="64" alt="" style="display:block;width:64px;border-radius:8px"></td>` : ""}
      <td style="padding:14px 16px">
        <a href="${html(kniha.url)}" style="color:${BARVY.text};font-family:${NADPIS};font-size:19px;font-weight:600;text-decoration:none">${html(kniha.nazev)}</a>
        ${kniha.autor ? `<div style="color:${BARVY.slaby};font-size:14px;margin-top:2px">${html(kniha.autor)}</div>` : ""}
        <div style="color:${BARVY.slaby};font-size:13px;margin-top:6px">Kód knihy ${kniha.id}</div>
      </td>
      <td style="padding:14px 16px 14px 0;text-align:right;font-weight:700;font-size:16px;white-space:nowrap">${kc(kniha.cena)}</td>
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

  function obsahEmailu(pro: "obchod" | "zakaznik") {
    const z = { jmeno: pole("jmeno").value.trim(), email: pole("email").value.trim(), telefon: pole("telefon").value.trim(), poznamka: pole("poznamka").value.trim() };
    const castka = celkem();
    const predem = platba() === "predem";
    const zpusob = predem ? `Platba PŘEDEM převodem (VS ${kniha.id})` : `Platba na DOBÍRKU${nastaveni.dobirka ? ` (+ ${kc(nastaveni.dobirka)})` : ""}`;
    const kontakt = `${html(z.jmeno)}<br>${html(z.telefon)}<br><a href="mailto:${html(z.email)}" style="color:${BARVY.text}">${html(z.email)}</a>`;
    const poznamka = z.poznamka ? html(z.poznamka).replace(/\n/g, "<br>") : "";
    const pravni = `${html(nastaveni.prodavajici)} · <a href="mailto:${html(nastaveni.email)}" style="color:${BARVY.slaby}">${html(nastaveni.email)}</a><br>
      <a href="${html(nastaveni.podminky)}" style="color:${BARVY.slaby}">Obchodní podmínky</a> ·
      <a href="${html(nastaveni.podminky)}#odstoupeni" style="color:${BARVY.slaby}">Odstoupení od smlouvy</a> ·
      <a href="${html(nastaveni.ochrana)}" style="color:${BARVY.slaby}">Ochrana osobních údajů</a>`;

    if (pro === "obchod") {
      // Kde knihu najít – hned pod nadpisem: „BOX111 | Vyšší život“
      const umisteni = `${kniha.box || "bez boxu"} | ${kniha.nazev}`;
      return {
        z,
        obsah: obalEmailu(
          `<div style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BARVY.panel};font-size:13px;font-weight:700;letter-spacing:.02em">Nová objednávka z webu kniha4u.cz</div>
           <div style="margin:14px 0 20px;padding:16px 20px;border-radius:18px;background:${BARVY.text};color:#fafaf7;font-size:20px;font-weight:700">${html(umisteni)}</div>
           ${kartaKnihy()}
           <div style="height:18px"></div>
           ${panel(
             radek("Celková cena objednávky", `<b style="font-size:17px">${castka},- Kč</b>`) +
             radek("Doprava", `${html(popisMista())}<br><span style="color:${BARVY.slaby}">${kc(cenaDopravy())}</span>`) +
             radek("Zvolený způsob platby", zpusob) +
             radek("Fakturační adresa", kontakt, !poznamka) +
             (poznamka ? radek("Poznámka", poznamka, true) : ""),
           )}
           <div style="margin-top:24px">${tlacitko(`mailto:${z.email}?subject=${encodeURIComponent(`Objednávka: ${kniha.nazev}`)}`, "Odpovědět zákazníkovi")}</div>`,
          pravni,
        ),
      };
    }

    const platbaBlok = predem
      ? `<h2 style="margin:28px 0 12px;font-family:${NADPIS};font-size:22px;font-weight:600">Platba předem</h2>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BARVY.panel};border-radius:18px"><tr>
           <td style="padding:18px;width:200px;vertical-align:top"><img src="${qrObrazek(castka)}" width="180" height="180" alt="QR kód pro platbu" style="display:block;border-radius:12px;background:#fff;padding:8px"></td>
           <td style="padding:18px 18px 18px 0;vertical-align:top;font-size:15px">
             <div style="color:${BARVY.slaby};font-size:13px">Částka</div><div style="font-weight:700;font-size:18px;margin-bottom:8px">${kc(castka)}</div>
             <div style="color:${BARVY.slaby};font-size:13px">Číslo účtu</div><div style="font-weight:700;margin-bottom:8px">${html(nastaveni.ucet)}</div>
             <div style="color:${BARVY.slaby};font-size:13px">Variabilní symbol</div><div style="font-weight:700">${kniha.id}</div>
           </td></tr></table>
         <p style="margin:10px 0 0;color:${BARVY.slaby};font-size:14px">QR kód naskenujte v aplikaci banky. Knihu odešleme po připsání platby.</p>
         ${zkusebniUcet ? `<p style="margin:10px 0 0;padding:12px 16px;border-radius:14px;background:#fdecea;color:#b42318;font-weight:700">${UPOZORNENI}</p>` : ""}`
      : `<p style="margin:24px 0 0;padding:14px 18px;border-radius:18px;background:${BARVY.panel}">Platíte <b>na dobírku ${kc(castka)}</b> při převzetí zásilky.</p>`;

    return {
      z,
      obsah: obalEmailu(
        `<h1 style="margin:0 0 8px;font-family:${NADPIS};font-size:30px;font-weight:600;line-height:1.2">Děkujeme za objednávku</h1>
         <p style="margin:0 0 22px;color:${BARVY.slaby}">Dobrý den, ${html(z.jmeno)}, objednávku jsme přijali. Ozveme se vám s potvrzením – kupní smlouva vzniká naším potvrzením, nejpozději odesláním knihy.</p>
         ${kartaKnihy()}
         <div style="height:18px"></div>
         ${panel(
           radek("Kniha", kc(kniha.cena)) +
           radek("Doprava", `${html(popisMista())}<br><span style="color:${BARVY.slaby}">${kc(cenaDopravy())}</span>`) +
           (!predem && nastaveni.dobirka ? radek("Dobírka", kc(nastaveni.dobirka)) : "") +
           radek("Platba", predem ? "Předem převodem" : "Na dobírku") +
           radek("Kontakt", kontakt, !poznamka) +
           (poznamka ? radek("Poznámka", poznamka, true) : "") ,
         )}
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
           <td style="font-size:16px;font-weight:700">Celkem</td><td style="text-align:right;font-size:22px;font-weight:700">${kc(castka)}</td></tr></table>
         ${platbaBlok}
         <p style="margin:26px 0 0;font-size:14px;color:${BARVY.slaby}">Jako spotřebitel můžete od smlouvy odstoupit bez udání důvodu do 14 dnů od převzetí knihy – postup a formulář najdete v <a href="${html(nastaveni.podminky)}#odstoupeni" style="color:${BARVY.text}">obchodních podmínkách</a>. S dotazy stačí odpovědět na tento e-mail.</p>
         <div style="margin-top:24px">${tlacitko(kniha.url, "Zobrazit knihu na webu")}</div>`,
        pravni,
      ),
    };
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
    if (!pole("jmeno").value.trim()) return chyba("Vyplňte jméno a příjmení."), pole("jmeno").focus();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return chyba("Zkontrolujte e-mail."), pole("email").focus();
    if (pole("telefon").value.replace(/\D/g, "").length < 9) return chyba("Zkontrolujte telefon (aspoň 9 číslic)."), pole("telefon").focus();
    if (!misto) return chyba("Vyberte výdejní místo na mapě.");
    if (!pole("souhlas").checked) return chyba("Pro odeslání potvrďte souhlas s obchodními podmínkami."), pole("souhlas").focus();
    chyba("");

    const tl = $<HTMLButtonElement>("#obj-odeslat");
    tl.disabled = true;
    $("#obj-odeslat span").textContent = "Odesílám…";
    const predmet = `Objednávka: ${kniha.nazev} (kód ${kniha.id})`;
    try {
      const obchod = obsahEmailu("obchod");
      await posli({ to_email: nastaveni.email, reply_to: email, from_name: obchod.z.jmeno, predmet: `${predmet} – ${obchod.z.jmeno}`, obsah: obchod.obsah });
      let potvrzeni = true;
      try {
        await posli({ to_email: email, reply_to: nastaveni.email, from_name: "Kniha4U", predmet: `Potvrzení objednávky – ${kniha.nazev}`, obsah: obsahEmailu("zakaznik").obsah });
      } catch {
        potvrzeni = false; // objednávka u nás je – jen potvrzení zákazníkovi nedošlo
      }
      try {
        localStorage.setItem("objednavka-kontakt", JSON.stringify(Object.fromEntries(ZAPAMATOVAT.map((k) => [k, pole(k).value.trim()]))));
      } catch {
        // nevadí
      }
      hotovo(email, potvrzeni);
    } catch {
      chyba(`Objednávku se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám napište na ${nastaveni.email}.`);
    } finally {
      tl.disabled = false;
      $("#obj-odeslat span").textContent = "Objednat s povinností platby";
    }
  });

  function hotovo(email: string, potvrzeni: boolean) {
    const castka = celkem();
    formular.hidden = true;
    $("#obj-hotovo").hidden = false;
    $("#obj-hotovo-text").textContent = potvrzeni
      ? `Potvrzení jsme poslali na ${email}. Brzy se vám ozveme.`
      : `Objednávku jsme přijali, potvrzení na ${email} se ale nepodařilo odeslat – ozveme se vám.`;
    const predem = platba() === "predem";
    $("#obj-platba").hidden = !predem;
    $("#obj-zkusebni").hidden = !(predem && zkusebniUcet);
    if (predem) {
      const qr = qrcode(0, "M");
      qr.addData(spayd(castka));
      qr.make();
      $("#obj-qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      $("#obj-platba-udaje").replaceChildren(
        ...[["Částka", kc(castka)], ["Účet", nastaveni.ucet], ["Variabilní symbol", String(kniha.id)]].flatMap(([a, b]) => [
          Object.assign(document.createElement("dt"), { textContent: a }),
          Object.assign(document.createElement("dd"), { textContent: b }),
        ]),
      );
    }
  }
}
