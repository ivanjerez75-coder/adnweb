"use client";

/**
 * Session context. Holds the whole user journey in memory and mirrors it to
 * `localStorage` through `storage.ts`. Components read `useSession()` and call
 * the typed actions; they never touch storage directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FootProfile,
  Order,
  ScanResult,
  ShoeConfig,
  ShoeSpec,
  TestAnswers,
} from "@/lib/engine/types";
import {
  EMPTY_SESSION,
  loadSession,
  saveSession,
  type SessionState,
} from "./storage";

interface SessionContextValue extends SessionState {
  ready: boolean;
  setAnswer: <K extends keyof TestAnswers>(key: K, value: TestAnswers[K]) => void;
  resetAnswers: () => void;
  commitProfile: (profile: FootProfile) => void;
  setScan: (scan: ScanResult) => void;
  setShoeConfig: (patch: Partial<ShoeConfig>) => void;
  commitShoe: (spec: ShoeSpec) => void;
  placeOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  signIn: (user: { name: string; email: string }) => void;
  signOut: () => void;
  reset: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    setState(loadSession());
    setReady(true);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveSession(state);
  }, [state]);

  const setAnswer = useCallback<SessionContextValue["setAnswer"]>((key, value) => {
    setState((s) => ({ ...s, testAnswers: { ...s.testAnswers, [key]: value } }));
  }, []);

  const resetAnswers = useCallback(() => {
    setState((s) => ({ ...s, testAnswers: {} }));
  }, []);

  const commitProfile = useCallback((profile: FootProfile) => {
    setState((s) => ({ ...s, footProfile: profile }));
  }, []);

  const setScan = useCallback((scan: ScanResult) => {
    setState((s) => ({ ...s, scan }));
  }, []);

  const setShoeConfig = useCallback((patch: Partial<ShoeConfig>) => {
    setState((s) => ({ ...s, shoeConfig: { ...s.shoeConfig, ...patch } }));
  }, []);

  const commitShoe = useCallback((spec: ShoeSpec) => {
    setState((s) => ({ ...s, shoeSpec: spec }));
  }, []);

  const placeOrder = useCallback((order: Order) => {
    setState((s) => ({ ...s, order }));
  }, []);

  const updateOrder = useCallback((order: Order) => {
    setState((s) => (s.order && s.order.id === order.id ? { ...s, order } : s));
  }, []);

  const signIn = useCallback((user: { name: string; email: string }) => {
    setState((s) => ({ ...s, user }));
  }, []);

  const signOut = useCallback(() => {
    setState((s) => ({ ...s, user: null }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...EMPTY_SESSION });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      ready,
      setAnswer,
      resetAnswers,
      commitProfile,
      setScan,
      setShoeConfig,
      commitShoe,
      placeOrder,
      updateOrder,
      signIn,
      signOut,
      reset,
    }),
    [
      state,
      ready,
      setAnswer,
      resetAnswers,
      commitProfile,
      setScan,
      setShoeConfig,
      commitShoe,
      placeOrder,
      updateOrder,
      signIn,
      signOut,
      reset,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
