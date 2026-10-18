// Comprobación real contra Supabase: crea 2 usuarios de prueba, verifica
// créditos, RLS, permisos, límites, devoluciones, renovación y colgados,
// y los borra al final.
// Solo imprime ✓/✗ por comprobación; nunca imprime claves ni contraseñas.
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Perfil = { creditos_restantes: number; renovacion: string };

let fallos = 0;

function mensaje(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function check(nombre: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${nombre}`);
  } catch (error) {
    fallos++;
    console.log(`✗ ${nombre} — ${mensaje(error)}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function perfil(client: SupabaseClient): Promise<Perfil> {
  const { data, error } = await client.rpc("obtener_perfil");
  if (error) throw new Error(error.message);
  return data as Perfil;
}

async function iniciar(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("iniciar_analisis", {
    p_url: "https://example.com",
    p_dominio: "example.com",
  });
  if (error) throw new Error(error.message);
  return data as string;
}

async function main() {
  if (!url || !anonKey || !secretKey) {
    console.log("✗ Faltan variables de Supabase en .env.local");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const creados: string[] = [];

  async function crearUsuario(sufijo: string, nombre: string) {
    const email = `dnaweb-test-${stamp}-${sufijo}@example.com`;
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error || !data.user) throw new Error(error?.message ?? "sin usuario");
    creados.push(data.user.id);
    const client = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) throw new Error(loginError.message);
    return { id: data.user.id, client };
  }

  try {
    const a = await crearUsuario("a", "Test A");
    const b = await crearUsuario("b", "Test B");
    let idA = "";

    await check("(a) perfil creado con 5 créditos", async () => {
      const p = await perfil(a.client);
      assert(p.creditos_restantes === 5, `créditos = ${p.creditos_restantes}`);
    });

    await check("(b) 2 iniciar_analisis en paralelo: 1 ok, 1 analisis_en_curso, quedan 4", async () => {
      const resultados = await Promise.all([
        a.client.rpc("iniciar_analisis", { p_url: "https://example.com", p_dominio: "example.com" }),
        a.client.rpc("iniciar_analisis", { p_url: "https://example.com", p_dominio: "example.com" }),
      ]);
      const ok = resultados.filter((r) => !r.error && typeof r.data === "string");
      const enCurso = resultados.filter((r) => r.error?.message.includes("analisis_en_curso"));
      assert(ok.length === 1, `éxitos = ${ok.length}`);
      assert(enCurso.length === 1, `analisis_en_curso = ${enCurso.length}`);
      idA = ok[0].data as string;
      const p = await perfil(a.client);
      assert(p.creditos_restantes === 4, `créditos = ${p.creditos_restantes}`);
    });

    await check("(c) B no lee el análisis de A ni puede llamar a devolver_credito", async () => {
      assert(idA, "no hay análisis de A");
      const { data, error } = await b.client.from("analyses").select().eq("id", idA).maybeSingle();
      assert(!error, `error al leer: ${error?.message}`);
      assert(data === null, "B ha leído el análisis de A");
      const rpc = await b.client.rpc("devolver_credito", { p_id: idA });
      assert(rpc.error, "B ha podido llamar a devolver_credito");
    });

    await check("(d) admin devolver_credito: true, luego false; 5 créditos", async () => {
      assert(idA, "no hay análisis de A");
      // Solo se devuelven análisis fallidos: primero se marca como error.
      const fallo = await admin.from("analyses").update({ estado: "error" }).eq("id", idA);
      if (fallo.error) throw new Error(fallo.error.message);
      const r1 = await admin.rpc("devolver_credito", { p_id: idA });
      if (r1.error) throw new Error(r1.error.message);
      const r2 = await admin.rpc("devolver_credito", { p_id: idA });
      if (r2.error) throw new Error(r2.error.message);
      assert(r1.data === true, `primera = ${r1.data}`);
      assert(r2.data === false, `segunda = ${r2.data}`);
      const p = await perfil(a.client);
      assert(p.creditos_restantes === 5, `créditos = ${p.creditos_restantes}`);
    });

    await check("(e) renovación vencida: obtener_perfil recarga 5 y renovacion futura", async () => {
      const pasado = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { error } = await admin
        .from("profiles")
        .update({ renovacion: pasado, creditos_restantes: 1 })
        .eq("id", a.id);
      if (error) throw new Error(error.message);
      const p = await perfil(a.client);
      assert(p.creditos_restantes === 5, `créditos = ${p.creditos_restantes}`);
      assert(new Date(p.renovacion).getTime() > Date.now(), `renovacion = ${p.renovacion}`);
    });

    await check("(f) procesando > 3 min: marcar_colgados lo pasa a error y devuelve el crédito", async () => {
      // Cierra el análisis anterior para que el índice único permita otro.
      const cierre = await admin.from("analyses").update({ estado: "error" }).eq("user_id", a.id).eq("estado", "procesando");
      if (cierre.error) throw new Error(cierre.error.message);
      const idF = await iniciar(a.client);
      const antes = await perfil(a.client);
      const hace4 = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const viejo = await admin.from("analyses").update({ created_at: hace4 }).eq("id", idF);
      if (viejo.error) throw new Error(viejo.error.message);
      const { data, error } = await admin.rpc("marcar_colgados", { p_user: a.id });
      if (error) throw new Error(error.message);
      assert(typeof data === "number" && data >= 1, `marcados = ${data}`);
      const fila = await admin.from("analyses").select("estado, credito_devuelto").eq("id", idF).single();
      if (fila.error) throw new Error(fila.error.message);
      assert(fila.data.estado === "error", `estado = ${fila.data.estado}`);
      assert(fila.data.credito_devuelto === true, "credito_devuelto = false");
      const despues = await perfil(a.client);
      assert(
        despues.creditos_restantes === antes.creditos_restantes + 1,
        `créditos ${antes.creditos_restantes} → ${despues.creditos_restantes}`,
      );
    });

    await check("(g) update directo de creditos_restantes = 99 no cambia nada", async () => {
      const antes = await perfil(a.client);
      const { data, error } = await a.client
        .from("profiles")
        .update({ creditos_restantes: 99 })
        .eq("id", a.id)
        .select();
      assert(error || (data ?? []).length === 0, `filas afectadas = ${data?.length}`);
      const despues = await perfil(a.client);
      assert(
        despues.creditos_restantes === antes.creditos_restantes,
        `créditos ${antes.creditos_restantes} → ${despues.creditos_restantes}`,
      );
    });

    await check("(h) un usuario no puede llamar a marcar_colgados", async () => {
      const { error } = await a.client.rpc("marcar_colgados", { p_user: a.id });
      assert(error, "el usuario ha podido llamar a marcar_colgados");
    });

    await check("(i) anon sin sesión no lee filas de profiles ni analyses", async () => {
      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      for (const tabla of ["profiles", "analyses"]) {
        const { data, error } = await anon.from(tabla).select("id");
        assert(error || (data ?? []).length === 0, `anon lee ${data?.length} filas de ${tabla}`);
      }
    });

    await check("(j) iniciar_analisis con url de 3000 caracteres: url_invalida y sin cobro", async () => {
      const antes = await perfil(a.client);
      const { error } = await a.client.rpc("iniciar_analisis", {
        p_url: `https://example.com/${"a".repeat(3000 - "https://example.com/".length)}`,
        p_dominio: "example.com",
      });
      assert(error?.message.includes("url_invalida"), `error = ${error?.message ?? "ninguno"}`);
      const despues = await perfil(a.client);
      assert(
        despues.creditos_restantes === antes.creditos_restantes,
        `créditos ${antes.creditos_restantes} → ${despues.creditos_restantes}`,
      );
    });

    await check("(k) devolver_credito sobre un análisis listo devuelve false", async () => {
      const idK = await iniciar(a.client);
      const listo = await admin.from("analyses").update({ estado: "listo" }).eq("id", idK);
      if (listo.error) throw new Error(listo.error.message);
      const antes = await perfil(a.client);
      const { data, error } = await admin.rpc("devolver_credito", { p_id: idK });
      if (error) throw new Error(error.message);
      assert(data === false, `devolver_credito = ${data}`);
      const despues = await perfil(a.client);
      assert(
        despues.creditos_restantes === antes.creditos_restantes,
        `créditos ${antes.creditos_restantes} → ${despues.creditos_restantes}`,
      );
    });
  } catch (error) {
    fallos++;
    console.log(`✗ preparación — ${mensaje(error)}`);
  } finally {
    for (const id of creados) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) {
        fallos++;
        console.log(`✗ borrar usuario de prueba — ${error.message}`);
      }
    }
  }

  process.exitCode = fallos > 0 ? 1 : 0;
}

main().catch((error) => {
  console.log(`✗ ${mensaje(error)}`);
  process.exitCode = 1;
});
