/**
 * Pricing. A thin, pure calculation on top of `config.ts`. Swap for a pricing
 * service or Stripe price lookup later — signature stays the same.
 */

import { BASE_PRICE_EUR, PRICE_DELTAS } from "./config";
import type { ShoeSpec } from "./types";

export function getPrice(shoe: ShoeSpec): number {
  const { insole, closure } = shoe.config;
  return (
    BASE_PRICE_EUR +
    PRICE_DELTAS.insole[insole] +
    PRICE_DELTAS.closure[closure]
  );
}

export function formatEur(amount: number): string {
  return `${amount} €`;
}
