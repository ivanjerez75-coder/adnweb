export const es = {
  marca: {
    nombre: "ADNweb",
    lema: "Analiza cualquier web",
    descripcion:
      "Analiza cualquier negocio a partir de su URL: qué vende, cuánto factura y dónde hay oportunidades.",
  },
  landing: {
    subtitulo: "ANTES DE LANZAR TU WEB, ANALIZA LAS QUE YA GANAN DINERO",
    titular1: "DESCUBRE CUÁNTO FACTURA",
    titular2: "CUALQUIER WEB",
    placeholder: "Pega la URL de una web",
    explicacion:
      "Pega la dirección de cualquier negocio y obtén un informe con su modelo, sus cifras y las pruebas que lo respaldan.",
    ejemplosEtiqueta: "Prueba con",
    oportunidadesTitulo: "DESCUBRE OPORTUNIDADES",
    oportunidadesTexto:
      "Mira cómo gana dinero un negocio, qué ofrece y dónde falla, antes de invertir en el tuyo.",
    cierreTitulo: "TODO GRAN NEGOCIO EMPEZÓ CON UNA INVESTIGACIÓN",
    cierreBoton: "COMIENZA A ANALIZAR",
    piePrivacidad: "Privacidad",
    pieCondiciones: "Condiciones",
    pieContacto: "Contacto",
  },
  auth: {
    titulo: "ADNweb: analiza cualquier web",
    email: "Correo electrónico",
    emailPlaceholder: "tu@correo.com",
    continuar: "Continuar",
    codigo: "Código recibido",
    codigoPlaceholder: "Código de 6 dígitos",
    codigoEnviado: "Te hemos enviado un código a {email}.",
    reenviar: "Reenviar código",
    cambiarEmail: "Usar otro correo",
    google: "Continuar con Google",
    o: "o",
    aviso: "Al continuar aceptas las condiciones y la política de privacidad.",
    errorCodigo: "El código no es correcto o ha caducado. Pide uno nuevo.",
    errorGoogle: "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
    errorEmail: "Escribe un correo válido.",
    salir: "Cerrar sesión",
  },
  panel: {
    titulo: "¿QUÉ WEB QUIERES ANALIZAR HOY?",
    nuevo: "Nuevo análisis",
    recientes: "Recientes",
    sinRecientes: "Aún no has analizado ninguna web.",
    buscar: "Buscar análisis",
    creditos: "Créditos restantes: {n}",
    sinCreditos: "No te quedan créditos.",
    analizar: "Analizar",
  },
  barra: {
    plegar: "Plegar barra lateral",
    desplegar: "Desplegar barra lateral",
    menu: "Abrir menú",
    cerrarMenu: "Cerrar menú",
    ajustes: "Ajustes",
    historial: "Historial",
    inicio: "Inicio",
  },
  ajustes: {
    titulo: "AJUSTES",
    cuenta: "Cuenta",
    email: "Correo",
    creditos: "Créditos",
    guardar: "Guardar cambios",
    guardado: "Cambios guardados.",
  },
  historial: {
    titulo: "HISTORIAL",
    vacio: "Todavía no hay análisis en tu historial.",
    ver: "Ver informe",
    fecha: "Fecha",
    web: "Web",
    estado: "Estado",
  },
  errores: {
    generico: "Algo ha salido mal. Inténtalo de nuevo.",
    urlInvalida: "Escribe una URL válida, por ejemplo canva.com.",
    sinCreditos: "No te quedan créditos para analizar.",
    noEncontrado: "No hemos encontrado lo que buscas.",
    sesionCaducada: "Tu sesión ha caducado. Inicia sesión de nuevo.",
  },
  comun: {
    cargando: "Cargando…",
    cancelar: "Cancelar",
    aceptar: "Aceptar",
    volver: "Volver",
    cerrar: "Cerrar",
    enviar: "Enviar",
    analizarUrl: "Analizar la URL",
    campoUrl: "URL de la web",
    etObservado: "Observado",
    etExterna: "Fuente externa",
    etInferencia: "Inferencia",
    etHipotesis: "Hipótesis",
    etProblema: "Problema",
  },
} as const;

type Hojas<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Hojas<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Clave = Hojas<typeof es>;
