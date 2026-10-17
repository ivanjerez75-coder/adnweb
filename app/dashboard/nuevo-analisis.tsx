"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NuevoAnalisis({ urlInicial }: { urlInicial: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(urlInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/analisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.status === 202 && cuerpo.id) {
        router.push("/analisis/" + cuerpo.id);
        return;
      }
      setError(cuerpo.error ?? "Ha ocurrido un error inesperado.");
    } catch {
      setError("Ha ocurrido un error inesperado.");
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={enviar}>
      <label>
        Pega una URL{" "}
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </label>
      <button type="submit" disabled={enviando}>
        Analizar
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
