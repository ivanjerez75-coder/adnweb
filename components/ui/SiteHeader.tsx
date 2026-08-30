"use client";

import Link from "next/link";
import { useSession } from "@/lib/session/SessionProvider";
import { Wordmark } from "./Screen";

export function SiteHeader() {
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[760px] items-center justify-between px-5">
        <Wordmark />
        <Link
          href="/cuenta"
          className="text-base font-semibold text-[var(--color-brand)]"
        >
          {user ? "Mi cuenta" : "Entrar"}
        </Link>
      </div>
    </header>
  );
}
