import { parseEnclosure, parseNumber, parsePower, type Parsed } from "@/lib/admin/product-fields";
import { EMPTY_FILTERS, RPM_BANDS, shopHref, type RpmBand } from "@/lib/catalog/filters";
import { ENCLOSURE_LABELS, POWER_LABELS, type Enclosure, type PowerSupply } from "@/lib/catalog/types";
import { EQUIPMENT_TYPES, type EquipmentType } from "@/lib/requests/schemas";
import { formatHp } from "@/lib/utils";

/**
 * A customer's own equipment list: the motors, pumps and so on they run,
 * with nameplate details, so repairs and replacements start from what's
 * already known. Pure helpers here (unit-tested); reads and writes go
 * through the customer's session, so RLS keeps each list private.
 */

export interface EquipmentValues {
  label: string;
  equipment_type: EquipmentType;
  make: string | null;
  model: string | null;
  serial: string | null;
  hp: number | null;
  rpm: number | null;
  voltage: string | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  location: string | null;
  notes: string | null;
}

export interface Equipment extends EquipmentValues {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface EquipmentJob {
  id: string;
  reference: string;
  status: string;
  symptoms: string;
  created_at: string;
}

export const EQUIPMENT_FORM_FIELDS = [
  "label", "equipment_type", "make", "model", "serial", "hp", "rpm", "voltage", "frame", "enclosure", "power", "location", "notes",
] as const;
export type EquipmentFormField = (typeof EQUIPMENT_FORM_FIELDS)[number];

export const MAX_EQUIPMENT = 200;

function text(raw: string, max: number, label: string): Parsed<string | null> {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { value: null };
  return s.length > max ? { error: `${label} must be ${max} characters or fewer.` } : { value: s };
}

export type EquipmentFormResult =
  | { ok: true; values: EquipmentValues }
  | { ok: false; errors: Partial<Record<EquipmentFormField, string>> };

export function parseEquipmentForm(form: Record<EquipmentFormField, string>): EquipmentFormResult {
  const errors: Partial<Record<EquipmentFormField, string>> = {};
  const take = <T,>(field: EquipmentFormField, result: Parsed<T>): T => {
    if (result.error !== undefined) errors[field] = result.error;
    return result.value as T;
  };

  const label = take("label", text(form.label, 120, "Name"));
  if (!label && !errors.label) errors.label = "Give it a name you'll recognise, like “Cooling tower fan #2”.";
  const type = form.equipment_type in EQUIPMENT_TYPES ? (form.equipment_type as EquipmentType) : null;
  if (!type) errors.equipment_type = "Choose what kind of equipment it is.";
  const rpm = take("rpm", parseNumber(form.rpm, "RPM", { integer: true }));
  const hp = take("hp", parseNumber(form.hp, "HP"));
  if (hp !== null && hp > 100000) errors.hp = "That horsepower looks too high.";
  if (rpm !== null && rpm > 100000) errors.rpm = "That speed looks too high.";

  const values: EquipmentValues = {
    label: label ?? "",
    equipment_type: type ?? "motor",
    make: take("make", text(form.make, 120, "Make")),
    model: take("model", text(form.model, 160, "Model")),
    serial: take("serial", text(form.serial, 160, "Serial")),
    hp,
    rpm,
    voltage: take("voltage", text(form.voltage, 60, "Voltage")),
    frame: (() => {
      const f = take("frame", text(form.frame.toUpperCase(), 20, "Frame"));
      return f ? f.replace(/\s+/g, "") : null;
    })(),
    enclosure: take("enclosure", parseEnclosure(form.enclosure)),
    power: take("power", parsePower(form.power)),
    location: take("location", text(form.location, 160, "Location")),
    notes: (() => {
      const n = form.notes.trim();
      if (n.length > 2000) errors.notes = "Notes must be 2,000 characters or fewer.";
      return n || null;
    })(),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** The form's starting values for a unit (the inverse of parseEquipmentForm). */
export function equipmentToForm(v: EquipmentValues | null): Record<EquipmentFormField, string> {
  const n = (x: number | null) => (x === null ? "" : String(x));
  return {
    label: v?.label ?? "",
    equipment_type: v?.equipment_type ?? "motor",
    make: v?.make ?? "",
    model: v?.model ?? "",
    serial: v?.serial ?? "",
    hp: n(v?.hp ?? null),
    rpm: n(v?.rpm ?? null),
    voltage: v?.voltage ?? "",
    frame: v?.frame ?? "",
    enclosure: v?.enclosure ?? "",
    power: v?.power ?? "",
    location: v?.location ?? "",
    notes: v?.notes ?? "",
  };
}

/** Nameplate details as one line: "Baldor · 5 HP · 1750 RPM · 184T · TEFC · 230/460 V". */
export function nameplateLine(v: EquipmentValues): string {
  return [
    v.make,
    v.hp !== null ? `${formatHp(v.hp)} HP` : null,
    v.rpm !== null ? `${v.rpm} RPM` : null,
    v.frame,
    v.enclosure ? ENCLOSURE_LABELS[v.enclosure] : null,
    v.power ? POWER_LABELS[v.power] : null,
    v.voltage ? `${v.voltage}${/v$/i.test(v.voltage) ? "" : " V"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The nameplate speed band a unit's RPM falls in. */
export function rpmBandOf(rpm: number | null): RpmBand | null {
  if (rpm === null) return null;
  return (Object.keys(RPM_BANDS) as RpmBand[]).find((b) => rpm >= RPM_BANDS[b].min && rpm <= RPM_BANDS[b].max) ?? null;
}

/**
 * A shop search for a like-for-like replacement: same horsepower, speed band,
 * frame, enclosure and power. Null for equipment that isn't a motor, or
 * without enough on the nameplate to search by.
 */
export function replacementHref(v: EquipmentValues): string | null {
  if (v.equipment_type !== "motor" || v.hp === null) return null;
  const band = rpmBandOf(v.rpm);
  return shopHref(
    { ...EMPTY_FILTERS, category: "electric-motors" },
    {
      hpMin: v.hp,
      hpMax: v.hp,
      rpm: band ? [band] : [],
      frame: v.frame ? v.frame.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
      enclosures: v.enclosure ? [v.enclosure] : [],
      power: v.power,
    },
  );
}

/** What the service form fills in when a customer picks one of their units. */
export interface UnitPrefill {
  id: string;
  label: string;
  equipmentType: EquipmentType;
  make: string;
  size: string;
  modelSerial: string;
}

export function unitPrefill(unit: Equipment): UnitPrefill {
  return {
    id: unit.id,
    label: unit.label,
    equipmentType: unit.equipment_type,
    make: unit.make ?? "",
    size: [unit.hp !== null ? `${formatHp(unit.hp)} HP` : null, unit.frame].filter(Boolean).join(", "),
    modelSerial: [unit.model, unit.serial ? `S/N ${unit.serial}` : null].filter(Boolean).join(" · "),
  };
}
