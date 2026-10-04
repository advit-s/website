"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error", error.digest ?? error.message);
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="t-eyebrow text-error">Something went wrong</p>
      <h1 className="t-h1 mt-3">We hit a problem loading this page</h1>
      <p className="mt-3 text-ink-muted">
        This is usually temporary. If you are running the local demo, check that the Firebase emulators are running (<code>npm run emulators</code>).
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex min-h-11 items-center px-4 text-maroon underline underline-offset-4">
          Go home
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-ink-muted">Reference: {error.digest}</p>}
    </main>
  );
}
