"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { Notice } from "@/components/ui/Notice";
import { formatEur, getPrice } from "@/lib/engine/pricing";
import { createOrder, ORDER_STATUS_LABEL } from "@/lib/engine/orders";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import type { Order } from "@/lib/engine/types";

export default function CheckoutPage() {
  const { ok, loading } = useRequire("shoe");
  const { shoeSpec, user, order, placeOrder } = useSession();
  const [placed, setPlaced] = useState<Order | null>(order);

  if (loading || !ok || !shoeSpec) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  const price = getPrice(shoeSpec);

  function pay() {
    const created = createOrder(shoeSpec!, price);
    placeOrder(created);
    setPlaced(created);
  }

  if (placed) {
    return (
      <>
        <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
          <Wordmark />
        </div>
        <Screen>
          <div className="animate-fade-up rounded-[2rem] bg-[var(--color-brand-soft)] p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--color-brand)] text-3xl text-white">
              ✓
            </div>
            <h1 className="mt-4 text-2xl font-bold">Pedido confirmado</h1>
            <p className="mt-2 text-base text-[var(--color-muted)]">
              Hemos empezado a preparar tu zapatilla.
            </p>
            <p className="mt-4 text-base">
              Número de pedido:{" "}
              <span className="font-bold">{placed.id}</span>
            </p>
            <p className="text-base">
              Estado:{" "}
              <span className="font-bold text-[var(--color-brand)]">
                {ORDER_STATUS_LABEL[placed.status]}
              </span>
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <ButtonLink href="/cuenta" fullWidth>
              Ver mi pedido
            </ButtonLink>
            <ButtonLink href="/" variant="ghost" fullWidth>
              Volver al inicio
            </ButtonLink>
          </div>
        </Screen>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/comprar" />
        <h1 className="text-2xl font-bold">Finalizar compra</h1>

        <div className="mt-4">
          <Notice tone="warn">
            Pago simulado — esto es una demostración. No introduzcas datos reales.
          </Notice>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <span className="text-base font-medium">Zapatilla NONNA a medida</span>
          <span className="text-xl font-bold">{formatEur(price)}</span>
        </div>

        <form
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-white p-5 opacity-90"
          onSubmit={(e) => e.preventDefault()}
        >
          <MockField label="Nombre" value={user?.name ?? "María López"} />
          <MockField label="Dirección" value="Calle Mayor 12, 28013 Madrid" />
          <MockField label="Correo electrónico" value={user?.email ?? "maria@example.com"} />
          <MockField label="Tarjeta" value="•••• •••• •••• ••••" mono />
          <p className="text-sm text-[var(--color-muted)]">
            Los campos están desactivados a propósito en esta demostración.
          </p>
        </form>

        <div className="mt-6">
          <Button fullWidth onClick={pay}>
            Pagar {formatEur(price)}
          </Button>
        </div>
      </Screen>
    </>
  );
}

function MockField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
        {label}
      </span>
      <input
        disabled
        value={value}
        readOnly
        className={`w-full cursor-not-allowed rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-base text-[var(--color-muted)] ${
          mono ? "font-mono tracking-widest" : ""
        }`}
      />
    </label>
  );
}
