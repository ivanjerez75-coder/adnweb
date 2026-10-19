"use client";

import { useRef, useState } from "react";
import { t } from "@/lib/i18n";

export const EJEMPLOS_POR_DEFECTO = [
  { nombre: "Canva", dominio: "canva.com" },
  { nombre: "Notion", dominio: "notion.so" },
  { nombre: "Stripe", dominio: "stripe.com" },
  { nombre: "Shopify", dominio: "shopify.com" },
  { nombre: "ChatGPT", dominio: "chatgpt.com" },
];

type Props = {
  accion: (formData: FormData) => void | Promise<void>;
  valorInicial?: string;
  placeholder?: string;
  ejemplos?: { nombre: string; dominio: string }[];
};

export function BuscadorUrl({
  accion,
  valorInicial = "",
  placeholder,
  ejemplos = EJEMPLOS_POR_DEFECTO,
}: Props) {
  const [valor, setValor] = useState(valorInicial);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full max-w-2xl">
      <form
        action={accion}
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
          name="url"
          type="text"
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder ?? t("landing.placeholder")}
          aria-label={t("comun.campoUrl")}
          className="min-w-0 flex-1 bg-transparent text-base text-grafito placeholder:text-suave focus:outline-none"
        />
        <button
          type="submit"
          aria-label={t("comun.analizarUrl")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-white transition-colors hover:bg-teal/90"
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
