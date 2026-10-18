# DNAweb — Informe v3.1: solo datos fiables y reales

- **Fecha:** 2026-10-18.
- **Modifica:** `2026-10-18-dnaweb-informe-v3-design.md`. Donde choquen, manda este documento.
- **Origen:** el documento maestro del usuario ("DNAWEB — Product specification & technical master plan"), que pegó en el chat el 2026-10-18. Lo aprobó con un "si" a la propuesta de 5 puntos más datos nuevos.

## 1. Por qué

Las pruebas reales mostraron que algunos parámetros no eran fiables:

- el tráfico se traducía de un ranking a una cifra de visitas;
- los ingresos salían de una conversión de referencia;
- la valoración salía de un multiplicador.

El documento maestro fija una regla: **un informe más pequeño con pruebas defendibles vale más que uno completo con cifras inventadas.** Los competidores siguen dentro del MVP, por decisión del usuario.

## 2. Reglas de datos (obligatorias)

### 2.1 Cada métrica es un registro `Metrica`

| Campo | Qué contiene |
|---|---|
| `clave` | Identificador estable de la métrica |
| `etiqueta` | Nombre en español |
| `valor` | `number`, `string`, rango o `null` |
| `unidad` | Unidad del valor |
| `fuente` | Nombre de la fuente |
| `fuenteUrl` | Enlace a la fuente, si existe |
| `tipo` | `observado` \| `estimado` \| `hipotetico` |
| `metodologia` | Cómo se obtuvo |
| `periodo` | Periodo al que corresponde, si aplica |
| `obtenidoEn` | ISO |
| `confianza` | `alta` \| `media` \| `baja` \| `insuficiente` |
| `motivoConfianza` | Por qué tiene esa confianza |
| `limitaciones` | `string[]` |
| `supuestos` | `string[]` |
| `estado` | `disponible` \| `insuficiente` \| `error` \| `no_aplica` |

- Los campos ausentes **no** se rellenan.
- La confianza se asigna **por métrica**, con reglas de código:
  - **alta:** dato directo o publicado, con un periodo pertinente y que corresponde a la entidad analizada;
  - **media:** estimación de un proveedor identificable;
  - **baja:** señal indirecta;
  - **insuficiente:** no hay base.

### 2.2 Tráfico

- **Las visitas mensuales siempre salen "No hay datos fiables disponibles"**, porque ninguna fuente gratuita las mide. Estado `insuficiente`.
- Lo que sí se muestra, como dato `observado`, con su fuente y fecha:
  - el puesto en Tranco y su tendencia;
  - la franja de Cloudflare Radar;
  - si Chrome (CrUX, a través de PageSpeed) tiene datos de usuarios reales del origen, y sus métricas (LCP, INP, CLS).
- Nunca se convierte un ranking en visitas.

### 2.3 Ingresos

- **Observado:** solo cuando están publicados, por ejemplo en Wikidata. Se muestran con el año, la moneda original y la fuente, y la confianza depende de la antigüedad del dato.
- **Si no hay dato publicado:** "No estimable".
- **Escenario hipotético:** se añade solo si la web publica un precio verificable.
  - La fórmula es `clientes × precio publicado`, con 100, 500 y 1.000 clientes.
  - Lleva siempre la etiqueta `hipotetico` y el texto "Escenario ilustrativo: no son los ingresos de la empresa".
  - Indica los supuestos (clientes desconocidos y periodicidad del precio) y el dato que falta para validarlo.
  - Nunca se infiere una conversión.

### 2.4 Valor del negocio

- Siempre: "No estimable con los datos disponibles", con estado `no_aplica`.
- La explicación dice que haría falta ingresos, márgenes, crecimiento y comparables.

### 2.5 Precios

- Cada precio publicado lleva: importe, moneda, periodicidad (si consta), plan (si consta) y la URL de la página.
- Un precio anunciado no es un ingreso medio por cliente.

### 2.6 Modelo de negocio

- Lleva un estado: `confirmado`, `probable` o `desconocido`.
  - **`confirmado`:** hay un precio o un recorrido de compra o contratación visible y citado.
  - **`probable`:** solo hay indicios.
  - **`desconocido`:** no hay base.
- Se muestran los canales de conversión visibles (prueba gratuita, demo, contacto, suscripción, compra, registro) con su evidencia.

### 2.7 Afirmaciones frente a hechos

- Lo que la empresa dice de sí misma ("líderes", "el mejor", "+1.000 clientes") se marca como `afirmacion`, con el texto "La empresa afirma…".
- Solo es `comprobado` lo que respalda otra fuente o un dato estructural, por ejemplo una página de precios real.

## 3. Datos nuevos (gratuitos)

1. **PageSpeed completo.**
   - Una petición móvil con las categorías performance, accessibility, best-practices y seo, más los datos de campo de CrUX (`loadingExperience` / `originLoadingExperience`).
   - Una petición de escritorio solo con performance.
   - Se guarda la estrategia, la fecha y si el dato es de laboratorio o de campo.
   - Usa `PAGESPEED_API_KEY`, que es gratuita. El usuario la crea.
2. **Identidad legal**, a partir de las páginas leídas y de la portada:
   - enlaces a aviso legal o legal notice, privacidad, cookies y condiciones;
   - CIF/NIF español, validado con su dígito de control;
   - razón social, con formas societarias como S.L., S.A., SLU o SCCL, o "Fundació" / "Fundación" / "Asociación";
   - email, teléfono y dirección de contacto visibles.

   Todo esto pasa a ser evidencia (`dato:cif`, `dato:razon_social`, `dato:aviso_legal`, etc.).
3. **Datos estructurados JSON-LD** de tipo Organization o LocalBusiness: `name`, `legalName`, `address`, `foundingDate`, `sameAs`. Se marcan como `observado`, con la limitación "declarado por la propia web".

## 4. DNA Score v1.0 (sustituye los 6 criterios)

- **Dimensiones**, con pesos configurables y versionados en `METODOLOGIA_DNA = "dna-score-1.0"`:
  - Propuesta de valor: 20 %.
  - Oferta y monetización: 20 %.
  - Experiencia y rendimiento: 20 %.
  - Adquisición y visibilidad: 20 %.
  - Confianza y transparencia: 20 %.
- **Indicadores.** Cada dimensión tiene indicadores explícitos (§9 los deja al constructor y 0008 los documenta). Cada indicador tiene esta forma: `{ clave, nombre, evaluado: boolean, puntos, maximo, evidencias, motivo }`.
  - Un indicador **sin datos se marca como no evaluado**. Nunca vale 0.
- **Puntuación de una dimensión:** `round(100 × Σpuntos / Σmáximo)` sobre los indicadores evaluados.
  - Su cobertura es `evaluados / total`.
  - Si la cobertura es menor del 50 %, la dimensión es "No puntuable".
- **Puntuación global:** la media ponderada de las dimensiones puntuables, con los pesos renormalizados.
  - Muestra una **cobertura global**, la media de las coberturas.
  - Si la cobertura global es menor del 60 % o hay menos de 3 dimensiones puntuables, sale "DNA Score no disponible".
- **Textos fijos:**
  - "Resume indicadores públicos; no es una valoración financiera."
  - "Pesos provisionales, pendientes de validación."
- **Lo que sale del score:**
  - Novedad deja de puntuar. Los competidores se quedan como sección informativa.
  - Las puntuaciones no se comparan entre empresas.

## 5. Oportunidades (sustituye "3 acciones")

- Hay 3 como máximo. Cada una necesita ≥ 2 evidencias y nunca se rellena.
- Ficha de cada oportunidad:
  - hallazgo;
  - evidencias;
  - impacto potencial (qué resuelve y para quién);
  - prioridad, calculada en código a partir de impacto, esfuerzo y riesgo (alta, media o baja);
  - acción concreta;
  - **validación**: el experimento o la métrica de éxito;
  - **confianza**: lo comprobado frente a la hipótesis;
  - supuestos.
- No se afirma nada sobre conversión, abandono o clientes perdidos sin datos.

## 6. Fortalezas y debilidades

Cada una lleva: hallazgo, evidencias, relevancia para el negocio, confianza y limitaciones. Las afirmaciones de la empresa no cuentan como fortaleza comprobada.

## 7. Lo que no cambia

- Se mantienen el modelo de evidencias (extractos literales con id y validación de citas por código), las secciones progresivas, la base de datos, los créditos, la seguridad SSRF y los competidores verificados.
- La sección `datos` pasa a contener `metricas: Metrica[]` y `precios`.
- `score` pasa a ser el DNA Score v1.0.
- `cierre` pasa a tener `oportunidades`.
- `revision` gana relevancia, confianza y limitaciones en `bien` y `problemas`.

## 8. Fuera de alcance

- Proveedores de pago como Similarweb.
- Search Console, que requiere la autorización del propietario.
- Un simulador interactivo de escenarios.
- El diseño visual (Plan 3).

## 9. A criterio del constructor

- Los indicadores exactos de cada dimensión y sus puntos.
- Las expresiones regulares de identidad legal.
- El texto de los prompts.
- La forma de mostrar las etiquetas en la vista básica.
