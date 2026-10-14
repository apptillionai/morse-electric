import { z } from "zod";

export const EQUIPMENT_TYPES = {
  motor: "Electric motor",
  pump: "Pump",
  blower: "Blower",
  vacuum_pump: "Vacuum pump",
  starter: "Starter",
  alternator: "Alternator",
  other: "Something else",
} as const;
export type EquipmentType = keyof typeof EQUIPMENT_TYPES;

export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(max, `Keep ${label} under ${max} characters.`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v || null);

export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254));

export const phonePattern = /^[\d\s()+.\-x]{7,40}$/i;

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const quoteRequestSchema = z
  .object({
    name: requiredText("name", 120),
    company: optionalText(160),
    email,
    phone: optionalText(40).refine((v) => v === null || phonePattern.test(v), "Enter a valid phone number."),
    sku: optionalText(80),
    quantity: z
      .string()
      .trim()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 10000), "Enter a quantity from 1 to 10,000."),
    details: optionalText(4000),
  })
  .refine((v) => v.sku !== null || v.details !== null, {
    path: ["details"],
    message: "Tell us what you need: a part number, nameplate details or a description.",
  });
export type QuoteRequestInput = z.output<typeof quoteRequestSchema>;

export const serviceRequestSchema = z.object({
  equipmentType: z.enum(Object.keys(EQUIPMENT_TYPES) as [EquipmentType, ...EquipmentType[]], {
    error: "Choose what needs service.",
  }),
  name: requiredText("name", 120),
  company: optionalText(160),
  email,
  phone: z.string().trim().regex(phonePattern, "Enter a phone number we can call."),
  make: optionalText(120),
  size: optionalText(60),
  modelSerial: optionalText(160),
  symptoms: requiredText("description of the problem", 4000),
  wantsPickup: checkbox,
  isRush: checkbox,
  wantsReplacementQuote: checkbox,
});
export type ServiceRequestInput = z.output<typeof serviceRequestSchema>;

/** Read named string fields from FormData; missing or file fields become "". */
export function formFields<K extends string>(formData: FormData, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : ""];
    }),
  ) as Record<K, string>;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(
    Object.entries(flat).flatMap(([key, messages]) => (messages?.[0] ? [[key, messages[0]]] : [])),
  );
}
