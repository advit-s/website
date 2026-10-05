/**
 * Maintenance jobs, runnable locally and by any scheduler that can run a command (or call POST /api/jobs/<name> with JOB_SECRET).
 *   npm run jobs:expire     release stock held by unpaid prepaid orders past their expiry
 *   npm run jobs:outbox     deliver pending notifications (preview channel only until a vendor is chosen)
 *   npm run jobs:reconcile  ask the payment provider about recent unpaid prepaid orders (lost webhook/callback recovery)
 *   npm run jobs:refunds    re-check refunds stuck in "processing" against the provider; applies only verified outcomes, never unlocks by time
 *   npm run jobs:purge      delete assistant conversations older than the configured retention (default 365 days)
 */
import { expireReservations, reconcilePayments } from "@/server/services/payment-events";
import { reconcileRefunds } from "@/server/services/refunds";
import { drainOutbox } from "@/server/services/notifications";
import { purgeOldAssistantLogs } from "@/server/services/assistant-review";

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
    case "refunds":
      console.log("refunds:", await reconcileRefunds());
      break;
    case "purge":
      console.log("purge:", await purgeOldAssistantLogs());
      break;
    default:
      throw new Error("Usage: tsx scripts/jobs.ts expire|outbox|reconcile|refunds|purge");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
