"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { ShoeVisual } from "@/components/ShoeVisual";
import {
  CLOSURE_OPTIONS,
  COLOR_OPTIONS,
  INSOLE_OPTIONS,
} from "@/lib/engine/config";
import { buildShoe } from "@/lib/engine/shoeBuilder";
import { getPrice, formatEur } from "@/lib/engine/pricing";
import { WIDTH_LABEL } from "@/lib/engine/recommendation";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

export default function PersonalizarPage() {
  const { ok, loading } = useRequire("shoe");
  const { shoeSpec, footProfile, scan, shoeConfig, setShoeConfig, commitShoe } =
    useSession();

  // Keep the stored spec in sync with the aesthetic config.
  useEffect(() => {
    if (!ok || !footProfile) return;
    commitShoe(buildShoe(footProfile, scan, shoeConfig));
  }, [ok, footProfile, scan, shoeConfig, commitShoe]);

  if (loading || !ok || !shoeSpec || !footProfile) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  const price = getPrice(shoeSpec);

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/resultado" />
        <h1 className="text-2xl font-bold">Personaliza tu zapatilla</h1>
        <p className="mt-2 text-base text-[var(--color-muted)]">
          La comodidad ya está resuelta. Ajusta solo el aspecto y el cierre.
        </p>

        <div className="mt-4 sticky top-4 z-[1] rounded-[2rem] bg-[var(--color-surface)] p-5">
          <ShoeVisual spec={shoeSpec} />
        </div>

        <Field label="Color">
          <div className="grid grid-cols-4 gap-2">
            {COLOR_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setShoeConfig({ color: o.value })}
                aria-pressed={shoeConfig.color === o.value}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 text-sm font-medium",
                  shoeConfig.color === o.value
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                    : "border-[var(--color-line)]",
                )}
              >
                <span
                  className="h-8 w-8 rounded-full border border-black/10"
                  style={{ background: o.swatch }}
                />
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Cierre">
          <div className="flex flex-col gap-2">
            {CLOSURE_OPTIONS.map((o) => (
              <Row
                key={o.value}
                selected={shoeConfig.closure === o.value}
                onClick={() => setShoeConfig({ closure: o.value })}
                title={o.label}
                hint={o.hint}
              />
            ))}
          </div>
        </Field>

        <Field label="Plantilla">
          <div className="flex flex-col gap-2">
            {INSOLE_OPTIONS.map((o) => (
              <Row
                key={o.value}
                selected={shoeConfig.insole === o.value}
                onClick={() => setShoeConfig({ insole: o.value })}
                title={o.label}
                hint={o.hint}
              />
            ))}
          </div>
        </Field>

        <section className="mt-8 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <h2 className="text-base font-bold">Tu configuración</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-base">
            <Item k="Anchura" v={WIDTH_LABEL[footProfile.width]} />
            <Item k="Color" v={label(COLOR_OPTIONS, shoeConfig.color)} />
            <Item k="Cierre" v={label(CLOSURE_OPTIONS, shoeConfig.closure)} />
            <Item k="Plantilla" v={label(INSOLE_OPTIONS, shoeConfig.insole)} />
          </dl>
        </section>

        <div className="mt-6">
          <ButtonLink href="/comprar" fullWidth>
            Continuar ({formatEur(price)})
          </ButtonLink>
        </div>
      </Screen>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-base font-bold">{label}</p>
      {children}
    </div>
  );
}

function Row({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left",
        selected
          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
          : "border-[var(--color-line)]",
      )}
    >
      <span>
        <span className="block text-base font-semibold">{title}</span>
        <span className="block text-sm text-[var(--color-muted)]">{hint}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full border-2 text-xs",
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

function Item({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[var(--color-muted)]">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </>
  );
}

function label<T extends { value: string; label: string }>(
  opts: T[],
  value: string,
): string {
  return opts.find((o) => o.value === value)?.label ?? value;
}
