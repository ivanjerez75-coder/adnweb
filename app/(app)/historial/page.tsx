import { Suspense } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { repoDelUsuario } from "@/lib/server/auth/usuario";
import { EstadoPunto } from "@/components/shell/EstadoPunto";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

async function Contenido({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const buscar = typeof sp.buscar === "string" ? sp.buscar.trim() : "";
  const repo = await repoDelUsuario(buscar ? `/historial?buscar=${encodeURIComponent(buscar)}` : "/historial");
  const lista = await repo.listar({ buscar: buscar || undefined });
  return (
    <>
      <form method="get" role="search" className="mt-6 flex max-w-md gap-2">
        <input
          type="search"
          name="buscar"
          defaultValue={buscar}
          placeholder={t("historial.buscarPlaceholder")}
          aria-label={t("historial.buscarPlaceholder")}
          className="min-w-0 flex-1 rounded-full border border-borde bg-superficie px-4 py-2 text-sm text-grafito placeholder:text-suave focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full border border-borde bg-superficie px-4 py-2 text-sm font-semibold text-grafito transition-colors hover:bg-superficie-2"
        >
          {t("historial.buscar")}
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="mt-8 text-suave">
          <p>{buscar ? t("historial.sinResultados", { q: buscar }) : t("historial.vacio")}</p>
          {buscar && (
            <Link href="/historial" className="mt-2 inline-block font-medium text-teal hover:underline">
              {t("historial.verTodo")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-borde border-y border-borde">
          {lista.map((a) => (
            <li key={a.id}>
              <Link
                href={`/analisis/${a.id}`}
                className="flex items-center gap-3 px-2 py-3 transition-colors hover:bg-superficie-2 sm:px-3"
              >
                <EstadoPunto estado={a.estado} />
                <span className="min-w-0 flex-1 truncate font-medium text-grafito">{a.dominio}</span>
                <span className="hidden text-sm text-suave sm:inline">{t(`estado.${a.estado}`)}</span>
                <time dateTime={a.createdAt} className="shrink-0 text-sm text-suave">
                  {fecha(a.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Esqueleto() {
  return (
    <div aria-hidden="true" className="mt-6 space-y-3">
      <div className="h-10 max-w-md rounded-full bg-superficie-2" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-11 rounded-lg bg-superficie-2" />
      ))}
    </div>
  );
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 md:py-10">
      <h1 className="font-display text-5xl leading-[0.95] font-extrabold text-grafito uppercase">
        {t("historial.titulo")}
      </h1>
      <Suspense fallback={<Esqueleto />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
