"use client";

import { useId, useRef, useState } from "react";
import { t } from "@/lib/i18n";

export const EJEMPLOS_POR_DEFECTO = [
  { nombre: "Canva", dominio: "canva.com" },
  { nombre: "Notion", dominio: "notion.so" },
  { nombre: "Stripe", dominio: "stripe.com" },
  { nombre: "Shopify", dominio: "shopify.com" },
  { nombre: "ChatGPT", dominio: "chatgpt.com" },
];

type Props = {
  /** Server Action del formulario (p. ej. la landing). */
  accion?: (formData: FormData) => void | Promise<void>;
  /** Alternativa en cliente: recibe la URL sin recargar ni reiniciar el formulario. */
  alEnviar?: (url: string) => void;
  /** Mensaje de error, que se muestra justo bajo el campo. */
  error?: string | null;
  /** Mientras se envía: desactiva el botón. */
  ocupado?: boolean;
  valorInicial?: string;
  placeholder?: string;
  ejemplos?: { nombre: string; dominio: string }[];
  /** id del campo, para enlazarlo (p. ej. el botón de la landing). */
  idCampo?: string;
};

export function BuscadorUrl({
  accion,
  alEnviar,
  error,
  ocupado = false,
  valorInicial = "",
  placeholder,
  ejemplos = EJEMPLOS_POR_DEFECTO,
  idCampo,
}: Props) {
  const [valor, setValor] = useState(valorInicial);
  const ref = useRef<HTMLInputElement>(null);
  const idError = useId();

  return (
    <div className="w-full max-w-2xl">
      <form
        action={alEnviar ? undefined : accion}
        onSubmit={
          alEnviar
            ? (e) => {
                e.preventDefault();
                alEnviar(valor);
              }
            : undefined
        }
        aria-busy={ocupado || undefined}
        className="pildora-brillo flex items-center gap-3 rounded-full bg-superficie p-2 pl-3"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-grafito"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
          </svg>
        </span>
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-borde" />
        <input
          ref={ref}
          id={idCampo}
          name="url"
          type="text"
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder ?? t("landing.placeholder")}
          aria-label={t("comun.campoUrl")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className="min-w-0 flex-1 bg-transparent text-base text-grafito placeholder:text-suave focus:outline-none"
        />
        <button
          type="submit"
          aria-label={t("comun.analizarUrl")}
          disabled={ocupado}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-white transition-colors hover:bg-teal/90 disabled:cursor-wait disabled:opacity-60"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {error && (
        <p id={idError} role="alert" className="mt-3 px-4 text-center text-sm font-medium text-rojo">
          {error}
        </p>
      )}
      {ejemplos.length > 0 && (
        <ul
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
          aria-label={t("landing.ejemplosEtiqueta")}
        >
          {ejemplos.map((e) => (
            <li key={e.dominio}>
              <button
                type="button"
                onClick={() => {
                  setValor(e.dominio);
                  ref.current?.focus();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-3.5 py-1.5 text-sm font-medium text-grafito transition-colors hover:bg-superficie-2"
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-full border-2 border-teal"
                />
                {e.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
