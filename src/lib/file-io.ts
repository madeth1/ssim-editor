import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/** Last path segment; handles both / and \ separators (Windows builds). */
export const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** "…/sched.ssim" -> "…/sched_modified.ssim"; no extension -> append "_modified". */
export function defaultExportPath(sourcePath: string): string {
  const dot = basename(sourcePath).lastIndexOf(".");
  if (dot <= 0) return `${sourcePath}_modified`;
  const cut = sourcePath.length - (basename(sourcePath).length - dot);
  return `${sourcePath.slice(0, cut)}_modified${sourcePath.slice(cut)}`;
}

export async function pickAndReadSsim(): Promise<{
  path: string;
  text: string;
} | null> {
  const path = await open({
    title: "Open SSIM file",
    filters: [
      { name: "SSIM", extensions: ["ssim", "dat", "txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (!path) return null;
  return { path, text: await readTextFile(path) };
}

/** Save-as dialog; refuses to silently overwrite the source file. Returns saved path or null. */
export async function saveSsimAs(
  text: string,
  sourcePath: string,
): Promise<string | null> {
  const path = await save({
    title: "Export modified SSIM",
    defaultPath: defaultExportPath(sourcePath),
    filters: [{ name: "SSIM", extensions: ["ssim", "dat", "txt"] }],
  });
  if (!path) return null;
  if (path === sourcePath) {
    const sure = await ask(
      "This would overwrite the original file. The whole point of this app is not doing that.\n\nOverwrite anyway?",
      { title: "Overwrite original?", kind: "warning" },
    );
    if (!sure) return null;
  }
  await writeTextFile(path, text);
  return path;
}

export async function pickAndReadJson(): Promise<string | null> {
  const path = await open({
    title: "Import rules",
    filters: [{ name: "Rules JSON", extensions: ["json"] }],
  });
  return path ? readTextFile(path) : null;
}

export async function saveJsonAs(json: string): Promise<string | null> {
  const path = await save({
    title: "Export rules",
    defaultPath: "ssim-rules.json",
    filters: [{ name: "Rules JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, json);
  return path;
}
