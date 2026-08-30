"use client";

import { cn } from "@/lib/cn";
import type { BuildStep } from "@/lib/engine/types";

export function BuildChecklist({
  steps,
  currentIndex,
}: {
  steps: BuildStep[];
  /** index of the step in progress; steps before it are done */
  currentIndex: number;
}) {
  return (
    <ul className="mx-auto flex max-w-[380px] flex-col gap-2.5">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li
            key={step.key}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base transition-colors",
              done && "text-white/90",
              active && "bg-white/10 text-white",
              !done && !active && "text-white/35",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-sm",
                done && "border-[var(--color-brand)] bg-[var(--color-brand)] text-white",
                active && "border-white/70 text-white",
                !done && !active && "border-white/25",
              )}
            >
              {done ? "✓" : active ? "" : ""}
              {active && (
                <span
                  className="block h-3 w-3 rounded-full border-2 border-white/40 border-t-white"
                  style={{ animation: "nonna-spin 0.8s linear infinite" }}
                />
              )}
            </span>
            {step.label}
          </li>
        );
      })}
    </ul>
  );
}
