/**
 * The client half run against the form model the shell actually ships.
 *
 * `test/client.test.mjs` checks *what gets registered* using fakes. This file
 * answers the other question: given the real `SettingsFormModel`, does the
 * plugin's field wiring produce correct saves? The two defects that survived the
 * first version of the tests — reading `.value` from `field()`, and calling a
 * per-field setter instead of `mutate` — were both invisible to registration
 * checks and show up here immediately.
 *
 * `test/fixtures/real-form-model.mjs` is the shipped class transcribed with only
 * names expanded, so it can drift from the real one; approximating it instead is
 * what let those two defects through in the first place.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { SettingsFormModel, settingsTextField, settingsNumberField } from "./fixtures/real-form-model.mjs";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = readFileSync(join(PACKAGE_ROOT, "client.js"), "utf8");

/** Load client.js the way the browser module system does, wired to the real model. */
function loadPlugin() {
  let plugin;
  const box = {
    window: {
      __ModuleLoader__: {
        load({ id, factory }) {
          plugin = factory((spec) => {
            if (spec === "react") return { createElement: () => null, default: {} };
            if (spec === "@deepseek-ai/dsh-client-ui-primitives") {
              return {
                SettingsFormModel,
                settingsTextField,
                settingsNumberField,
                SettingsForm: () => null,
                SettingsValueField: () => null,
              };
            }
            throw new Error(`unexpected require: ${spec}`);
          });
        },
      },
    },
    console,
  };
  vm.createContext(box);
  vm.runInContext(SOURCE, box);
  return plugin;
}

/** A scope shaped like configForms' ConfigFormController, holding one namespace. */
function makeScope(value, { writable = true } = {}) {
  const listeners = new Set();
  const writes = [];
  let revision = 1;
  return {
    writes,
    getSnapshot: () => ({ status: "ready", writable, value, base: {}, user: {}, revision }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mutate: async (ops, expected) => {
      writes.push({ ops, expected });
      revision += 1;
      for (const op of ops) {
        if (op.op === "set") value[op.path[0]] = op.value;
        else if (op.op === "unset") delete value[op.path[0]];
      }
      for (const listener of listeners) listener();
      return true;
    },
  };
}

/** A configForms service over one scope, which can start unserved. */
function makeForms(scope) {
  const listeners = new Set();
  let namespaces = [];
  return {
    describe: () => ({
      getSnapshot: () => ({ view: { writable: true, namespaces } }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      load: () => {},
    }),
    get: () => scope,
    serve: (ns) => {
      namespaces = [{ ns, revision: 1 }];
      for (const listener of listeners) listener();
    },
  };
}

/**
 * Apply the plugin to a context that can gain services later.
 *
 * The service arrives through `internal/service` because that is the only door
 * the dynamic client facade opens: its verb whitelist has no `inject`.
 */
function mount() {
  const registered = [];
  const services = new Map();
  const serviceListeners = new Set();
  const ctx = {
    get: (name) => services.get(name),
    on: (name, listener) => {
      if (name !== "internal/service") return () => {};
      serviceListeners.add(listener);
      return () => serviceListeners.delete(listener);
    },
    effect: (fn) => ({ dispose: fn() }),
    slots: {
      inject: (key, callback) => callback(),
      register: (meta, component) => {
        registered.push({ meta, component });
        return () => {};
      },
    },
    locale: { bind: () => (key) => key, register: () => () => {} },
    supply: (name, value) => {
      services.set(name, value);
      for (const listener of serviceListeners) listener(name, value);
    },
  };
  const plugin = loadPlugin();
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  return { plugin, page, ctx };
}

/** Mount a page bound to one served namespace. */
function mountWith(value, options) {
  const scope = makeScope(value, options);
  const forms = makeForms(scope);
  const mounted = mount();
  mounted.ctx.supply("configForms", forms);
  forms.serve("ofttold-memory");
  return { ...mounted, scope, forms, props: mounted.page.meta.inject() };
}

test("configForms is not a hard inject dependency", () => {
  const { plugin } = mount();
  assert.equal([...plugin.inject].sort().join(","), "locale,slots");
});

test("the page registers before configForms is served", () => {
  const { page } = mount();
  assert.ok(page, "the page must exist even while the service is missing");
});

test("configForms arriving after apply still binds", () => {
  const { ctx, page } = mount();
  const scope = makeScope({ memoryDir: "~/Desktop/拾光" });
  const forms = makeForms(scope);
  ctx.supply("configForms", forms);
  forms.serve("ofttold-memory");
  const state = page.meta.inject().hooks.memoryForm.getSnapshot();
  assert.equal(state.available, true);
  assert.equal(state.memoryDir.text, "~/Desktop/拾光");
});

test("fields render real values through the model's format()", () => {
  const { props } = mountWith({ memoryDir: "~/Desktop/拾光", maxChars: 600 });
  const state = props.hooks.memoryForm.getSnapshot();
  // `field()` hands back formatted text; a list or boolean read through the
  // shared helpers alone would render as an empty string here.
  assert.equal(state.memoryDir.text, "~/Desktop/拾光");
  assert.equal(state.maxChars.text, "600");
});

test("a list field stages as text and reads back as text", () => {
  const { props } = mountWith({ sections: ["Oft-told"] });
  props.edit("sections", "Oft-told\n常被提起");
  const state = props.hooks.memoryForm.getSnapshot();
  assert.equal(state.sections.text, "Oft-told\n常被提起");
  assert.equal(state.dirty, true);
});

test("save goes through mutate(ops, revision) with the right JSON-patch ops", async () => {
  const { props, scope } = mountWith({ sections: ["Oft-told"] });
  props.edit("sections", "Oft-told\n常被提起");
  await props.save();
  assert.equal(scope.writes.length, 1, "save must reach the scope exactly once");
  // JSON-compare: the ops were built inside the vm realm, so their prototypes
  // differ from this file's even when the values are identical.
  assert.equal(
    JSON.stringify(scope.writes[0].ops),
    JSON.stringify([{ op: "set", path: ["sections"], value: ["Oft-told", "常被提起"] }]),
  );
  const after = props.hooks.memoryForm.getSnapshot();
  assert.equal(after.dirty, false, "a successful save clears the staged plan");
  assert.equal(after.failed, false);
});

test("a boolean field parses to a real boolean, not the string 'true'", async () => {
  const { props, scope } = mountWith({ workspaceRelative: false });
  props.edit("workspaceRelative", "true");
  assert.equal(props.hooks.memoryForm.getSnapshot().workspaceRelative.invalid, false);
  await props.save();
  assert.equal(
    JSON.stringify(scope.writes[0].ops),
    JSON.stringify([{ op: "set", path: ["workspaceRelative"], value: true }]),
  );
});

test("object-form sections render read-only instead of being flattened", () => {
  const { props } = mountWith({ sections: [{ file: "INDEX.md", heading: "常被提起", maxChars: 600 }] });
  const state = props.hooks.memoryForm.getSnapshot();
  assert.equal(state.sectionsComplex, true);
  // The heading still shows, so the field is informative rather than blank.
  assert.equal(state.sections.text, "常被提起");
});

test("a read-only scope refuses the save without touching the Host", async () => {
  const { props, scope } = mountWith({ memoryDir: "~/x" }, { writable: false });
  props.edit("memoryDir", "/tmp/nowhere");
  assert.equal(await props.save(), undefined);
  assert.equal(scope.writes.length, 0, "a read-only scope must never receive a write");
});

test("every setting the panel draws is declared, and every declared one is drawn", () => {
  // 面板上画出来的字段和表单模型登记的字段必须是一套。多画一个没登记的，它永远空着；
  // 少画一个，那个配置项就藏起来了——两次都是静默的，所以拿源码直接对。
  const drawn = new Set([
    ...[...SOURCE.matchAll(/field\("([a-zA-Z]+)"/g)].map((match) => match[1]),
    ...[...SOURCE.matchAll(/booleanRow\("([a-zA-Z]+)"/g)].map((match) => match[1]),
    ...[...SOURCE.matchAll(/selectRow\("([a-zA-Z]+)"/g)].map((match) => match[1]),
  ]);
  const declared = new Set([...SOURCE.matchAll(/settings(?:Text|Number)Field\("([a-zA-Z]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...drawn].sort(), [...declared].sort());
});
