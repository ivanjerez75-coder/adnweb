import { Suspense } from "react";
import Link from "next/link";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { NuevoAnalisis } from "./nuevo-analisis";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

async function Contenido({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const url = typeof sp.url === "string" ? sp.url : "";
  const repo = await repoDelUsuario("/dashboard");
  const [perfil, ultimos] = await Promise.all([repo.obtenerPerfil(), repo.listar({ limite: 5 })]);
  return (
    <main>
      <h1>Panel</h1>
      <p>
        Créditos: {perfil.creditosRestantes} de {perfil.creditosMensuales} · se renuevan el{" "}
        {new Date(perfil.renovacion).toLocaleDateString("es-ES")}
      </p>
      <NuevoAnalisis urlInicial={url} />
      <h2>Últimos análisis</h2>
      <ul>
        {ultimos.map((a) => (
          <li key={a.id}>
            <Link href={`/analisis/${a.id}`}>{a.dominio}</Link> · {a.estado}
          </li>
        ))}
      </ul>
      <p>
        <Link href="/historial">Ver historial</Link> · <Link href="/cuenta">Mi cuenta</Link>
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
