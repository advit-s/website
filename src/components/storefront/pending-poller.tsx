"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Re-renders the server page every 5 s (max 24 times) while a payment is still being verified. */
export function PendingPoller() {
  const router = useRouter();
  const n = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      n.current += 1;
      router.refresh();
      if (n.current >= 24) clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
