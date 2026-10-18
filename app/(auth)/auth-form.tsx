"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "./actions";

type Props = {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  modo: "login" | "registro";
  next: string;
  url: string;
};

export function AuthForm({ action, modo, next, url }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const esRegistro = modo === "registro";
  const qs = new URLSearchParams();
  if (next) qs.set("next", next);
  if (url) qs.set("url", url);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return (
    <main>
      <h1>{esRegistro ? "Crear cuenta" : "Iniciar sesión"}</h1>
      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="url" value={url} />
        {esRegistro && (
          <p>
            <label>
              Nombre <input type="text" name="nombre" autoComplete="name" />
            </label>
          </p>
        )}
        <p>
          <label>
            Email <input type="email" name="email" required autoComplete="email" />
          </label>
        </p>
        <p>
          <label>
            Contraseña{" "}
            <input
              type="password"
              name="password"
              required
              minLength={esRegistro ? 8 : undefined}
              autoComplete={esRegistro ? "new-password" : "current-password"}
            />
          </label>
        </p>
        {state?.error && <p role="alert">{state.error}</p>}
        {state?.info && <p role="status">{state.info}</p>}
        <button type="submit" disabled={pending}>
          {esRegistro ? "Crear cuenta" : "Entrar"}
        </button>
      </form>
      <p>
        {esRegistro ? (
          <>
            ¿Ya tienes cuenta? <Link href={`/login${suffix}`}>Inicia sesión</Link>
          </>
        ) : (
          <>
            ¿No tienes cuenta? <Link href={`/registro${suffix}`}>Regístrate</Link>
          </>
        )}
      </p>
    </main>
  );
}
