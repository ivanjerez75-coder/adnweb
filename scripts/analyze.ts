import { analyze, depsFromEnv } from "../lib/engine/analyze";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: npm run analyze -- <url>");
    process.exit(1);
  }
  const started = Date.now();
  const { report } = await analyze(input, depsFromEnv(), (step) => console.error(`→ ${step}`));
  console.log(JSON.stringify(report, null, 2));
  console.error(`✓ Listo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  process.exit(1);
});
