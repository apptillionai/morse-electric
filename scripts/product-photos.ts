/**
 * Stand-in photos for the placeholder catalog, loaded by `npm run seed:photos`.
 * `file` is a Wikimedia Commons file title; the script checks its license when
 * it runs. Pick photos that show the right kind of equipment, ideally without
 * a prominent brand logo (Morse doesn't sell under these names).
 *
 * No photo on purpose: MEM-M-213T-7.5-N (explosion-proof), MEM-M-56C-1-N
 * (washdown C-face) and MEM-M-56-0.5-DC (PM DC). Commons has nothing that
 * shows that kind of motor, and a general-purpose motor would misrepresent
 * them, so they keep the "Photo coming soon" placeholder.
 */
export interface ProductPhotoPick {
  sku: string;
  file: string;
  /** Alt text; defaults to the product name. */
  alt?: string;
}

const TEFC_SMALL = "File:Silniki by Zureks.jpg";
const TEFC_LARGE = "File:Drehstrommotor eines Schiffshebewerks.JPG";
const ALTERNATOR = "File:Alternator.jpg";

export const PRODUCT_PHOTOS: ProductPhotoPick[] = [
  // Electric motors
  { sku: "MEM-M-184T-5-N", file: TEFC_SMALL, alt: "Three-phase TEFC electric motors" },
  { sku: "MEM-M-184T-5-R", file: TEFC_SMALL, alt: "Three-phase TEFC electric motors" },
  { sku: "MEM-M-184T-5-X", file: TEFC_SMALL, alt: "Three-phase TEFC electric motors" },
  { sku: "MEM-M-145T-2-N", file: TEFC_SMALL, alt: "TEFC electric motors" },
  { sku: "MEM-M-256T-20-R", file: TEFC_LARGE, alt: "Large three-phase TEFC electric motor" },
  { sku: "MEM-M-326T-50-U", file: TEFC_LARGE, alt: "Large three-phase TEFC electric motor" },
  // Alternators
  { sku: "MEM-A-12V-160-R", file: ALTERNATOR, alt: "Vehicle alternator" },
  { sku: "MEM-A-24V-100-N", file: ALTERNATOR, alt: "Vehicle alternator" },
  // Blowers
  { sku: "MEM-B-RGN-2.5", file: "File:Seitenkanalverdichter 2014-04-19 15-40.jpg", alt: "Regenerative (side channel) blower" },
  // Starters & controls
  { sku: "MEM-S-NEMA1", file: "File:Inside 3 phase motor starter.jpg", alt: "Inside an enclosed three-phase motor starter" },
  { sku: "MEM-S-12V-GR-R", file: "File:Starter motor.JPG", alt: "Vehicle starter motor" },
  // Pumps
  { sku: "MEM-P-CC-1", file: "File:Kreiselpumpe-Elektromotor.jpg", alt: "Centrifugal pump driven by an electric motor" },
  { sku: "MEM-P-SUB-2", file: "File:Norip-Rohr mit Unterwasserpumpe.jpg", alt: "Submersible well pump on its riser pipe" },
  // Vacuum pumps
  { sku: "MEM-V-RV-1-R", file: "File:Fruitland RCF500 Rotary Vane Vacuum Pump.jpg", alt: "Rotary vane vacuum pump" },
];
