import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { PaginaEnPreparacion } from "../_landing/PaginaEnPreparacion";

export const metadata: Metadata = {
  title: `${t("landing.pieCondiciones")} · ADNweb`,
};

export default function Condiciones() {
  return <PaginaEnPreparacion titulo={t("legal.condicionesTitulo")} />;
}
