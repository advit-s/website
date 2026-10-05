// Downloads the licensed sample photography (Unsplash licence) into public/photos and writes docs/photo-credits.json.
// Usage: node scripts/fetch-photos.mjs      (needs network; images are committed, so this only needs re-running to change the set)
// Every photo is credited in docs/ASSETS.md. These are SAMPLE photographs of models/garments that are NOT Raj Raani products.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/photos";
mkdirSync(OUT, { recursive: true });

/** key -> [unsplash photo id (the number after "photo-"), page slug, photographer] */
const P = {
  A: ["1746372283841-dbb3838f9935", "an-elegantly-dressed-woman-poses-in-a-doorway--4YUHtrI6rQ", "SAREE GHAR"],
  B: ["1668371679302-a8ec781e876e", "a-woman-in-a-red-dress-scTC9VKQPkk", "Ardy Arjun"],
  C: ["1767955694884-d4bf352c23c2", "woman-in-ornate-yellow-and-maroon-traditional-indian-attire-unFmQCqV8Ow", "Morni Saree"],
  D: ["1619715613791-89d35b51ff81", "woman-in-green-dress-sitting-on-concrete-bench-X-olTuZZhVs", "Sabesh Photography LTD"],
  E: ["1649930055986-ca57250a7fd4", "a-woman-in-a-long-dress-standing-in-a-garden-pkqmkwkApgA", "Ardy Arjun"],
  F: ["1759906760638-eeffcb471e53", "a-bride-in-a-traditional-red-lehenga-and-veil-5gVAj1k-FBA", "Royal Photography"],
  G: ["1729146768775-3662af38016e", "a-woman-wearing-a-white-sari-and-a-necklace-wusSGdCQQVA", "The Behruz Theory"],
  H: ["1602210901882-071c6b9e239d", "woman-in-white-long-sleeve-dress-standing-on-gray-concrete-pavement-during-daytime-bbE9VOyqKxo", "Bernie Almanzar"],
  I: ["1574847872646-abff244bbd87", "woman-wearing-white-crop-top-and-yellow-long-skirt-dz0Q0FS_oTQ", "Kunal Goswami"],
  K: ["1601571103926-ed7860bb5e2c", "woman-in-white-long-sleeve-dress-standing-on-gray-rocks-during-daytime--_uL4h6z-vs", "Bernie Almanzar"],
  L: ["1601571115502-83ca3095735b", "woman-in-white-long-sleeve-dress-sitting-on-brown-wooden-fence-during-daytime-8R2cQmFoQIk", "Bernie Almanzar"],
  D1: ["1724856604254-f7cf4e9c8f72", "a-close-up-of-a-brides-red-and-gold-wedding-dress-reZz3rNHBdQ", "Abhishek Sharma"],
  D2: ["1724856604403-60304b28906c", "a-close-up-of-a-red-and-gold-dress-sOga_fHfoek", "Abhishek Sharma"],
  D3: ["1724856605022-106d6dd6e842", "a-close-up-of-a-red-and-gold-dress-z8dUDjXEdno", "Abhishek Sharma"],
  R1: ["1629118477133-b8b1499f2b8a", "woman-in-red-and-white-floral-dress-arn2mcDxcEk", "Bulbul Ahmed"],
  R2: ["1610047881689-fc68ff7b2a89", "woman-in-gold-floral-sari-AhQhEmtChu4", "Bulbul Ahmed"],
  R3: ["1610047520958-b42ebcd2f6cb", "woman-in-red-and-white-floral-sari-jUEqikbT4o8", "Bulbul Ahmed"],
  M1: ["1512676052261-98bab4919138", "woman-wearing-tradition-dress-smiling-xo66i3WfS0A", "Samridhhi Sondhi"],
  M2: ["1740674570259-a47d713a2976", "a-woman-in-a-red-and-white-bridal-outfit-aXSyDSydIjU", "Aman Malik"],
  M3: ["1677691257005-9d69ab23f485", "a-woman-in-a-red-bridal-outfit-CXIT2LBJmjI", "dras koli"],
  M4: ["1721324807083-e9ddaa99310e", "a-woman-in-a-red-and-gold-bridal-outfit-wN2ijql9HOs", "Naeem Ad"],
  J1: ["1740431377901-c2f28d50c759", "a-woman-in-a-bridal-outfit-sitting-on-a-couch-fQtnMrW1NAQ", "Ardy Arjun"],
  J2: ["1787831398033-d70495c1e8a4", "woman-wearing-ornate-gold-jewelry-pVeBI1-Ec7U", "Picture & Poet"],
  J3: ["1648291531524-97afa1c2ac30", "a-close-up-of-a-person-wearing-a-pair-of-earrings-O2jfnvVJDwA", "Samar Ahmad"],
  J4: ["1724594888502-34f2b647ce33", "a-white-pillow-with-red-and-green-beads-on-it-78Du2X6Gev4", "A N Suresh"],
  T1: ["1652722464455-ec026ef74703", "a-close-up-of-a-bed-with-a-pattern-on-it-p0_9uZfThaY", "Saubhagya gandharv"],
  T2: ["1652722426884-647880c63bf1", "a-close-up-view-of-a-multicolored-area-rug-AvML_0Oap7c", "Saubhagya gandharv"],
  S1: ["1717586756136-d9a3eeb1fa6f", "a-close-up-of-a-scarf-with-a-flower-on-it-lyK1Pq4JE8E", "Jainica Dhingra"],
  S2: ["1717585679395-bbe39b5fb6bc", "a-pile-of-different-types-of-cloths-on-a-table-udCX1mvNFos", "Jainica Dhingra"],
};

/** product slug -> [primary photo key, alt of primary, secondary: photo key (a real second photo) or "crop" (detail crop of the primary), alt of secondary] */
const PRODUCTS = {
  "royal-rose-bridal-lehenga": ["A", "Model in a rose-pink and red bridal lehenga with dupatta, standing in an arched doorway", "D2", "Close-up of red and gold embroidery on a bridal lehenga"],
  "crimson-zardozi-bridal-lehenga": ["R1", "Model in a crimson embroidered bridal lehenga with a sheer dupatta", "D3", "Close-up of zardozi and sequin embroidery with elephant motifs on red fabric"],
  "heritage-gold-bridal-lehenga": ["R2", "Model in a gold embroidered bridal ensemble with a sheer dupatta", "D1", "Close-up of a bride's red and gold embroidered skirt"],
  "ivory-dream-wedding-lehenga": ["H", "Model in an ivory embroidered lehenga with a sheer dupatta and red border", "crop", "Close-up of the ivory lehenga's red-bordered hem"],
  "blush-garden-lehenga": ["E", "Model in a blush-lilac embroidered lehenga standing in a garden", "crop", "Close-up of embroidery on a blush lehenga skirt"],
  "emerald-mirror-work-lehenga": ["M1", "Woman in traditional mirror-work and embroidered attire with a patterned dupatta", "crop", "Close-up of mirror work and embroidery on traditional attire"],
  "peach-blossom-lehenga": ["K", "Model in an ivory embroidered lehenga with a draped dupatta, outdoors", "crop", "Close-up of embroidered skirt fabric"],
  "marigold-festive-lehenga": ["I", "Model in a marigold-yellow lehenga skirt with a white blouse and a peach dupatta", "crop", "Close-up of the flared marigold-yellow skirt"],
  "teal-peacock-lehenga": ["D", "Model in a teal-green lehenga seated against an arched window", "crop", "Close-up of the layered teal skirt"],
  "midnight-charm-party-lehenga": ["F", "Model in a red embroidered lehenga with dupatta, photographed in the evening", "crop", "Close-up of the embroidered lehenga skirt"],
  "wine-sequin-lehenga": ["M2", "Model in a deep wine velvet blouse and lehenga with a sheer dupatta and bangles", "crop", "Close-up of silver embroidery on wine velvet"],
  "silver-mist-lehenga": ["G", "Model in an ivory and silver outfit with a pearl necklace", "crop", "Close-up of the ivory drape and fabric"],
  "made-to-measure-bridal-lehenga": ["M3", "Model in a red bridal outfit with a veil-style dupatta and bangles", "crop", "Close-up of embroidery on a red bridal skirt"],
  "made-to-measure-sangeet-lehenga": ["C", "Model in a gold and maroon embroidered lehenga with a maroon dupatta", "crop", "Close-up of gold embroidery on a lehenga skirt"],
  "kundan-maang-tikka-set": ["J1", "Bride wearing a maang tikka, necklace and jewellery set", "J2", "Model wearing ornate gold maang tikka, headpiece and necklace"],
  "pearl-drop-jhumkas": ["J3", "Close-up of an ear wearing gold hoop jhumka earrings with pearl drops", "J4", "Jhumka earrings with pearl drops on a cushion"],
  "embroidered-potli-bag": ["T1", "Close-up of cream thread and sequin embroidery on fabric", "T2", "Close-up of colourful floral embroidery"],
  "net-dupatta-with-gold-border": ["S1", "Close-up of a pink dupatta fabric with gold stripes", "S2", "Folded dupatta fabrics in assorted colours"],
  "unpublished-sample-lehenga": ["B", "Model in a flowing red lehenga on a gravel hill", "crop", "Close-up of the flowing red skirt"],
};

const CATEGORIES = {
  "bridal-lehengas": ["R3", "top"],
  "wedding-lehengas": ["L", "top"],
  "festive-lehengas": ["I", "top"],
  "party-wear": ["M2", "top"],
  "custom-made": ["C", "top"],
  "lehenga-accessories": ["J1", "top"],
};

const cache = new Map();
async function original(key) {
  if (cache.has(key)) return cache.get(key);
  const [id] = P[key];
  const res = await fetch(`https://images.unsplash.com/photo-${id}?w=1800&q=85&fm=jpg&fit=max`);
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  cache.set(key, buf);
  return buf;
}
const write = (name, pipeline) => pipeline.jpeg({ quality: 78, mozjpeg: true }).toFile(`${OUT}/${name}`);
const used = new Set();

for (const [slug, [k1, , k2]] of Object.entries(PRODUCTS)) {
  const b1 = await original(k1);
  used.add(k1);
  await write(`${slug}-1.jpg`, sharp(b1).resize(1000, 1250, { fit: "cover", position: "attention" }));
  if (k2 === "crop") {
    // detail crop: lower-middle region of the primary photograph
    const m = await sharp(b1).metadata();
    const h = Math.min(Math.round(m.height * 0.5), Math.round(m.width * 0.75));
    const w = Math.min(m.width, Math.round(h * 0.8));
    const left = Math.round((m.width - w) / 2);
    const top = Math.min(m.height - h, Math.round(m.height * 0.5));
    await write(`${slug}-2.jpg`, sharp(b1).extract({ left, top, width: w, height: h }).resize(1000, 1250, { fit: "cover" }));
  } else {
    used.add(k2);
    await write(`${slug}-2.jpg`, sharp(await original(k2)).resize(1000, 1250, { fit: "cover", position: "attention" }));
  }
}

for (const [slug, [k, pos]] of Object.entries(CATEGORIES)) {
  used.add(k);
  await write(`category-${slug}.jpg`, sharp(await original(k)).resize(600, 750, { fit: "cover", position: pos === "top" ? "north" : "attention" }));
}

// Hero: maroon canvas with the bridal portrait on the right, faded into the brand colour on the left.
{
  used.add("A");
  const W = 2400, H = 1000, PW = 1100;
  const portrait = await sharp(await original("A")).resize(PW, H, { fit: "cover", position: "north" }).png().toBuffer();
  const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.45" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="${PW}" height="${H}" fill="url(#g)"/></svg>`);
  const masked = await sharp(portrait).composite([{ input: fade, blend: "dest-in" }]).png().toBuffer();
  await write("hero.jpg", sharp({ create: { width: W, height: H, channels: 3, background: "#4A1020" } }).composite([{ input: masked, left: W - PW, top: 0 }]));
}
// Story band + about: embroidery textures (decorative backgrounds / detail)
used.add("T1");
used.add("T2");
await write("story.jpg", sharp(await original("T1")).resize(1800, 900, { fit: "cover", position: "centre" }));
await write("about-detail.jpg", sharp(await original("T2")).resize(1000, 1250, { fit: "cover", position: "centre" }));
used.add("M3");
await write("custom-feature.jpg", sharp(await original("M3")).resize(1000, 1250, { fit: "cover", position: "attention" }));

writeFileSync("scripts/lib/photo-alts.json", JSON.stringify(Object.fromEntries(Object.entries(PRODUCTS).map(([slug, v]) => [slug, [v[1], v[3]]])), null, 2) + "\n");
const credits = [...used].map((k) => ({ key: k, unsplashId: `photo-${P[k][0]}`, page: `https://unsplash.com/photos/${P[k][1]}`, photographer: P[k][2] }));
writeFileSync("docs/photo-credits.json", JSON.stringify(credits, null, 2) + "\n");
console.log(`wrote ${credits.length} credited photos`);
