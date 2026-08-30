"use client";

import { ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { ShoeVisual } from "@/components/ShoeVisual";
import { formatEur, getPrice } from "@/lib/engine/pricing";
import { WIDTH_LABEL } from "@/lib/engine/recommendation";
import {
  CLOSURE_OPTIONS,
  COLOR_OPTIONS,
  INSOLE_OPTIONS,
} from "@/lib/engine/config";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";

export default function ComprarPage() {
  const { ok, loading } = useRequire("shoe");
  const { shoeSpec, footProfile, shoeConfig } = useSession();

  if (loading || !ok || !shoeSpec || !footProfile) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  const price = getPrice(shoeSpec);
  const l = <T extends { value: string; label: string }>(o: T[], v: string) =>
    o.find((x) => x.value === v)?.label ?? v;

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/personalizar" />
        <h1 className="text-2xl font-bold">Tu zapatilla personalizada</h1>

        <div className="mt-4 rounded-[2rem] bg-[var(--color-surface)] p-6">
          <ShoeVisual spec={shoeSpec} />
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-base text-[var(--color-muted)]">Precio</p>
              <p className="text-4xl font-bold text-[var(--color-brand)]">
                {formatEur(price)}
              </p>
            </div>
            <p className="pb-1 text-sm text-[var(--color-muted)]">IVA incluido</p>
          </div>
          <p className="mt-2 text-base text-[var(--color-muted)]">
            Fabricada según tu configuración.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--color-line)] pt-4 text-base">
            <dt className="text-[var(--color-muted)]">Anchura</dt>
            <dd className="text-right font-semibold">
              {WIDTH_LABEL[footProfile.width]}
            </dd>
            <dt className="text-[var(--color-muted)]">Color</dt>
            <dd className="text-right font-semibold">
              {l(COLOR_OPTIONS, shoeConfig.color)}
            </dd>
            <dt className="text-[var(--color-muted)]">Cierre</dt>
            <dd className="text-right font-semibold">
              {l(CLOSURE_OPTIONS, shoeConfig.closure)}
            </dd>
            <dt className="text-[var(--color-muted)]">Plantilla</dt>
            <dd className="text-right font-semibold">
              {l(INSOLE_OPTIONS, shoeConfig.insole)}
            </dd>
          </dl>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <ButtonLink href="/checkout" fullWidth>
            Personalizar y comprar
          </ButtonLink>
          <ButtonLink href="/personalizar" variant="ghost" fullWidth>
            Seguir personalizando
          </ButtonLink>
        </div>
      </Screen>
    </>
  );
}
