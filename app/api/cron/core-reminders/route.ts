import type { NextRequest } from "next/server";
import { sendOrderEmails } from "@/lib/orders/email";
import { REMINDER_DAYS_BEFORE, reminderDue, shopToday } from "@/lib/orders/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

/**
 * Daily core-return reminders (vercel.json schedules it). Vercel Cron calls it
 * with "Authorization: Bearer $CRON_SECRET"; anything else is refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) return new Response("Supabase is not configured", { status: 503 });

  const supabase = createAdminClient();
  const today = shopToday();
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + REMINDER_DAYS_BEFORE * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("core_returns")
    .select("id, order_id, status, due_date, reminder_sent_at, overdue_notice_sent_at")
    .eq("status", "awaiting")
    .lte("due_date", horizon)
    .limit(200);
  if (error) return new Response(`Core returns: ${error.message}`, { status: 500 });

  let sent = 0;
  for (const core of data) {
    const kind = reminderDue(core, today);
    if (!kind) continue;
    // Only mark it sent once the email really went, so a mail outage is retried tomorrow.
    if (!(await sendOrderEmails(core.order_id, kind, core.id))) continue;
    const column = kind === "core_reminder" ? "reminder_sent_at" : "overdue_notice_sent_at";
    await supabase.from("core_returns").update({ [column]: new Date().toISOString() }).eq("id", core.id);
    sent++;
  }
  return Response.json({ today, checked: data.length, sent });
}
