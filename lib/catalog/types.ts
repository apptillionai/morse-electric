import type { PhotoCredit } from "./photo-credit";

export const PRODUCT_CONDITIONS = ["new", "remanufactured", "used_tested", "exchange"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const ENCLOSURES = ["tefc", "odp", "tenv", "xp", "washdown", "other"] as const;
export type Enclosure = (typeof ENCLOSURES)[number];

export const POWER_SUPPLIES = ["ac_1ph", "ac_3ph", "dc"] as const;
export type PowerSupply = (typeof POWER_SUPPLIES)[number];

export type ShipClass = "parcel" | "ltl" | "pickup_only";

export interface Category {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface Brand {
  slug: string;
  name: string;
}

export interface SpecLine {
  label: string;
  value: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  mfrPartNumber: string | null;
  /** Other part numbers this replaces: competitors', the original manufacturer's. */
  crossReferences: string[];
  slug: string;
  name: string;
  categorySlug: string;
  brand: Brand | null;
  condition: ProductCondition;
  priceCents: number | null;
  coreChargeCents: number | null;
  inStock: boolean;
  featured: boolean;
  hp: number | null;
  rpm: number | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  voltage: string | null;
  imageUrl: string | null;
}

export interface ProductDocument {
  label: string;
  url: string;
}

export interface ProductImage {
  url: string;
  alt: string;
  /** Set on stock photos that stand in for the real unit; null for Morse's own photos. */
  credit: PhotoCredit | null;
}

export interface ProductDetail extends ProductSummary {
  familyKey: string | null;
  description: string | null;
  shipClass: ShipClass;
  weightLb: number | null;
  specs: SpecLine[];
  images: ProductImage[];
  documents: ProductDocument[];
  /** Other condition variants of the same unit, including this one. */
  variants: Pick<ProductSummary, "slug" | "condition" | "priceCents" | "inStock">[];
}

export const CONDITION_LABELS: Record<ProductCondition, string> = {
  new: "New",
  remanufactured: "Remanufactured",
  used_tested: "Used · tested",
  exchange: "Exchange",
};

export const ENCLOSURE_LABELS: Record<Enclosure, string> = {
  tefc: "TEFC",
  odp: "ODP",
  tenv: "TENV",
  xp: "Explosion-proof",
  washdown: "Washdown",
  other: "Other",
};

export const POWER_LABELS: Record<PowerSupply, string> = {
  ac_1ph: "AC · single phase",
  ac_3ph: "AC · three phase",
  dc: "DC",
};
