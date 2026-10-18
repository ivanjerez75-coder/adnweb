import { Suspense } from "react";
import { iniciarSesion } from "../actions";
import { AuthForm } from "../auth-form";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

function uno(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

async function Formulario({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <AuthForm action={iniciarSesion} modo="login" next={uno(sp.next)} url={uno(sp.url)} />;
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={null}>
      <Formulario searchParams={searchParams} />
    </Suspense>
  );
}
