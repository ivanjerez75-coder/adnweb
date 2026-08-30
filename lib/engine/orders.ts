/**
 * Order lifecycle, backed by localStorage for the MVP.
 *
 * Swap this module for a backend order API + webhooks later. The functions are
 * intentionally small and synchronous; a real version would return Promises.
 */

import type { Order, OrderStatus, ShoeSpec } from "./types";

const STORAGE_KEY = "nonna.orders.v1";

const STATUS_FLOW: OrderStatus[] = [
  "designing",
  "manufacturing",
  "shipped",
  "delivered",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  designing: "Diseñando",
  manufacturing: "Fabricando",
  shipped: "Enviada",
  delivered: "Entregada",
};

export const ORDER_STATUS_STEPS = STATUS_FLOW.map((status) => ({
  status,
  label: ORDER_STATUS_LABEL[status],
}));

function read(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function write(orders: Order[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* storage unavailable — MVP tolerates this silently */
  }
}

function makeId(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `NN-${new Date().getFullYear()}-${n}`;
}

export function createOrder(shoe: ShoeSpec, priceEur: number): Order {
  const order: Order = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    priceEur,
    shoe,
    status: "designing",
  };
  write([order, ...read()]);
  return order;
}

export function getOrders(): Order[] {
  return read();
}

export function getOrder(id: string): Order | undefined {
  return read().find((o) => o.id === id);
}

export function advanceStatus(id: string): Order | undefined {
  const orders = read();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return undefined;
  const current = orders[idx].status;
  const pos = STATUS_FLOW.indexOf(current);
  const next = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, pos + 1)];
  orders[idx] = { ...orders[idx], status: next };
  write(orders);
  return orders[idx];
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const pos = STATUS_FLOW.indexOf(status);
  return pos < STATUS_FLOW.length - 1 ? STATUS_FLOW[pos + 1] : null;
}
