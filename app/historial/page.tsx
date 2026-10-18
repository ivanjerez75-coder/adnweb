import { Suspense } from "react";
import Link from "next/link";
import { repoDelUsuario } from "@/lib/server/auth/usuario";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

async function Contenido({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const buscar = typeof sp.buscar === "string" ? sp.buscar.trim() : "";
  const repo = await repoDelUsuario("/historial");
  const lista = await repo.listar({ buscar: buscar || undefined });
  return (
    <main>
      <h1>Historial</h1>
      <form method="get">
        <input type="text" name="buscar" defaultValue={buscar} placeholder="Buscar dominio" aria-label="Buscar" />
        <button type="submit">Buscar</button>
      </form>
      <ul>
        {lista.map((a) => (
          <li key={a.id}>
            <Link href={`/analisis/${a.id}`}>{a.dominio}</Link> · {a.estado} ·{" "}
            {new Date(a.createdAt).toLocaleDateString("es-ES")}
          </li>
        ))}
      </ul>
      {lista.length === 0 && <p>No hay análisis.</p>}
      <p>
        <Link href="/dashboard">Volver al panel</Link>
      </p>
    </main>
  );
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={null}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}
