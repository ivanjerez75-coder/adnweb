import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        emphasis
          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
          : "border-[var(--color-line)] bg-white",
      )}
    >
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-[var(--color-ink)]">{value}</p>
      {hint ? (
        <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
