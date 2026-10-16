# 0005 — Siete fuentes gratuitas más

- **Fecha:** 2026-10-15
- **Contexto:** La primera prueba real (notion.so) dio pocos datos de empresa y señales falsas.
- **Decisión:** Se añaden sitemap, comprobación de rutas, empleo (Greenhouse/Lever/Ashby), App Store, Wikidata, DNS (Cloudflare DoH) y Hacker News (Algolia). Todas sin clave ni pago, en paralelo, con un plazo total de 40 s.
- **Identificación:** App Store y Wikidata solo se aceptan si su web coincide con el dominio registrable analizado. Los tableros de empleo enlazados desde la web tienen prioridad sobre los adivinados.
- **Dominio final:** Tranco, Radar, RDAP, DNS y Hacker News usan el dominio registrable de la URL final tras las redirecciones.
- **Estados:** cada fuente queda como `ok`, `fallo` o `no_aplica` en `informe.fuentes`.
