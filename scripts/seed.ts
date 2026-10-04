import { assertLocalTarget } from "./lib/guard";
import { DEMO_PASSWORD, DEMO_USERS, seedCatalog, seedUsers } from "./lib/seed-core";

async function main() {
  assertLocalTarget("seed demo data");
  const cat = await seedCatalog();
  const users = await seedUsers();
  console.log(`Seeded ${cat.products} products / ${cat.variants} variants, settings, coupons and ${Object.keys(users).length} demo accounts.`);
  console.log("Demo accounts (Auth emulator only):");
  for (const u of DEMO_USERS) console.log(`  ${u.key.padEnd(10)} ${u.email}  password: ${DEMO_PASSWORD}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
