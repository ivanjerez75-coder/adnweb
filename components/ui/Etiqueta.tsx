import type { ReactNode } from "react";

export type Tono =
  | "observado"
  | "externa"
  | "inferencia"
  | "hipotesis"
  | "neutro"
  | "problema";

const tonos: Record<Tono, string> = {
  observado: "bg-teal-claro text-teal",
  externa: "bg-superficie-2 text-grafito border border-borde",
  inferencia: "bg-superficie text-suave border border-borde",
  hipotesis: "bg-superficie text-suave border border-dashed border-borde",
  neutro: "bg-superficie-2 text-suave",
  problema: "bg-ambar/10 text-ambar",
};

export function Etiqueta({
  tono = "neutro",
  children,
}: {
  tono?: Tono;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}
