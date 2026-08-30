"use client";

import type { FootFeature } from "@/lib/engine/types";
import { FootVisual } from "./FootVisual";

export function ScanStage({
  side,
  flags,
  scanning,
  statusLabel,
}: {
  side: "left" | "right";
  flags: FootFeature[];
  scanning: boolean;
  statusLabel: string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className="relative rounded-[2rem] border-2 border-dashed border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-6">
        {/* corner brackets */}
        {["-left-[2px] -top-[2px]", "-right-[2px] -top-[2px] rotate-90", "-right-[2px] -bottom-[2px] rotate-180", "-left-[2px] -bottom-[2px] -rotate-90"].map(
          (pos, i) => (
            <span
              key={i}
              aria-hidden
              className={`absolute h-7 w-7 border-l-4 border-t-4 border-[var(--color-brand)] ${pos}`}
            />
          ),
        )}
        <FootVisual side={side} flags={flags} scanning={scanning} className="max-h-[300px]" />
      </div>
      <p
        className="mt-5 min-h-[1.75rem] text-center text-lg font-semibold text-[var(--color-brand)] animate-fade"
        key={statusLabel}
        aria-live="polite"
      >
        {statusLabel}
      </p>
    </div>
  );
}
