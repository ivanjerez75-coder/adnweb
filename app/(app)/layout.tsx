import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Marca } from "@/components/ui/Marca";
import { BarraLateral, type DatosBarra } from "@/components/shell/BarraLateral";
import { BarraSuperior, MenuMovil } from "@/components/shell/MenuMovil";
import { repoSiHaySesion } from "@/lib/server/auth/usuario";

/** Lee la sesión y los recientes en el servidor; va dentro de <Suspense>. */
async function Barra() {
  const repo = await repoSiHaySesion();
  // Sin sesión el proxy y la página ya redirigen a /login; aquí basta con no romper.
  if (!repo) return <EsqueletoBarra />;
  let datos: DatosBarra;
  try {
    const [perfil, recientes] = await Promise.all([repo.obtenerPerfil(), repo.listar({ limite: 20 })]);
    datos = {
      recientes,
      creditos: { restantes: perfil.creditosRestantes, mensuales: perfil.creditosMensuales },
    };
  } catch {
    // Un fallo leyendo la barra no debe tumbar la página que hay al lado.
    datos = { recientes: [], creditos: null };
  }
  return (
    <>
      <MenuMovil {...datos} />
      <aside className="hidden shrink-0 md:sticky md:top-0 md:block md:h-svh">
        <BarraLateral {...datos} modo="fija" />
      </aside>
    </>
  );
}

function EsqueletoBarra() {
  return (
    <>
      <BarraSuperior>
        <span aria-hidden="true" className="h-10 w-10 rounded-lg bg-borde/40" />
      </BarraSuperior>
      <aside
        aria-hidden="true"
        className="hidden w-[260px] shrink-0 flex-col gap-3 px-6 pt-6 md:sticky md:top-0 md:flex md:h-svh"
      >
        <div className="mb-4 h-8 w-20 self-end rounded-lg bg-borde/40" />
        <div className="h-9 rounded-lg bg-borde/40" />
        <div className="mt-6 h-3 w-20 rounded bg-borde/40" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 rounded-lg bg-borde/30" />
        ))}
      </aside>
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col bg-fondo md:flex-row">
      <Suspense fallback={<EsqueletoBarra />}>
        <Barra />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col px-2 pb-2 md:py-3 md:pr-3 md:pl-0">
        <div className="flex min-w-0 flex-1 flex-col rounded-3xl bg-superficie shadow-[0_1px_3px_rgb(57_57_57/0.06)]">
          <div className="hidden px-8 pt-7 md:block">
            <Link href="/dashboard" className="inline-block rounded">
              <Marca className="text-2xl" />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
