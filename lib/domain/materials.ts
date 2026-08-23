// Box → piece conversion constants for received raw materials / PPE.
// Previously copy-pasted across the procurement route and two procurement
// pages; centralised here. (These are mirrored by the consumable_materials
// seed row values in the DB for reference/display.)

export const STAMP_COILS_PER_BOX = 6
export const STAMP_PCS_PER_COIL = 15_000
export const STAMP_PCS_PER_BOX = STAMP_COILS_PER_BOX * STAMP_PCS_PER_COIL // 90,000
export const TAPE_PCS_PER_BOX = 24
export const HAIRNET_PACKS_PER_BOX = 10
export const NOSEMASK_PACKS_PER_BOX = 40
export const GLOVES_PACKS_PER_BOX = 10

export type MaterialType =
  | "tax_stamp"
  | "carton_bitters"
  | "carton_ginger"
  | "seal_tape"
  | "hair_net"
  | "nose_mask"
  | "gloves"

export const PPE_TYPES: MaterialType[] = ["seal_tape", "hair_net", "nose_mask", "gloves"]

export const ALL_MATERIAL_TYPES: MaterialType[] = [
  "tax_stamp",
  "carton_bitters",
  "carton_ginger",
  "seal_tape",
  "hair_net",
  "nose_mask",
  "gloves",
]

/** Units per received box for the box-based materials. */
export function pcsPerBox(material: MaterialType): number {
  switch (material) {
    case "seal_tape":
      return TAPE_PCS_PER_BOX
    case "hair_net":
      return HAIRNET_PACKS_PER_BOX
    case "nose_mask":
      return NOSEMASK_PACKS_PER_BOX
    case "gloves":
      return GLOVES_PACKS_PER_BOX
    default:
      return 1
  }
}
