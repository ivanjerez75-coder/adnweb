import Image from "next/image";
import Link from "next/link";
import { t, type Clave } from "@/lib/i18n";
import { BuscadorUrl } from "@/components/ui/BuscadorUrl";
import { Destacado } from "@/components/ui/Destacado";
import { Marca } from "@/components/ui/Marca";
import { IrAlBuscador } from "./_landing/IrAlBuscador";
import { empezar } from "./landing-actions";

const ID_CAMPO = "url-landing";

const titular =
  "font-display font-extrabold uppercase leading-[0.92] tracking-[-0.005em] text-grafito text-balance";

const PASOS: { titulo: Clave; texto: Clave }[] = [
  { titulo: "landing.paso1Titulo", texto: "landing.paso1Texto" },
  { titulo: "landing.paso2Titulo", texto: "landing.paso2Texto" },
  { titulo: "landing.paso3Titulo", texto: "landing.paso3Texto" },
];

export default function Home() {
  return (
    <>
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex min-h-svh w-full max-w-7xl flex-col items-center px-4 pt-8 pb-16 text-center sm:px-6">
          <Marca className="text-2xl" />
          <div className="flex w-full flex-1 flex-col items-center justify-center py-14 sm:py-16">
            <p className="max-w-3xl text-xs font-medium tracking-[0.14em] text-grafito uppercase sm:text-sm md:text-base">
              <Destacado texto={t("landing.subtitulo")} />
            </p>
            <h1
              className={`${titular} mt-5 text-[clamp(2.5rem,8vw,7.25rem)] sm:mt-6`}
            >
              <span className="block">{t("landing.titular1")}</span>
              <span className="block text-teal">{t("landing.titular2")}</span>
            </h1>
            <div className="relative mt-10 flex w-full max-w-2xl justify-center sm:mt-12">
              <div
                aria-hidden="true"
                className="halo-pildora pointer-events-none absolute -inset-x-4 -top-2 h-[76px] opacity-80"
              />
              <div className="relative flex w-full justify-center">
                <BuscadorUrl accion={empezar} idCampo={ID_CAMPO} />
              </div>
            </div>
            <p className="mt-10 max-w-3xl text-[0.8125rem] leading-relaxed font-medium tracking-[0.06em] text-suave uppercase sm:mt-12 sm:text-sm">
              {t("landing.explicacion")}
            </p>
          </div>
        </section>

        {/* Descubre oportunidades */}
        <section
          aria-labelledby="titulo-oportunidades"
          className="mx-auto w-full max-w-7xl px-4 pt-8 pb-20 text-center sm:px-6 sm:pb-28"
        >
          <h2
            id="titulo-oportunidades"
            className={`${titular} text-[clamp(2.5rem,7.5vw,6.5rem)]`}
          >
            <Destacado texto={t("landing.oportunidadesTitulo")} />
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-suave sm:text-lg">
            {t("landing.oportunidadesTexto")}
          </p>
          <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[1.75rem] border border-borde bg-superficie-2 sm:mt-14 sm:rounded-[2.25rem]">
            <Image
              src="/landing/investigacion.svg"
              alt={t("landing.ilustracionAlt")}
              width={960}
              height={600}
              className="block h-auto w-full"
            />
          </div>
        </section>

        {/* Cómo funciona */}
        <section aria-labelledby="titulo-como" className="border-t border-borde">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2
              id="titulo-como"
              className="text-center font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-[0.95] font-extrabold text-grafito uppercase"
            >
              {t("landing.comoTitulo")}
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="border-t border-borde pt-5">
                  <span
                    aria-hidden="true"
                    className="font-display text-2xl leading-none font-bold text-teal"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-grafito">
                    {t(paso.titulo)}
                  </h3>
                  <p className="mt-2 leading-relaxed text-suave">
                    {t(paso.texto)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Cierre */}
        <section aria-labelledby="titulo-cierre" className="border-t border-borde">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <h2
              id="titulo-cierre"
              className={`${titular} mx-auto max-w-5xl text-[clamp(2rem,5.5vw,4.75rem)]`}
            >
              <Destacado texto={t("landing.cierreTitulo")} />
            </h2>
          </div>
        </section>
      </main>

      <footer className="border-t border-borde">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col items-center gap-1.5 md:items-start">
            <Marca className="text-xl" />
            <span className="text-sm text-suave">{t("landing.pieCopyright")}</span>
          </div>
          <IrAlBuscador
            idCampo={ID_CAMPO}
            className="inline-flex items-center justify-center justify-self-center rounded-full bg-teal px-7 py-3 font-display text-lg leading-none font-bold tracking-[0.04em] text-white uppercase transition-colors hover:bg-teal/90"
          >
            {t("landing.cierreBoton")}
          </IrAlBuscador>
          <nav
            aria-label={t("landing.pieNavegacion")}
            className="justify-self-center md:justify-self-end"
          >
            <ul className="flex items-center gap-6 text-sm font-medium text-grafito">
              <li>
                <Link href="/privacidad" className="hover:text-teal">
                  {t("landing.piePrivacidad")}
                </Link>
              </li>
              <li>
                <Link href="/condiciones" className="hover:text-teal">
                  {t("landing.pieCondiciones")}
                </Link>
              </li>
              <li>
                <a href={t("landing.pieContactoEnlace")} className="hover:text-teal">
                  {t("landing.pieContacto")}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
