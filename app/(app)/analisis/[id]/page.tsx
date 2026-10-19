import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/lib/i18n";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { Informe, VolverAnalizar } from "./informe";

const MAIN = "mx-auto w-full max-w-6xl px-4 py-8 [overflow-wrap:anywhere] sm:px-8";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Página sencilla para los informes que no se pintan con la vista v4 (antiguos o con error). */
function Aviso({ dominio, children }: { dominio: string; children: ReactNode }) {
  return (
    <main className={MAIN}>
      <h1 className="font-display text-[clamp(2.25rem,6vw,4rem)] leading-[0.95] font-extrabold text-grafito uppercase">{dominio}</h1>
      <div className="mt-6 max-w-2xl rounded-[14px] border border-borde bg-superficie p-6">{children}</div>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = await repoDelUsuario(`/analisis/${id}`);
  const a = await repo.obtener(id);
  if (!a) notFound();

  // Informe v4 o análisis en curso (los análisis nuevos se guardan siempre por secciones v4).
  if ((a.version === 4 && a.estado !== "error") || a.estado === "procesando") {
    return (
      <main className={MAIN}>
        <Informe
          id={a.id}
          createdAt={a.createdAt}
          dominio={a.dominio}
          inicial={{ estado: a.estado, pasoActual: a.pasoActual, secciones: a.secciones }}
        />
        <p className="mt-12 text-sm">
          <Link href="/dashboard" className="text-teal hover:underline">
            {t("informe.volverPanel")}
          </Link>
        </p>
      </main>
    );
  }
  if (a.estado === "error") {
    return (
      <Aviso dominio={a.dominio}>
        <p role="alert">{a.error ?? t("informe.errorInesperado")}</p>
        <p className="mt-4">
          <Link href="/dashboard" className="font-semibold text-teal hover:underline">
            {t("informe.probarOtra")}
          </Link>
        </p>
      </Aviso>
    );
  }
  // Informes v3 (secciones antiguas) y v2 (columna informe): no se pintan con la vista v4.
  const queHace = a.version === 3 ? null : a.informe?.resumen?.queHace;
  return (
    <Aviso dominio={a.dominio}>
      <p role="note">{t("informe.versionAnterior")}</p>
      {a.version !== 3 && <p className="mt-3 text-suave">{queHace ?? t("informe.noDisponible")}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <VolverAnalizar dominio={a.dominio} />
        <Link href="/dashboard" className="text-sm text-teal hover:underline">
          {t("informe.volverPanel")}
        </Link>
      </div>
    </Aviso>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Contenido params={params} />
    </Suspense>
  );
}
