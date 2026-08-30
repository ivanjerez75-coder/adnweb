"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { ShoeVisual } from "@/components/ShoeVisual";
import type { ShoeSpec } from "@/lib/engine/types";

const HERO_SHOE: ShoeSpec = {
  widthScale: 0.62,
  toeBoxSpace: 0.6,
  instepVolume: 0.55,
  midsoleThickness: 0.6,
  heelCounterStiffness: 0.6,
  config: { color: "beige", closure: "velcro", insole: "comfort" },
  profile: {
    width: "wide",
    toeBox: "high",
    instep: "medium",
    stability: "high",
    cushioning: "high",
    closure: "velcro",
    flags: [],
    rationale: [],
  },
};

const STEPS = [
  {
    n: "01",
    title: "Cuéntanos sobre tus pies",
    body: "Un breve test para conocer tus necesidades.",
  },
  {
    n: "02",
    title: "Escanea tus pies",
    body: "Usa la cámara de tu móvil para obtener sus medidas y forma.",
  },
  {
    n: "03",
    title: "Creamos tu zapatilla",
    body: "Combinamos tus datos para crear tu configuración personalizada.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[760px] px-5 pb-24">
        <section className="pt-10 sm:pt-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-soft)] px-4 py-1.5 text-sm font-semibold text-[var(--color-brand)]">
            Zapatillas hechas a medida
          </p>
          <h1 className="text-[2rem] font-bold leading-[1.15] sm:text-[2.75rem]">
            Tu pie no debería adaptarse a la zapatilla.
            <br />
            <span className="text-[var(--color-brand)]">
              La zapatilla debería adaptarse a ti.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[var(--color-muted)]">
            Analizamos tus necesidades y la forma de tus pies para crear una
            zapatilla diseñada pensando en tu comodidad.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/test" className="sm:px-10">
              Crear mi zapatilla
            </ButtonLink>
            <ButtonLink href="#como-funciona" variant="secondary">
              ¿Cómo funciona?
            </ButtonLink>
          </div>
        </section>

        <section className="mt-12 rounded-[2rem] bg-[var(--color-surface)] p-6 sm:p-10">
          <div className="mx-auto max-w-[460px]">
            <ShoeVisual spec={HERO_SHOE} />
          </div>
          <p className="mt-4 text-center text-base text-[var(--color-muted)]">
            Una zapatilla moderna, ligera y con el espacio que tus pies necesitan.
          </p>
        </section>

        <section id="como-funciona" className="mt-16 scroll-mt-20">
          <h2 className="text-2xl font-bold">Cómo funciona</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-[var(--color-line)] bg-white p-5"
              >
                <span className="text-sm font-bold text-[var(--color-brand)]">
                  {s.n}
                </span>
                <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-base text-[var(--color-muted)]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <ButtonLink href="/test" fullWidth className="sm:w-auto sm:px-10">
              Empezar ahora
            </ButtonLink>
          </div>
        </section>

        <footer className="mt-20 border-t border-[var(--color-line)] pt-6 text-sm text-[var(--color-muted)]">
          <p>
            NONNA es una demostración (MVP). El escaneo, el análisis y la compra
            son simulados.{" "}
            <Link href="/cuenta" className="font-semibold text-[var(--color-brand)]">
              Ver mi cuenta
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
}
