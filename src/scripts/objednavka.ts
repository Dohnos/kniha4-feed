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
};
type Kniha = { id: number; nazev: string; autor: string; cena: number; url: string; obalka: string };
type Misto = { id: number; name: string; street: string; city: string; zip: string; is_locker?: number; carriers: Record<string, { code: string }> };

const okno = document.querySelector<HTMLDialogElement>("#objednavka");
const DOPRAVCI: Record<string, string> = { zasilkovna: "Zásilkovna", balikovna: "Balíkovna", ppl: "PPL", dpd: "DPD", gls: "GLS" };

if (okno) {
  const nastaveni: Nastaveni = JSON.parse(okno.dataset.nastaveni || "null");
  const $ = <T extends HTMLElement>(vyber: string) => okno.querySelector<T>(vyber)!;
  const formular = $<HTMLFormElement>("#obj-formular");
  const pole = (nazev: string) => formular.elements.namedItem(nazev) as HTMLInputElement;
  const kc = (n: number) => `${n.toLocaleString("cs-CZ")} Kč`;
  const html = (t: string) => t.replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]!);

  let kniha: Kniha;
  let misto: Misto | null = null;

  const dopravce = () => $<HTMLSelectElement>("#obj-dopravce").value;
  const platba = () => (formular.elements.namedItem("platba") as RadioNodeList).value as "predem" | "dobirka";
  const cenaDopravy = () => (misto ? nastaveni.doprava[dopravce()] ?? 0 : 0);
  const celkem = () => kniha.cena + cenaDopravy() + (platba() === "dobirka" ? nastaveni.dobirka : 0);

  /** „Zásilkovna – výdejní místo, Míni market, Petrohradská 403/50, 10100 Praha (kód 32596)“ */
  const popisMista = () =>
    misto ? `${DOPRAVCI[dopravce()]} – ${misto.is_locker ? "výdejní box" : "výdejní místo"}, ${misto.name}, ${misto.street}, ${misto.zip} ${misto.city} (kód ${misto.carriers[dopravce()].code})` : "";

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

  function obsahEmailu(pro: "obchod" | "zakaznik") {
    const z = { jmeno: pole("jmeno").value.trim(), email: pole("email").value.trim(), telefon: pole("telefon").value.trim(), poznamka: pole("poznamka").value.trim() };
    const castka = celkem();
    const zpusob = platba() === "predem" ? `Platba PŘEDEM převodem (VS ${kniha.id})` : `Platba na DOBÍRKU${nastaveni.dobirka ? ` (+ ${kc(nastaveni.dobirka)})` : ""}`;
    const r = (popis: string, hodnota: string) => `<tr><td style="padding:4px 12px 4px 0;color:#67665f;vertical-align:top">${popis}</td><td style="padding:4px 0">${hodnota}</td></tr>`;
    const tabulka = `<table style="border-collapse:collapse;font-size:15px">
      ${r("Kniha", `<a href="${html(kniha.url)}">${html(kniha.nazev)}</a>${kniha.autor ? ` – ${html(kniha.autor)}` : ""} (kód ${kniha.id}) – ${kc(kniha.cena)}`)}
      ${r("Celková cena objednávky", `<b>${castka},- Kč</b>`)}
      ${r("Doprava", `${html(popisMista())} – ${kc(cenaDopravy())}`)}
      ${r("Zvolený způsob platby", zpusob)}
      ${r("Fakturační adresa", `${html(z.jmeno)}<br>${html(z.telefon)}<br>${html(z.email)}`)}
      ${z.poznamka ? r("Poznámka", html(z.poznamka).replace(/\n/g, "<br>")) : ""}
    </table>`;
    const qr = platba() === "predem"
      ? `<h3 style="margin:24px 0 8px">Platba předem</h3>
         <p>Zaplaťte prosím <b>${kc(castka)}</b> na účet <b>${html(nastaveni.ucet)}</b>, variabilní symbol <b>${kniha.id}</b>.<br>Nebo naskenujte QR kód v aplikaci banky:</p>
         <img src="${qrObrazek(castka)}" width="220" height="220" alt="QR kód pro platbu">`
      : "";
    const obsah = pro === "obchod"
      ? `<p><b>Nová objednávka z webu kniha4u.cz</b></p>${tabulka}`
      : `<p>Dobrý den,</p><p>děkujeme za objednávku v antikvariátu Kniha4U. Shrnutí:</p>${tabulka}${qr}
         <p style="margin-top:24px">Knihu odešleme ${platba() === "predem" ? "po připsání platby" : "co nejdříve"}. S dotazy odpovězte na tento e-mail.<br>Kniha4U · <a href="mailto:${html(nastaveni.email)}">${html(nastaveni.email)}</a></p>`;
    return { z, obsah: `<div style="font-family:Arial,sans-serif;color:#0c0c0c;line-height:1.5">${obsah}</div>` };
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
      $("#obj-odeslat span").textContent = "Odeslat objednávku";
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
