/**
 * Placeholder art generator. These are ORIGINAL vector illustrations generated in code in the brand palette.
 * They are NOT photographs of real products and are labelled "Demo" wherever shown. Replace via Admin > Products.
 * Provenance is recorded in docs/ASSETS.md.
 */

export interface GarmentPalette {
  bg1: string;
  bg2: string;
  skirt: string;
  skirtDeep: string;
  trim: string; // border/embroidery base
  blouse: string;
  dupatta: string;
  motif: "paisley" | "floral" | "dots" | "lines";
}

const SKIN = "#c99a7c";
const HAIR = "#2a1612";

function motifDefs(id: string, m: GarmentPalette["motif"], c: string): string {
  const stroke = `stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"`;
  switch (m) {
    case "paisley":
      return `<pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M22 6c8 2 12 10 8 18-3 6-10 8-13 3-2-4 1-7 5-6" ${stroke}/><circle cx="22" cy="36" r="2.2" fill="${c}"/></pattern>`;
    case "floral":
      return `<pattern id="${id}" width="46" height="46" patternUnits="userSpaceOnUse"><g ${stroke}><circle cx="23" cy="23" r="3" fill="${c}"/><ellipse cx="23" cy="11" rx="3.4" ry="6"/><ellipse cx="23" cy="35" rx="3.4" ry="6"/><ellipse cx="11" cy="23" rx="6" ry="3.4"/><ellipse cx="35" cy="23" rx="6" ry="3.4"/></g></pattern>`;
    case "dots":
      return `<pattern id="${id}" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.2" fill="${c}"/><circle cx="23" cy="23" r="2.2" fill="${c}"/><circle cx="23" cy="8" r="1" fill="${c}"/><circle cx="8" cy="23" r="1" fill="${c}"/></pattern>`;
    default:
      return `<pattern id="${id}" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M0 26L26 0M-6 6L6 -6M20 32L32 20" ${stroke}/></pattern>`;
  }
}

/** Faceless fashion-illustration of a lehenga set. 4:5 portrait (800x1000). */
export function garmentSvg(p: GarmentPalette, uid: string): string {
  const mp = `m${uid}`;
  const hem = `h${uid}`;
  const sk = `s${uid}`;
  const bgG = `b${uid}`;
  const dup = `d${uid}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Demo illustration of a lehenga">
<defs>
<linearGradient id="${bgG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
<linearGradient id="${sk}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.skirtDeep}"/><stop offset="0.5" stop-color="${p.skirt}"/><stop offset="1" stop-color="${p.skirtDeep}"/></linearGradient>
<linearGradient id="${dup}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.dupatta}" stop-opacity="0.92"/><stop offset="1" stop-color="${p.dupatta}" stop-opacity="0.55"/></linearGradient>
<linearGradient id="${hem}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8922a"/><stop offset="0.5" stop-color="#f1d77b"/><stop offset="1" stop-color="#b8922a"/></linearGradient>
${motifDefs(mp, p.motif, "#f1d77b")}
</defs>
<rect width="800" height="1000" fill="url(#${bgG})"/>
<path d="M130 1000V420a270 270 0 0 1 540 0V1000Z" fill="#fff" fill-opacity="0.10"/>
<path d="M175 1000V430a225 225 0 0 1 450 0V1000Z" fill="#fff" fill-opacity="0.07"/>
<rect y="930" width="800" height="70" fill="#000" fill-opacity="0.10"/>
<ellipse cx="400" cy="935" rx="300" ry="22" fill="#000" fill-opacity="0.18"/>
<!-- skirt -->
<path d="M318 478 C300 640 215 790 150 915 Q400 962 650 915 C585 790 500 640 482 478 Z" fill="url(#${sk})"/>
<path d="M318 478 C300 640 215 790 150 915 Q400 962 650 915 C585 790 500 640 482 478 Z" fill="url(#${mp})" opacity="0.55"/>
<path d="M312 560 C400 585 400 585 488 560 L492 580 C400 606 400 606 308 580Z" fill="url(#${hem})"/>
<path d="M270 705 Q400 745 530 705 L541 735 Q400 778 259 735Z" fill="url(#${hem})" opacity="0.9"/>
<path d="M205 835 Q400 888 595 835 L612 872 Q400 934 188 872Z" fill="url(#${hem})"/>
<path d="M150 915 Q400 962 650 915" stroke="#f1d77b" stroke-width="3" fill="none"/>
<g stroke="${p.skirtDeep}" stroke-opacity="0.35" stroke-width="2"><path d="M400 600V945"/><path d="M355 590 322 930"/><path d="M445 590 478 930"/></g>
<!-- waist band -->
<path d="M316 462h168l-2 22H318Z" fill="url(#${hem})"/>
<!-- blouse -->
<path d="M322 280 C340 262 370 258 400 262 C430 258 460 262 478 280 L496 330 C492 380 490 420 484 466 L316 466 C310 420 308 380 304 330Z" fill="${p.blouse}"/>
<path d="M322 280 C340 262 370 258 400 262 C430 258 460 262 478 280 L496 330 C492 380 490 420 484 466 L316 466 C310 420 308 380 304 330Z" fill="url(#${mp})" opacity="0.5"/>
<path d="M345 272 C370 306 430 306 455 272" stroke="#f1d77b" stroke-width="3" fill="none"/>
<path d="M316 466h168" stroke="#f1d77b" stroke-width="3"/>
<!-- arms -->
<path d="M304 330 C280 400 262 470 258 540 L282 546 C292 480 312 420 330 360Z" fill="${SKIN}"/>
<path d="M496 330 C520 400 538 470 542 540 L518 546 C508 480 488 420 470 360Z" fill="${SKIN}"/>
<g fill="#f1d77b"><rect x="256" y="505" width="30" height="7" rx="3"/><rect x="514" y="505" width="30" height="7" rx="3"/></g>
<!-- neck + head (faceless) -->
<path d="M382 236 h36 v34 q-18 14 -36 0Z" fill="${SKIN}"/>
<ellipse cx="400" cy="196" rx="44" ry="54" fill="${SKIN}"/>
<path d="M352 188 C350 140 450 134 448 188 C440 160 360 160 352 188Z" fill="${HAIR}"/>
<circle cx="400" cy="128" r="22" fill="${HAIR}"/>
<circle cx="400" cy="156" r="3.4" fill="#f1d77b"/>
<g fill="#f1d77b"><circle cx="355" cy="222" r="4"/><circle cx="445" cy="222" r="4"/></g>
<path d="M368 270 Q400 326 432 270" stroke="#f1d77b" stroke-width="2.6" fill="none"/>
<!-- dupatta -->
<path d="M452 262 C520 262 560 320 556 430 C552 560 600 720 612 900 C560 880 520 700 506 560 C498 470 470 360 430 300Z" fill="url(#${dup})"/>
<path d="M556 430 C552 560 600 720 612 900" stroke="#f1d77b" stroke-width="2.4" fill="none" opacity="0.8"/>
<g fill="#f1d77b" opacity="0.9"><circle cx="150" cy="150" r="3"/><circle cx="660" cy="120" r="2"/><circle cx="700" cy="260" r="3"/><circle cx="105" cy="330" r="2"/><circle cx="640" cy="40" r="2"/></g>
</svg>`;
}

/** Close-up of embroidered fabric (hover/detail image). */
export function detailSvg(p: GarmentPalette, uid: string): string {
  const mp = `m${uid}`;
  const g = `g${uid}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Demo illustration of embroidery detail">
<defs>
<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.skirt}"/><stop offset="1" stop-color="${p.skirtDeep}"/></linearGradient>
${motifDefs(mp, p.motif, "#f6dc85")}
<linearGradient id="r${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8922a"/><stop offset="0.5" stop-color="#f1d77b"/><stop offset="1" stop-color="#b8922a"/></linearGradient>
</defs>
<rect width="800" height="1000" fill="url(#${g})"/>
<rect width="800" height="1000" fill="url(#${mp})" transform="scale(1.7)" opacity="0.85"/>
<rect y="640" width="800" height="26" fill="url(#r${uid})"/>
<rect y="690" width="800" height="10" fill="url(#r${uid})" opacity="0.8"/>
<g fill="${p.trim}" opacity="0.9"><circle cx="100" cy="800" r="26"/><circle cx="260" cy="840" r="26"/><circle cx="420" cy="800" r="26"/><circle cx="580" cy="840" r="26"/><circle cx="740" cy="800" r="26"/></g>
<g fill="none" stroke="#f1d77b" stroke-width="2.4"><circle cx="100" cy="800" r="16"/><circle cx="260" cy="840" r="16"/><circle cx="420" cy="800" r="16"/><circle cx="580" cy="840" r="16"/><circle cx="740" cy="800" r="16"/></g>
<rect y="0" width="800" height="1000" fill="#000" opacity="0.06"/>
</svg>`;
}

export type AccessoryKind = "tikka" | "potli" | "dupatta" | "jhumka";

/** Simple jewellery/accessory still-life on a soft backdrop. */
export function accessorySvg(kind: AccessoryKind, p: { bg1: string; bg2: string; base: string; accent: string }, uid: string): string {
  const g = `a${uid}`;
  const gold = `g${uid}`;
  const body: Record<AccessoryKind, string> = {
    tikka: `<path d="M180 330 Q400 240 620 330" stroke="url(#${gold})" stroke-width="6" fill="none"/><g fill="url(#${gold})"><circle cx="400" cy="272" r="9"/><circle cx="330" cy="288" r="7"/><circle cx="470" cy="288" r="7"/></g><path d="M400 282 v70" stroke="url(#${gold})" stroke-width="5"/><path d="M400 352 c-44 4 -64 44 -40 84 c20 30 60 30 80 0 c24 -40 4 -80 -40 -84Z" fill="url(#${gold})"/><circle cx="400" cy="402" r="22" fill="${p.accent}"/><circle cx="400" cy="402" r="9" fill="#fff" fill-opacity=".6"/><g fill="${p.accent}"><circle cx="372" cy="470" r="9"/><circle cx="400" cy="480" r="9"/><circle cx="428" cy="470" r="9"/></g>`,
    jhumka: `<g id="j"><path d="M300 260 v60" stroke="url(#${gold})" stroke-width="6"/><path d="M240 340 a60 60 0 0 1 120 0Z" fill="url(#${gold})"/><path d="M246 340 h108 l-14 80 h-80Z" fill="url(#${gold})" opacity=".9"/><g fill="${p.accent}"><circle cx="270" cy="440" r="9"/><circle cx="300" cy="450" r="9"/><circle cx="330" cy="440" r="9"/></g></g><use href="#j" x="200"/>`,
    potli: `<path d="M260 760 C230 600 270 470 400 430 C530 470 570 600 540 760 Q400 800 260 760Z" fill="${p.base}"/><path d="M260 760 C230 600 270 470 400 430 C530 470 570 600 540 760" fill="none" stroke="url(#${gold})" stroke-width="5"/><path d="M330 450 Q400 400 470 450" stroke="url(#${gold})" stroke-width="8" fill="none"/><path d="M330 450 Q250 300 330 260 M470 450 Q550 300 470 260" stroke="url(#${gold})" stroke-width="6" fill="none"/><g fill="url(#${gold})" opacity=".95"><circle cx="400" cy="600" r="46"/><circle cx="400" cy="600" r="30" fill="${p.accent}"/></g><g fill="url(#${gold})"><circle cx="320" cy="690" r="7"/><circle cx="480" cy="690" r="7"/><circle cx="360" cy="720" r="6"/><circle cx="440" cy="720" r="6"/></g>`,
    dupatta: `<path d="M140 200 C300 160 500 260 660 200 L690 760 C520 840 300 740 110 800Z" fill="${p.base}"/><path d="M140 200 C300 160 500 260 660 200" stroke="url(#${gold})" stroke-width="14" fill="none"/><path d="M110 800 C300 740 520 840 690 760" stroke="url(#${gold})" stroke-width="18" fill="none"/><g fill="url(#${gold})" opacity=".85"><circle cx="220" cy="400" r="9"/><circle cx="400" cy="460" r="9"/><circle cx="580" cy="400" r="9"/><circle cx="300" cy="580" r="9"/><circle cx="500" cy="600" r="9"/></g>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Demo illustration of a bridal accessory">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
<linearGradient id="${gold}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8922a"/><stop offset="0.5" stop-color="#f1d77b"/><stop offset="1" stop-color="#a47f1d"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#${g})"/>
<ellipse cx="400" cy="850" rx="260" ry="24" fill="#000" fill-opacity=".14"/>
${body[kind]}
</svg>`;
}

/** 16:9 hero composition: arched window, garment on the right, space for text on the left. */
export function heroSvg(p: GarmentPalette): string {
  const inner = garmentSvg(p, "hero")
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Demo illustration of a maroon bridal lehenga in an arched hall">
<defs><linearGradient id="hb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0a14"/><stop offset="0.55" stop-color="#4a1020"/><stop offset="1" stop-color="#7a3a30"/></linearGradient>
<radialGradient id="glow" cx="0.72" cy="0.45" r="0.55"><stop offset="0" stop-color="#f1d77b" stop-opacity=".35"/><stop offset="1" stop-color="#f1d77b" stop-opacity="0"/></radialGradient></defs>
<rect width="1600" height="900" fill="url(#hb)"/>
<rect width="1600" height="900" fill="url(#glow)"/>
<g fill="none" stroke="#f1d77b" stroke-opacity=".28" stroke-width="2"><path d="M880 900V380a210 210 0 0 1 420 0V900"/><path d="M930 900V390a160 160 0 0 1 320 0V900"/><path d="M1320 900V300a170 170 0 0 1 340 0V900"/><path d="M500 900V430a140 140 0 0 1 280 0V900"/></g>
<g fill="#f1d77b" fill-opacity=".5"><circle cx="1000" cy="120" r="3"/><circle cx="1460" cy="200" r="2"/><circle cx="1180" cy="70" r="2"/><circle cx="760" cy="180" r="2"/><circle cx="1520" cy="420" r="3"/></g>
<g transform="translate(820,-50) scale(0.95)">${inner}</g>
<rect width="1600" height="900" fill="url(#hb)" opacity="0"/>
</svg>`;
}

export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#e8ddc9"/><g fill="none" stroke="#c9b8a7" stroke-width="3"><path d="M400 300c60 0 100 40 100 100v60c0 40-30 70-100 70s-100-30-100-70v-60c0-60 40-100 100-100Z"/></g><text x="400" y="640" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#5c534d">Image coming soon</text></svg>`;
