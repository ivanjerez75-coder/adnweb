import { Suspense } from "react";
import { t } from "@/lib/i18n";
import { Destacado } from "@/components/ui/Destacado";
import { NuevoAnalisis } from "./nuevo-analisis";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

/** Lee ?url= (p. ej. desde la landing) y rellena el buscador. */
async function Buscador({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const url = typeof sp.url === "string" ? sp.url : "";
  return <NuevoAnalisis urlInicial={url} />;
}

function EsqueletoBuscador() {
  return (
    <div aria-hidden="true" className="w-full max-w-2xl">
      <div className="h-[60px] rounded-full bg-superficie-2" />
      <div className="mt-4 h-8" />
    </div>
  );
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-8 md:pb-24">
      <h1 className="font-display text-[clamp(2.25rem,6vw,4.75rem)] leading-[0.95] font-extrabold tracking-[-0.005em] text-balance text-grafito uppercase">
        <Destacado texto={t("panel.titulo")} />
      </h1>
      <div className="mt-10 flex w-full justify-center sm:mt-12">
        <Suspense fallback={<EsqueletoBuscador />}>
          <Buscador searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
