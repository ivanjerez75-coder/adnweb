"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-ink)] shadow-sm",
  secondary:
    "bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-brand)]",
  ghost: "bg-transparent text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 min-h-[3.5rem] text-lg font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";

type CommonProps = {
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
};

export function Button({
  variant = "primary",
  fullWidth,
  className,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={cn(BASE, VARIANT[variant], fullWidth && "w-full", className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  fullWidth,
  className,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(BASE, VARIANT[variant], fullWidth && "w-full", className)}
      {...props}
    />
  );
}
