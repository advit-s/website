import Link from "next/link";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "gold" | "danger" | "light";
export type ButtonSize = "sm" | "md" | "lg";

/** Shared button look: 44px touch target, small radius, Montserrat uppercase tracking (brand buttons). */
export function btnClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-sm font-nav font-medium uppercase tracking-[0.12em] whitespace-nowrap",
    "transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    size === "sm" && "min-h-9 px-4 text-[0.72rem]",
    size === "md" && "min-h-11 px-6 text-[0.78rem]",
    size === "lg" && "min-h-12 px-8 text-[0.82rem]",
    variant === "primary" && "bg-maroon text-white hover:bg-wine active:bg-wine",
    variant === "secondary" && "border border-maroon bg-transparent text-maroon hover:bg-maroon hover:text-white",
    variant === "ghost" && "bg-transparent text-maroon hover:bg-beige/60",
    variant === "gold" && "border border-gold bg-transparent text-white hover:bg-white/10",
    variant === "light" && "bg-ivory text-maroon hover:bg-white",
    variant === "danger" && "bg-error text-white hover:bg-[#8a1a27]",
    extra,
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...rest }: BtnProps) {
  return (
    <button type={type} className={btnClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

interface LinkBtnProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function ButtonLink({ variant, size, className, children, ...rest }: LinkBtnProps) {
  return (
    <Link className={btnClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
