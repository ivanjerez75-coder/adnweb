# 0009 — Informe v3 / v3.1: entender el negocio con datos fiables y reales

- **Fecha:** 2026-10-19.
- **Especificaciones:**
  - `docs/superpowers/specs/2026-10-18-dnaweb-informe-v3-design.md`;
  - `docs/superpowers/specs/2026-10-18-dnaweb-informe-v3-1-datos-fiables.md`. Esta manda si las dos chocan.

## Por qué

El informe v2 era genérico: no hablaba del negocio, no proponía oportunidades y daba una puntuación sin sentido.

El documento maestro del usuario fija la regla: *un informe más pequeño con pruebas defendibles vale más que uno completo con cifras inventadas*.

## Qué se decidió

### Pruebas
- **Lectura en profundidad.** Se leen hasta 15 páginas propias. Se eligen así:
  1. las secciones de negocio en cualquier idioma, y el menú de la portada;
  2. las versiones en otro idioma, solo al final.
- **Extractos.** Cada página se convierte en extractos literales numerados (`p3-e2`). El código descarta toda afirmación que cite ids inexistentes.
- **Problemas y oportunidades.** Un problema necesita un extracto de página, y una oportunidad necesita 2 evidencias.

### Métricas
- **Ficha de cada métrica.** Cada una es un registro con tipo (observado, estimado o hipotético), fuente, fecha, confianza, limitaciones y estado.
- **Visitas mensuales.** Siempre "No hay datos fiables disponibles". Los rankings Tranco y Radar y los datos de usuarios reales de Chrome se muestran tal cual, con la advertencia "No mide visitas".
- **Ingresos.** Solo se dan si están publicados. Si la web publica precios, se añade un escenario **hipotético** (100, 500 o 1.000 clientes × precio mediano), con sus supuestos y el texto "Escenario ilustrativo: no son los ingresos de la empresa".
- **Valoración.** Siempre "No estimable con los datos disponibles".

### Fuentes gratuitas nuevas
- PageSpeed completo, con datos de campo de CrUX.
- Identidad legal: aviso legal, privacidad, CIF validado con su dígito de control, razón social y contacto, todo solo del dominio propio.
- JSON-LD de la organización.

### DNA Score v1.0
- **Dimensiones.** 5, al 20 % cada una (ver 0008).
- **Indicadores sin datos.** Se marcan "no evaluado", nunca 0.
- **Indicadores que no aplican.** Por ejemplo, el plan gratuito en una cooperativa, o el aviso legal en una web no española. Se marcan "no aplica" y no cuentan.
- **Explicación.** El resumen de cada dimensión lo escribe el código a partir de sus indicadores.

### Textos de la IA
Un filtro de código quita las predicciones, las promesas de ventas y conversión, y las cifras no respaldadas. En texto descriptivo deja pasar precios y porcentajes publicados.

Lo que la empresa dice de sí misma se muestra como "La empresa afirma…".

### Competidores
- Se buscan con Gemini y Google Search; si no hay búsqueda, se usa el modelo normal.
- **Verificación.** Un competidor queda verificado si su portada contiene al menos 2 términos clave del servicio.
- **Diferencias.** Solo se muestran para los verificados.

### Entrega por partes
- **Fases.**
  1. Primero se guardan los datos calculados por código.
  2. Después, el ADN del negocio.
  3. Luego el resto de secciones en paralelo, con un máximo de 3 llamadas de IA a la vez.
  4. Al final, la puntuación y las oportunidades.
- **Estado y crédito.**
  - El análisis queda "listo" en cuanto se guarda el ADN.
  - Si el ADN falla: error y devolución del crédito, una sola vez.
  - Las demás secciones fallan por separado.
- **Caché.** Se reutiliza un análisis solo si es v3.1 y tiene menos de 24 h.

### Regla retirada
La regla 2+2 de oportunidades (0004) ya no se aplica al informe v3. Los informes v2 la siguen usando.

## Resultados reales (2026-10-19, `scripts/probar-informe.ts`)

| Web | Tiempo total | Primer contenido | DNA Score | Notas |
|---|---|---|---|---|
| teb.org (cooperativa social, en catalán) | 40-61 s | ~28 s | 72 | Ver abajo |
| tally.so (SaaS belga) | 25-28 s | ~17 s | 84 | Ver abajo |

**teb.org**
- Separa las 3 líneas: servicios a personas, servicios industriales y productos propios.
- Encuentra el CIF F08388043, el aviso legal y la privacidad.
- Verifica 3 competidores.
- Señala problemas concretos con su cita: no hay tienda online para los productos propios y no hay orientación de precios.

**tally.so**
- Lo identifica como SaaS.
- Muestra los precios publicados y el escenario hipotético.
- Verifica a Typeform y Google Forms.
- El aviso legal y el CIF no aplican, porque no es una web española.

En las dos, las visitas salen sin datos fiables y los ingresos y la valoración como "No estimable".

## Límites conocidos
- El estado del modelo de negocio y el tipo dependen de la IA. El código solo rebaja "confirmado" cuando no tiene respaldo.
- Los tiempos varían con la carga de Gemini. El límite duro sigue siendo `maxDuration = 300`.
- Se dejan para más adelante dos restos de código antiguo: `textosVerificados` en competidores y el parámetro `signals` que no se usa en el score.
