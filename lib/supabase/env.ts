type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export function supabaseEnv(env: Env = process.env): { url: string; anonKey: string } {
  return {
    url: required(env, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** Solo servidor: nunca importar desde código de navegador. */
export function serviceRoleKey(env: Env = process.env): string {
  return required(env, "SUPABASE_SERVICE_ROLE_KEY");
}
