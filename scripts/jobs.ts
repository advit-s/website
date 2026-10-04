/**
 * Maintenance jobs, runnable locally and by any scheduler that can run a command (or call POST /api/jobs/<name> with JOB_SECRET).
 *   npm run jobs:expire     release stock held by unpaid prepaid orders past their expiry
 *   npm run jobs:outbox     deliver pending notifications (preview channel only until a vendor is chosen)
 *   npm run jobs:reconcile  ask the payment provider about recent unpaid prepaid orders (lost webhook/callback recovery)
 */
import { expireReservations, reconcilePayments } from "@/server/services/payment-events";
import { drainOutbox } from "@/server/services/notifications";

async function main() {
  const job = process.argv[2];
  switch (job) {
    case "expire":
      console.log("expire:", await expireReservations());
      break;
    case "outbox":
      console.log("outbox:", await drainOutbox());
      break;
    case "reconcile":
      console.log("reconcile:", await reconcilePayments());
      break;
    default:
      throw new Error("Usage: tsx scripts/jobs.ts expire|outbox|reconcile");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
