"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { Marca } from "@/components/ui/Marca";
import { enviarCodigo, entrarConGoogle, verificarCodigo, type AuthState } from "./actions";

type Props = { next: string; url: string; errorInicial?: string };

const campo =
  "mt-2 w-full rounded-xl border border-transparent bg-superficie px-4 py-3 text-base text-grafito placeholder:text-suave focus:outline-none focus-visible:ring-2 focus-visible:ring-teal";
const etiqueta = "block text-sm font-medium text-white";
const principal =
  "mt-4 w-full rounded-xl bg-teal px-4 py-3 font-display text-lg leading-none font-bold tracking-[0.06em] text-white transition-colors hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50";
const enlace =
  "text-sm font-medium text-white/80 underline-offset-4 hover:text-white hover:underline";

function GoogleG() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#fff" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#fff" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-16.6z" />
      <path fill="#fff" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#fff" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function AuthForm({ next, url, errorInicial }: Props) {
  const [state, formAction, pending] = useActionState(
    (prev: AuthState, fd: FormData) =>
      fd.get("accion") === "verificar" ? verificarCodigo(prev, fd) : enviarCodigo(prev, fd),
    undefined,
  );
  // "Usar otro email" vuelve al paso 1 sin perder el estado anterior.
  const [volverDe, setVolverDe] = useState<AuthState>(undefined);
  const enCodigo = state?.paso === "codigo" && volverDe !== state;
  const error = state?.error ?? (state === undefined ? errorInicial : undefined);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <Marca className="mb-6 text-2xl" />
      <div className="w-full max-w-md rounded-[2rem] bg-grafito px-6 py-8 text-white shadow-xl sm:px-9 sm:py-10">
        <h1 className="font-display text-3xl leading-[0.95] font-extrabold text-balance text-white sm:text-4xl">
          {t("auth.titulo")}
        </h1>
        <p className="mt-3 text-base font-medium text-menta">
          {enCodigo ? t("auth.subtituloCodigo") : t("auth.subtitulo")}
        </p>
        {enCodigo && <p className="mt-1 text-sm text-white/70">{t("auth.notaEnlace")}</p>}

        <form action={formAction} className="mt-7">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="url" value={url} />
          {enCodigo ? (
            <>
              <label className={etiqueta}>
                {t("auth.email")}
                <input
                  type="email"
                  name="email"
                  readOnly
                  value={state?.email ?? ""}
                  className={`${campo} text-suave`}
                />
              </label>
              <label className={`${etiqueta} mt-4`}>
                {t("auth.codigo")}
                <input
                  type="text"
                  name="codigo"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoFocus
                  placeholder={t("auth.codigoPlaceholder")}
                  className={campo}
                />
              </label>
            </>
          ) : (
            <label className={etiqueta}>
              {t("auth.email")}
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                className={campo}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-white">
              <span className="rounded-md bg-rojo px-2 py-1">{error}</span>
            </p>
          )}
          {state?.info && !error && (
            <p role="status" className="mt-3 text-sm text-menta">
              {state.info}
            </p>
          )}

          <button
            type="submit"
            name="accion"
            value={enCodigo ? "verificar" : "enviar"}
            disabled={pending}
            className={principal}
          >
            {t("auth.continuar")}
          </button>

          {enCodigo && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                name="accion"
                value="reenviar"
                formNoValidate
                disabled={pending}
                className={enlace}
              >
                {t("auth.reenviar")}
              </button>
              <button type="button" onClick={() => setVolverDe(state)} className={enlace}>
                {t("auth.cambiarEmail")}
              </button>
            </div>
          )}
        </form>

        <div className="my-6 flex items-center gap-3 text-sm font-medium text-menta">
          <span aria-hidden="true" className="h-px flex-1 bg-white/20" />
          {t("auth.separador")}
          <span aria-hidden="true" className="h-px flex-1 bg-white/20" />
        </div>

        <form action={entrarConGoogle}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="url" value={url} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-black/30 px-4 py-3.5 text-lg font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-black/45"
          >
            <GoogleG />
            {t("auth.google")}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/70">
          {t("auth.legalAntes")}{" "}
          <Link href="/condiciones" className="font-medium text-menta underline-offset-2 hover:underline">
            {t("auth.condiciones")}
          </Link>{" "}
          {t("auth.legalY")}{" "}
          <Link href="/privacidad" className="font-medium text-menta underline-offset-2 hover:underline">
            {t("auth.privacidad")}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
