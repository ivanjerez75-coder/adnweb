# 0004 — Oportunidades respaldadas por varias señales

- **Fecha:** 2026-10-14
- **Decisión:** Una oportunidad solo se muestra si cita ≥ 2 señales existentes de ≥ 2 fuentes distintas. Con 1 señal pasa a "Pistas a investigar". La confianza la calcula el código: ≥ 4 señales y ≥ 3 fuentes → alta; ≥ 3 señales → media; si no → baja.
- **Por qué:** Evitar que la IA invente oportunidades sin datos; el usuario ve la lista de evidencias de cada una.
- **Dónde:** `lib/engine/signals.ts` (señales objetivas) y `lib/engine/opportunities.ts` (regla y confianza).
