/**
 * First-run scaffolding: make the memory folder exist and give it a starting
 * file, so installing the plugin is the only step.
 *
 * Without this, a fresh install injects nothing and the failure is silent — the
 * user sees an empty session and has no way to tell "working, nothing configured"
 * from "broken". Writing a template they can edit is cheaper than explaining the
 * folder layout in a README they may not open.
 *
 * The scaffold is deliberately shy. It only ever acts on a folder that is missing
 * or holds no markdown at all, because a folder with notes in it is somebody's
 * actual memory: dropping a starter file into `~/Desktop/notes` next to their
 * `INDEX.md` is not help, it is clutter they then have to notice and delete. A
 * user pointing at an existing notes folder has already answered the question the
 * template exists to answer.
 *
 * Every step is best-effort: a read-only home directory must not fail a session.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MEMORY_FILE } from "./sources.js";

/** Absolute path of this package's directory, used to locate the template. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Whether a folder already holds notes this plugin should not add to.
 *
 * Any markdown file counts, not just `MEMORY.md`: a folder full of someone's
 * diary and index files is already a memory folder, whether or not it happens to
 * contain the file name this plugin prefers.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {boolean} True when the folder exists and contains markdown.
 */
function holdsNotes(memoryDir) {
  if (!existsSync(memoryDir)) return false;
  try {
    const entries = readdirSync(memoryDir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));
  } catch {
    // Unreadable is not the same as empty. Treating it as empty would write into
    // a folder we could not even list, which is the worst possible guess.
    return true;
  }
}

/**
 * Ensure `memoryDir` exists and holds a `MEMORY.md` to start from.
 *
 * Existing files are never touched: a scaffold that overwrites is worse than no
 * scaffold, because it destroys the notes it was meant to bootstrap.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {{ createdDir: boolean, createdFile: boolean, skipped: boolean, error?: string }}
 *   What was actually done, so the caller can log it rather than guess.
 *   `skipped` means the folder already held notes and was left alone on purpose.
 */
export function scaffoldMemory(memoryDir) {
  let createdDir = false;
  let createdFile = false;
  try {
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
      createdDir = true;
    } else if (holdsNotes(memoryDir)) {
      return { createdDir: false, createdFile: false, skipped: true };
    }
    const file = join(memoryDir, DEFAULT_MEMORY_FILE);
    if (!existsSync(file)) {
      const template = readFileSync(join(PACKAGE_ROOT, "templates", DEFAULT_MEMORY_FILE), "utf8");
      writeFileSync(file, template, { flag: "wx" });
      createdFile = true;
    }
  } catch (error) {
    return { createdDir, createdFile, skipped: false, error: error?.code ?? "SCAFFOLD_FAILED" };
  }
  return { createdDir, createdFile, skipped: false };
}
