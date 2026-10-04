/** Generates original placeholder SVG art into public/demo. Run: npm run art */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accessorySvg, detailSvg, garmentSvg, heroSvg, PLACEHOLDER_SVG } from "./lib/demo-art";
import { PALETTES, SEED_CATEGORIES, SEED_PRODUCTS } from "./lib/seed-catalog";

const out = join(process.cwd(), "public", "demo");
mkdirSync(out, { recursive: true });

let n = 0;
const write = (name: string, svg: string) => {
  writeFileSync(join(out, name), svg, "utf8");
  n++;
};

write("placeholder.svg", PLACEHOLDER_SVG);
write("hero.svg", heroSvg(PALETTES.maroon));
write("story.svg", heroSvg(PALETTES.gold));

for (const p of SEED_PRODUCTS) {
  if (p.palette) {
    write(`${p.slug}-1.svg`, garmentSvg(p.palette, p.id.replace(/\W/g, "")));
    write(`${p.slug}-2.svg`, detailSvg(p.palette, p.id.replace(/\W/g, "")));
  } else if (p.accessory) {
    write(`${p.slug}-1.svg`, accessorySvg(p.accessory.kind, p.accessory, p.id.replace(/\W/g, "")));
    write(`${p.slug}-2.svg`, accessorySvg(p.accessory.kind, { ...p.accessory, bg1: p.accessory.bg2, bg2: p.accessory.bg1 }, p.id.replace(/\W/g, "") + "b"));
  }
}
for (const c of SEED_CATEGORIES) {
  const uid = "c" + c.id.replace(/\W/g, "");
  write(
    `category-${c.slug}.svg`,
    c.id === "cat_accessories"
      ? accessorySvg("tikka", { bg1: "#f1e6cc", bg2: "#d8bd86", base: "#d4af37", accent: "#a3202f" }, uid)
      : garmentSvg(c.art.palette, uid),
  );
}
console.log(`Wrote ${n} demo SVG files to ${out}`);
