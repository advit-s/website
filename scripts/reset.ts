import { assertLocalTarget } from "./lib/guard";
import { wipeAll } from "./lib/seed-core";

async function main() {
  assertLocalTarget("wipe all data");
  await wipeAll();
  console.log("All emulator collections and Auth users wiped. Run `npm run seed` to repopulate.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
