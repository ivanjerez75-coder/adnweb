import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "principal" | "secundario";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const variantes = {
  principal: "bg-teal text-white hover:bg-teal/90",
  secundario:
    "border border-borde bg-superficie text-grafito hover:bg-superficie-2",
} as const;

export function Boton({
  variante = "principal",
  className = "",
  type = "button",
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={`${base} ${variantes[variante]} ${className}`}
      {...resto}
    />
  );
}
