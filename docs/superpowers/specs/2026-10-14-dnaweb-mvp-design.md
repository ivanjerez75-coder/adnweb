# DNAweb — Diseño del MVP

- **Fecha:** 2026-10-14
- **Estado:** pendiente de revisión
- **Nombre:** DNAweb (provisional)

## 1. Qué es

DNAweb es una plataforma SaaS de inteligencia de negocio. El usuario pega la URL de cualquier negocio digital y obtiene un informe claro y visual: modelo de negocio, tráfico estimado, ingresos y valoración estimados, oportunidades y un veredicto global.

El objetivo no es mostrar datos sueltos, sino **comprensión**: responder de forma sencilla a "¿cómo gana dinero?", "¿tiene potencial?", "¿cómo se compara?" y "¿dónde hay oportunidades?".

**Público:** emprendedores, empresas, inversores, agencias/consultorías y estudiantes.

## 2. Objetivo del MVP

Un usuario debe poder:

1. Registrarse.
2. Iniciar sesión.
3. Pegar una URL.
4. Obtener un informe claro.
5. Guardar el análisis (automático).
6. Ver su historial.
7. Ver y gestionar sus créditos.

## 3. Decisiones principales

| Decisión | Elección | Motivo |
|---|---|---|
| Coste | **MVP 100 % gratuito**: sin APIs de pago, sin cobros a usuarios, sin planes | Validar el producto sin gasto |
| Datos | IA sobre el contenido público de la web + fuentes gratuitas de terceros que anclan las estimaciones | Gratis y suficiente para un primer informe; fuentes de pago enchufables en el futuro |
| IA | **Gemini API (capa gratuita)**, con Groq/OpenRouter (modelos gratuitos) como respaldo, detrás de una capa intermedia | Gratis; permite cambiar de proveedor sin reescribir el motor |
| Créditos | 5 créditos gratuitos al mes por usuario, 1 por análisis | Proteger el cupo gratuito de las APIs |
| Ejecución | Análisis en segundo plano con pantalla de progreso | Evita los cortes de tiempo de Vercel; no se pierden análisis; historial natural |
| Ubicación | `C:\Users\ivanj\OneDrive\Desktop\dnaweb`, repositorio propio | Separado del proyecto `adnweb` (NONNA) |

**Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Supabase (base de datos + autenticación), Vercel (despliegue), Git/GitHub.

**Fuera del MVP:** Stripe, planes de pago, comparador de varias empresas, exportar a PDF, fuentes de datos de pago.

## 4. Páginas

| Ruta | Contenido | Login |
|---|---|---|
| `/` | Landing: qué es DNAweb, campo para pegar URL, llamada al registro | No |
| `/registro`, `/login` | Email + contraseña (Supabase Auth) | No |
| `/dashboard` | Campo "Pega una URL", créditos restantes, últimos análisis | Sí |
| `/analisis/[id]` | Progreso por pasos mientras se genera; informe de 5 secciones al terminar | Sí |
| `/historial` | Todos los análisis del usuario, con buscador | Sí |
| `/cuenta` | Créditos del mes, fecha de renovación, cerrar sesión | Sí |

Si alguien pega una URL en la landing sin sesión, se le lleva a registrarse y el análisis se lanza justo después con esa URL.

## 5. Flujo de un análisis

1. El usuario pega la URL en el dashboard.
2. Se valida la URL (sección 9) y se comprueba que tiene créditos.
3. En una única operación de base de datos: se descuenta 1 crédito y se crea el análisis con estado `procesando`.
4. El usuario va a `/analisis/[id]` y ve el progreso ("Leyendo la web…", "Analizando tráfico…", "Generando veredicto…").
5. En segundo plano, el motor ejecuta sus 3 fases, guardando `paso_actual` a medida que avanza.
6. Al terminar, el análisis pasa a `listo` y la página muestra el informe completo. Si falla, pasa a `error` y se devuelve el crédito.

## 6. El motor (`lib/engine/`)

El motor es independiente de la interfaz: recibe una URL y devuelve datos brutos + informe. No depende de React ni de las páginas, y se puede probar de forma aislada.

### Fase 1 — Recogida de datos (fuentes gratuitas)

| Fuente | Qué obtiene |
|---|---|
| La propia web (home + hasta ~5 páginas clave: precios, about, producto, blog) | Textos, títulos, meta descripción, datos estructurados (JSON-LD), idioma(s), enlaces a redes, llamadas a la acción |
| Detección de tecnologías (reglas propias sobre HTML y cabeceras) | Shopify, WordPress, Stripe, Google Ads, Meta Pixel, Intercom, Hotjar, analítica, captación de email… |
| Tranco | Posición en el ranking de dominios y su evolución |
| Cloudflare Radar (API gratuita con token) | Franja de popularidad del dominio |
| Google PageSpeed Insights (API gratuita) | Rendimiento y calidad técnica, móvil y escritorio |
| RDAP/WHOIS | Fecha de creación del dominio |
| Wayback Machine | Primera captura y frecuencia de cambios |

Cada fuente es un módulo independiente con la misma interfaz. Si una falla, el análisis continúa sin ella y el informe lo indica.

### Fase 2 — Anclas y señales calculadas por código (sin IA)

- **Tráfico:** rango de visitas mensuales derivado del ranking Tranco/Radar mediante una tabla propia y documentada.
- **Señales objetivas:** lista de hechos detectados, cada uno con su familia y su fuente (ver sección 7.4). Ejemplos: `sin_precios_publicos (web)`, `pagespeed_movil_bajo: 34 (pagespeed)`, `web_sin_cambios_14_meses (wayback)`.

### Fase 3 — Informe con Gemini

Gemini recibe los datos de la Fase 1, las anclas y las señales de la Fase 2, y devuelve un **JSON con estructura fija** (validado por esquema). Si el JSON no es válido, se reintenta.

**Regla de honestidad:** toda cifra estimada lleva **rango**, **confianza** (baja/media/alta) y **en qué se basa**. Si no hay datos suficientes, se devuelve "no estimable" en lugar de inventar.

## 7. El informe (5 secciones)

### 7.1 Resumen y modelo de negocio
Qué hace, para quién, tipo de negocio (SaaS, ecommerce, marketplace, contenido/ads, servicios…), cómo gana dinero, planes y precios detectados.

### 7.2 Tráfico y presencia
Visitas mensuales (rango, a partir de las anclas), tendencia (sube / estable / baja), redes sociales detectadas, calidad técnica (PageSpeed), antigüedad.

### 7.3 Ingresos y valoración
Ingresos anuales (rango) y valoración (rango), con las **suposiciones visibles**. Por ejemplo: "X visitas × 1,5 % conversión × 29 €/mes".

### 7.4 Oportunidades y vacíos

Cada oportunidad debe apoyarse en **varias señales**, nunca en una sola.

**Regla de admisión:** una oportunidad solo se muestra si la respaldan **≥ 2 señales de ≥ 2 fuentes distintas**. Si solo hay una señal, se descarta o pasa a una lista secundaria de "Pistas a investigar".

**Confianza (calculada por código, no por la IA):**
- 2 señales de 2 fuentes → baja
- 3 señales de 2–3 fuentes → media
- ≥ 4 señales de ≥ 3 fuentes → alta

**Familias de señales:**

| Familia | Fuente | Ejemplos |
|---|---|---|
| Producto y oferta | Web | Precios ocultos, sin plan gratuito, sin prueba |
| Contenido y SEO | Web + Wayback | Sin blog, blog abandonado (> 1 año), pocas páginas |
| Técnica y experiencia | PageSpeed + tecnologías | Web lenta en móvil, sin analítica, sin soporte/chat, sin captación de email |
| Alcance | Web | Un solo idioma/país, sin app móvil, pocas redes |
| Tracción | Tranco + Radar + Wayback | Tráfico en caída, ranking estancado, web sin cambios |
| Mercado y competencia | Gemini (+ búsqueda si hay cupo) | Funcionalidades que ofrecen competidores y este no, rango de precios del sector |
| Confianza | Web | Sin reseñas, testimonios, casos de éxito ni logos de clientes |

**Proceso:**
1. El código extrae las señales objetivas (Fase 2).
2. Gemini propone oportunidades indicando qué señales (por identificador) usa.
3. El código verifica que esas señales existen y cumplen la regla 2+2; si no, la oportunidad se descarta.
4. El código asigna la confianza.

**Formato de cada oportunidad:** qué (una frase), lista de evidencias con su fuente, para quién (competir contra este negocio / mejorarlo si es el tuyo), confianza. Se muestran de 3 a 5, ordenadas por confianza.

### 7.5 Veredicto y competidores
Puntuación 0–100 desglosada en mercado, tracción, monetización y diferenciación. Cada sub-puntuación indica las señales en que se apoya, con el mismo principio de varias señales. Además: 3 fortalezas, 3 debilidades, 3–5 competidores probables y una conclusión de dos líneas.

**Limitación conocida:** los competidores salen del conocimiento de Gemini y pueden no estar al día con negocios muy recientes. Si el cupo gratuito de búsqueda de Google en Gemini lo permite, se activará para afinarlos.

## 8. Datos (Supabase)

### `profiles` (uno por usuario)
- `id` (= id de Supabase Auth), `nombre`, `created_at`
- `creditos_restantes`, `creditos_mensuales` (por defecto 5), `renovacion` (fecha del próximo reinicio)

### `analyses` (uno por análisis)
- `id`, `user_id`, `url`, `dominio`, `created_at`
- `estado`: `procesando` | `listo` | `error`
- `paso_actual`: texto del paso en curso
- `datos_brutos` (JSON): resultado de la Fase 1, para regenerar sin volver a extraer
- `informe` (JSON): las 5 secciones
- `error`: mensaje, si lo hay

### Reglas
- **RLS:** cada usuario solo puede leer su perfil y sus análisis.
- **Créditos atómicos:** descontar el crédito y crear el análisis ocurre en una sola función de base de datos; no se pueden lanzar dos análisis con un único crédito.
- **Devolución:** si el análisis falla por causa nuestra, se devuelve el crédito.
- **Renovación mensual:** al acceder, si `renovacion` ya pasó, se reinician los créditos y se fija la siguiente fecha. Sin tareas programadas.
- **Caché:** si el mismo dominio se analizó en las últimas 24 h, se reutilizan sus `datos_brutos` y solo se vuelve a ejecutar la Fase 3.

## 9. Errores y límites

### Validación de URL (antes de gastar créditos)
- Normalización a dominio (`Notion.so/precios` → `notion.so`).
- Se rechazan dominios inválidos, IPs, `localhost` y direcciones privadas o internas (protección SSRF), comprobando también la IP resuelta.
- Se comprueba que la web responde; si no, no se cobra el crédito.

### Durante el análisis

| Situación | Comportamiento |
|---|---|
| Falla una fuente | Se continúa; "Dato no disponible"; baja la confianza afectada |
| La web bloquea la lectura | Se usan las demás fuentes; si no hay datos suficientes → error + crédito devuelto |
| Web 100 % JavaScript | Meta tags + Wayback + fuentes externas; aviso de "análisis limitado" |
| Gemini falla o devuelve JSON inválido | 2 reintentos; después error + crédito devuelto + botón "Reintentar" |
| Cupo de Gemini agotado | Proveedor de respaldo; si también falla → "Alta demanda, inténtalo en unos minutos" + crédito devuelto |
| Análisis colgado > 3 min | Se marca `error` y se devuelve el crédito |

### Límites
- Máximo 1 análisis en curso por usuario.
- 5 créditos al mes por usuario (configurable).
- Caché de 24 h por dominio.

## 10. Pruebas

- **Motor:** pruebas automáticas con webs de ejemplo guardadas (SaaS, ecommerce, medio, web rota), sin acceso a internet ni a Gemini. Cubren extracción de señales, anclas de tráfico, regla 2+2, cálculo de confianza y validación del JSON.
- **Créditos:** descuento, devolución, renovación mensual y concurrencia (dos análisis con un único crédito).
- **Validación de URL:** casos válidos, raros y maliciosos (IPs privadas, redirecciones a internas).
- **Prueba manual final:** 5–10 webs reales conocidas, revisando que cifras y oportunidades tengan sentido.

## 11. Documentación de decisiones

Cada decisión importante se registra en `docs/decisiones/` (una nota corta por decisión: contexto, decisión, alternativas descartadas), para que cualquier persona entienda el proyecto sin adivinar.
