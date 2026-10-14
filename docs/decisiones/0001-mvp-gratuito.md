# 0001 — El MVP es 100 % gratuito

- **Fecha:** 2026-10-14
- **Contexto:** Queremos validar DNAweb sin gastar dinero en APIs ni cobrar a usuarios.
- **Decisión:** Solo fuentes gratuitas (la web, detección propia de tecnologías, Tranco, Cloudflare Radar, PageSpeed, RDAP, Wayback Machine) y la capa gratuita de Gemini, con Groq como respaldo. Los usuarios tienen 5 créditos gratis al mes; sin Stripe ni planes.
- **Descartado:** Similarweb/Semrush/BuiltWith (cientos de €/mes); suscripción con Stripe (se añadirá tras validar interés).
- **Consecuencias:** Las cifras son estimaciones con rango y confianza. Las fuentes están aisladas en `lib/engine/sources/`, así que añadir una de pago es crear un módulo nuevo.
