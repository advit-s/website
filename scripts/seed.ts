import { assertLocalTarget } from "./lib/guard";
import { DEMO_PASSWORD, DEMO_USERS, seedCatalog, seedUsers, wipeAll } from "./lib/seed-core";
import { seedOrders } from "./lib/seed-orders";

async function main() {
  assertLocalTarget("seed demo data");
  // `npm run seed` always rebuilds the demo dataset from scratch (local emulators only - assertLocalTarget refuses anything else).
  await wipeAll();
  const cat = await seedCatalog();
  const users = await seedUsers();
  const orders = await seedOrders(users);
  console.log(`Seeded ${cat.products} products / ${cat.variants} variants, settings, coupons, ${Object.keys(users).length} demo accounts and ${orders} demo orders.`);
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
