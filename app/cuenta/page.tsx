import { Suspense } from "react";
import Link from "next/link";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { cerrarSesion } from "../(auth)/actions";

async function Contenido() {
  const repo = await repoDelUsuario("/cuenta");
  const perfil = await repo.obtenerPerfil();
  return (
    <main>
      <h1>Mi cuenta</h1>
      {perfil.nombre && <p>{perfil.nombre}</p>}
      <p>
        Créditos: {perfil.creditosRestantes} de {perfil.creditosMensuales} · se renuevan el{" "}
        {new Date(perfil.renovacion).toLocaleDateString("es-ES")}
      </p>
      <form action={cerrarSesion}>
        <button type="submit">Cerrar sesión</button>
      </form>
      <p>
        <Link href="/dashboard">Volver al panel</Link>
      </p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Contenido />
    </Suspense>
  );
}
