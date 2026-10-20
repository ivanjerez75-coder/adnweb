import type { SVGProps } from "react";

/** Iconos de línea de la barra lateral. Decorativos: el texto accesible va en el botón o enlace. */
function Icono({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconoBuscar() {
  return (
    <Icono>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Icono>
  );
}

/** Rectángulo redondeado partido por la mitad (plegar/desplegar la barra). */
export function IconoPanel() {
  return (
    <Icono>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M12 4.5v15" />
    </Icono>
  );
}

/** Lápiz sobre un cuadrado (nuevo análisis). */
export function IconoNuevo() {
  return (
    <Icono>
      <path d="M11 4.5H7a3 3 0 0 0-3 3v9.5a3 3 0 0 0 3 3h9.5a3 3 0 0 0 3-3V13" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.5 14.4 9 15l.6-3.5z" />
    </Icono>
  );
}

export function IconoAjustes() {
  return (
    <Icono>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
    </Icono>
  );
}

export function IconoMenu() {
  return (
    <Icono>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icono>
  );
}

export function IconoCerrar() {
  return (
    <Icono>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icono>
  );
}
