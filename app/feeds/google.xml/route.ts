import { feedItems, renderFeed } from "@/lib/catalog/feed";
import { loadFeedProducts } from "@/lib/catalog/feed-source";
import { storeIsOpen } from "@/lib/orders/store";
import { SITE } from "@/lib/site";
import { getSiteSettings } from "@/lib/site-settings";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Google Merchant Center product feed. Add this URL as a scheduled fetch in
 * Merchant Center. It lists products only while the online store is open
 * (so every listed item can be bought at the listed price); otherwise it's
 * an empty, valid feed.
 */
export async function GET() {
  const channel = { title: SITE.name, link: SITE.url, description: `Parts from ${SITE.name}` };
  let xml = renderFeed([], channel);
  if (isSupabaseConfigured() && (await storeIsOpen())) {
    try {
      const [products, { shippingRates }] = await Promise.all([loadFeedProducts(), getSiteSettings()]);
      xml = renderFeed(feedItems(products, shippingRates, SITE.url), channel);
    } catch (error) {
      console.error("[feed]", error instanceof Error ? error.message : error);
      return new Response("Feed unavailable", { status: 503, headers: { "Retry-After": "3600" } });
    }
  }
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
