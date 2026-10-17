-- =====================================================================
-- DNAweb · 0001_cuentas.sql
-- Cuentas, créditos y análisis. Idempotente: se puede pegar en el
-- SQL Editor de Supabase tantas veces como haga falta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla de perfiles: un perfil por usuario de auth.users.
-- Los créditos nunca pueden ser negativos (check >= 0).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  created_at timestamptz default now(),
  creditos_restantes int not null default 5 check (creditos_restantes >= 0),
  creditos_mensuales int not null default 5,
  renovacion timestamptz not null default now() + interval '1 month'
);

-- ---------------------------------------------------------------------
-- Tabla de análisis. Estado: procesando | listo | error.
-- credito_devuelto garantiza que el crédito se devuelve una sola vez.
-- ---------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  dominio text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  estado text not null default 'procesando'
    check (estado in ('procesando', 'listo', 'error')),
  paso_actual text,
  datos_brutos jsonb,
  informe jsonb,
  error text,
  error_kind text,
  credito_devuelto boolean not null default false
);

-- ---------------------------------------------------------------------
-- Índices: historial del usuario, caché por dominio y, sobre todo,
-- como máximo UN análisis 'procesando' por usuario (índice único parcial).
-- ---------------------------------------------------------------------
create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);

create index if not exists analyses_dominio_listo_idx
  on public.analyses (dominio, created_at desc)
  where estado = 'listo';

create unique index if not exists analyses_un_procesando_por_usuario
  on public.analyses (user_id)
  where estado = 'procesando';

-- ---------------------------------------------------------------------
-- RLS: cada usuario solo puede LEER sus propias filas.
-- No hay políticas de escritura: todo cambio pasa por las funciones.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.analyses enable row level security;

drop policy if exists profiles_select_propio on public.profiles;
create policy profiles_select_propio on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists analyses_select_propio on public.analyses;
create policy analyses_select_propio on public.analyses
  for select to authenticated
  using (user_id = auth.uid());

-- Defensa extra: anon no toca las tablas y authenticated solo puede leer.
revoke all on public.profiles, public.analyses from anon, authenticated;
grant select on public.profiles, public.analyses to authenticated;

-- ---------------------------------------------------------------------
-- Trigger: al registrarse un usuario se crea su perfil con el nombre
-- que viene en raw_user_meta_data->>'nombre'.
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, new.raw_user_meta_data->>'nombre')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.crear_perfil() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Perfiles para usuarios que ya existieran antes de esta migración.
insert into public.profiles (id, nombre)
select u.id, u.raw_user_meta_data->>'nombre'
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- obtener_perfil(): aplica la renovación mensual si toca y devuelve
-- el perfil del usuario autenticado.
-- ---------------------------------------------------------------------
create or replace function public.obtener_perfil()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.profiles;
begin
  -- Sin sesión no hay perfil.
  if v_uid is null then
    raise exception 'no_autenticado';
  end if;

  -- Renovación: si la fecha ya pasó, se recargan los créditos del mes.
  update public.profiles
     set creditos_restantes = creditos_mensuales,
         renovacion = now() + interval '1 month'
   where id = v_uid
     and renovacion <= now();

  select * into v_perfil
    from public.profiles
   where id = v_uid;

  return v_perfil;
end;
$$;

-- ---------------------------------------------------------------------
-- iniciar_analisis(): cobra 1 crédito y crea el análisis en UNA sola
-- operación atómica. Errores: no_autenticado, sin_creditos,
-- analisis_en_curso. Cualquier excepción deshace también el cobro.
-- ---------------------------------------------------------------------
create or replace function public.iniciar_analisis(p_url text, p_dominio text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado';
  end if;

  -- Renovación mensual antes de cobrar.
  update public.profiles
     set creditos_restantes = creditos_mensuales,
         renovacion = now() + interval '1 month'
   where id = v_uid
     and renovacion <= now();

  -- Cobro atómico: bloquea la fila y solo resta si queda saldo.
  update public.profiles
     set creditos_restantes = creditos_restantes - 1
   where id = v_uid
     and creditos_restantes > 0;

  if not found then
    raise exception 'sin_creditos';
  end if;

  -- Alta del análisis. El índice único parcial impide un segundo
  -- 'procesando'; al relanzar la excepción se revierte el cobro.
  begin
    insert into public.analyses (user_id, url, dominio)
    values (v_uid, p_url, p_dominio)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'analisis_en_curso';
  end;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- devolver_credito(): devuelve el crédito de un análisis UNA sola vez.
-- Solo cambia algo si credito_devuelto era false. Devuelve si hubo
-- devolución.
-- ---------------------------------------------------------------------
create or replace function public.devolver_credito(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  -- Marca la devolución; si ya estaba marcada no actualiza ninguna fila.
  update public.analyses
     set credito_devuelto = true,
         updated_at = now()
   where id = p_id
     and not credito_devuelto
  returning user_id into v_user;

  if not found then
    return false;
  end if;

  -- Solo si la marca ha cambiado se suma el crédito al dueño.
  update public.profiles
     set creditos_restantes = creditos_restantes + 1
   where id = v_user;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- marcar_colgados(): los análisis 'procesando' de más de 3 minutos
-- pasan a 'error' (timeout) y se les devuelve el crédito.
-- Devuelve cuántos se han marcado.
-- ---------------------------------------------------------------------
create or replace function public.marcar_colgados(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_marcados int := 0;
begin
  -- Cada fila se marca una sola vez: tras el bloqueo, una llamada
  -- concurrente ya no la ve como 'procesando'.
  for v_id in
    update public.analyses
       set estado = 'error',
           error = 'El análisis ha tardado demasiado. Te hemos devuelto el crédito.',
           error_kind = 'timeout',
           updated_at = now()
     where user_id = p_user
       and estado = 'procesando'
       and created_at < now() - interval '3 minutes'
    returning id
  loop
    perform public.devolver_credito(v_id);
    v_marcados := v_marcados + 1;
  end loop;

  return v_marcados;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos: nadie ejecuta por defecto. El usuario autenticado puede
-- leer su perfil e iniciar análisis; devolver créditos y marcar
-- colgados es solo para el servidor (service_role).
-- ---------------------------------------------------------------------
revoke execute on function public.obtener_perfil() from public, anon;
revoke execute on function public.iniciar_analisis(text, text) from public, anon;
revoke execute on function public.devolver_credito(uuid) from public, anon, authenticated;
revoke execute on function public.marcar_colgados(uuid) from public, anon, authenticated;

grant execute on function public.obtener_perfil() to authenticated;
grant execute on function public.iniciar_analisis(text, text) to authenticated;
grant execute on function public.devolver_credito(uuid) to service_role;
grant execute on function public.marcar_colgados(uuid) to service_role;
