export interface Preset {
  value: string;
  label: string;
}

const SEED = {
  trafficRestriction: [{ value: "K", label: "Connecting Traffic Only" }],
  serviceType: [{ value: "J", label: "Scheduled Passenger Normal Service" }],
} satisfies Record<string, Preset[]>;

/** Leg fields whose values are picked from a user-maintained list. */
export type PresetField = keyof typeof SEED;
export const PRESET_FIELDS = Object.keys(SEED) as PresetField[];

const key = (field: PresetField) => `ssim-editor.presets.${field}`;

export function loadPresets(field: PresetField): Preset[] {
  try {
    const raw = localStorage.getItem(key(field));
    return raw ? JSON.parse(raw) : SEED[field];
  } catch {
    return SEED[field];
  }
}

export function savePresets(field: PresetField, presets: Preset[]): void {
  localStorage.setItem(key(field), JSON.stringify(presets));
}
