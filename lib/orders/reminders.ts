/**
 * Which email a core still owes the customer, given today's date. Pure, so
 * the daily reminder job is unit-tested: a reminder a week before the due
 * date, and one overdue notice from the due date on. Each is sent once.
 */

export const REMINDER_DAYS_BEFORE = 7;

export interface CoreReminderState {
  status: string;
  /** YYYY-MM-DD */
  due_date: string;
  reminder_sent_at: string | null;
  overdue_notice_sent_at: string | null;
}

/** Today's date (YYYY-MM-DD) at the shop. */
export function shopToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Whole days until the due date (negative once overdue). */
export function daysUntilDue(dueDate: string, today: string): number {
  return daysBetween(today, dueDate);
}

export function reminderDue(core: CoreReminderState, today: string): "core_reminder" | "core_overdue" | null {
  if (core.status !== "awaiting") return null;
  const days = daysUntilDue(core.due_date, today);
  if (days <= 0) return core.overdue_notice_sent_at ? null : "core_overdue";
  // A late start (e.g. the job was down) still sends the reminder, but never both on one day.
  if (days <= REMINDER_DAYS_BEFORE) return core.reminder_sent_at ? null : "core_reminder";
  return null;
}
