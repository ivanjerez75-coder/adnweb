/**
 * The single seam between the app and persistence.
 *
 * Today: `localStorage` under one key. Later: swap the three functions for calls
 * to a real API / DB. Everything is guarded for SSR and tolerant of a missing,
 * blank, or corrupt value.
 */

import type {
  FootProfile,
  Order,
  ScanResult,
  ShoeConfig,
  ShoeSpec,
  TestAnswers,
} from "@/lib/engine/types";

export const SESSION_KEY = "nonna.session.v1";

export interface SessionState {
  testAnswers: Partial<TestAnswers>;
  footProfile: FootProfile | null;
  scan: ScanResult | null;
  shoeConfig: ShoeConfig;
  shoeSpec: ShoeSpec | null;
  order: Order | null;
  user: { name: string; email: string } | null;
}

export const DEFAULT_SHOE_CONFIG: ShoeConfig = {
  color: "black",
  closure: "laces",
  insole: "comfort",
};

export const EMPTY_SESSION: SessionState = {
  testAnswers: {},
  footProfile: null,
  scan: null,
  shoeConfig: DEFAULT_SHOE_CONFIG,
  shoeSpec: null,
  order: null,
  user: null,
};

export function loadSession(): SessionState {
  if (typeof window === "undefined") return EMPTY_SESSION;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      ...EMPTY_SESSION,
      ...parsed,
      shoeConfig: { ...DEFAULT_SHOE_CONFIG, ...(parsed.shoeConfig ?? {}) },
      testAnswers: parsed.testAnswers ?? {},
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function saveSession(state: SessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — MVP tolerates this silently */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
