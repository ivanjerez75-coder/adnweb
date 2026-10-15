# DNAweb: diseño del motor v2 (más fuentes y más fiabilidad)

- **Fecha:** 2026-10-15
- **Estado:** pendiente de revisión
- **Parte de:** spec del MVP `2026-10-14-dnaweb-mvp-design.md`. Este documento amplía las secciones 6 (motor), 7 (informe) y 9 (errores) de ese spec. Todo lo que no se cambia aquí sigue vigente.

## 1. Por qué

La primera prueba real (notion.so, 2026-10-15) funcionó de principio a fin, pero mostró tres problemas:

1. **Señales falsas.** Dijo "no tiene blog", "solo 1 red social" y "no tiene app" de Notion. La home se genera con JavaScript y el motor tomó "no lo he visto" como "no existe". Esto genera oportunidades absurdas ("crear un blog") y destruye la credibilidad.
2. **Datos insuficientes.** Faltan datos reales sobre la empresa: tamaño, contratación, app, fundación. Faltan también señales positivas para respaldar las fortalezas.
3. **IA inestable.** Google retiró `gemini-2.5-flash` para usuarios nuevos y los modelos rápidos devolvían 503 (saturados). El motor no reintenta ante un 503.

**Objetivo:** que el informe dé más información real y verificable, y que nunca afirme algo que no ha comprobado. Sigue la promesa del producto: datos reales y comprensión, no números inventados.

**Restricción:** el MVP sigue siendo 100 % gratuito. Ninguna fuente nueva requiere pago ni tarjeta.

## 2. Fuentes nuevas

Todas se ejecutan en paralelo con las actuales, a través del `Fetcher` o del `PageGetter` inyectados. Cada una tiene su tiempo máximo. Si una falla, se marca como no disponible y el análisis continúa.

| Fuente (`SourceId`) | Endpoint (gratuito, sin clave) | Datos |
|---|---|---|
| `sitemap` | `/robots.txt` (líneas `Sitemap:`), si no `/sitemap.xml`. Sigue hasta 3 sitemaps hijos; 5 MB en total como máximo | Nº de URLs, secciones detectadas por ruta (blog, ayuda, precios, empleo, docs), idiomas (prefijos de ruta y `xhtml:link hreflang`), `lastmod` más reciente y nº de URLs de blog con `lastmod` en los últimos 90 días |
| `rutas` | GET mediante `PageGetter` a `/blog`, `/pricing`, `/precios`, `/careers`, `/jobs`, `/empleo`, `/about`, `/nosotros` (máx. 8, en paralelo) | La sección existe si responde < 400, sigue en el mismo sitio y no redirige a la home |
| `empleo` | Greenhouse `boards-api.greenhouse.io/v1/boards/{t}/jobs`, Lever `api.lever.co/v0/postings/{t}?mode=json`, Ashby `api.ashbyhq.com/posting-api/job-board/{t}` | Nº de ofertas abiertas, nº por área (departamento o equipo) y la plataforma |
| `appstore` | iTunes `itunes.apple.com/lookup?id=` (si la web enlaza `apps.apple.com/.../id<N>`) o `itunes.apple.com/search?term=<nombre>&entity=software&limit=10` | Nombre de la app, valoración media, nº de valoraciones y enlace |
| `wikidata` | `wikidata.org/w/api.php?action=wbsearchentities` (por nombre) y después `wbgetentities` (claims y etiquetas) | Fundación (P571), fundadores (P112), sede (P159), empleados (P1128, el valor más reciente), ingresos (P2139, el más reciente, con su moneda), web oficial (P856) y descripción |
| `dns` | Cloudflare DoH `cloudflare-dns.com/dns-query?name=<d>&type=MX` y `type=TXT` (`accept: application/dns-json`) | Proveedor de email corporativo (MX), herramientas por `include:` de SPF y tokens de verificación TXT |
| `hackernews` | Algolia `hn.algolia.com/api/v1/search?query=<dominio>&restrictSearchableAttributes=url` (total y últimos 12 meses con `numericFilters=created_at_i>…`) | Nº de historias que enlazan al dominio (total y del último año), y la historia con más puntos (título y puntos) |

### 2.1 Identificar a la empresa en servicios externos

Empleo, App Store y Wikidata buscan por nombre o identificador. Hay que evitar mezclar empresas.

- **Nombre de la empresa:** primero el JSON-LD `Organization.name`; si no hay, `og:site_name`; si no, el título hasta el primer separador (`—`, `|`, `-`, `:`); si no, la primera etiqueta del dominio.
- **Empleo:** el token preferente es el que aparece en un enlace de la propia web (`boards.greenhouse.io/<t>`, `job-boards.greenhouse.io/<t>`, `jobs.lever.co/<t>`, `jobs.ashbyhq.com/<t>`), buscado en la home, en la página de empleo y en las rutas. Si no hay enlace, se prueba la primera etiqueta del dominio registrable en las tres plataformas. Un token adivinado da confianza "media"; uno enlazado desde la web, "alta".
- **App Store:** una app enlazada desde la web se acepta siempre. Una app encontrada por búsqueda solo se acepta si el host de `sellerUrl` tiene el mismo dominio registrable que la web analizada.
- **Wikidata:** de los 5 primeros candidatos, solo se acepta la entidad cuya web oficial (P856) tenga el mismo dominio registrable que la web analizada. Si ninguna coincide, no hay datos de Wikidata.

### 2.2 Dominio final

Tranco, Radar y RDAP usan el dominio registrable de la **URL final tras las redirecciones** de la home (por ejemplo, notion.so → notion.com). Si la home no responde, usan el dominio introducido. Se mantiene `allowPrivateDomains: true`. Para esto, Tranco, Radar y RDAP esperan a que termine la descarga de la home. El resto de fuentes sigue en paralelo.

### 2.3 Plazo total

La recogida tiene un plazo blando de **40 s**. Toda fuente que no haya terminado en ese plazo se marca como no disponible (`fallo`) y el análisis continúa. El plazo se inyecta (`deadlineMs`) para poder probarlo.

## 3. Hechos con tres estados

Se introduce `Presence = "si" | "no" | "desconocido"`. Una capa nueva (`facts.ts`) combina todas las fuentes y produce los **hechos** sobre los que trabajan las señales:

| Hecho | Fuentes que lo comprueban |
|---|---|
| `blog` | Enlaces de la web, secciones del sitemap, ruta `/blog`, subdominio `blog.` enlazado |
| `paginaPrecios` | Enlaces de la web, sitemap, rutas `/pricing` `/precios`, precios detectados |
| `empleo` | Enlaces de la web, sitemap, rutas de empleo, API de empleo con ofertas |
| `app` | Enlaces a App Store o Google Play, app aceptada en App Store |
| `redes` | Lista unida (sin duplicados) de redes encontradas en enlaces de la web y en JSON-LD `sameAs` |
| `emailMarketing` | Tecnologías de la web (categoría email) y herramientas detectadas por DNS |
| `chatSoporte` | Tecnologías de la web (categoría chat) y herramientas de soporte detectadas por DNS (Zendesk, Intercom, Freshdesk) |

**Regla:**
- `"si"` si **cualquier** fuente lo ve.
- `"no"` si **al menos dos fuentes independientes** lo comprobaron con éxito y ninguna lo vio.
- `"desconocido"` en cualquier otro caso.

Una fuente cuenta como comprobación solo si respondió. El sitemap cuenta solo si existe. Las rutas cuentan solo si las peticiones obtuvieron respuesta.

**Las señales negativas de presencia** (`sin_blog`, `sin_app_movil`, `sin_captacion_email`, `sin_chat_soporte`, `sin_empleo`) **solo se emiten con `"no"`**. `pocas_redes` solo se emite si la web se leyó con un texto ≥ 1500 caracteres y hay menos de 2 redes en la lista unida.

## 4. Señales

`Signal` gana el campo `polarity: "positiva" | "negativa"`. Todas las señales existentes son negativas. `SourceId` gana `sitemap`, `rutas`, `empleo`, `appstore`, `wikidata`, `dns` y `hackernews`.

### 4.1 Señales positivas nuevas

| id | Condición | Fuente |
|---|---|---|
| `contratando` | ≥ 5 ofertas abiertas | empleo |
| `contratacion_fuerte` | ≥ 30 ofertas abiertas (sustituye a `contratando`) | empleo |
| `app_valorada` | valoración ≥ 4,3 y ≥ 1000 valoraciones | appstore |
| `blog_activo` | ≥ 4 URLs de blog con `lastmod` en los últimos 90 días | sitemap |
| `multi_idioma` | ≥ 3 idiomas (web y sitemap) | web |
| `web_amplia` | ≥ 500 URLs en el sitemap | sitemap |
| `trafico_alto` | rango Tranco o Radar ≤ 10 000 | tranco / radar |
| `trafico_en_subida` | tendencia de Tranco "sube" | tranco |
| `empresa_consolidada` | fundación (Wikidata) o antigüedad del dominio ≥ 5 años | wikidata / rdap |
| `plantilla_grande` | ≥ 200 empleados (Wikidata) | wikidata |
| `notoriedad_tech` | ≥ 20 historias en Hacker News | hackernews |
| `stack_crecimiento` | ≥ 3 herramientas de marketing, ventas o soporte (web y DNS, sin duplicados) | tecnologias / dns |
| `web_rapida` | PageSpeed móvil ≥ 90 | pagespeed |

### 4.2 Señales negativas nuevas

| id | Condición | Fuente |
|---|---|---|
| `sin_empleo` | hecho `empleo` = "no" | rutas |
| `web_inactiva` | `lastmod` más reciente del sitemap con más de 12 meses | sitemap |
| `app_mal_valorada` | valoración < 3,5 con ≥ 100 valoraciones | appstore |
| `sin_email_corporativo` | DNS respondió y no hay ningún registro MX | dns |

### 4.3 Cambios en señales existentes

- `sin_blog`, `sin_app_movil`, `sin_captacion_email` y `sin_chat_soporte` pasan a depender del hecho correspondiente (sección 3).
- `sin_analitica` se mantiene (solo web), pero no se emite si el texto leído es < 1500 caracteres (web hecha con JavaScript).
- `contenido_escaso` no se emite si el sitemap tiene ≥ 50 URLs.
- `un_solo_idioma` no se emite si no se detectó ningún idioma.

## 5. Anclas

### 5.1 Tráfico

Sin cambios, salvo que usa el dominio final (sección 2.2).

### 5.2 Ingresos

Se añade un ancla de ingresos calculada por código (`anchors.ingresosAnuales`):

- **Ingresos públicos.** Si Wikidata tiene ingresos, el ancla es ese valor ± 10 %, convertido a EUR con una tabla fija (USD 0,92 y GBP 1,17; otras monedas no se convierten y el ancla se descarta) y con confianza **alta**.
- **Si no, empleados.** Si Wikidata tiene empleados, el ancla es empleados × ingresos por empleado del sector, con un rango de ×0,5 a ×1,5 y confianza **media**. Tabla en EUR: saas 150 000, ecommerce 250 000, marketplace 200 000, contenido_ads 120 000, servicios 100 000, app 150 000, otro 120 000. Como el tipo de negocio lo da la IA, el ancla por sector se calcula **después** de la IA y se usa en el recorte de la sección 5.3. A la IA se le pasan los empleados, no el ancla.
- **Si no,** no hay ancla de ingresos.

### 5.3 Recorte de ingresos (sustituye la regla actual)

Se mantienen los recortes actuales: negativos a null, intercambio si mínimo > máximo, y todo null con confianza "baja" si no hay ancla de tráfico **ni** ancla de ingresos. Además:

- **Con ancla de ingresos:** el rango final es la intersección del rango de la IA con el ancla. Si no se solapan, gana el ancla. La confianza máxima es la del ancla.
- **Sin ancla de ingresos:** la confianza máxima es la del tráfico (como ahora).

## 6. IA

### 6.1 Cadena de modelos

- `GEMINI_MODELS` es una lista separada por comas. Por defecto: `gemini-3.5-flash,gemini-flash-lite-latest`.
- Si existe `GEMINI_MODEL` (el ajuste antiguo), se pone al principio de la lista sin duplicarlo.
- Cada modelo es un `JsonModel` distinto. Después de todos los de Gemini va Groq, si está configurado.
- `.env.example` y `docs/decisiones/` se actualizan con la nueva configuración.

### 6.2 Reintentos ante saturación

Si `generate` falla con 503, `UNAVAILABLE` o "overloaded", se reintenta el **mismo modelo** tras 2 s y tras 5 s (la función de espera se inyecta para las pruebas). Si sigue fallando, pasa al siguiente modelo. El cupo agotado (429) pasa al siguiente modelo sin esperar, como ahora. Los fallos de JSON siguen teniendo 3 intentos por modelo.

### 6.3 Esquema de salida

- `veredicto.fortalezas` pasa a ser `{ texto: string; senales: string[] }[]`. El código conserva solo las fortalezas que citan al menos una señal **positiva** existente, como máximo 3. Si quedan menos de 3, se muestran las que haya.
- `debilidades` pasa a `{ texto; senales }[]` con la misma regla, pero con señales **negativas**.
- El prompt incluye la ficha de empresa y la polaridad de cada señal, e indica que las oportunidades se basan en señales negativas o de mercado y las fortalezas en señales positivas.

## 7. Informe

Cambios en `Report`:

- **`empresa`** (nuevo, lo rellena solo el código). Cada campo es `{ valor, fuente } | null`:
  - `nombre`, `fundacion` (año), `fundadores` (string[]), `sede`, `empleados`, `ingresosPublicos` (`{ importe, moneda, anio }`)
  - `empleo`: `{ ofertas, porArea: Record<string, number>, plataforma }`
  - `app`: `{ nombre, valoracion, valoraciones, url }`
  - `emailCorporativo` ("Google Workspace" | "Microsoft 365" | "Otro" | "Ninguno")
  - `herramientas`: herramientas del DNS que se unen a las tecnologías de la web, sin duplicados
  - `web`: `{ paginas, ultimaActualizacion, idiomas }`
  - `menciones`: `{ total, ultimoAnio, destacada: { titulo, puntos } | null }`
- **`hechos`** (nuevo): el valor de `Presence` de cada hecho de la sección 3.
- **`fuentes`** (nuevo): `Record<SourceId, "ok" | "fallo" | "no_aplica">`. Ejemplos de `no_aplica`: Radar sin token, empleo sin token encontrado, App Store sin app coincidente. `fuentesNoDisponibles` se mantiene por compatibilidad.
- **`trafico.tecnologias`** incluye las herramientas detectadas por DNS, con su fuente.
- **`veredicto.fortalezas` y `debilidades`** pasan a `{ texto, evidencias: Signal[] }[]`.

## 8. Errores

Se suman a la sección 9 del spec del MVP:

| Situación | Comportamiento |
|---|---|
| Sitemap enorme o mal formado | Se cortan los datos en 5 MB / 3 sitemaps hijos y se usa lo leído; si no se puede leer, la fuente se marca como `fallo` |
| No se encuentra token de empleo, app o entidad de Wikidata coincidente | `no_aplica`; ningún hecho pasa a "no" solo por eso |
| Una fuente supera el plazo de 40 s | `fallo`; el análisis sigue |
| Todos los modelos de IA saturados | `AiUnavailableError` con `kind: "unavailable"` (sin cambios) |

## 9. Pruebas

- Pruebas sin internet para cada fuente nueva, con respuestas de ejemplo de cada API, incluidas las respuestas vacías y erróneas.
- La identificación de empresa debe aceptar la coincidencia correcta y rechazar las que no coinciden (App Store y Wikidata).
- Tabla de verdad de los hechos de tres estados.
- Cada señal nueva, con sus condiciones límite.
- Ancla y recorte de ingresos.
- Cadena de modelos y reintentos ante 503 (con espera inyectada).
- Validación de fortalezas y debilidades por polaridad.
- Plazo total con un reloj o temporizador inyectado.
- **Regresión del caso Notion:** una home sin enlaces visibles, con sitemap que contiene `/blog/…`, no puede producir `sin_blog`.
- **Prueba manual final** con 5 webs reales: notion.so, una tienda Shopify, una web española, una startup pequeña y una empresa con app. Se revisa que no haya señales falsas y que la ficha de empresa tenga datos correctos.
