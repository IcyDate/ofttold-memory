/**
 * First-run scaffolding: make the memory folder exist and give it a starting
 * file, so installing the plugin is the only step.
 *
 * Without this, a fresh install injects nothing and the failure is silent — the
 * user sees an empty session and has no way to tell "working, nothing configured"
 * from "broken". Writing a template they can edit is cheaper than explaining the
 * folder layout in a README they may not open.
 *
 * Every step is best-effort: a read-only home directory must not fail a session.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MEMORY_FILE } from "./sources.js";

/** Absolute path of this package's directory, used to locate the template. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Ensure `memoryDir` exists and holds a `MEMORY.md` to start from.
 *
 * Existing files are never touched: a scaffold that overwrites is worse than no
 * scaffold, because it destroys the notes it was meant to bootstrap.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {{ createdDir: boolean, createdFile: boolean, error?: string }}
 *   What was actually created, so the caller can log it rather than guess.
 */
export function scaffoldMemory(memoryDir) {
  let createdDir = false;
  let createdFile = false;
  try {
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
      createdDir = true;
    }
    const file = join(memoryDir, DEFAULT_MEMORY_FILE);
    if (!existsSync(file)) {
      const template = readFileSync(join(PACKAGE_ROOT, "templates", DEFAULT_MEMORY_FILE), "utf8");
      writeFileSync(file, template, { flag: "wx" });
      createdFile = true;
    }
  } catch (error) {
    return { createdDir, createdFile, error: error?.code ?? "SCAFFOLD_FAILED" };
  }
  return { createdDir, createdFile };
}
