# 0002 — Motor en tres fases y separado de la interfaz

- **Fecha:** 2026-10-14
- **Decisión:** `lib/engine/` funciona en 3 fases: (1) recoger datos, (2) calcular anclas y señales por código, (3) la IA redacta el informe en JSON validado con zod. El motor no importa React ni Next.js, y toda la red se inyecta por parámetro.
- **Por qué:** Que la IA razone sobre datos calculados (y no los invente), poder probar todo sin internet, y poder cambiar de proveedor de IA sin tocar el resto.
- **Uso:** `npm run analyze -- <url>` ejecuta el motor completo desde la terminal.
