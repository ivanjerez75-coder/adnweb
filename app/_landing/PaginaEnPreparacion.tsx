import Link from "next/link";
import { t } from "@/lib/i18n";
import { Marca } from "@/components/ui/Marca";

/** Página provisional para los enlaces legales del pie. */
export function PaginaEnPreparacion({ titulo }: { titulo: string }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:px-6">
      <Link href="/" aria-label={t("legal.volverInicio")} className="self-start">
        <Marca className="text-2xl" />
      </Link>
      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="font-display text-[clamp(2.5rem,8vw,4.5rem)] leading-[0.95] font-extrabold text-grafito uppercase">
          {titulo}
        </h1>
        <p className="mt-4 text-lg text-suave">{t("legal.enPreparacion")}</p>
        <Link
          href="/"
          className="mt-8 self-start font-medium text-teal underline-offset-4 hover:underline"
        >
          {t("legal.volverInicio")}
        </Link>
      </div>
    </main>
  );
}
