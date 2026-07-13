import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

/** Check GitHub Releases for a newer version; prompt, install, relaunch. */
export async function checkForUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    const yes = await ask(
      `Version ${update.version} is available (you have ${update.currentVersion}). Install and restart now?`,
      { title: "Update available", kind: "info" },
    );
    if (!yes) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    // ponytail: startup update check must never break the app (offline,
    // no published release yet, running outside Tauri). Log and move on.
    console.warn("update check failed:", err);
  }
}
