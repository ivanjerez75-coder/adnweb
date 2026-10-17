import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { Progreso } from "./progreso";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = await repoDelUsuario(`/analisis/${id}`);
  const a = await repo.obtener(id);
  if (!a) notFound();

  if (a.estado === "procesando") {
    return (
      <main>
        <h1>{a.dominio}</h1>
        <Progreso id={a.id} />
      </main>
    );
  }
  if (a.estado === "error") {
    return (
      <main>
        <h1>{a.dominio}</h1>
        <p role="alert">{a.error ?? "Ha ocurrido un error inesperado. Te hemos devuelto el crédito."}</p>
        <p>
          <Link href="/dashboard">Probar otra URL</Link>
        </p>
      </main>
    );
  }
  const informe = a.informe;
  return (
    <main>
      <h1>{a.dominio}</h1>
      {informe && (
        <>
          <p>{informe.resumen.queHace}</p>
          <p>Puntuación: {informe.veredicto.puntuacion}</p>
          <pre>{JSON.stringify(informe, null, 2)}</pre>
        </>
      )}
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
