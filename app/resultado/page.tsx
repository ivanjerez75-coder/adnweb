"use client";

import { ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { ShoeVisual } from "@/components/ShoeVisual";
import { StatCard } from "@/components/ui/StatCard";
import { explainConfig } from "@/lib/engine/copy";
import {
  LEVEL_LABEL,
  LEVEL_LABEL_SPACE,
  WIDTH_LABEL,
} from "@/lib/engine/recommendation";
import { getPrice, formatEur } from "@/lib/engine/pricing";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import type { TestAnswers } from "@/lib/engine/types";

const CLOSURE_LABEL: Record<string, string> = {
  velcro: "Apertura fácil",
  laces: "Cordones",
  "slip-on": "Slip-on",
};

export default function ResultadoPage() {
  const { ok, loading } = useRequire("shoe");
  const { shoeSpec, footProfile, testAnswers } = useSession();

  if (loading || !ok || !shoeSpec || !footProfile) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  const reasons = explainConfig(footProfile, testAnswers as TestAnswers);
  const price = getPrice(shoeSpec);

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/" />
        <h1 className="text-2xl font-bold">Esta es tu zapatilla</h1>

        <div className="mt-4 rounded-[2rem] bg-[var(--color-surface)] p-6">
          <ShoeVisual spec={shoeSpec} />
        </div>

        <h2 className="mt-8 text-lg font-bold">Configurada para ti</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard label="Anchura" value={WIDTH_LABEL[footProfile.width]} emphasis />
          <StatCard
            label="Zona delantera"
            value={LEVEL_LABEL_SPACE[footProfile.toeBox]}
          />
          <StatCard label="Empeine" value={LEVEL_LABEL[footProfile.instep]} />
          <StatCard label="Amortiguación" value={LEVEL_LABEL[footProfile.cushioning]} />
          <StatCard label="Estabilidad" value={LEVEL_LABEL[footProfile.stability]} />
          <StatCard
            label="Cierre"
            value={CLOSURE_LABEL[shoeSpec.config.closure]}
          />
        </div>

        <section className="mt-8 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <h2 className="text-lg font-bold">
            ¿Por qué hemos elegido esta configuración?
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-base text-[var(--color-muted)]">
            {reasons.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3">
          <ButtonLink href="/personalizar" fullWidth>
            Personalizar mi zapatilla
          </ButtonLink>
          <ButtonLink href="/comprar" variant="secondary" fullWidth>
            Ver precio ({formatEur(price)})
          </ButtonLink>
        </div>
      </Screen>
    </>
  );
}
