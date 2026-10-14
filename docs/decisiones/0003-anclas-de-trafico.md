# 0003 — Tabla ranking → visitas mensuales

- **Fecha:** 2026-10-14
- **Decisión:** El tráfico se estima con una tabla fija a partir del ranking de Tranco (o, si falta, la franja de Cloudflare Radar):

| Ranking | Visitas/mes |
|---|---|
| ≤ 100 | 500 M – 5.000 M |
| ≤ 1.000 | 50 M – 500 M |
| ≤ 10.000 | 5 M – 50 M |
| ≤ 100.000 | 500 K – 5 M |
| ≤ 1.000.000 | 50 K – 500 K |
| Fuera del ranking | 0 – 50 K |

- **Confianza:** media si hay dato de Tranco y de Radar; baja si solo hay uno.
- **Pendiente de calibrar:** contrastar con 10–20 webs de tráfico conocido y ajustar la tabla (en `lib/engine/anchors.ts`).
