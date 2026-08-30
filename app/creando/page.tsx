"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { ShoeVisual } from "@/components/ShoeVisual";
import { BuildChecklist } from "@/components/BuildChecklist";
import { buildShoe, getBuildSteps } from "@/lib/engine/shoeBuilder";
import { useRequire } from "@/lib/useRequire";
import { useSession } from "@/lib/session/SessionProvider";
import type { ShoeSpec } from "@/lib/engine/types";

export default function CreandoPage() {
  const router = useRouter();
  const { ok, loading } = useRequire("scan");
  const { footProfile, scan, shoeConfig, testAnswers, commitShoe, setShoeConfig } =
    useSession();

  const steps = useMemo(() => getBuildSteps(), []);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const startedRef = useRef(false);

  // Final spec, used both to animate toward and to store.
  const targetSpec: ShoeSpec | null = useMemo(() => {
    if (!footProfile) return null;
    const closure =
      shoeConfig.closure === "laces" ? footProfile.closure : shoeConfig.closure;
    const insole =
      testAnswers.usesOrthotics === "yes" ? "extra-cushion" : shoeConfig.insole;
    return buildShoe(footProfile, scan, { ...shoeConfig, closure, insole });
  }, [footProfile, scan, shoeConfig, testAnswers.usesOrthotics]);

  useEffect(() => {
    if (!ok || !targetSpec || startedRef.current) return;
    startedRef.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    const total = steps.reduce((s, x) => s + x.durationMs, 0);

    steps.forEach((step, i) => {
      timers.push(
        setTimeout(() => {
          setStepIndex(i);
          setProgress((elapsed + step.durationMs) / total);
        }, elapsed),
      );
      elapsed += step.durationMs;
    });

    timers.push(
      setTimeout(() => {
        setStepIndex(steps.length);
        setProgress(1);
        setShoeConfig({
          closure: targetSpec.config.closure,
          insole: targetSpec.config.insole,
        });
        commitShoe(targetSpec);
        setFinished(true);
      }, elapsed + 250),
    );

    return () => timers.forEach(clearTimeout);
  }, [ok, targetSpec, steps, commitShoe, setShoeConfig]);

  if (loading || !ok || !targetSpec) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0c1512] text-white/70">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0c1512] to-[#123029] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center px-5 py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
          NONNA
        </p>

        <h1 className="mt-6 text-center text-2xl font-bold sm:text-3xl">
          {finished ? "Tu zapatilla está lista." : "Estamos creando tu zapatilla"}
        </h1>
        <p className="mt-2 max-w-sm text-center text-base text-white/60">
          {finished
            ? "Hemos combinado tu test y el escaneo de tus pies en una única configuración."
            : "Estamos combinando la información de tu test y el escaneo de tus pies."}
        </p>

        <div className="my-8 w-full max-w-[420px]">
          <ShoeVisual
            spec={targetSpec}
            buildProgress={finished ? undefined : progress}
          />
        </div>

        <div className="h-1 w-full max-w-[420px] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <div className="mt-8 w-full">
          {finished ? (
            <ButtonLink
              href="/resultado"
              variant="secondary"
              fullWidth
              className="border-transparent"
            >
              Ver mi zapatilla
            </ButtonLink>
          ) : (
            <BuildChecklist steps={steps} currentIndex={stepIndex} />
          )}
        </div>
      </div>
    </div>
  );
}
