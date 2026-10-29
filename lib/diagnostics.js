/**
 * Diagnostics: the record someone needs when they open an issue.
 *
 * The plugin is deliberately quiet — a missing file or a renamed heading must not
 * fail a session — which also means the reason nothing was injected is invisible.
 * That is fine for a working setup and miserable for a broken one, so the decisions
 * are recorded here and written to a file the user can find without reading logs
 * they do not know exist.
 *
 * Where that file lives matters. It goes under the plugin's own storage directory
 * (`~/.dsh/ofttold-memory/`), **never inside the user's memory folder**: a notes
 * folder that the plugin writes into is not read-only, and "point it at notes you
 * already keep" would then mean "let a plugin drop files among them". The memory
 * folder is a source, not a destination.
 *
 * Two rules shape this:
 *
 * 1. It never throws. A diagnostic that can fail the thing it diagnoses is worse
 *    than no diagnostic, so every write is wrapped and a failure is dropped.
 * 2. It holds no secrets. Paths are the user's own and are the point; file
 *    *contents* are never recorded, because the whole idea is to share this file
 *    with a stranger in a bug report.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Directory holding the diagnostic file, relative to the plugin's storage root.
 *
 * Deliberately not inside the memory folder: see the header note. The caller
 * supplies the root so this module never has to know how `~/.dsh` is resolved.
 */
export const DIAGNOSTICS_DIR = "ofttold-memory";

/** File name inside `DIAGNOSTICS_DIR`. */
export const DIAGNOSTICS_FILE = "diagnostics.json";

/** How many decisions to keep. Enough to see a pattern, small enough to paste. */
const MAX_ENTRIES = 50;

/**
 * In-process ring buffer of injection decisions.
 *
 * One per plugin instance, not per session: a single `apply` sees every session,
 * and a per-session buffer would fragment exactly the history that explains a
 * cross-session symptom.
 */
export class Diagnostics {
  constructor() {
    /** @type {any[]} Newest last. */
    this.entries = [];
  }

  /**
   * Record one decision.
   *
   * @param {string} event - Short machine-readable name.
   * @param {Record<string, unknown>} [detail] - Values worth seeing; never file contents.
   */
  record(event, detail = {}) {
    this.entries.push({ at: new Date().toISOString(), event, ...detail });
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
  }

  /**
   * Write the buffer to the plugin's own storage directory.
   *
   * Called after a decision rather than on a timer: the interesting moment is the
   * one a user is about to ask about, and a timer would keep writing during a
   * session that never injects anything.
   *
   * @param {string} storageRoot - Absolute directory the plugin owns, such as
   *   `~/.dsh`. The diagnostic lands in `<storageRoot>/ofttold-memory/`.
   * @returns {string | undefined} The file written, or undefined when it could not be.
   */
  flush(storageRoot) {
    try {
      const dir = join(storageRoot, DIAGNOSTICS_DIR);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, DIAGNOSTICS_FILE);
      writeFileSync(
        file,
        `${JSON.stringify({ plugin: "dsh-ofttold-memory", writtenAt: new Date().toISOString(), entries: this.entries }, undefined, 2)}\n`,
        "utf8",
      );
      return file;
    } catch {
      // A read-only home directory is a normal deployment, not a bug.
      return undefined;
    }
  }
}
