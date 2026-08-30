"use client";

import { ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { FootVisual } from "@/components/FootVisual";
import {
  LEVEL_LABEL,
  LEVEL_LABEL_SPACE,
  WIDTH_LABEL,
} from "@/lib/engine/recommendation";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import type { Level } from "@/lib/engine/types";

function levelWidth(level: Level) {
  return level === "high" ? "88%" : level === "medium" ? "58%" : "30%";
}

const CLOSURE_LABEL: Record<string, string> = {
  velcro: "Apertura fácil (velcro)",
  laces: "Cordones",
  "slip-on": "Slip-on",
};

export default function PerfilPage() {
  const { ok, loading } = useRequire("profile");
  const { footProfile } = useSession();

  if (loading || !ok || !footProfile) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  const rows: Array<{ label: string; value: string; level: Level }> = [
    { label: "Espacio delantero", value: LEVEL_LABEL_SPACE[footProfile.toeBox], level: footProfile.toeBox },
    { label: "Empeine", value: LEVEL_LABEL[footProfile.instep], level: footProfile.instep },
    { label: "Estabilidad", value: LEVEL_LABEL[footProfile.stability], level: footProfile.stability },
    { label: "Amortiguación", value: LEVEL_LABEL[footProfile.cushioning], level: footProfile.cushioning },
  ];

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/test" />
        <p className="text-base font-semibold text-[var(--color-brand)]">
          Perfil del pie
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          Tenemos una primera idea de lo que necesitas.
        </h1>

        <div className="mt-6 grid grid-cols-[120px_1fr] items-center gap-4 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <FootVisual side="right" flags={footProfile.flags} className="max-h-[180px]" />
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Anchura
            </p>
            <p className="text-2xl font-bold text-[var(--color-brand)]">
              {WIDTH_LABEL[footProfile.width]}
            </p>
            {footProfile.flags.length > 0 && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Detectado: {footProfile.flags.map(featureLabel).join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-medium">{r.label}</span>
                <span className="text-base font-bold text-[var(--color-ink)]">
                  {r.value}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700"
                  style={{ width: levelWidth(r.level) }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-[var(--color-line)] pt-3">
            <span className="text-base font-medium">Cierre recomendado</span>
            <span className="text-base font-bold text-[var(--color-brand)]">
              {CLOSURE_LABEL[footProfile.closure]}
            </span>
          </div>
        </div>

        <p className="mt-6 text-lg text-[var(--color-muted)]">
          Ahora necesitamos conocer la forma exacta de tus pies.
        </p>
        <div className="mt-4">
          <ButtonLink href="/escaneo" fullWidth>
            Escanear mis pies
          </ButtonLink>
        </div>
      </Screen>
    </>
  );
}

function featureLabel(f: string): string {
  return (
    {
      bunion: "juanete",
      "hammer-toes": "dedos en martillo",
      "swollen-feet": "pies hinchados",
      "swollen-ankles": "tobillos hinchados",
      "high-instep": "empeine alto",
    }[f] ?? f
  );
}
