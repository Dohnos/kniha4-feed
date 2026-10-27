/** Drobné interakce na všech stránkách: vyhledávací paleta, karusely, počítadla, sdílení. */

import { hledej, kc, nactiRejstrik, prvek, type Polozka } from "./rejstrik";

/* ---------- vyhledávací paleta ---------- */

const paleta = document.querySelector<HTMLDialogElement>("#paleta");
if (paleta) {
  const input = paleta.querySelector("input")!;
  const seznam = paleta.querySelector("ul")!;
  const vse = paleta.querySelector<HTMLAnchorElement>("[data-vse]")!;
  const { zdroj, knihy, hledatStranka } = paleta.dataset as Record<string, string>;
  const MAX = 8;
  let vysledky: Polozka[] = [];
  let vybrany = 0;

  const info = (text: string) => seznam.replaceChildren(prvek("li", "paleta-info", text));

  const vykresli = (celkem: number) => {
    seznam.replaceChildren(...vysledky.map((p, i) => {
      const li = prvek("li", "paleta-polozka");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === vybrany));
      const a = prvek("a");
      a.href = `${knihy}${p.slug}/`;
      const text = prvek("span", "paleta-text");
      text.append(prvek("strong", "", p.nazev), prvek("small", "", [p.autor, p.rok || ""].filter(Boolean).join(" · ")));
      a.append(prvek("span", `mini-obalka v${p.id % 6}`, p.nazev.charAt(0)), text, prvek("span", "cena", kc.format(p.cena)));
      li.append(a);
      return li;
    }));
    if (!vysledky.length) info("Nic jsme nenašli. Zkuste jiné slovo.");
    if (celkem > MAX) {
      const li = prvek("li", "paleta-info");
      const a = prvek("a", "", `Zobrazit všech ${celkem} výsledků →`);
      a.href = `${hledatStranka}?q=${encodeURIComponent(input.value.trim())}`;
      li.append(a);
      seznam.append(li);
    }
    vse.href = `${hledatStranka}${input.value.trim() ? `?q=${encodeURIComponent(input.value.trim())}` : ""}`;
  };

  const aktualizuj = async () => {
    const dotaz = input.value.trim();
    if (dotaz.length < 2) return info("Začněte psát – hledáme v celé nabídce, na diakritice nezáleží.");
    try {
      const nalezene = hledej(await nactiRejstrik(zdroj), dotaz);
      vysledky = nalezene.slice(0, MAX);
      vybrany = 0;
      vykresli(nalezene.length);
    } catch {
      info("Hledání se nepodařilo načíst. Zkuste to prosím znovu.");
    }
  };

  const otevri = () => {
    if (paleta.open) return;
    paleta.showModal();
    input.select();
    nactiRejstrik(zdroj).catch(() => {});
  };

  input.addEventListener("input", aktualizuj);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!vysledky.length) return;
      vybrany = (vybrany + (e.key === "ArrowDown" ? 1 : -1) + vysledky.length) % vysledky.length;
      vykresli(vysledky.length);
      seznam.children[vybrany]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      location.href = vysledky[vybrany] ? `${knihy}${vysledky[vybrany].slug}/` : vse.href;
    }
  });
  paleta.querySelector("[data-zavrit]")!.addEventListener("click", () => paleta.close());
  paleta.addEventListener("click", (e) => e.target === paleta && paleta.close());

  document.querySelectorAll("[data-hledat]").forEach((tl) => tl.addEventListener("click", otevri));
  document.addEventListener("keydown", (e) => {
    const cil = e.target as HTMLElement;
    const pise = cil.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cil.tagName);
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !pise)) {
      e.preventDefault();
      otevri();
    }
  });
}

/* ---------- karusely ---------- */

document.querySelectorAll<HTMLButtonElement>("[data-karusel-sipka]").forEach((tl) => {
  const karusel = document.getElementById(tl.dataset.karuselSipka!);
  tl.addEventListener("click", () => karusel?.scrollBy({ left: Number(tl.dataset.smer) * karusel.clientWidth * 0.85, behavior: "smooth" }));
});

/* ---------- počítadla (čísla „naběhnou“, když se objeví) ---------- */

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const pocet = new Intl.NumberFormat("cs-CZ");
  const pozorovatel = new IntersectionObserver((zaznamy) => {
    for (const { target, isIntersecting } of zaznamy) {
      if (!isIntersecting) continue;
      pozorovatel.unobserve(target);
      const el = target as HTMLElement;
      const cil = Number(el.dataset.pocitadlo);
      const { predpona = "", pripona = "" } = el.dataset;
      const start = performance.now();
      const krok = (ted: number) => {
        const t = Math.min(1, (ted - start) / 1400);
        el.textContent = `${predpona}${pocet.format(Math.round(cil * (1 - (1 - t) ** 3)))}${pripona}`;
        if (t < 1) requestAnimationFrame(krok);
      };
      requestAnimationFrame(krok);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-pocitadlo]").forEach((el) => pozorovatel.observe(el));
}

/* ---------- sdílení ---------- */

document.querySelectorAll<HTMLButtonElement>("[data-sdilet]").forEach((tl) => {
  tl.addEventListener("click", async () => {
    const data = { title: document.title, url: location.href };
    if (navigator.share) return navigator.share(data).catch(() => {});
    await navigator.clipboard.writeText(location.href);
    const popisek = tl.querySelector("span");
    if (popisek) {
      const puvodni = popisek.textContent;
      popisek.textContent = "Odkaz zkopírován";
      setTimeout(() => (popisek.textContent = puvodni), 2000);
    }
  });
});

/* ---------- světlý / tmavý režim ---------- */

const jeTmavy = () =>
  document.documentElement.dataset.tema ? document.documentElement.dataset.tema === "tmavy" : matchMedia("(prefers-color-scheme: dark)").matches;

document.querySelectorAll("[data-tema-prepinac]").forEach((tl) =>
  tl.addEventListener("click", () => {
    const novy = jeTmavy() ? "svetly" : "tmavy";
    try {
      localStorage.setItem("tema", novy);
    } catch {
      // bez úložiště jen pro tuhle stránku
    }
    const prepni = () => (document.documentElement.dataset.tema = novy);
    document.startViewTransition ? document.startViewTransition(prepni) : prepni();
  })
);
