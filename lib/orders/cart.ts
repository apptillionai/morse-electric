/**
 * The cart lives in a cookie as product ids and quantities only. Prices,
 * stock and names are always read fresh from the catalog (lib/orders/pricing.ts),
 * so a stale or edited cookie can never change what someone pays.
 *
 * The cookie is readable by the browser so the header can show a count
 * without making every page dynamic. It holds nothing private.
 */

export const CART_COOKIE = "morse_cart";
export const MAX_CART_LINES = 30;
export const MAX_LINE_QUANTITY = 99;

export interface CartLine {
  productId: string;
  quantity: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A product (or order) id: a UUID. */
export function isProductId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

const clampQuantity = (n: number) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(n)));

/** Read the cookie value ("id:qty.id:qty"). Anything malformed is dropped, never thrown. */
export function parseCart(value: string | undefined | null): CartLine[] {
  if (!value) return [];
  const lines: CartLine[] = [];
  for (const part of value.split(".")) {
    const [id, qty] = part.split(":");
    const quantity = Number(qty);
    if (!isProductId(id) || !Number.isFinite(quantity) || quantity < 1) continue;
    const productId = id.toLowerCase();
    const existing = lines.find((l) => l.productId === productId);
    if (existing) existing.quantity = clampQuantity(existing.quantity + quantity);
    else if (lines.length < MAX_CART_LINES) lines.push({ productId, quantity: clampQuantity(quantity) });
  }
  return lines;
}

export function serializeCart(lines: CartLine[]): string {
  return lines
    .slice(0, MAX_CART_LINES)
    .map((l) => `${l.productId}:${clampQuantity(l.quantity)}`)
    .join(".");
}

/** Add to a line (or start one). */
export function addToCart(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  const id = productId.toLowerCase();
  if (lines.some((l) => l.productId === id)) {
    return lines.map((l) => (l.productId === id ? { ...l, quantity: clampQuantity(l.quantity + quantity) } : l));
  }
  if (lines.length >= MAX_CART_LINES) return lines;
  return [...lines, { productId: id, quantity: clampQuantity(quantity) }];
}

/** Set a line's quantity; 0 or less removes it. */
export function setCartQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  const id = productId.toLowerCase();
  if (quantity < 1) return lines.filter((l) => l.productId !== id);
  return lines.map((l) => (l.productId === id ? { ...l, quantity: clampQuantity(quantity) } : l));
}

/** Total units, for the header badge. */
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
