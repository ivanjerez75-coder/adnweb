"use client";

import { cn } from "@/lib/cn";

export function OptionCard({
  label,
  icon,
  selected,
  multi,
  onClick,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 text-left transition-all",
        "hover:border-[var(--color-brand)]",
        selected
          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] shadow-sm"
          : "border-[var(--color-line)]",
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl",
            selected
              ? "bg-[var(--color-brand)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-ink)]",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex-1 text-lg font-semibold">{label}</span>
      <span
        aria-hidden
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center border-2 text-sm",
          multi ? "rounded-md" : "rounded-full",
          selected
            ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
            : "border-[var(--color-line)] text-transparent",
        )}
      >
        ✓
      </span>
    </button>
  );
}
