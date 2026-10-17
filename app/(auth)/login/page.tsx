import { iniciarSesion } from "../actions";
import { AuthForm } from "../auth-form";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

function uno(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <AuthForm action={iniciarSesion} modo="login" next={uno(sp.next)} url={uno(sp.url)} />;
}
