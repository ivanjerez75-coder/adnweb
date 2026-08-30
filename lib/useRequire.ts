"use client";

/**
 * Flow guard. Redirects to the earliest incomplete step if a prerequisite of the
 * current screen is missing (e.g. landing on /resultado with no profile).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionProvider";

export type FlowStep = "test" | "profile" | "scan" | "shoe";

export function useRequire(step: FlowStep): { ok: boolean; loading: boolean } {
  const router = useRouter();
  const { ready, footProfile, scan, shoeSpec } = useSession();

  const ok =
    step === "test" ||
    (step === "profile" && !!footProfile) ||
    (step === "scan" && !!footProfile && !!scan) ||
    (step === "shoe" && !!footProfile && !!scan && !!shoeSpec);

  useEffect(() => {
    if (!ready || ok) return;
    if (step === "shoe" && (!scan || !footProfile)) router.replace("/perfil");
    else if (step === "scan" && !footProfile) router.replace("/test");
    else if (step === "profile" && !footProfile) router.replace("/test");
    else if (step === "shoe" && !shoeSpec) router.replace("/creando");
    else router.replace("/test");
  }, [ready, ok, step, footProfile, scan, shoeSpec, router]);

  return { ok: ready && ok, loading: !ready };
}
