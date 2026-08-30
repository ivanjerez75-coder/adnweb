"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { Notice } from "@/components/ui/Notice";
import { useSession } from "@/lib/session/SessionProvider";

export default function EntrarPage() {
  const router = useRouter();
  const { signIn, user } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    signIn({ name: name.trim(), email: email.trim() });
    router.push("/cuenta");
  }

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/cuenta" />
        <h1 className="text-2xl font-bold">Entrar en mi cuenta</h1>
        <p className="mt-2 text-base text-[var(--color-muted)]">
          Solo tu nombre y tu correo. Sin contraseñas.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
              Nombre
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-base"
              placeholder="Tu nombre"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
              Correo electrónico
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-base"
              placeholder="tu@correo.com"
            />
          </label>

          <Notice>
            Cuenta de demostración. Tus datos se guardan solo en este dispositivo.
          </Notice>

          <Button type="submit" fullWidth disabled={!valid}>
            Entrar
          </Button>
        </form>
      </Screen>
    </>
  );
}
