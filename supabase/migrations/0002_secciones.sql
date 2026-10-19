-- =====================================================================
-- DNAweb · 0002_secciones.sql
-- Informe v3: cada sección se guarda en cuanto está lista.
-- Idempotente: se puede pegar en el SQL Editor de Supabase tantas
-- veces como haga falta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- secciones: { clave: { estado, contenido } }. version: 2 = informe
-- antiguo (columna informe), 3 = informe por secciones.
-- ---------------------------------------------------------------------
alter table public.analyses
  add column if not exists secciones jsonb not null default '{}'::jsonb,
  add column if not exists version int not null default 2;

-- ---------------------------------------------------------------------
-- guardar_seccion(): fusiona una sección en analyses.secciones.
-- Solo actúa sobre análisis 'procesando' o 'listo'. Solo service_role.
-- Devuelve false si no ha actualizado ninguna fila (p. ej. el análisis
-- ya se marcó como error por timeout).
-- ---------------------------------------------------------------------
drop function if exists public.guardar_seccion(uuid, text, jsonb, text);

create or replace function public.guardar_seccion(
  p_id uuid,
  p_clave text,
  p_contenido jsonb,
  p_estado text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_clave is null or p_clave = '' then
    raise exception 'clave_invalida';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'lista', 'error') then
    raise exception 'estado_invalido';
  end if;

  update public.analyses
     set secciones = jsonb_set(
           coalesce(secciones, '{}'::jsonb),
           array[p_clave],
           jsonb_build_object('estado', p_estado, 'contenido', p_contenido)
         ),
         updated_at = now()
   where id = p_id
     and estado in ('procesando', 'listo');

  return found;
end;
$$;

revoke execute on function public.guardar_seccion(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.guardar_seccion(uuid, text, jsonb, text) to service_role;
