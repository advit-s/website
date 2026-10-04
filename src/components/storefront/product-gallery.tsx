"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Media } from "@/components/ui/media";

export function ProductGallery({ images, demo }: { images: { src: string; alt: string }[]; demo: boolean }) {
  const [i, setI] = useState(0);
  const list = images.length ? images : [{ src: "", alt: "Image coming soon" }];
  const go = (n: number) => setI((n + list.length) % list.length);
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {list.length > 1 && (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto md:w-20 md:shrink-0 md:flex-col md:overflow-visible" aria-label="Product images">
          {list.map((im, n) => (
            <li key={n} className="w-16 shrink-0 md:w-full">
              <button
                type="button"
                onClick={() => setI(n)}
                aria-label={`Show image ${n + 1} of ${list.length}`}
                aria-current={n === i}
                className={clsx("block w-full border-2 p-0", n === i ? "border-maroon" : "border-transparent hover:border-taupe")}
              >
                <Media src={im.src} alt="" ratio="4/5" sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="relative min-w-0 flex-1"
        role="group"
        aria-roledescription="carousel"
        aria-label="Product gallery"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(i - 1);
          if (e.key === "ArrowRight") go(i + 1);
        }}
      >
        <Media src={list[i]!.src} alt={list[i]!.alt} ratio="4/5" priority sizes="(min-width:1024px) 45vw, 100vw" demo={demo} />
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => go(i - 1)} aria-label="Previous image" className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-ivory/90 text-maroon hover:bg-white">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Next image" className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-ivory/90 text-maroon hover:bg-white">
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <p className="sr-only" aria-live="polite">
              Image {i + 1} of {list.length}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
