import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { Progreso } from "./progreso";
import { Secciones } from "./secciones";

// Dentro del panel de la app; el diseño del informe llega en el Plan B.
const MAIN = "mx-auto w-full max-w-4xl px-4 py-8 [overflow-wrap:anywhere] sm:px-8";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = await repoDelUsuario(`/analisis/${id}`);
  const a = await repo.obtener(id);
  if (!a) notFound();

  if (a.version === 3 && a.estado !== "error") {
    return (
      <main className={MAIN}>
        <h1>{a.dominio}</h1>
        <Secciones
          id={a.id}
          createdAt={a.createdAt}
          inicial={{ estado: a.estado, pasoActual: a.pasoActual, secciones: a.secciones }}
        />
        <p>
          <Link href="/dashboard">Volver al panel</Link>
        </p>
      </main>
    );
  }
  if (a.estado === "procesando") {
    return (
      <main className={MAIN}>
        <h1>{a.dominio}</h1>
        <Progreso id={a.id} />
      </main>
    );
  }
  if (a.estado !== "listo") {
    return (
      <main className={MAIN}>
        <h1>{a.dominio}</h1>
        <p role="alert">{a.error ?? "Ha ocurrido un error inesperado. Te hemos devuelto el crédito."}</p>
        <p>
          <Link href="/dashboard">Probar otra URL</Link>
        </p>
      </main>
    );
  }
  // Informe antiguo (version 2).
  const informe = a.informe;
  return (
    <main className={MAIN}>
      <h1>{a.dominio}</h1>
      <p>Informe de una versión anterior</p>
      {informe ? <p>{informe.resumen.queHace}</p> : <p>El informe no está disponible.</p>}
      <p>
        <Link href="/dashboard">Volver al panel</Link>
      </p>
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Contenido params={params} />
    </Suspense>
  );
}
