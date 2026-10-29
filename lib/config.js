/**
 * Read config values that may arrive as volatile references.
 *
 * schemastery's `.volatile()` does two things, and only the first is obvious:
 * it marks the field so `dsh-settings` keeps it in the editable form, and it
 * makes `Schema.resolve` wrap the field's value in a reference object
 * (`{ get(), [Symbol.for('cosmokit.volatile.write')] }`) whose snapshot changes
 * when the runtime writes it. Reading that wrapper as if it were the value is a
 * `TypeError` in the plugin — `path.startsWith is not a function` — not a
 * degraded result, so every read has to go through here.
 *
 * The wrapper is detected by its write symbol rather than by duck-typing `get`:
 * a plain object that happens to carry a `get` method must stay readable as
 * itself. `Symbol.for` is global, so this matches the wrapper even though the
 * plugin never imports cosmokit.
 *
 * An unvalidated config (a plain object, which tests and the scaffold path both
 * pass) has no wrappers and passes straight through, so this helper does not
 * change behaviour for callers that never went through validation.
 */

/** Symbol cosmokit puts on a volatile reference; `Symbol.for` keeps it global. */
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

/**
 * Unwrap a volatile reference, leaving an ordinary value untouched.
 *
 * @param {unknown} value - Field value, possibly a volatile reference.
 * @returns {unknown} The current snapshot, or the value unchanged.
 */
export function deref(value) {
  if (value === null || typeof value !== "object") return value;
  if (!(VOLATILE_WRITE in value)) return value;
  const get = Reflect.get(value, "get");
  return typeof get === "function" ? Reflect.apply(get, value, []) : undefined;
}

/**
 * Read one config field, unwrapping a volatile reference.
 *
 * @param {any} config - Plugin config, validated or not.
 * @param {string} field - Field name.
 * @returns {any} The field's current value, or `undefined`.
 */
export function configValue(config, field) {
  return deref(config?.[field]);
}
