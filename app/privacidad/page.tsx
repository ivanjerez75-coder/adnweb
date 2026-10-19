import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { PaginaEnPreparacion } from "../_landing/PaginaEnPreparacion";

export const metadata: Metadata = {
  title: `${t("landing.piePrivacidad")} · ADNweb`,
};

export default function Privacidad() {
  return <PaginaEnPreparacion titulo={t("legal.privacidadTitulo")} />;
}
