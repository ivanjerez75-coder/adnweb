export function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
}) {
  const styles =
    tone === "warn"
      ? "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 text-[var(--color-danger)]"
      : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]";
  return (
    <p className={`rounded-xl border px-4 py-3 text-base ${styles}`}>
      {children}
    </p>
  );
}
