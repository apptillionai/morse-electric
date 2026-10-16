import { daysUntilDue, reminderDue, shopToday } from "@/lib/orders/reminders";

const core = (over: Partial<Parameters<typeof reminderDue>[0]> = {}) => ({
  status: "awaiting",
  due_date: "2026-11-20",
  reminder_sent_at: null,
  overdue_notice_sent_at: null,
  ...over,
});

describe("core reminders", () => {
  it("uses the shop's date, not UTC", () => {
    // 02:00 UTC on Nov 14 is still Nov 13 in Massachusetts.
    expect(shopToday(new Date("2026-11-14T02:00:00Z"))).toBe("2026-11-13");
    expect(daysUntilDue("2026-11-20", "2026-11-13")).toBe(7);
  });

  it("sends nothing while the due date is far off", () => {
    expect(reminderDue(core(), "2026-11-12")).toBeNull();
  });

  it("sends a reminder a week before, once", () => {
    expect(reminderDue(core(), "2026-11-13")).toBe("core_reminder");
    expect(reminderDue(core(), "2026-11-19")).toBe("core_reminder");
    expect(reminderDue(core({ reminder_sent_at: "2026-11-13T12:00:00Z" }), "2026-11-15")).toBeNull();
  });

  it("sends an overdue notice from the due date, once", () => {
    expect(reminderDue(core({ reminder_sent_at: "x" }), "2026-11-20")).toBe("core_overdue");
    expect(reminderDue(core(), "2026-12-01")).toBe("core_overdue");
    expect(reminderDue(core({ overdue_notice_sent_at: "x" }), "2026-12-01")).toBeNull();
  });

  it("never nags about a core that's back or settled", () => {
    for (const status of ["received", "credited", "rejected", "cancelled"]) {
      expect(reminderDue(core({ status }), "2026-12-01")).toBeNull();
    }
  });
});
