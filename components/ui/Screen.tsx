"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

export function Screen({
  children,
  className,
  wide,
}: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-5 pb-24 pt-6",
        wide ? "max-w-[760px]" : "max-w-[520px]",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="mb-4 inline-flex items-center gap-1 text-base font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      aria-label="Volver"
    >
      <span aria-hidden>←</span> Volver
    </button>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-baseline gap-[2px] text-xl font-bold tracking-tight text-[var(--color-ink)]"
    >
      <span
        aria-hidden
        className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]"
      />
      NONNA
    </Link>
  );
}
