import type {
  Category,
  Enclosure,
  PowerSupply,
  ProductCondition,
  ShipClass,
  SpecLine,
} from "./types";

/**
 * Placeholder catalog used until Morse supplies their real parts list.
 *
 * It powers the demo catalog (when Supabase isn't configured) and is what
 * `npm run seed:catalog` loads into a fresh database. Prices are deliberately
 * null ("price on request") and no brand names are claimed.
 */

export const SEED_CATEGORIES: Category[] = [
  {
    slug: "electric-motors",
    name: "Electric motors",
    description:
      "AC and DC motors, single and three phase. NEMA and IEC frames in TEFC, ODP, washdown and explosion-proof enclosures.",
    sortOrder: 1,
  },
  {
    slug: "pumps",
    name: "Pumps",
    description: "Centrifugal, submersible, booster and process pumps, plus seals, impellers and rebuild kits.",
    sortOrder: 2,
  },
  {
    slug: "blowers",
    name: "Blowers",
    description: "Regenerative, centrifugal and positive-displacement blowers for aeration, conveying and drying.",
    sortOrder: 3,
  },
  {
    slug: "vacuum-pumps",
    name: "Vacuum pumps",
    description: "Rotary vane, liquid ring and claw pumps, with oil, vanes, filters and full rebuild service.",
    sortOrder: 4,
  },
  {
    slug: "starters-controls",
    name: "Starters & controls",
    description:
      "Motor starters, contactors, overloads, soft starts and drives, plus automotive and equipment starters.",
    sortOrder: 5,
  },
  {
    slug: "alternators",
    name: "Alternators",
    description: "New and remanufactured alternators for trucks, ag, marine and industrial equipment, with core exchange.",
    sortOrder: 6,
  },
];

export interface SeedProduct {
  sku: string;
  mfrPartNumber: string | null;
  slug: string;
  familyKey: string | null;
  name: string;
  description: string | null;
  category: string;
  condition: ProductCondition;
  priceCents: number | null;
  coreChargeCents: number | null;
  shipClass: ShipClass;
  weightLb: number | null;
  hp: number | null;
  rpm: number | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  voltage: string | null;
  specs: SpecLine[];
  qtyOnHand: number;
  featured: boolean;
}

const motor = (p: Partial<SeedProduct> & Pick<SeedProduct, "sku" | "slug" | "name">): SeedProduct => ({
  mfrPartNumber: null,
  familyKey: null,
  description: null,
  category: "electric-motors",
  condition: "new",
  priceCents: null,
  coreChargeCents: null,
  shipClass: "parcel",
  weightLb: null,
  hp: null,
  rpm: null,
  frame: null,
  enclosure: null,
  power: null,
  voltage: null,
  specs: [],
  qtyOnHand: 0,
  featured: false,
  ...p,
});

export const SEED_PRODUCTS: SeedProduct[] = [
  motor({
    sku: "MEM-M-184T-5-N",
    slug: "5-hp-general-purpose-motor-184t-new",
    familyKey: "5hp-184t-tefc",
    name: "5 HP General Purpose Motor, 184T TEFC",
    description:
      "Three-phase, totally enclosed fan-cooled motor for pumps, fans, compressors and conveyors. Rigid base, T-frame mounting.",
    condition: "new",
    hp: 5,
    rpm: 1750,
    frame: "184T",
    enclosure: "tefc",
    power: "ac_3ph",
    voltage: "208-230/460V",
    weightLb: 85,
    specs: [
      { label: "Frequency", value: "60 Hz" },
      { label: "Mounting", value: "Rigid base (foot mount)" },
      { label: "Shaft diameter", value: "1⅛ in" },
    ],
    qtyOnHand: 4,
    featured: true,
  }),
  motor({
    sku: "MEM-M-184T-5-R",
    slug: "5-hp-general-purpose-motor-184t-remanufactured",
    familyKey: "5hp-184t-tefc",
    name: "5 HP General Purpose Motor, 184T TEFC",
    description: "Shop-remanufactured: new bearings, cleaned and re-varnished windings, balanced and load-tested.",
    condition: "remanufactured",
    hp: 5,
    rpm: 1750,
    frame: "184T",
    enclosure: "tefc",
    power: "ac_3ph",
    voltage: "208-230/460V",
    weightLb: 85,
    specs: [
      { label: "Frequency", value: "60 Hz" },
      { label: "Mounting", value: "Rigid base (foot mount)" },
      { label: "Shaft diameter", value: "1⅛ in" },
    ],
    qtyOnHand: 2,
  }),
  motor({
    sku: "MEM-M-184T-5-X",
    slug: "5-hp-general-purpose-motor-184t-exchange",
    familyKey: "5hp-184t-tefc",
    name: "5 HP General Purpose Motor, 184T TEFC",
    description: "Exchange unit: we ship a remanufactured motor now and credit the core when your old motor comes back.",
    condition: "exchange",
    hp: 5,
    rpm: 1750,
    frame: "184T",
    enclosure: "tefc",
    power: "ac_3ph",
    voltage: "208-230/460V",
    weightLb: 85,
    specs: [
      { label: "Frequency", value: "60 Hz" },
      { label: "Shaft diameter", value: "1⅛ in" },
    ],
    qtyOnHand: 1,
  }),
  motor({
    sku: "MEM-M-145T-2-N",
    slug: "2-hp-farm-duty-motor-145t",
    name: "2 HP Farm Duty Motor, 145T TEFC",
    hp: 2,
    rpm: 1750,
    frame: "145T",
    enclosure: "tefc",
    power: "ac_1ph",
    voltage: "115/230V",
    specs: [{ label: "Shaft diameter", value: "⅞ in" }],
    qtyOnHand: 3,
  }),
  motor({
    sku: "MEM-M-256T-20-R",
    slug: "20-hp-premium-efficiency-motor-256t",
    name: "20 HP Premium Efficiency Motor, 256T TEFC",
    condition: "remanufactured",
    hp: 20,
    rpm: 1765,
    frame: "256T",
    enclosure: "tefc",
    power: "ac_3ph",
    voltage: "230/460V",
    shipClass: "ltl",
    specs: [{ label: "Shaft diameter", value: "1⅝ in" }],
    qtyOnHand: 1,
    featured: true,
  }),
  motor({
    sku: "MEM-M-56C-1-N",
    slug: "1-hp-washdown-c-face-motor-56c",
    name: "1 HP Washdown C-Face Motor, 56C TENV",
    hp: 1,
    rpm: 1725,
    frame: "56C",
    enclosure: "washdown",
    power: "ac_3ph",
    voltage: "208-230/460V",
    specs: [{ label: "Shaft diameter", value: "⅝ in" }],
    qtyOnHand: 0,
  }),
  motor({
    sku: "MEM-M-326T-50-U",
    slug: "50-hp-severe-duty-motor-326t",
    name: "50 HP Severe Duty Motor, 326T TEFC",
    description: "Used and load-tested in our shop. Ships LTL freight or pick up at the shop.",
    condition: "used_tested",
    hp: 50,
    rpm: 1780,
    frame: "326T",
    enclosure: "tefc",
    power: "ac_3ph",
    voltage: "460V",
    shipClass: "ltl",
    qtyOnHand: 1,
  }),
  motor({
    sku: "MEM-M-213T-7.5-N",
    slug: "7-5-hp-explosion-proof-motor-213t",
    name: "7½ HP Explosion-Proof Motor, 213T",
    hp: 7.5,
    rpm: 1770,
    frame: "213T",
    enclosure: "xp",
    power: "ac_3ph",
    voltage: "230/460V",
    specs: [{ label: "Hazardous location", value: "Class I Div 1, Group D" }],
    qtyOnHand: 0,
  }),
  motor({
    sku: "MEM-M-56-0.5-DC",
    slug: "half-hp-dc-motor-56",
    name: "½ HP Permanent Magnet DC Motor, 56 frame",
    hp: 0.5,
    rpm: 1750,
    frame: "56C",
    enclosure: "tenv",
    power: "dc",
    voltage: "90V DC",
    qtyOnHand: 2,
  }),
  motor({
    sku: "MEM-P-CC-1",
    slug: "1-hp-close-coupled-centrifugal-pump",
    name: "1 HP Close-Coupled Centrifugal Pump",
    category: "pumps",
    hp: 1,
    rpm: 3450,
    power: "ac_1ph",
    voltage: "115/230V",
    specs: [{ label: "Suction × discharge", value: "1¼ × 1 in" }],
    qtyOnHand: 5,
    featured: true,
  }),
  motor({
    sku: "MEM-P-SUB-2",
    slug: "2-hp-4-inch-submersible-well-pump",
    name: "2 HP 4-inch Submersible Well Pump",
    category: "pumps",
    hp: 2,
    rpm: 3450,
    power: "ac_1ph",
    voltage: "230V",
    qtyOnHand: 2,
  }),
  motor({
    sku: "MEM-B-RGN-2.5",
    slug: "2-5-hp-regenerative-blower",
    name: "2½ HP Regenerative Blower",
    category: "blowers",
    hp: 2.5,
    rpm: 3450,
    power: "ac_3ph",
    voltage: "230/460V",
    qtyOnHand: 1,
  }),
  motor({
    sku: "MEM-V-RV-1-R",
    slug: "1-hp-rotary-vane-vacuum-pump",
    name: "1 HP Rotary Vane Vacuum Pump",
    category: "vacuum-pumps",
    condition: "remanufactured",
    hp: 1,
    rpm: 1725,
    power: "ac_1ph",
    voltage: "115/230V",
    qtyOnHand: 1,
    featured: true,
  }),
  motor({
    sku: "MEM-S-NEMA1",
    slug: "nema-size-1-combination-starter",
    name: "NEMA Size 1 Combination Starter",
    category: "starters-controls",
    voltage: "120V coil",
    specs: [
      { label: "Rating", value: "27 A" },
      { label: "Overload range", value: "6–18 A" },
    ],
    qtyOnHand: 3,
  }),
  motor({
    sku: "MEM-S-12V-GR-R",
    slug: "12v-gear-reduction-starter-heavy-duty",
    name: "Heavy-Duty 12V Gear Reduction Starter",
    category: "starters-controls",
    condition: "remanufactured",
    power: "dc",
    voltage: "12V",
    specs: [{ label: "Pinion", value: "11-tooth" }],
    qtyOnHand: 2,
  }),
  motor({
    sku: "MEM-A-12V-160-R",
    slug: "12v-160a-heavy-duty-alternator",
    name: "Heavy-Duty Alternator, 12V 160A",
    category: "alternators",
    condition: "remanufactured",
    power: "dc",
    voltage: "12V",
    specs: [
      { label: "Output", value: "160 A" },
      { label: "Mount", value: "J180" },
      { label: "Pulley", value: "2-groove" },
    ],
    qtyOnHand: 3,
    featured: true,
  }),
  motor({
    sku: "MEM-A-24V-100-N",
    slug: "24v-100a-brushless-alternator",
    name: "Brushless Alternator, 24V 100A",
    category: "alternators",
    power: "dc",
    voltage: "24V",
    specs: [
      { label: "Output", value: "100 A" },
      { label: "Mount", value: "Pad mount" },
    ],
    qtyOnHand: 0,
  }),
];
