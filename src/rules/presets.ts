export interface Preset {
  value: string;
  label: string;
}

// ponytail: single preset list for traffic restriction; generalize to a
// per-field map only when a second field actually needs presets.
const KEY = "ssim-editor.presets.trafficRestriction";

const SEED: Preset[] = [{ value: "K", label: "Connecting Traffic Only" }];

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : SEED;
  } catch {
    return SEED;
  }
}

export function savePresets(presets: Preset[]): void {
  localStorage.setItem(KEY, JSON.stringify(presets));
}
