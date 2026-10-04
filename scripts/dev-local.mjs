// Starts the whole local stack: Firebase emulators (persisted in ./emulator-data), seeds on first run, then Next.js dev.
// Usage: npm run dev:local        (Ctrl+C stops both; emulator data is exported on exit)
import { spawn } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";

if (!existsSync(".env.local")) {
  copyFileSync(".env.example", ".env.local");
  console.log("[dev:local] created .env.local from .env.example");
}

const isWin = process.platform === "win32";
const run = (cmd, args, opts = {}) => spawn(cmd, args, { stdio: "inherit", shell: isWin, ...opts });

const firstRun = !existsSync("emulator-data");
const emu = run("npx", ["firebase", "emulators:start", "--only", "auth,firestore,storage", "--project", "demo-rajraani", "--import=./emulator-data", "--export-on-exit=./emulator-data"]);

async function waitFor(url, label, ms = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`${label} did not start within ${ms / 1000}s (is Java 21+ installed? run: java -version)`);
}

let next;
try {
  await waitFor("http://127.0.0.1:8080", "Firestore emulator");
  await waitFor("http://127.0.0.1:9099", "Auth emulator");
  if (firstRun) {
    console.log("[dev:local] first run - seeding demo data");
    await new Promise((res, rej) => run("npm", ["run", "seed"]).on("exit", (c) => (c === 0 ? res() : rej(new Error("seed failed")))));
  }
  next = run("npx", ["next", "dev"]);
} catch (e) {
  console.error("[dev:local]", e.message);
  emu.kill("SIGINT");
  process.exit(1);
}

const stop = () => {
  next?.kill("SIGINT");
  emu.kill("SIGINT"); // lets the emulator export data
  setTimeout(() => process.exit(0), 6000);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
emu.on("exit", () => process.exit(0));
