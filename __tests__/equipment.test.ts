import {
  equipmentToForm,
  nameplateLine,
  parseEquipmentForm,
  replacementHref,
  rpmBandOf,
  unitPrefill,
  type Equipment,
  type EquipmentValues,
} from "@/lib/customers/equipment";

const form = (over: Partial<ReturnType<typeof equipmentToForm>> = {}) => ({ ...equipmentToForm(null), ...over });

const unit = (over: Partial<EquipmentValues> = {}): EquipmentValues => ({
  label: "Cooling tower fan",
  equipment_type: "motor",
  make: "Baldor",
  model: "EM3615T",
  serial: "Z1234",
  hp: 5,
  rpm: 1750,
  voltage: "230/460",
  frame: "184T",
  enclosure: "tefc",
  power: "ac_3ph",
  location: "Roof",
  notes: null,
  ...over,
});

describe("parseEquipmentForm", () => {
  it("reads a nameplate the way people type it", () => {
    const result = parseEquipmentForm(
      form({ label: "  Cooling   tower fan ", make: "Baldor", hp: "7½", rpm: "1,760", frame: "215 t", enclosure: "TEFC", power: "3 phase" }),
    );
    expect(result).toEqual({
      ok: true,
      values: {
        label: "Cooling tower fan",
        equipment_type: "motor",
        make: "Baldor",
        model: null,
        serial: null,
        hp: 7.5,
        rpm: 1760,
        voltage: null,
        frame: "215T",
        enclosure: "tefc",
        power: "ac_3ph",
        location: null,
        notes: null,
      },
    });
  });

  it("needs a name and a known type, and explains bad numbers", () => {
    const result = parseEquipmentForm(form({ label: " ", equipment_type: "toaster", rpm: "fast", hp: "-2" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["equipment_type", "hp", "label", "rpm"]);
  });

  it("round-trips through the form", () => {
    const parsed = parseEquipmentForm(equipmentToForm(unit()));
    expect(parsed).toEqual({ ok: true, values: unit() });
  });
});

describe("nameplateLine", () => {
  it("joins what's known", () => {
    expect(nameplateLine(unit())).toBe("Baldor · 5 HP · 1750 RPM · 184T · TEFC · AC · three phase · 230/460 V");
    expect(nameplateLine(unit({ make: null, hp: null, rpm: null, frame: null, enclosure: null, power: null, voltage: "460V" }))).toBe("460V");
  });
});

describe("replacement search", () => {
  it("finds the nameplate speed band", () => {
    expect(rpmBandOf(1750)).toBe("1800");
    expect(rpmBandOf(3500)).toBe("3600");
    expect(rpmBandOf(5000)).toBeNull();
    expect(rpmBandOf(null)).toBeNull();
  });

  it("searches motors by horsepower, speed, frame, enclosure and power", () => {
    expect(replacementHref(unit())).toBe(
      "/shop/electric-motors?hp=5&rpm=1800&enclosure=tefc&power=ac_3ph&frame=184T",
    );
  });

  it("offers no search without horsepower, or for other equipment", () => {
    expect(replacementHref(unit({ hp: null }))).toBeNull();
    expect(replacementHref(unit({ equipment_type: "pump" }))).toBeNull();
  });
});

describe("unitPrefill", () => {
  it("turns a unit into service form values", () => {
    const u: Equipment = { ...unit(), id: "u1", customer_id: "c1", created_at: "", updated_at: "" };
    expect(unitPrefill(u)).toEqual({
      id: "u1",
      label: "Cooling tower fan",
      equipmentType: "motor",
      make: "Baldor",
      size: "5 HP, 184T",
      modelSerial: "EM3615T · S/N Z1234",
    });
  });
});
