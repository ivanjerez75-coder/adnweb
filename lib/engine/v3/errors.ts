/** Una sección se quedó sin ningún elemento con evidencia válida. */
export class SeccionVaciaError extends Error {
  constructor(seccion: string) {
    super(`La sección "${seccion}" no tiene ningún elemento con evidencia`);
    this.name = "SeccionVaciaError";
  }
}
