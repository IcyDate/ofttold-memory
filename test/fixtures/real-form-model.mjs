/**
 * SettingsFormModel, transcribed verbatim from the shipped frontend bundle
 * (dsh-web-frontend/dist/assets/index-BXV-oxvX.js, class gR).
 *
 * Every line below is copied from the minified source with only names expanded.
 * It is here because approximating this class is what let two genuine bugs
 * through: `field()` returns {text, overridden, invalid} rather than {value},
 * and saving goes through scope.mutate(ops, revision) rather than a setter.
 */
export function settingsTextField(field) {
  return {
    field,
    format: (value) => (typeof value === "string" ? value : ""),
    parse: (text) => {
      const trimmed = text.trim();
      return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
    },
  };
}

export function settingsNumberField(field) {
  return {
    field,
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? { kind: "set", value: parsed } : undefined;
    },
  };
}

export class SettingsFormModel {
  staged = new Map();
  listeners = new Set();
  baseline;
  unsubscribe;
  saving = false;
  failed = false;

  constructor(scope, specs, secretSpecs = []) {
    this.scope = scope;
    this.specs = new Map(specs.map((spec) => [spec.field, spec]));
    this.secretSpecs = new Map(secretSpecs.map((spec) => [spec.field, spec]));
    this.unsubscribe = scope.subscribe(() => this.publish());
  }

  bind(read) {
    const store = makeStore(read);
    this.listeners.add(() => store.set(read()));
    return store;
  }

  shell() {
    const snapshot = this.scope.getSnapshot();
    const plan = this.plan();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some((item) => item.run === undefined && item.op === undefined),
      saving: this.saving,
      failed: this.failed,
    };
  }

  field(name) {
    const staged = this.staged.get(name);
    if (this.secretSpecs.has(name)) return { text: staged?.text ?? "", overridden: false, invalid: false };
    const spec = this.spec(name);
    if (staged === undefined) return { text: spec.format(this.sectionValue(name)), overridden: this.stored(name), invalid: false };
    const parsed = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
    return { text: staged.text, overridden: parsed?.kind === "set", invalid: parsed === undefined };
  }

  actions() {
    return {
      edit: (name, text) => {
        this.stage(name, { text, clear: false });
      },
      resetField: (name) => {
        this.stage(name, { text: this.spec(name).format(this.baseValue(name)), clear: true });
      },
      save: () => {
        this.save();
      },
      discard: () => {
        if (!(this.staged.size === 0 && !this.failed)) {
          this.staged.clear();
          this.baseline = undefined;
          this.failed = false;
          this.publish();
        }
      },
    };
  }

  async save() {
    const plan = this.plan();
    if (plan.length === 0 || this.saving || !this.scope.getSnapshot().writable || plan.some((item) => item.run === undefined && item.op === undefined)) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      const ops = plan.flatMap((item) => (item.op === undefined ? [] : [item.op]));
      let accepted = ops.length === 0 || (await this.scope.mutate(ops, this.baseline?.revision));
      if (!accepted) {
        this.failed = true;
        return;
      }
      for (const item of plan) if (item.run) accepted = (await item.run()) && accepted;
      if (accepted) {
        this.staged.clear();
        this.baseline = undefined;
      }
      this.failed = !accepted;
    } catch {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }

  dispose() {
    this.unsubscribe();
    this.listeners.clear();
  }

  plan() {
    const plan = [];
    for (const [name, staged] of this.staged) {
      const secret = this.secretSpecs.get(name);
      if (secret !== undefined) {
        const text = staged.text.trim();
        if (text !== "") plan.push({ field: name, run: () => secret.write(text) });
        continue;
      }
      const spec = this.spec(name);
      if (staged.clear) {
        if (this.stored(name)) plan.push({ field: name, op: { op: "unset", path: [name] } });
        continue;
      }
      if (staged.text === spec.format(this.sectionValue(name))) continue;
      const parsed = spec.parse(staged.text);
      if (parsed === undefined) plan.push({ field: name });
      else if (parsed.kind === "clear") plan.push({ field: name, op: { op: "unset", path: [name] } });
      else plan.push({ field: name, op: { op: "set", path: [name], value: parsed.value } });
    }
    return plan;
  }

  stage(name, staged) {
    this.baseline ??= this.scope.getSnapshot();
    this.staged.set(name, staged);
    this.failed = false;
    this.publish();
  }

  spec(name) {
    const spec = this.specs.get(name);
    if (spec === undefined) throw new Error(`plugin card has no field ${name}`);
    return spec;
  }

  snapshotOf() {
    return this.scope.getSnapshot();
  }
  sectionValue(name) {
    return this.snapshotOf().value?.[name];
  }
  baseValue(name) {
    return this.snapshotOf().base?.[name];
  }
  userLayer() {
    return this.snapshotOf().user;
  }
  stored(name) {
    const user = this.userLayer();
    return user !== undefined && Object.hasOwn(user, name);
  }
  publish() {
    for (const listener of this.listeners) listener();
  }
}

/** Minimal store, matching the bundle's Y3(): getSnapshot/subscribe/set. */
function makeStore(read) {
  let value = read();
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
