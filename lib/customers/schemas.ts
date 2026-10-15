import { z } from "zod";
import { checkbox, email, optionalText, phonePattern, requiredText } from "@/lib/requests/schemas";

const phone = optionalText(40).refine((v) => v === null || phonePattern.test(v), "Enter a valid phone number.");

const address = (prefix: "ship" | "bill") => ({
  [`${prefix}_line1`]: optionalText(160),
  [`${prefix}_line2`]: optionalText(160),
  [`${prefix}_city`]: optionalText(80),
  [`${prefix}_state`]: optionalText(40),
  [`${prefix}_postal`]: optionalText(20),
});

export const ADDRESS_PARTS = ["line1", "line2", "city", "state", "postal"] as const;

export const PROFILE_FIELDS = [
  "name", "company", "phone",
  "ship_line1", "ship_line2", "ship_city", "ship_state", "ship_postal",
  "bill_same_as_ship",
  "bill_line1", "bill_line2", "bill_city", "bill_state", "bill_postal",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** What a customer can edit on their own profile. */
export const profileSchema = z
  .object({
    name: requiredText("name", 120),
    company: optionalText(160),
    phone,
    ...address("ship"),
    bill_same_as_ship: checkbox,
    ...address("bill"),
  })
  .transform((v) => {
    const out = v as Record<string, string | boolean | null>;
    // Billing fields are meaningless when "same as shipping" is ticked.
    if (out.bill_same_as_ship) for (const part of ADDRESS_PARTS) out[`bill_${part}`] = null;
    return out as Record<Exclude<ProfileField, "bill_same_as_ship">, string | null> & { name: string; bill_same_as_ship: boolean };
  });
export type ProfileInput = z.output<typeof profileSchema>;

export const INVITE_FIELDS = ["email", "name", "company", "phone"] as const;

/** What staff enter to invite a customer. */
export const inviteSchema = z.object({
  email,
  name: requiredText("customer's name", 120),
  company: optionalText(160),
  phone,
});
export type InviteInput = z.output<typeof inviteSchema>;

export const PASSWORD_MIN = 10;

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(72, "Use 72 characters or fewer."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don’t match." });
