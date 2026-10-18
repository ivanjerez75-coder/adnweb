# DNAweb — Diseño del informe v3: entender el negocio y saber qué hacer

- **Fecha:** 2026-10-18
- **Estado:** pendiente de revisión
- **Sustituye:** la estructura de informe de `2026-10-14-dnaweb-mvp-design.md` §7 y la parte de "Informe" de `2026-10-15-dnaweb-motor-v2-design.md` §6.3-§7.
- **Se mantiene:** las fuentes y la recogida (motor v2), los hechos de tres estados, las señales, las anclas, la cadena de modelos y todo el Plan 2 (cuentas, créditos, segundo plano).

## 1. Por qué

La primera prueba real con una cuenta (teb.org, 2026-10-18) produjo un informe técnicamente correcto pero inútil:

- **Oportunidades:** todas descartadas.
- **Sugerencias genéricas e impropias:** "crea un blog" o "haz una app" para una cooperativa de inclusión social.
- **Datos que no aportaban nada:** ingresos vacíos y tráfico "0–50.000" sin contexto.
- **Competidores flojos y una puntuación de 41 inexplicable.**

La causa es que el motor busca **huecos de una lista fija pensada para startups/SaaS** y la IA rellena una plantilla.

El usuario lo resumió así: *el cliente no quiere un informe lleno de métricas; quiere entender un negocio que no conoce y descubrir qué puede hacer con esa información*. Un analizador normal dice "esta web tiene estas características". DNAweb debe decir "esto es lo que hemos descubierto del negocio, estas son las oportunidades respaldadas por evidencias y estas son las decisiones que podrías tomar".

## 2. Objetivo, no-objetivos y anti-objetivos

**Objetivo.** Que quien termine el informe sepa algo relevante del negocio que no sabía antes y tenga una forma concreta de usarlo. El informe tiene que ser **rápido y completo**: el usuario ve contenido útil casi enseguida y el informe completo en torno a un minuto.

**No-objetivos (por ahora):**
- comparador de varias empresas;
- exportar a PDF;
- datos SEO de pago (backlinks, palabras clave);
- el diseño visual del informe (es el Plan 3; este documento define el contenido).

**Anti-objetivos.** El informe fracasa, aunque "funcione", si:
- inventa cifras para parecer completo;
- da consejos genéricos de marketing que valdrían para cualquier web;
- presenta como hecho algo no comprobado (un competidor, un problema, una oportunidad);
- añade puntuaciones o gráficos solo para parecer profesional.

## 3. Estructura del informe

El informe tiene **4 bloques**. Todo lo que afirma lleva **evidencia** (ver §4).

### Bloque 1 — ADN del negocio (la parte central)

- **Qué es y propuesta de valor:** 2-4 frases.
- **Líneas de actividad.** Si hay varias, van separadas (TEB, por ejemplo: servicios a personas, inserción laboral, servicios a empresas, accesibilidad). Para cada línea:
  - qué ofrece (productos o servicios concretos);
  - a quién se dirige (público objetivo);
  - cómo se contrata o se compra;
  - de dónde vendrían sus ingresos (modelo de monetización).
- **Cómo funciona en conjunto:** cómo se relacionan las líneas.
- **Tipo de negocio:** se mantiene la clasificación actual y se añaden `organizacion_social` y `negocio_local`.

### Bloque 2 — Qué sabemos y qué no

- **Datos publicados:** lo que la propia empresa dice y es comprobable (fundación, sede, nº de servicios, idiomas, contacto…), con su fuente.
- **Estimaciones.** Cada una lleva **valor o rango, fuente, metodología (en una frase) y confianza**. Si no hay base suficiente, se muestra "No estimable" y el motivo, nunca un número. Las estimaciones son:
  - **tráfico mensual**, con las anclas actuales;
  - **ingresos mensuales**: el ancla actual pasada a mensual (anual ÷ 12), con la misma regla de recorte;
  - **valoración aproximada**: solo si hay ingresos estimables; si no, "No estimable";
  - **métricas SEO gratuitas**: páginas en el sitemap, velocidad (PageSpeed), si las páginas clave tienen título y meta descripción, idiomas y actividad del blog.
- **Lo que no se puede saber desde fuera.** Una lista explícita, adaptada al tipo de negocio. Ejemplos: rentabilidad, nº real de clientes, backlinks y palabras clave (que requieren herramientas de pago), y los ingresos de una organización sin datos públicos.

### Bloque 3 — DNA Score

Es una puntuación resumen con **6 criterios**. Cada criterio tiene una nota de 0-100, de 1 a 3 motivos y evidencias:

| Criterio | Qué mide |
|---|---|
| Claridad de la propuesta | Si se entiende qué ofrece, a quién y por qué elegirlo |
| Visibilidad | Tráfico, rankings, SEO básico |
| Monetización | Si está claro cómo gana dinero y cómo se compra |
| Confianza y madurez | Antigüedad (de la empresa o, si no hay, del dominio, sin confundirlas), casos y testimonios, datos públicos |
| Presencia digital | Redes, contenido, app, actividad reciente |
| Novedad y diferenciación | Si es algo nuevo o distinto frente a sus competidores reales y qué tiene que ellos no |

Reglas:
- Un criterio sin datos suficientes se muestra como **"No puntuable"**, no como 0.
- La nota global es la media de los criterios puntuables. Si hay menos de 3 puntuables, no hay nota global.
- Lleva siempre el aviso: *"Resume indicadores públicos; no es una valoración financiera."*
- **La nota de cada criterio la calcula el código** a partir de reglas y señales. La IA solo redacta los motivos, citando evidencias. Así la nota es reproducible y explicable.
- Las reglas concretas de cada criterio las decide el constructor, siguiendo estos principios:
  - cada regla usa hechos, señales o evidencias existentes;
  - cada regla está documentada en `docs/decisiones/`;
  - "Novedad y diferenciación" solo es puntuable si hay al menos 2 competidores verificados (§5).

### Bloque 4 — Comprender y actuar

- **Qué hace bien:** 3-5 puntos, cada uno con evidencia.
- **Problemas concretos:** se revisa **cada línea de actividad / servicio** contra estas preguntas:
  - ¿la propuesta es clara?
  - ¿dice a quién va dirigido?
  - ¿muestra resultados o casos concretos?
  - ¿es fácil pedir información o comprar (formulario, teléfono, botón visible)?
  - ¿hay precios u orientación de coste, si el tipo de negocio lo admite?

  Cada problema lleva la evidencia (la página y lo que se ve o falta en ella) y **una mejora específica para ese caso**. Un problema sin evidencia de una página concreta del sitio no se muestra.
- **Competidores reales:** de 3 a 5 organizaciones que ofrecen **servicios parecidos** (no solo del mismo sector). Para cada uno se indica:
  - nombre;
  - web;
  - qué ofrece que se parece;
  - diferencias verificables;
  - estado: **verificado** o **no verificado** (§5).
- **Qué aprender de este negocio:** 2-4 estrategias, características o decisiones que merecería la pena estudiar para otro proyecto, con su evidencia.
- **Qué haría yo después:** exactamente **3 acciones priorizadas**. Cada una lleva:
  - qué hacer;
  - por qué (citando evidencias);
  - impacto estimado (alto/medio/bajo);
  - esfuerzo (alto/medio/bajo);
  - **qué datos faltan para confirmar que merece la pena**.

  El orden es por impacto/esfuerzo.

## 4. Modelo de evidencias

Toda afirmación de los bloques 1, 3 y 4 cita al menos una evidencia. Hay dos tipos:

1. **Extracto de página:** `{ id, url, titulo, cita }`, donde `cita` es un fragmento literal de esa página de ≤ 200 caracteres. El código extrae los extractos al leer la web y los numera (`p3-e2`, por ejemplo). La IA solo puede citar ids existentes.
2. **Dato o señal:** los ids de señales y hechos existentes (motor v2) y los datos de fuentes externas: Wikidata, empleo, App Store, DNS, rankings.

El código valida cada cita, igual que ya hace con fortalezas y debilidades. Lo que cite ids inexistentes se descarta. Un problema solo es válido si cita al menos un extracto de página.

La regla de "2 señales de 2 fuentes" de las oportunidades del motor v2 **se retira**. La sustituye la regla de evidencia concreta: los problemas necesitan un extracto de página y las acciones necesitan al menos 2 evidencias de cualquier tipo.

## 5. Lectura más profunda y competidores

**Lectura de la web.**
- Se leen **hasta 15 páginas** del propio dominio. Se priorizan las de servicios/productos, quiénes somos, precios, casos/clientes, contacto y empleo. Se eligen a partir del sitemap y de los enlaces de la navegación principal.
- Las páginas se descargan en paralelo, siempre con el `PageGetter` seguro, dentro del plazo total de recogida. Ese plazo pasa de 40 s a **25 s** para estas páginas: si alguna tarda, se sigue sin ella.
- La heurística de selección la decide el constructor.

**Competidores.**
- Se buscan con **Gemini con búsqueda de Google** ("grounding"), que tiene un cupo gratuito diario.
- Para cada candidato se descarga su portada con el `PageGetter` seguro y se comprueba que su texto respalda lo que se afirma de él (que ofrece servicios parecidos). Si lo respalda, está **verificado**.
- Sin búsqueda disponible (cupo agotado o error), se usan competidores del conocimiento de la IA, que se muestran como **no verificados**, igual que los que no superen la comprobación.
- Nunca se afirma una "diferencia verificable" de un competidor no verificado.

## 6. Velocidad: el informe llega por partes

El usuario ve contenido útil en torno a **20 s** y el informe completo en **≤ 90 s** en el caso típico. El límite duro sigue siendo `maxDuration = 300`.

**Fases del trabajo:**
1. **Recogida** (como hoy, en paralelo): fuentes externas más la lectura de hasta 15 páginas.
2. **ADN del negocio (bloque 1):** primera llamada a la IA, sola, porque las demás secciones dependen de las líneas de actividad. Se guarda y se muestra en cuanto termina.
3. **En paralelo, después:**
   - bloque 2 (las estimaciones las calcula el código y la IA redacta lo que no se puede saber);
   - competidores;
   - problemas y qué hace bien;
   - qué aprender.
4. **Al final:** DNA Score (motivos) y las 3 acciones, porque usan todo lo anterior.

**Progreso parcial.** Cada sección se guarda en la base de datos en cuanto está lista (estado por sección: `pendiente`/`lista`/`error`), y la página del análisis las va mostrando.
- Si una sección falla, las demás siguen. La que falló muestra "No hemos podido generar esta sección".
- El análisis solo cuenta como fallido (con el crédito devuelto) si falla el bloque 1.

**Cupo gratuito de Gemini.** Unas 6-8 llamadas por informe. El código debe respetar los límites por minuto: limita la concurrencia y usa la cadena de modelos y los reintentos que ya existen.

## 7. Restricciones

- **Coste y fuentes.** El MVP sigue siendo 100 % gratuito, sin fuentes de pago. La búsqueda de Google para competidores solo se usa dentro del cupo gratuito.
- **Contrato con el Plan 2.** No se rompe:
  - créditos: 1 por análisis;
  - devolución si falla el bloque 1;
  - estados `procesando`/`listo`/`error`;
  - caché de 24 h por dominio (se reutilizan los datos brutos, incluidas las páginas leídas).
- **Seguridad.** Todo el contenido de las webs va dentro del delimitador de datos no confiables del prompt. Los extractos se escapan.
- **Idioma.** Textos al usuario en español, incluso si la web analizada está en otro idioma.

## 8. Lo que decidió el usuario

- El enfoque es entender el negocio y qué hacer, no métricas sueltas.
- La estructura de 4 bloques y las 6 preguntas, incluidos "qué sabemos y qué no", "qué aprender" y "3 acciones priorizadas con datos que faltan".
- Se mantienen las estimaciones (tráfico, ingresos mensuales, valoración, SEO), siempre con fuente, metodología y confianza, o "No estimable".
- El DNA Score se queda, con criterios transparentes y el aviso de que no es una valoración financiera. Tiene 6 criterios, con "Novedad" añadido por el usuario.
- Rápido y completo: el informe aparece por partes.

## 8b. Decisiones de Claude (revisables por el usuario)

1. **Ingresos y valoración sin ancla.**
   - **Hay ancla de ingresos** (Wikidata): se usa, pasada a mensual.
   - **No hay ancla:** el código solo estima los ingresos si se cumplen las tres condiciones siguientes:
     - hay tráfico estimado;
     - se han detectado precios públicos;
     - el tipo de negocio tiene una tasa de conversión de referencia documentada (`saas`, `ecommerce`, `marketplace`, `app`).

     En ese caso: visitas × conversión de referencia × precio medio detectado, con un rango amplio y confianza **baja**.
   - **En cualquier otro caso:** "No estimable".
   - **La IA ya no propone cifras de ingresos ni de valoración.**
   - **Valoración:** solo si hay ingresos estimados. Se calcula como ingresos anuales × un múltiplo por tipo de negocio, en rango, con la tabla documentada en `docs/decisiones/`. Su confianza nunca es mayor que la de los ingresos.
2. **Tiempos.**
   - **Plazo de recogida:** sigue en 40 s en total. Las 15 páginas tienen además su propio tope de 25 s dentro de ese plazo.
   - **Lo primero que se muestra:** cuando termina la recogida (unos 20-25 s), aparecen de inmediato las partes que calcula el código sin IA: datos publicados, estimaciones y métricas SEO.
   - **Después:** el bloque 1 (ADN) llega hacia los 35-45 s, y el resto se va completando.
   - **Objetivo revisado:** algo útil en ≈ 25 s y el informe completo en ≤ 90 s.
3. **Estado del análisis.**
   - **El análisis pasa a `listo` en cuanto se guarda el bloque 1.** Desde ese momento el crédito queda consumido.
   - **Secciones sin terminar:** las demás siguen como `pendiente` mientras el trabajo continúa. Si el proceso muere, las secciones que siguen `pendiente` después de 3 minutos se muestran como "No hemos podido generar esta sección", sin devolución, porque el usuario ya tiene el ADN.
   - **Si falla el bloque 1:** el análisis queda en `error` y se devuelve el crédito, igual que ahora.
   - **SQL:** las reglas de `marcar_colgados` no cambian, porque solo actúan sobre `procesando`.
4. **Página del análisis en este plan.**
   - **Versión nueva:** se incluye una vista funcional sin diseño que muestra los 4 bloques a medida que llegan. El diseño visual es el Plan 3, a partir de `2026-10-18-dnaweb-diseno-visual-entrada.md`.
   - **Informes antiguos (v2):** llevan un campo `version`. La vista muestra su resumen y el aviso "Informe de una versión anterior".
   - **Caché:** se ignoran los datos en caché de v2, porque no tienen las páginas.
5. **DNA Score con juicios de la IA validados.**
   - **Criterios que dependen de un juicio:** "Claridad de la propuesta" puede puntuarse con las respuestas de la revisión por línea de actividad (bloque 4), y "Novedad" con los competidores verificados.
   - **Condición:** cada respuesta tiene que estar respaldada por un extracto de página o un competidor verificado. El código cuenta las respuestas válidas y aplica la regla de puntuación. Lo que no tenga evidencia no cuenta.
   - **Orden:** el DNA Score se calcula al final, después del bloque 4 y de los competidores.

## 9. Lo que se deja al constructor

- Las reglas exactas de cada criterio del DNA Score (siguiendo los principios de §3).
- La heurística de selección de las 15 páginas.
- Los prompts de cada sección.
- El esquema JSON exacto de cada sección.
- El mecanismo de guardado parcial: columnas nuevas o un `jsonb` por sección.
- Cómo se hace la comprobación de un competidor contra su portada.
