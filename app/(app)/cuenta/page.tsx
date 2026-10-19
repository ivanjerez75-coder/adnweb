import { Suspense, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { sesionDelUsuario } from "@/lib/server/auth/usuario";
import { cerrarSesion } from "@/app/(auth)/actions";
import { Boton } from "@/components/ui/Boton";

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-borde py-6 sm:grid sm:grid-cols-[180px_1fr] sm:gap-6">
      <h2 className="text-sm font-semibold text-grafito">{titulo}</h2>
      <div className="mt-2 text-grafito sm:mt-0">{children}</div>
    </section>
  );
}

async function Contenido() {
  const { repo, email } = await sesionDelUsuario("/cuenta");
  const perfil = await repo.obtenerPerfil();
  const renovacion = new Date(perfil.renovacion).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="mt-8">
      <Bloque titulo={t("ajustes.cuenta")}>
        {perfil.nombre && <p className="font-medium">{perfil.nombre}</p>}
        <p>
          <span className="text-suave">{t("ajustes.email")}: </span>
          <span className="break-all">{email ?? "—"}</span>
        </p>
      </Bloque>
      <Bloque titulo={t("ajustes.creditos")}>
        <p className="font-medium">
          {t("barra.creditos", { n: perfil.creditosRestantes, total: perfil.creditosMensuales })}
        </p>
        <p className="mt-1 text-sm text-suave">{t("ajustes.renovacion", { fecha: renovacion })}</p>
      </Bloque>
      <Bloque titulo={t("ajustes.sesion")}>
        <p className="text-sm text-suave">{t("ajustes.sesionTexto")}</p>
        <form action={cerrarSesion} className="mt-3">
          <Boton type="submit" variante="secundario">
            {t("auth.salir")}
          </Boton>
        </form>
      </Bloque>
    </div>
  );
}

function Esqueleto() {
  return (
    <div aria-hidden="true" className="mt-8 space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-lg bg-superficie-2" />
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 md:py-10">
      <h1 className="font-display text-5xl leading-[0.95] font-extrabold text-grafito uppercase">
        {t("ajustes.titulo")}
      </h1>
      <Suspense fallback={<Esqueleto />}>
        <Contenido />
      </Suspense>
    </main>
  );
}
