"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { ScanStage } from "@/components/ScanStage";
import { StatCard } from "@/components/ui/StatCard";
import { runScan, SCAN_STAGES } from "@/lib/engine/scan";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import type { ScanResult } from "@/lib/engine/types";

type Phase = "idle" | "scanning" | "done";

export default function EscaneoPage() {
  const router = useRouter();
  const { ok, loading } = useRequire("profile");
  const { footProfile, scan, setScan } = useSession();

  const [phase, setPhase] = useState<Phase>(scan ? "done" : "idle");
  const [statusLabel, setStatusLabel] = useState("Coloca el pie dentro del área marcada.");
  const [side, setSide] = useState<"left" | "right">("right");
  const [result, setResult] = useState<ScanResult | null>(scan);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (loading || !ok || !footProfile) {
    return (
      <Screen>
        <p className="pt-20 text-center text-[var(--color-muted)]">Cargando…</p>
      </Screen>
    );
  }

  async function start() {
    setPhase("scanning");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runScan(footProfile!, {
        signal: controller.signal,
        onStage: (stage) => setStatusLabel(stage.label),
      });
      setResult(res);
      setScan(res);
      setPhase("done");
      setStatusLabel(SCAN_STAGES[SCAN_STAGES.length - 1].label);
    } catch {
      /* aborted */
    }
  }

  const m = result ? result[side] : null;

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/perfil" />
        <h1 className="text-2xl font-bold">Escanea tu pie</h1>
        <p className="mt-2 text-base text-[var(--color-muted)]">
          Coloca el pie dentro del área marcada y sigue las instrucciones.
        </p>

        <div className="mt-8">
          <ScanStage
            side={side}
            flags={footProfile.flags}
            scanning={phase === "scanning"}
            statusLabel={statusLabel}
          />
        </div>

        {phase === "idle" && (
          <div className="mt-8">
            <Button fullWidth onClick={start}>
              Comenzar escaneo
            </Button>
          </div>
        )}

        {phase === "scanning" && (
          <p className="mt-8 text-center text-base text-[var(--color-muted)]">
            Mantén el pie quieto…
          </p>
        )}

        {phase === "done" && m && (
          <div className="mt-8 animate-fade-up">
            <div className="mb-4 flex justify-center gap-2">
              {(["left", "right"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`rounded-full px-5 py-2 text-base font-semibold transition-colors ${
                    side === s
                      ? "bg-[var(--color-brand)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-ink)]"
                  }`}
                >
                  Pie {s === "left" ? "izquierdo" : "derecho"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Longitud" value={`${m.lengthMm} mm`} />
              <StatCard label="Anchura" value={`${m.widthMm} mm`} emphasis />
              <StatCard label="Altura del empeine" value={`${m.instepHeightMm} mm`} />
              <StatCard label="Ancho del talón" value={`${m.heelWidthMm} mm`} />
            </div>
            <p className="mt-3 text-center text-sm text-[var(--color-muted)]">
              Cada pie se mide por separado: tus medidas izquierda y derecha son
              ligeramente distintas.
            </p>

            <div className="mt-6">
              <ButtonLink href="/creando" fullWidth>
                Crear mi zapatilla
              </ButtonLink>
            </div>
            <button
              onClick={() => {
                setPhase("idle");
                setStatusLabel("Coloca el pie dentro del área marcada.");
              }}
              className="mt-3 w-full text-center text-base font-medium text-[var(--color-muted)]"
            >
              Repetir escaneo
            </button>
          </div>
        )}
      </Screen>
    </>
  );
}
