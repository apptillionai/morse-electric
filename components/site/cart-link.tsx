"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CART_COOKIE, cartCount, parseCart } from "@/lib/orders/cart";

// The header is static, so the count comes from the cart cookie in the
// browser. Server actions change the cookie without a full reload, so check
// it again now and then and whenever the tab comes back into focus.
function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 1500);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
  };
}

function readCount(): number {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CART_COOKIE}=`));
  return raw ? cartCount(parseCart(decodeURIComponent(raw.slice(CART_COOKIE.length + 1)))) : 0;
}

export function CartLink() {
  const count = useSyncExternalStore(subscribe, readCount, () => 0);
  return (
    <Link
      href="/cart"
      className="relative inline-flex size-11 items-center justify-center rounded border border-edge-strong bg-surface text-fg no-underline hover:border-bold hover:text-fg"
    >
      <ShoppingCart size={20} aria-hidden="true" />
      <span className="sr-only">Cart{count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}</span>
      {count > 0 && (
        <span aria-hidden="true" className="absolute -top-2 -right-2 min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-bold text-on-accent">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
