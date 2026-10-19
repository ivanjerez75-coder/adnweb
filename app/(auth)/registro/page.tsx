import { Suspense } from "react";
import { redirect } from "next/navigation";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

async function Redirigir({ searchParams }: { searchParams: SP }): Promise<null> {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["next", "url"]) {
    const v = sp[k];
    if (typeof v === "string" && v) qs.set(k, v);
  }
  redirect(qs.toString() ? `/login?${qs.toString()}` : "/login");
  return null;
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={null}>
      <Redirigir searchParams={searchParams} />
    </Suspense>
  );
}
