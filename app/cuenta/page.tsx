"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Screen, Wordmark } from "@/components/ui/Screen";
import { StatCard } from "@/components/ui/StatCard";
import { ShoeVisual } from "@/components/ShoeVisual";
import { FootVisual } from "@/components/FootVisual";
import {
  advanceStatus,
  getOrders,
  nextStatus,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STEPS,
} from "@/lib/engine/orders";
import { WIDTH_LABEL } from "@/lib/engine/recommendation";
import {
  CLOSURE_OPTIONS,
  COLOR_OPTIONS,
  INSOLE_OPTIONS,
} from "@/lib/engine/config";
import { formatEur } from "@/lib/engine/pricing";
import { useSession } from "@/lib/session/SessionProvider";
import type { Order } from "@/lib/engine/types";
import { cn } from "@/lib/cn";

export default function CuentaPage() {
  const { ready, user, footProfile, scan, order, updateOrder, signOut } =
    useSession();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (ready) setOrders(getOrders());
  }, [ready, order]);

  const allOrders = order
    ? [order, ...orders.filter((o) => o.id !== order.id)]
    : orders;

  function advance(id: string) {
    const updated = advanceStatus(id);
    if (updated) {
      updateOrder(updated);
      setOrders(getOrders());
    }
  }

  if (!ready) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[760px] items-center justify-between px-5">
        <Wordmark />
        {user ? (
          <button
            onClick={signOut}
            className="text-base font-semibold text-[var(--color-muted)]"
          >
            Salir
          </button>
        ) : null}
      </div>
      <Screen wide>
        <h1 className="text-2xl font-bold">
          {user ? `Hola, ${user.name.split(" ")[0]}` : "Mi cuenta"}
        </h1>

        {!user && (
          <div className="mt-4 rounded-2xl border border-[var(--color-line)] bg-white p-5">
            <p className="text-base text-[var(--color-muted)]">
              Entra para guardar tu perfil de pie y seguir tus pedidos.
            </p>
            <div className="mt-3">
              <ButtonLink href="/cuenta/entrar">Entrar</ButtonLink>
            </div>
          </div>
        )}

        {/* Foot profile */}
        <section className="mt-8">
          <h2 className="text-lg font-bold">Mi perfil de pie</h2>
          {!footProfile ? (
            <EmptyCard
              text="Aún no has hecho el test."
              cta={{ href: "/test", label: "Hacer el test" }}
            />
          ) : (
            <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {(["left", "right"] as const).map((s) => {
                  const m = scan?.[s];
                  return (
                    <div
                      key={s}
                      className="rounded-xl bg-[var(--color-surface)] p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12">
                          <FootVisual side={s} flags={footProfile.flags} />
                        </div>
                        <p className="text-base font-bold">
                          Pie {s === "left" ? "izquierdo" : "derecho"}
                        </p>
                      </div>
                      {m ? (
                        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                          <dt className="text-[var(--color-muted)]">Longitud</dt>
                          <dd className="text-right font-semibold">
                            {m.lengthMm} mm
                          </dd>
                          <dt className="text-[var(--color-muted)]">Anchura</dt>
                          <dd className="text-right font-semibold">
                            {m.widthMm} mm
                          </dd>
                          <dt className="text-[var(--color-muted)]">Empeine</dt>
                          <dd className="text-right font-semibold">
                            {m.instepHeightMm} mm
                          </dd>
                        </dl>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--color-muted)]">
                          Sin escaneo todavía.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Anchura"
                  value={WIDTH_LABEL[footProfile.width]}
                  emphasis
                />
                <StatCard
                  label="Características"
                  value={
                    footProfile.flags.length
                      ? `${footProfile.flags.length} detectadas`
                      : "Ninguna"
                  }
                  hint={footProfile.flags.map(featureLabel).join(", ") || undefined}
                />
                <StatCard
                  label="Cierre"
                  value={label(CLOSURE_OPTIONS, footProfile.closure)}
                />
              </div>
            </div>
          )}
        </section>

        {/* Shoes / orders */}
        <section className="mt-8">
          <h2 className="text-lg font-bold">Mis zapatillas</h2>
          {allOrders.length === 0 ? (
            <EmptyCard
              text="Todavía no has creado ninguna zapatilla."
              cta={{ href: "/test", label: "Crear mi zapatilla" }}
            />
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {allOrders.map((o) => (
                <OrderCard key={o.id} order={o} onAdvance={() => advance(o.id)} />
              ))}
            </div>
          )}
        </section>

        <p className="mt-10 text-sm text-[var(--color-muted)]">
          NONNA es un MVP. Los pedidos y estados son simulados.{" "}
          <Link href="/" className="font-semibold text-[var(--color-brand)]">
            Inicio
          </Link>
        </p>
      </Screen>
    </>
  );
}

function OrderCard({
  order,
  onAdvance,
}: {
  order: Order;
  onAdvance: () => void;
}) {
  const activeIdx = ORDER_STATUS_STEPS.findIndex((s) => s.status === order.status);
  const canAdvance = nextStatus(order.status) !== null;

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="w-28 shrink-0 rounded-xl bg-[var(--color-surface)] p-2">
          <ShoeVisual spec={order.shoe} />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold">Zapatilla NONNA a medida</p>
          <p className="text-sm text-[var(--color-muted)]">
            Pedido {order.id} ·{" "}
            {new Date(order.createdAt).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {label(COLOR_OPTIONS, order.shoe.config.color)} ·{" "}
            {label(CLOSURE_OPTIONS, order.shoe.config.closure)} ·{" "}
            {label(INSOLE_OPTIONS, order.shoe.config.insole)}
          </p>
          <p className="mt-1 text-base font-bold text-[var(--color-brand)]">
            {formatEur(order.priceEur)}
          </p>
        </div>
      </div>

      {/* status track */}
      <div className="mt-4 flex items-center">
        {ORDER_STATUS_STEPS.map((step, i) => (
          <div key={step.status} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold",
                  i <= activeIdx
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                    : "border-[var(--color-line)] text-[var(--color-muted)]",
                )}
              >
                {i <= activeIdx ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "mt-1 text-[11px] font-medium",
                  i === activeIdx
                    ? "text-[var(--color-brand)]"
                    : "text-[var(--color-muted)]",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < ORDER_STATUS_STEPS.length - 1 && (
              <span
                className={cn(
                  "mx-1 h-[2px] flex-1",
                  i < activeIdx
                    ? "bg-[var(--color-brand)]"
                    : "bg-[var(--color-line)]",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        {canAdvance ? (
          <Button variant="secondary" onClick={onAdvance}>
            Simular avance del pedido
          </Button>
        ) : (
          <p className="text-base font-semibold text-[var(--color-brand)]">
            {ORDER_STATUS_LABEL[order.status]} ✓
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyCard({
  text,
  cta,
}: {
  text: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-5 text-center">
      <p className="text-base text-[var(--color-muted)]">{text}</p>
      <div className="mt-3">
        <ButtonLink href={cta.href} variant="secondary">
          {cta.label}
        </ButtonLink>
      </div>
    </div>
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

function label<T extends { value: string; label: string }>(
  opts: T[],
  value: string,
): string {
  return opts.find((o) => o.value === value)?.label ?? value;
}
