import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sqlPath = fileURLToPath(
  new URL("../../supabase/migrations/0001_cuentas.sql", import.meta.url),
);
const raw = readFileSync(sqlPath, "utf8");
// Quita comentarios "--" y normaliza espacios/mayúsculas para comparar.
const sql = raw
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

const FUNCIONES = ["obtener_perfil", "iniciar_analisis", "devolver_credito", "marcar_colgados"];

// Devuelve la definición completa de una función (de "create or replace function" a "$$;").
function definicion(nombre: string): string {
  const inicio = sql.indexOf(`create or replace function public.${nombre}(`);
  expect(inicio, `falta la función ${nombre}`).toBeGreaterThanOrEqual(0);
  const fin = sql.indexOf("$$;", sql.indexOf("$$", inicio) + 2);
  expect(fin).toBeGreaterThan(inicio);
  return sql.slice(inicio, fin);
}

describe("migración 0001_cuentas.sql", () => {
  it("activa RLS en las dos tablas", () => {
    expect(sql.match(/enable row level security/g)?.length).toBe(2);
    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("alter table public.analyses enable row level security");
  });

  it("solo tiene políticas de select", () => {
    expect(sql).toMatch(/create policy \S+ on public\.profiles for select to authenticated using \( ?id = auth\.uid\(\) ?\)/);
    expect(sql).toMatch(/create policy \S+ on public\.analyses for select to authenticated using \( ?user_id = auth\.uid\(\) ?\)/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/);
    expect(sql).toContain("drop policy if exists");
  });

  it("garantiza un único análisis procesando por usuario", () => {
    expect(sql).toMatch(/create unique index if not exists \S+ on public\.analyses ?\( ?user_id ?\) where estado = 'procesando'/);
  });

  it("es idempotente", () => {
    expect(sql).toContain("create table if not exists public.profiles");
    expect(sql).toContain("create table if not exists public.analyses");
    expect(sql).not.toMatch(/create function/);
    expect(sql).toContain("drop trigger if exists");
  });

  it("créditos nunca negativos", () => {
    expect(sql).toMatch(/creditos_restantes int not null default 5 check \( ?creditos_restantes >= 0 ?\)/);
  });

  it.each(FUNCIONES)("%s es security definer con search_path fijo", (nombre) => {
    const def = definicion(nombre);
    expect(def).toContain("security definer");
    expect(def).toContain("set search_path = public");
  });

  it("el trigger de auth.users es security definer con search_path fijo", () => {
    const def = definicion("crear_perfil");
    expect(def).toContain("security definer");
    expect(def).toContain("set search_path = public");
    expect(def).toContain("raw_user_meta_data->>'nombre'");
    expect(sql).toMatch(/create trigger \S+ after insert on auth\.users for each row execute function public\.crear_perfil\(\)/);
  });

  it("iniciar_analisis descuenta de forma atómica y lanza los errores esperados", () => {
    const def = definicion("iniciar_analisis");
    expect(def).toContain("creditos_restantes > 0");
    expect(def).toContain("raise exception 'sin_creditos'");
    expect(def).toContain("when unique_violation then");
    expect(def).toContain("raise exception 'analisis_en_curso'");
    expect(def).toContain("raise exception 'no_autenticado'");
    expect(def).toContain("interval '1 month'");
  });

  it("obtener_perfil aplica la renovación", () => {
    const def = definicion("obtener_perfil");
    expect(def).toContain("renovacion <= now()");
    expect(def).toContain("interval '1 month'");
    expect(def).toContain("raise exception 'no_autenticado'");
  });

  it("devolver_credito es idempotente", () => {
    const def = definicion("devolver_credito");
    expect(def).toContain("not credito_devuelto");
    expect(def).toContain("creditos_restantes + 1");
  });

  it("marcar_colgados usa el umbral de 3 minutos y el mensaje de timeout", () => {
    const def = definicion("marcar_colgados");
    expect(def).toContain("interval '3 minutes'");
    expect(def).toContain("'timeout'");
    expect(raw).toContain("El análisis ha tardado demasiado. Te hemos devuelto el crédito.");
    expect(def).toContain("devolver_credito(");
  });

  it("iniciar_analisis limita la longitud de url y dominio (url_invalida)", () => {
    const def = definicion("iniciar_analisis");
    expect(def).toContain("raise exception 'url_invalida'");
    expect(def).toContain("p_url is null");
    expect(def).toContain("char_length(p_url) > 2048");
    expect(def).toContain("p_dominio is null");
    expect(def).toContain("char_length(p_dominio) > 253");
    // La validación va antes del cobro.
    expect(def.indexOf("url_invalida")).toBeLessThan(def.indexOf("creditos_restantes - 1"));
  });

  it("crear_perfil y el relleno inicial recortan el nombre a 100 caracteres", () => {
    const def = definicion("crear_perfil");
    expect(def).toContain("left(new.raw_user_meta_data->>'nombre', 100)");
    expect(sql).toContain("select u.id, left(u.raw_user_meta_data->>'nombre', 100) from auth.users u");
  });

  it("devolver_credito solo devuelve análisis en estado error", () => {
    const def = definicion("devolver_credito");
    expect(def).toMatch(/where id = p_id and estado = 'error' and not credito_devuelto/);
  });

  it("marcar_colgados también devuelve los error sin devolver", () => {
    const def = definicion("marcar_colgados");
    expect(def).toMatch(/where user_id = p_user and estado = 'error' and not credito_devuelto/);
  });

  it("obtener_perfil barre los colgados del usuario antes de devolver", () => {
    const def = definicion("obtener_perfil");
    expect(def).toContain("perform public.marcar_colgados(v_uid)");
    expect(def.indexOf("marcar_colgados(v_uid)")).toBeLessThan(def.indexOf("select * into v_perfil"));
  });

  it("revoca y concede permisos de ejecución correctamente", () => {
    for (const f of FUNCIONES) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from public, anon`));
    }
    for (const f of ["obtener_perfil", "iniciar_analisis"]) {
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`));
    }
    for (const f of ["devolver_credito", "marcar_colgados"]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*authenticated`));
    }
  });
});

const sql2 = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0002_secciones.sql", import.meta.url)),
  "utf8",
)
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("migración 0002_secciones.sql", () => {
  it("es idempotente", () => {
    expect(sql2).toContain("add column if not exists secciones jsonb not null default '{}'::jsonb");
    expect(sql2).toContain("add column if not exists version int not null default 2");
    expect(sql2).toContain("create or replace function public.guardar_seccion(");
    expect(sql2).not.toMatch(/create function/);
  });

  it("guardar_seccion es security definer con search_path fijo y fusiona con jsonb_set", () => {
    const inicio = sql2.indexOf("create or replace function public.guardar_seccion(");
    const def = sql2.slice(inicio, sql2.indexOf("$$;", sql2.indexOf("$$", inicio) + 2));
    expect(def).toContain("p_id uuid, p_clave text, p_contenido jsonb, p_estado text");
    expect(def).toContain("security definer");
    expect(def).toContain("set search_path = public");
    expect(def).toContain("jsonb_set(");
    expect(def).toContain("jsonb_build_object('estado', p_estado, 'contenido', p_contenido)");
    expect(def).toContain("updated_at = now()");
    expect(def).toMatch(/estado in \('procesando', ?'listo'\)/);
  });

  it("guardar_seccion se revoca a public, anon y authenticated y solo se concede a service_role", () => {
    expect(sql2).toMatch(
      /revoke execute on function public\.guardar_seccion\([^)]*\) from public, anon, authenticated/,
    );
    expect(sql2).toMatch(/grant execute on function public\.guardar_seccion\([^)]*\) to service_role;/);
    expect(sql2).not.toMatch(/grant execute on function public\.guardar_seccion\([^)]*\) to [^;]*authenticated/);
  });
});
