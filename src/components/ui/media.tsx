import Image from "next/image";
import clsx from "clsx";
import { mediaUrl } from "@/lib/media";

interface Props {
  src: string | null | undefined;
  alt: string;
  ratio?: "4/5" | "3/4" | "1/1" | "16/9" | "21/9" | "3/2";
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  fill?: boolean;
  demo?: boolean;
}

const ratioClass = { "4/5": "aspect-[4/5]", "3/4": "aspect-[3/4]", "1/1": "aspect-square", "16/9": "aspect-video", "21/9": "aspect-[21/9]", "3/2": "aspect-[3/2]" } as const;

/** Fixed-ratio image box (prevents layout shift). SVG placeholder art bypasses the optimiser. */
export function Media({ src, alt, ratio = "4/5", sizes = "(min-width:1024px) 25vw, 50vw", priority, className, imgClassName, demo }: Props) {
  const url = mediaUrl(src);
  const isSvg = url.endsWith(".svg");
  return (
    <div className={clsx("relative overflow-hidden bg-beige", ratioClass[ratio], className)}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={isSvg || url.startsWith("http://")}
        className={clsx("object-cover", imgClassName)}
      />
      {demo && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-sm bg-white/85 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-ink-muted">
          Sample photo
        </span>
      )}
    </div>
  );
}
