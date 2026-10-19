# ADNweb — Diseño: pestaña Análisis v4 y diseño visual de la aplicación

- **Fecha:** 2026-10-19.
- **Fuentes:** dos documentos que el usuario pegó en el chat el 2026-10-19:
  - **"ADNWeb — Estructura completa de la pestaña «Análisis»"**, el documento principal. Este diseño lo resume y fija las decisiones.
  - **Capturas de diseño:**
    - landing (hero, explicación, cierre);
    - login con tarjeta oscura;
    - panel "¿Qué web quieres analizar hoy?".
- **Mantiene:** todo lo de `2026-10-18-dnaweb-informe-v3-1-datos-fiables.md`:
  - nada de cifras inventadas;
  - visitas siempre "No hay datos fiables disponibles";
  - ingresos solo si están publicados, o como escenario hipotético;
  - valoración "No estimable";
  - evidencias literales validadas por código;
  - el filtro de cifras y promesas.

  Si algo choca, manda este documento.

## 1. Por qué

El usuario quiere que el cliente entienda el negocio al momento, y que el informe funcione como un sistema **Evidencia → Diagnóstico → Oportunidad → Acción**. Al terminar debe responder a cinco preguntas:

1. qué negocio es y cómo funciona;
2. qué se sabe de verdad y qué es estimación;
3. sus fortalezas, debilidades y problemas;
4. dónde hay oportunidades concretas;
5. qué hacer con todo ello.

## 2. Decisiones del usuario (2026-10-19)

| Tema | Decisión |
|---|---|
| Nombre | **ADNweb**, nunca "Foundry". |
| Idioma | Solo castellano por ahora, con la arquitectura preparada para más idiomas. Todos los textos de la interfaz van en un diccionario. La generación del informe recibe `idioma`, que hoy es siempre `"es"`. El informe se genera en el idioma elegido; los informes antiguos se quedan en el suyo. |
| Titular de la landing | "DESCUBRE CUÁNTO FACTURA CUALQUIER WEB", que es decisión del usuario. El informe responde explicando cómo gana dinero el negocio; las cifras solo aparecen si son reales. |
| Login | Email con código (sin contraseña) + Google. Apple queda para más adelante, porque cuesta 99 $/año. |
| Barra lateral | "Nuevo análisis" y "Recientes". Proyectos y Favoritos se dejan para más adelante. |
| DNA Score | Discreto, dentro de "Rendimiento y presencia digital", con su metodología. No va en el resumen ejecutivo. |
| Interacciones | Las cuatro entran en esta versión: exportar a PDF, ampliar hallazgos y filtrar, preguntar sobre el análisis, añadir competidores a mano. |

## 3. Estructura del informe: 7 secciones en una sola página

La página tiene una navegación lateral o secundaria entre las secciones y una cabecera con nombre, dominio, fecha y estado. En móvil, las secciones son desplegables y las tablas se adaptan.

### 01 Resumen ejecutivo
Lo primero que se ve; se entiende en 30-60 segundos. Contiene:
- nombre, URL, fecha y categoría;
- una frase sencilla que dice qué ofrece, a quién y cómo parece ganar dinero;
- el modelo de negocio con su grado de certeza;
- los indicadores clave que existen de verdad;
- **3 hallazgos principales**;
- 2-3 fortalezas o debilidades;
- la oportunidad más interesante;
- la **cobertura del análisis**: qué se pudo estudiar y qué no (ver §6).

No lleva puntuación global.

### 02 Anatomía del negocio
1. **Identidad y propuesta de valor.**
   - Producto o servicio, problema que resuelve, para quién, beneficio prometido, argumento de venta y diferenciación declarada.
   - Cada punto distingue **lo que la empresa declara** de **lo que ADNweb interpreta**.
2. **Modelo de negocio.**
   - Tipología **múltiple**: SaaS, e-commerce, marketplace, servicio profesional, medio de contenido, freemium, aplicación o plataforma, organización social, negocio local, o web informativa.
   - Cada tipología va con su explicación y su grado de certeza.
3. **Monetización.** Cada fuente de ingresos se marca en uno de tres niveles:
   - **Confirmado:** hay un precio, plan o fuente publicada.
   - **Inferido:** se deduce, pero falta confirmación.
   - **Desconocido.**

   Los precios publicados se muestran tal cual. Nunca se multiplican por clientes inventados; el escenario hipotético de v3.1 se mantiene, aparte y etiquetado.
4. **Cliente objetivo y posicionamiento.**
   - El público explícito, sus necesidades, los sectores prioritarios y el mensaje comercial.
   - Los segmentos alternativos que merece la pena investigar, como **hipótesis**.

Cada línea de negocio de v3 sigue existiendo como subapartado.

### 03 Rendimiento y presencia digital
Tiene cinco dimensiones:
1. tráfico y audiencia (hoy: "No hay datos fiables" más rankings y CrUX);
2. SEO y visibilidad orgánica;
3. rendimiento técnico;
4. experiencia de usuario y conversión (fricciones potenciales, nunca conversión real);
5. adquisición y marketing (canales observables).

Cada métrica lleva:
- el valor;
- el periodo;
- la fuente;
- el método;
- la confianza;
- una **interpretación empresarial**, generada por reglas de código o por la IA filtrada, que nunca afirma más de lo que permiten los datos;
- las limitaciones.

Al final va el **DNA Score**, discreto, con sus 5 dimensiones, su cobertura y su metodología.

### 04 Competencia y posicionamiento
- **Tipos de competidor:** **directo**, **indirecto** o **alternativa emergente**, cada uno con el motivo por el que es relevante.
- **Ficha de cada competidor:**
  - nombre, dominio y descripción;
  - tipo y motivo;
  - público y problema que resuelve;
  - propuesta de valor;
  - funcionalidades o servicios principales;
  - **precios públicos**, si existen;
  - fortalezas demostrables;
  - debilidades observables;
  - fuentes y fecha de comprobación.

  ADNweb lee la portada y, si la encuentra, la página de precios del competidor. Sus extractos son evidencia citable (`c<n>-e<k>`).
- **Matriz comparativa:** la empresa analizada frente a los competidores verificados, en las dimensiones cliente objetivo, propuesta de valor, precio (público o desconocido), funcionalidades, diferenciación y oportunidad.
- **Dónde gana y dónde pierde.** Para cada dimensión relevante:
  - quién destaca;
  - la evidencia;
  - por qué le importa al cliente;
  - qué puede aprender la empresa;
  - cómo diferenciarse sin copiar.
- **Añadir competidor a mano** (ver §5).

### 05 Diagnóstico estratégico
- **Fortalezas.** Cada una dice frente a qué alternativa lo es y para qué cliente.
- **Debilidades.** Cada una dice qué se observó y por qué importa. Nunca afirma malas ventas, pocos clientes ni abandono.
- **Riesgos.** Por ejemplo: dependencia de un canal, concentración, presión competitiva, dependencia de plataforma, falta de diferenciación. Sin datos se presentan como **hipótesis**.
- **Fricciones del cliente.** Por ejemplo: no se entiende qué se compra, ni para quién es, ni el precio; demasiados pasos; objeciones sin resolver; poca confianza. Siempre son **potenciales**.
- **Diagnóstico integrado.** Un párrafo coherente que une los cuatro bloques y propone la prioridad.

### 06 Oportunidades de negocio
- **Las cuatro tipologías:**
  1. mejorar el negocio existente;
  2. diferenciarse de la competencia;
  3. producto complementario;
  4. nuevo mercado o segmento.
- **Ficha de cada oportunidad:**
  1. evidencia;
  2. problema potencial;
  3. solución posible;
  4. por qué podría funcionar;
  5. qué falta comprobar.
- **Estado:** detectada, por validar, validada parcialmente o descartada. ADNweb genera "detectada" o "por validar".
- **Enlace** al hallazgo del diagnóstico o a la comparación de la que sale. Es obligatorio.
- **Prioridad.** Es una recomendación razonada a partir de cinco criterios: impacto potencial, evidencia, viabilidad, diferenciación y facilidad de validación. Cada criterio es alto, medio o bajo. El código combina los niveles en una prioridad sin porcentajes.

### 07 Plan de acción
Las acciones se agrupan en **Comprobar**, **Experimentar** y **Medir**. Cada acción tiene:
- el hallazgo u oportunidad que la origina (enlace);
- la tarea;
- por qué es prioritaria;
- los recursos o dependencias;
- el indicador que se medirá;
- el criterio para continuar, modificar o descartar.

Nunca lleva plazos, presupuestos ni incrementos de ingresos inventados.

## 4. Las cuatro clases de dato (sustituyen a observado/estimado/hipotético)

| Clase | Qué es | Etiqueta en pantalla |
|---|---|---|
| A, `observado` | Medido en la propia web o en una prueba técnica: precio publicado, PageSpeed, CIF | "Observado" |
| B, `fuente_externa` | Un proveedor con su metodología: Tranco, Radar, Wikidata, CrUX | "Fuente externa" |
| C, `inferencia` | Una interpretación de ADNweb con su razonamiento, por ejemplo "parece orientada a pymes por…" | "Inferencia" |
| D, `hipotesis` | Pendiente de validar | "Hipótesis" |

- **Ficha de trazabilidad.** Las métricas llevan la de v3.1 (§2.1): valor, unidad, fuente, URL, fecha, periodo, método, confianza, limitaciones y supuestos. Solo cambia el campo `tipo`, que pasa a usar estas cuatro clases.
- **Clase de cada afirmación de la IA.** El código la asigna a partir de sus evidencias:
  - con un extracto de página directo, `observado`;
  - con solo datos de fuentes externas, `fuente_externa`;
  - redactada como interpretación, `inferencia`;
  - las oportunidades, los riesgos y los segmentos alternativos, siempre `hipotesis`.

## 5. Interacciones

1. **Ampliar un hallazgo.** Cada hallazgo se abre y muestra la explicación, las pruebas literales y las fuentes. Una oportunidad enlaza al hallazgo que la originó.
2. **Filtrar.** Botones para ver por separado fortalezas, debilidades, riesgos, fricciones, oportunidades, datos técnicos o aspectos comerciales.
3. **Exportar a PDF.** Un botón "Descargar PDF" abre la impresión del navegador ("Guardar como PDF"). Una hoja de estilo de impresión despliega todo y muestra fuentes y limitaciones. No necesita servicios de pago.
4. **Preguntar sobre el análisis.**
   - Es un chat dentro del informe que responde **solo con los datos guardados del análisis**: las secciones y las evidencias. Si algo no está en los datos, lo dice.
   - Cita las evidencias que usa y aplica el mismo filtro de cifras.
   - **Límite:** 10 preguntas por análisis y día. No gasta créditos.
   - Las preguntas y respuestas se guardan con el análisis.
5. **Añadir un competidor a mano.**
   - El usuario pega una URL. ADNweb lee su portada y su página de precios de forma segura (SSRF), genera su ficha y la añade a la matriz y al "dónde gana y dónde pierde".
   - **Límite:** 3 por análisis. No gasta créditos.
   - Si la web no es accesible, lo dice.
6. **Guardar y continuar.** Ya existe: historial y recientes.

## 6. Adaptación al tipo de negocio y cobertura

- **El tipo va primero.** El motor fija la tipología, que puede ser múltiple, **antes** de elegir criterios.
- **Indicadores que no aplican.** Los del DNA Score y las comprobaciones de fricción que no aplican al tipo se marcan "no aplica". Por ejemplo, **no publicar precios no penaliza** a servicios profesionales, organizaciones sociales ni negocios con presupuesto personalizado. "Precios publicados" deja de aplicar siempre.
- **Cobertura.** El análisis registra qué comprobaciones se hicieron y cuáles fallaron, con estado válido, parcial o fallido y su motivo. Son las de la tabla §15 del documento del usuario:
  - identidad;
  - modelo de negocio;
  - auditoría web;
  - datos de rendimiento;
  - competencia;
  - diagnóstico;
  - oportunidades;
  - plan de acción.

  El resumen ejecutivo muestra esta cobertura, y el informe puede quedar con cobertura parcial.

## 7. Diseño visual

- **Identidad.**
  - Colores: grafito #393939, verde petróleo #0F766E, fondo #F5F5F5, superficie blanca o #F3F3F3, bordes #DADADA.
  - Rojo y ámbar solo para problemas y advertencias reales.
  - Nada de fondo negro con degradados morados en la aplicación. La tarjeta oscura del login es diseño del usuario y se respeta.
- **Tipografía.** Titulares grandes, condensados y en mayúsculas, como las capturas del usuario: Barlow Condensed 800. El texto va en Barlow. Las citas literales de la web van en serif cursiva (Source Serif 4), de modo que se distinguen al momento.
- **Landing** (capturas 1 y 2):
  - **Hero:** "ADNWEB", el subtítulo "ANTES DE LANZAR TU WEB, ANALIZA LAS QUE YA GANAN DINERO", el titular "DESCUBRE CUÁNTO FACTURA / CUALQUIER WEB" (la segunda línea en verde petróleo), el buscador en píldora con brillo suave y chips de ejemplo (Canva, Notion, Stripe, Shopify, ChatGPT), y el texto explicativo.
  - **Sección "DESCUBRE OPORTUNIDADES":** el texto y una imagen.
  - **Cierre:** "Every great business started with research" en castellano ("TODO GRAN NEGOCIO EMPEZÓ CON UNA INVESTIGACIÓN"), el botón "COMIENZA A ANALIZAR" y un pie con privacidad, condiciones y contacto.
  - **Al analizar sin sesión:** pedir el registro y conservar la URL.
- **Login y registro** (captura 3):
  - Tarjeta oscura con el texto "ADNweb: analiza cualquier web".
  - Paso 1: el email y "Continuar". Paso 2: el código recibido y "Continuar".
  - Botón "Continuar con Google".
  - Aviso de condiciones y privacidad.
- **Panel** (captura 4):
  - Barra lateral con buscador de análisis, botón para plegarla, "Nuevo análisis" y "Recientes" (la lista).
  - Zona central: "¿QUÉ WEB QUIERES ANALIZAR HOY?" con el buscador en píldora y los chips.
  - Se muestran los créditos restantes.
- **Informe:** las 7 secciones de §3, con el estilo de la maqueta 2: resumen claro arriba, citas con "Ver prueba", detalles plegables.
- **Responsive.** Escritorio completo. En móvil, la barra lateral se pliega en un menú y las tablas se convierten en fichas.

## 8. Restricciones

- **MVP gratuito.** Sin servicios de pago. Gemini y Groq en su cupo gratuito, y Supabase gratis.
- **Email con código.** El SMTP por defecto de Supabase tiene un límite muy bajo, unos pocos emails por hora. Antes del lanzamiento público hará falta un SMTP gratuito propio, como Resend con su capa gratis, y queda en la lista de prelanzamiento.
- **Google.** Requiere que el usuario cree un cliente OAuth en Google Cloud. Se le guiará.
- **IA.** Más llamadas por informe, unas 10-12. Hay que respetar la concurrencia de 3 y la cadena de modelos, y medir el tiempo total. El objetivo es el resumen en ≈ 30-40 s y el informe completo en ≤ 120 s.
- **Sin cambios.** Seguridad SSRF, evidencias validadas por código, contenido web dentro del delimitador escapado, RLS solo lectura, `security definer` y créditos.

## 9. Fuera de alcance

- Proyectos, Favoritos, Apple.
- Inteligencia de mercado con tráfico de pago.
- Seguimiento histórico y alertas.
- Idiomas además del castellano, aunque la arquitectura queda preparada.

## 10. A criterio del constructor

- Los esquemas exactos y el texto de los prompts.
- Las reglas de prioridad y de clase de dato, siempre deterministas.
- Cómo se renderizan los filtros.
- La imagen de la landing: una propia o libre de derechos, nunca la persona de la captura.
- El orden de construcción, que irá en planes separados:
  1. diseño de la app y login;
  2. motor v4 y página del informe;
  3. interacciones.

## 11. Estructura definitiva: 5 bloques (sustituye a la presentación en 7 secciones)

**Origen.** Documento del usuario "ADNWeb — Estructura definitiva de la pestaña Análisis", pegado el 2026-10-19. Las 7 secciones de §3 siguen siendo los datos que genera el motor. En pantalla se presentan en **5 bloques**, y lo detallado (auditorías técnicas, tablas completas, fuentes) va desplegable dentro de cada bloque.

### Los 5 bloques

1. **El negocio**: qué es y cómo funciona. Es una síntesis breve: qué ofrece, qué problema resuelve, para quién, cómo monetiza y su propuesta de valor. Si un negocio combina varios modelos, se marca como "Negocio híbrido".
2. **Datos clave**: qué sabemos realmente. Son los indicadores relevantes **según la tipología**, cada uno con una condición de publicación (§11.2).
3. **Competencia**: con quién compite y qué diferencias importan. Competidores justificados, precios públicos y diferencias demostrables.
4. **Hallazgos**: fortalezas, debilidades, riesgos y diferencias. Cada uno usa el formato estándar: **título + estado (Comprobado / Por comprobar) + HALLAZGO + EVIDENCIA + POR QUÉ IMPORTA + QUÉ HACER**.
5. **Oportunidades**: ordenadas por relevancia, con justificación y con lo que falta validar. Las acciones del plan (comprobar, experimentar, medir) aparecen dentro de cada oportunidad.

### §11.1 Indicadores según la tipología

Cada tipología activa sus datos clave. Una empresa híbrida usa la unión.

- **SaaS:**
  - planes y precios publicados;
  - prueba o plan gratuito;
  - funcionalidades principales;
  - competidores y diferencias funcionales;
  - claridad de la oferta y contratación.
- **E-commerce:**
  - catálogo, como número aproximado de productos según el sitemap;
  - rango de precios;
  - envíos y devoluciones publicados (página detectada);
  - medios de pago visibles;
  - confianza (aviso legal, CIF, opiniones).
- **Agencia o servicios:**
  - servicios y especialización;
  - modelo de contratación o precios, si los hay;
  - casos de éxito y testimonios;
  - clientes citados.
- **Marketplace o plataforma:**
  - qué conecta (los dos lados);
  - categorías;
  - modelo de monetización (comisión, suscripción) si se publica.
- **Negocio local o tradicional:**
  - actividad;
  - ubicación;
  - teléfono, contacto y horario;
  - presencia digital;
  - facilidad para pedir el servicio.
- **Organización social:**
  - actividad;
  - fuentes de financiación declaradas;
  - transparencia (aviso legal, memoria);
  - contacto.

### §11.2 Condiciones de publicación

Un dato clave solo se muestra si tiene fuente verificable.

- El tráfico solo aparece con una fuente adecuada, siempre etiquetado.
- Los ingresos y el valor no se muestran sin datos verificables.
- Lo que falta se indica como "Sin datos fiables", nunca con una cifra.

### §11.3 Priorización

Cada hallazgo pasa tres filtros:

- **relevancia**: responde a una pregunta importante;
- **fiabilidad**: está comprobado o es una hipótesis;
- **utilidad**: ayuda a comparar, entender, decidir o actuar.

El código ordena los hallazgos por esos tres filtros: la IA da cada nivel y el código combina. En el resumen solo aparecen los que superan los tres. Se excluye lo repetido o lo que no está respaldado.

### §11.4 Criterios de éxito

- El usuario entiende qué hace la empresa en menos de 30 segundos.
- Encuentra rápido los datos de su categoría.
- Ve las diferencias competitivas sin comparar a mano.
- Cada hallazgo tiene justificación verificable.
- El informe termina con una acción útil.
