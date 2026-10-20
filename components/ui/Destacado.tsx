import { trozosDestacados } from "@/lib/i18n";

/** Pinta en teal las palabras marcadas con *asteriscos* en el diccionario. */
export function Destacado({ texto }: { texto: string }) {
  return (
    <>
      {trozosDestacados(texto).map((p, i) =>
        p.destacado ? (
          <span key={i} className="text-teal">
            {p.texto}
          </span>
        ) : (
          p.texto
        ),
      )}
    </>
  );
}
