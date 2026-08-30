export function ProgressBar({
  value,
  label,
}: {
  /** 0..1 */
  value: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="mb-8">
      {label ? (
        <p className="mb-2 text-base font-medium text-[var(--color-muted)]">
          {label}
        </p>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
