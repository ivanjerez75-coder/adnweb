import { Suspense } from "react";
import { t } from "@/lib/i18n";
import { AuthForm } from "../auth-form";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

function uno(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

async function Formulario({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Solo se muestra un mensaje fijo: el parámetro error nunca se pinta tal cual.
  const errorInicial = uno(sp.error) ? t("auth.errorGoogle") : undefined;
  return <AuthForm next={uno(sp.next)} url={uno(sp.url)} errorInicial={errorInicial} />;
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={null}>
      <Formulario searchParams={searchParams} />
    </Suspense>
  );
}
