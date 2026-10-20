/**
 * Prueba real del informe v4 sin base de datos ni cuenta (solo desarrollo).
 * Uso: npm run probar-informe -- https://teb.org [carpeta-salida]
 * Escribe <dominio>.json (datos brutos + secciones) y muestra los tiempos de cada sección.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { depsFromEnv } from "../lib/engine/analyze";
import { collect } from "../lib/engine/collect";
import { normalizeUrl } from "../lib/engine/url";
import { searchModelsFromEnv } from "../lib/engine/v3/llm";
import { buildReportV4 } from "../lib/engine/v3/report";

async function main() {
  const [url, salida = "."] = process.argv.slice(2);
  if (!url) throw new Error("Falta la URL. Uso: npm run probar-informe -- https://ejemplo.com");

  const deps = depsFromEnv();
  if (deps.models.length === 0) throw new Error("No hay ningún modelo de IA configurado en .env.local.");
  const { GEMINI_API_KEY, GEMINI_MODELS, GEMINI_MODEL } = process.env;
  const searchModels = searchModelsFromEnv({ GEMINI_API_KEY, GEMINI_MODELS, GEMINI_MODEL });
  const inicio = Date.now();
  const t = () => `${((Date.now() - inicio) / 1000).toFixed(1)} s`;

  const raw = await collect(normalizeUrl(url), deps, (paso) => console.log(`[${t()}] ${paso}`));
  console.log(`[${t()}] recogida terminada · fuentes:`, raw.fuentes);

  const tiempos: Record<string, string> = {};
  const secciones: Record<string, { estado: string; contenido: unknown }> = {};
  const informe = await buildReportV4(
    raw,
    { models: deps.models, searchModels, getPage: deps.getPage, now: () => new Date() },
    async (clave, contenido, estado) => {
      tiempos[clave] = t();
      secciones[clave] = { estado, contenido };
      console.log(`[${t()}] ${clave}: ${estado}`);
    },
  ).catch((error: unknown) => {
    console.error(`[${t()}] el informe ha fallado:`, error instanceof Error ? error.message : error);
    return null;
  });

  mkdirSync(salida, { recursive: true });
  const archivo = join(salida, `${raw.domain}.json`);
  writeFileSync(archivo, JSON.stringify({ tiempos, estados: informe?.estados ?? null, secciones, raw }, null, 2));
  console.log(`[${t()}] escrito ${archivo}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
