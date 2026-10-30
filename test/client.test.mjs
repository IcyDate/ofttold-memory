/**
 * Registration test for the client half, run in Node against a fake loader.
 *
 * Why this exists: the settings page failed to appear on a live harness while
 * every host-side test passed, and the host half was genuinely fine. The defect
 * was in the wiring, which no test touched — `configForms` was a hard inject
 * dependency, so the whole client half silently never applied when that service
 * was not yet served, and the page could not even report that it was waiting.
 *
 * A browser is not needed to catch that class of bug. `client.js` is plain
 * JavaScript that asks `window.__ModuleLoader__` for a factory; supplying a fake
 * loader, a fake context, and stub primitives is enough to assert *what gets
 * registered*, which is exactly what was wrong. Rendering is not under test here
 * and the stub components are never mounted.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLIENT_SOURCE = readFileSync(join(PACKAGE_ROOT, "client.js"), "utf8");

/**
 * Load `client.js` the way the browser module system does and return its plugin.
 *
 * The bundle is evaluated in a fresh `vm` context with only the three globals it
 * touches: `window` (carrying the loader), plus the stub `require`. Evaluating
 * rather than importing is what makes this possible at all — the file is a script
 * that registers itself with a global, not an ES module.
 *
 * @returns {{ plugin: any, requireCalls: string[] }} The exported plugin object
 *   and every module specifier the bundle asked for, so a dependency that would
 *   not resolve in the browser is visible instead of silent.
 */
function loadClientPlugin() {
  const requireCalls = [];
  let plugin;
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load({ id, factory }) {
          plugin = factory(fakeRequire);
          return id;
        },
      },
    },
  };
  /** Stand-ins for the two packages the bundle requires. */
  function fakeRequire(specifier) {
    requireCalls.push(specifier);
    if (specifier === "react") {
      const createElement = () => null;
      return { createElement, default: { createElement } };
    }
    if (specifier === "@deepseek-ai/dsh-client-ui-primitives") {
      // Every primitive is a stub: the test asserts registrations, never renders.
      /**
       * A stand-in for the real form model, shaped from the shipped implementation.
       *
       * The three contracts that matter are copied from the real
       * `SettingsFormModel`, because approximating them is what let two genuine
       * bugs through:
       *
       * 1. `field(id)` returns `{ text, overridden, invalid }` — staged *text*,
       *    already run through the field's `format`. It never returns `.value`.
       * 2. `format(value)` is the inverse of `parse(text)`, and a field without
       *    one only handles strings/numbers.
       * 3. Saving goes through `scope.mutate(ops, revision)` with JSON-patch
       *    operations, not through a per-field setter.
       *
       * `bind(select)` returns a slot hook: an object with `getSnapshot` and
       * `subscribe`. Anything less would let a plugin that forgot to produce a
       * hook pass this suite.
       */
      class SettingsFormModel {
        constructor(scope, fields) {
          this.scope = scope;
          this.specs = new Map(fields.map((entry) => [entry.id, entry]));
          this.staged = new Map();
          this.listeners = new Set();
          this.unsubscribe = scope?.subscribe?.(() => this.publish());
        }
        spec(id) {
          const spec = this.specs.get(id);
          if (spec === undefined) throw new Error(`plugin card has no field ${id}`);
          return spec;
        }
        storedValue(id) {
          return this.scope?.getSnapshot?.().value?.[id];
        }
        field(id) {
          const spec = this.spec(id);
          const staged = this.staged.get(id);
          // A field that supplies no `format` falls back exactly like the real
          // helper: strings pass through, everything else becomes "".
          const format = spec.format ?? ((value) => (typeof value === "string" ? value : ""));
          if (staged === undefined) return { text: format(this.storedValue(id)), overridden: false, invalid: false };
          if (staged.clear) return { text: "", overridden: false, invalid: false };
          const parsed = spec.parse ? spec.parse(staged.text) : { kind: "set", value: staged.text };
          return { text: staged.text, overridden: parsed?.kind === "set", invalid: parsed === undefined };
        }
        shell() {
          const snapshot = this.scope?.getSnapshot?.();
          return { available: snapshot?.status === "ready", writable: snapshot?.writable === true };
        }
        bind(select) {
          const store = {
            getSnapshot: () => select(),
            subscribe: (listener) => {
              this.listeners.add(listener);
              return () => this.listeners.delete(listener);
            },
          };
          this.publish = () => this.listeners.forEach((listener) => listener());
          this.store = store;
          return store;
        }
        actions() {
          return {
            edit: (id, text) => this.stage(id, { text, clear: false }),
            resetField: (id) => this.stage(id, { text: "", clear: true }),
            save: () => this.save(),
            discard: () => {
              this.staged.clear();
              this.publish?.();
            },
          };
        }
        async save() {
          const ops = [];
          for (const [id, entry] of this.staged) {
            const spec = this.spec(id);
            if (entry.clear) {
              ops.push({ op: "unset", path: [id] });
              continue;
            }
            const parsed = spec.parse ? spec.parse(entry.text) : { kind: "set", value: entry.text };
            if (parsed === undefined) return false;
            if (parsed.kind === "clear") ops.push({ op: "unset", path: [id] });
            else ops.push({ op: "set", path: [id], value: parsed.value });
          }
          // Mirrors the real model: an empty plan is a no-op that returns
          // `undefined`, and a read-only scope skips the write entirely rather
          // than reporting a failure it never attempted.
          if (ops.length === 0) return undefined;
          if (this.scope?.getSnapshot?.().writable !== true) return undefined;
          const accepted = await this.scope.mutate(ops, undefined);
          if (accepted) {
            this.staged.clear();
            this.publish?.();
          }
          return accepted;
        }
        stage(id, entry) {
          this.staged.set(id, entry);
          this.publish?.();
        }
        dispose() {
          this.unsubscribe?.();
          this.listeners.clear();
        }
      }
      const component = () => null;
      return {
        SettingsForm: component,
        SettingsValueField: component,
        settingsTextField: (id) => ({ id }),
        settingsNumberField: (id) => ({ id }),
        SettingsFormModel,
      };
    }
    throw new Error(`client.js required an unexpected module: ${specifier}`);
  }
  vm.createContext(sandbox);
  vm.runInContext(CLIENT_SOURCE, sandbox, { filename: "client.js" });
  assert.ok(plugin !== undefined, "client.js did not hand a plugin to the module loader");
  return { plugin, requireCalls };
}

/**
 * Build a context whose services can be supplied after the plugin applies.
 *
 * `get(name)` is the soft read: it returns undefined until `supply` is called,
 * which is exactly the state a real client half starts in. This is what makes the
 * original bug reproducible — with a hard inject the plugin never applies at all,
 * and there would be nothing left to assert.
 *
 * @returns {{ ctx: any, supply: (name: string, value: any) => void,
 *   registered: any[], effects: number[] }}
 */
function fakeClientContext() {
  const registered = [];
  const disposers = [];
  const services = new Map();
  // Service arrival is an event, not a deferred callback: the dynamic client
  // facade withholds `inject` entirely, so a plugin can only observe a
  // late-provided service through ctx.on("internal/service").
  const serviceListeners = new Set();
  const ctx = {
    get: (name) => services.get(name),
    on(name, listener) {
      if (name !== "internal/service") return () => {};
      serviceListeners.add(listener);
      return () => serviceListeners.delete(listener);
    },
    effect(fn, label) {
      const dispose = fn();
      if (typeof dispose === "function") disposers.push(dispose);
      return { dispose, label };
    },
    slots: {
      inject(key, callback) {
        return callback();
      },
      register(meta, component) {
        registered.push({ meta, component });
        return () => {};
      },
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
    },
  };
  return {
    ctx,
    registered,
    supply(name, value) {
      services.set(name, value);
      // The real event carries the name and the value; the name is what the
      // plugin filters on.
      serviceListeners.forEach((listener) => listener(name, value));
    },
  };
}

/**
 * A stand-in for the config-forms service, shaped like the real one.
 *
 * Only the three reads the scope performs are modelled: `describe()` exposing the
 * served namespaces with a `load` refresh and a subscription, `get(ns)` handing
 * back a per-namespace scope, and that scope's snapshot/subscribe/set.
 */
function fakeConfigForms(initial, { writable = true, value = {} } = {}) {
  let namespaces = [...initial];
  const mirrorListeners = new Set();
  const scopes = new Map();
  let loads = 0;
  const describe = {
    getSnapshot: () => ({ view: { namespaces: namespaces.map((ns) => ({ ns })) } }),
    subscribe: (listener) => {
      mirrorListeners.add(listener);
      return () => mirrorListeners.delete(listener);
    },
    load: () => {
      loads += 1;
    },
  };
  const forms = {
    describe: () => describe,
    get: (ns) => {
      if (!namespaces.includes(ns)) return undefined;
      if (!scopes.has(ns)) {
        const scopeListeners = new Set();
        scopes.set(ns, {
          ns,
          writes: [],
          getSnapshot: () => ({ status: "ready", value, writable }),
          subscribe: (listener) => {
            scopeListeners.add(listener);
            return () => scopeListeners.delete(listener);
          },
          // The real scope writes through a JSON-patch batch. A stub exposing
          // `set(field, value)` would let a plugin that calls a method the real
          // service does not have pass this suite.
          mutate: (ops, revision) => {
            scopes.get(ns).writes.push({ ops, revision });
            return Promise.resolve(writable);
          },
        });
      }
      return scopes.get(ns);
    },
  };
  return {
    forms,
    loads: () => loads,
    scope: (ns) => scopes.get(ns),
    serve(names) {
      namespaces = [...names];
      mirrorListeners.forEach((listener) => listener());
    },
  };
}

test("client half does not hard-inject configForms", () => {
  const { plugin } = loadClientPlugin();
  // A client service named in `inject` is a hard dependency: while it is unserved
  // the whole client half never applies. Listing it here is the bug that hid the
  // settings page on a live harness.
  assert.ok(
    !plugin.inject.includes("configForms"),
    `configForms must be probed through ctx.get(), not declared in inject (got ${JSON.stringify(plugin.inject)})`,
  );
  assert.deepEqual([...plugin.inject].sort(), ["locale", "slots"]);
});

test("the bundle requires only packages the shell registers", () => {
  const { requireCalls } = loadClientPlugin();
  // The shell registers `react` and `@deepseek-ai/dsh-client-ui-primitives` for
  // plugin bundles. Requiring anything else is a runtime failure in the browser
  // that no host test can see.
  for (const specifier of requireCalls) {
    assert.ok(
      specifier === "react" || specifier === "@deepseek-ai/dsh-client-ui-primitives",
      `client.js required ${specifier}, which the shell does not provide`,
    );
  }
});

test("the page registers before configForms is served", () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  // No configForms supplied at all: the exact state that used to keep the page
  // from ever registering.
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  assert.ok(page !== undefined, "the settings page did not register without configForms");
  assert.equal(page.meta.key, "ofttold-memory");
  assert.equal(typeof page.meta.inject, "function");
  // The injected props must be complete enough to render: a missing hook would
  // throw inside the component, not here.
  const props = page.meta.inject();
  assert.equal(typeof props.hooks.memoryForm, "object");
  assert.equal(typeof props.save, "function");
  assert.equal(typeof props.edit, "function");
  assert.equal(typeof props.resetField, "function");
});

test("the form reports itself unavailable until a namespace is served", async () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  const props = page.meta.inject();
  // Read-only, not a broken form: the page must be honest that nothing is
  // configurable yet rather than offering controls whose saves are refused.
  const snapshot = props.hooks.memoryForm.getSnapshot();
  // Read-only, not broken: `available` distinguishes "this deployment does not
  // serve the namespace" from "the namespace exists but refuses writes", and the
  // page needs both to word its banner honestly.
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.writable, false);
  // A save staged against an unserved namespace must not reach the Host at all.
  props.edit("memoryDir", "/tmp/nowhere");
  assert.equal(await props.save(), undefined);
});

test("the scope binds to whatever namespace the Host actually serves", async () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  // A profile can serve the row under the package name, the bare id, or the
  // include-prefixed id. Binding one exact string left every write refused.
  const served = fakeConfigForms(["include:ofttold-memory"], {
    value: { memoryDir: "~/.dsh/memory", sections: ["常被提起"], maxChars: 600 },
  });
  ctx.get = (name) => (name === "configForms" ? served.forms : undefined);
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  const props = page.meta.inject();
  const snapshot = props.hooks.memoryForm.getSnapshot();
  assert.equal(snapshot.writable, true);
  // The stored list must arrive as text, one heading per line, or the field
  // renders blank on a config that is perfectly valid.
  assert.equal(snapshot.sections.text, "常被提起");
  assert.equal(snapshot.memoryDir.text, "~/.dsh/memory");
  // Editing stages a draft; saving writes one atomic patch batch to the served
  // namespace rather than a per-field setter the real scope does not have.
  props.edit("memoryDir", "/tmp/elsewhere");
  assert.equal(await props.save(), true);
  const writes = served.scope("include:ofttold-memory").writes;
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].ops, [{ op: "set", path: ["memoryDir"], value: "/tmp/elsewhere" }]);
});

test("a namespace that appears later still binds", () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  const served = fakeConfigForms([]);
  ctx.get = (name) => (name === "configForms" ? served.forms : undefined);
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  const props = page.meta.inject();
  // First read: nothing served yet, and the mirror was asked to refresh once.
  assert.equal(props.hooks.memoryForm.getSnapshot().writable, false);
  assert.equal(served.loads(), 1);
  // The Host now serves the row under its bare id; the mirror notifies, and the
  // scope must follow without a page reload.
  served.serve(["ofttold-memory"]);
  assert.equal(props.hooks.memoryForm.getSnapshot().writable, true);
});

test("configForms arriving after apply still binds", () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered, supply } = fakeClientContext();
  // Nothing is served when the plugin applies. This is the ordering that used to
  // lose the page forever: a client service that appears later does NOT re-run
  // `apply`, so anything captured at apply time stays undefined for the life of
  // the session unless it waits through ctx.inject.
  plugin.apply(ctx);
  const page = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  const props = page.meta.inject();
  assert.equal(props.hooks.memoryForm.getSnapshot().available, false);
  // The service now arrives, serving the row under its bare id.
  const served = fakeConfigForms(["ofttold-memory"], { value: { memoryDir: "~/.dsh/memory" } });
  supply("configForms", served.forms);
  const snapshot = props.hooks.memoryForm.getSnapshot();
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.writable, true);
  assert.equal(snapshot.memoryDir.text, "~/.dsh/memory");
});

test("the same panel also registers as a top-level settings section", () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  plugin.apply(ctx);
  // Two seats, one panel: the plugin card is where someone who found the plugin
  // expects settings, but requiring them to find the card first was the complaint.
  // The section is the short path from the sidebar's settings dialog.
  const section = registered.find((entry) => entry.meta.name === "settings.section");
  assert.ok(section !== undefined, "the page did not register as a settings section");
  assert.equal(section.meta.id, "ofttold-memory");
  assert.equal(typeof section.meta.order, "number");
  // A fresh id, not a shipped one: reusing an id puts you in that cell and
  // replaces the shipped page.
  assert.ok(!["account", "general", "models", "plugins", "agent-presets", "memes"].includes(section.meta.id));
  // `label` is a thunk so the nav text follows the active locale.
  assert.equal(typeof section.meta.label, "function");
  const props = section.meta.inject();
  assert.equal(typeof props.hooks.memoryForm, "object");
  assert.equal(typeof props.save, "function");
});

test("the section and the plugin card share one form, so a save in either is the same", () => {
  const { plugin } = loadClientPlugin();
  const { ctx, registered } = fakeClientContext();
  plugin.apply(ctx);
  const section = registered.find((entry) => entry.meta.name === "settings.section");
  const card = registered.find((entry) => entry.meta.name === "plugins.bundle.config");
  assert.ok(section !== undefined && card !== undefined);
  // Both faces must project the same hook object; two independent forms over one
  // scope would let the section show a stale value the card had just saved.
  assert.equal(section.meta.inject().hooks.memoryForm, card.meta.inject().hooks.memoryForm);
});

test("every key the panel asks for exists in both dictionaries", () => {
  // The panel and its dictionaries live in the same file, so a missing key is
  // invisible until a user sees the raw key rendered in the UI — which is exactly
  // what happened: `diagnostics`, `diagnosticsHint` and `copyReport` were added to
  // the panel and to locale/*.json but not to client.js's inline dictionaries,
  // and 79 tests stayed green.
  //
  // There are two dictionaries on purpose. `locale/*.json` is what the plugin
  // manager shows for the package (title and description); the inline ones are
  // what the settings panel resolves through `ctx.locale.bind`. A key added to one
  // and not the other renders as its own name.
  const source = CLIENT_SOURCE;
  // `(?<![.\w])` matters: `ctx.get("configForms")` also ends in `t(` and would
  // otherwise be counted as a dictionary lookup for a key named "configForms".
  const asked = new Set(
    [...source.matchAll(/(?<![.\w])t\("([A-Za-z][A-Za-z0-9]*)"\)/g)].map((match) => match[1]),
  );
  assert.ok(asked.size > 10, "the key scan found almost nothing; the pattern is wrong");

  // Pull each dictionary out by its literal text and evaluate it, rather than
  // importing: the file is a browser script, not a module.
  for (const [label, marker] of [
    ["en", "const en = {"],
    ["zh", "const zh = {"],
  ]) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${label} dictionary not found`);
    const end = source.indexOf("\n    };", start);
    assert.ok(end > start, `${label} dictionary is not terminated as expected`);
    const body = source.slice(start + marker.length, end);
    // Anchored to the start of an indented line: a colon inside a value ("The
    // name is the idea: ...") is prose, not a key, and matching it made the check
    // fail on its own sentence.
    const entries = [...body.matchAll(/\n\s{6}([A-Za-z][A-Za-z0-9]*):/g)].map((match) => match[1]);
    const keys = new Set(entries);
    const missing = [...asked].filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `${label} dictionary is missing: ${missing.join(", ")}`);
  }
});

test("both dictionaries define the same keys, so neither locale is thinner", () => {
  // The panel resolves keys through whichever dictionary the active locale selects.
  // A key present in one and missing from the other means one language renders the
  // raw key while the other looks fine — the failure mode that shipped.
  const source = CLIENT_SOURCE;
  const dictionary = (marker) => {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${marker} not found`);
    const end = source.indexOf("\n    };", start);
    const body = source.slice(start + marker.length, end);
    return new Set([...body.matchAll(/\n\s{6}([A-Za-z][A-Za-z0-9]*):/g)].map((match) => match[1]));
  };
  const en = dictionary("const en = {");
  const zh = dictionary("const zh = {");
  const onlyEn = [...en].filter((key) => !zh.has(key));
  const onlyZh = [...zh].filter((key) => !en.has(key));
  assert.deepEqual(onlyEn, [], `only in en: ${onlyEn.join(", ")}`);
  assert.deepEqual(onlyZh, [], `only in zh: ${onlyZh.join(", ")}`);
});

/**
 * Source-level guards for the three things a screenshot review turned up.
 *
 * Rendering is not under test here (the stub `createElement` returns null), so these
 * read the bundle the way a reviewer would: the page must not speak in jargon, the
 * boolean must not be a free-text box, and the panel must say where to file a
 * complaint. Weak assertions on purpose — they catch drift, not layout.
 */

test("the settings page does not say 注入 to the person configuring it", () => {
  // 「注入」是实现的词，不是用户的词。两处重新注入的说明都出现过它。
  const zhBlock = CLIENT_SOURCE.slice(CLIENT_SOURCE.indexOf("const zh = {"));
  for (const key of ["refreshIntervalMsHint", "refreshAfterMessagesHint"]) {
    const line = zhBlock.split("\n").find((l) => l.includes(`${key}:`));
    assert.ok(line !== undefined, `${key} must exist`);
    assert.doesNotMatch(line, /注入/, `${key} must not use the word 注入`);
  }
});

test("every boolean setting is a checkbox, not a text box asking for true", () => {
  assert.match(CLIENT_SOURCE, /type: "checkbox"/);
  assert.match(
    CLIENT_SOURCE,
    /props\.edit\(id, event\.target\.checked \? "true" : "false"\)/,
    "the checkbox must stage the two values the parser understands",
  );
  // All three go through the same helper: a new boolean added as a text field
  // would show "true" and expect the user to type it.
  for (const id of ["diaryCheck", "skills", "workspaceRelative"]) {
    assert.match(CLIENT_SOURCE, new RegExp(`booleanRow\\("${id}"\\)`), `${id} must render as a checkbox`);
  }
});

test("the panel says where to star and where to complain", () => {
  assert.match(CLIENT_SOURCE, /const REPO = "https:\/\/github\.com\/IcyDate\/ofttold-memory"/);
  assert.match(CLIENT_SOURCE, /\$\{REPO\}\/issues/, "an issue link must be reachable from the panel");
  assert.match(CLIENT_SOURCE, /starLink/);
});

test("the version in the footer matches package.json", () => {
  // 浏览器里读不到 package.json，所以版本只能写死一份——这份必须由测试盯着。
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const found = CLIENT_SOURCE.match(/const VERSION = "([^"]+)"/);
  assert.ok(found !== null, "client.js must declare VERSION");
  assert.equal(found[1], pkg.version, "bump both, or the footer lies");
});

test("related settings sit in a titled card, not as a bare list of rows", () => {
  // 一节里十来个设置平铺，用户得滑很久才知道这页在配什么；分成卡片、每张有标题之后
  // 一眼能看到「你的笔记」和「日记」两块。这条只守结构，不测样式。
  for (const key of ["cardNotes", "cardDiary"]) {
    assert.match(CLIENT_SOURCE, new RegExp(`card\\("${key}"`), `${key} must be a titled card`);
  }
  assert.match(CLIENT_SOURCE, /h\("h4"/);
});

test("a '?' only appears when there is something to explain", () => {
  // locale 在缺键时会把键名还回来。不做这个判断，每个设置旁边都会挂一个空问号。
  assert.match(CLIENT_SOURCE, /why === `\$\{id\}Why`\) return null/);
});

test("the tooltip is drawn, not left to the native title attribute", () => {
  // 原生 title 在宿主页面里 hover 不出提示（实测），而且样式跟着系统走、和面板不是一个语气。
  // 所以自己画：默认 display:none，hover 或键盘聚焦时才出现。
  assert.match(CLIENT_SOURCE, /\.ofttold-body \{[^}]*display: none/s);
  assert.match(CLIENT_SOURCE, /\.ofttold-tip:hover \.ofttold-body[^}]*display: block/s);
  assert.match(CLIENT_SOURCE, /\.ofttold-tip:focus-within \.ofttold-body[^}]*display: block/s);
  assert.equal(CLIENT_SOURCE.includes("title: why"), false, "native tooltips were replaced on purpose");
  // 样式表必须真的挂进树里，否则那几条 CSS 规则等于没写。
  assert.match(CLIENT_SOURCE, /h\("style", \{\}, TIP_CSS\)/);
});

test("the tooltip is clamped to the viewport, because the panel clips overflow", () => {
  // 绝对定位的提示会被卡片边缘切掉（截图：右边那列文字被截断）。所以 hover 时按视口
  // 夹一次坐标，用 fixed 定位逃出容器的 overflow。
  assert.match(CLIENT_SOURCE, /position: fixed/);
  assert.match(CLIENT_SOURCE, /Math\.max\(8, Math\.min\(box\.left/);
  assert.match(CLIENT_SOURCE, /onMouseEnter: placeTip/);
  assert.match(CLIENT_SOURCE, /onFocus: placeTip/);
});

test("placeTip keeps the tooltip inside the window", () => {
  // 直接执行那段逻辑，确认两种情况都不越界：贴着屏幕右边缘、以及贴着左边缘。
  const source = CLIENT_SOURCE.slice(CLIENT_SOURCE.indexOf("const placeTip ="), CLIENT_SOURCE.indexOf("const helpDot ="));
  const placeTip = new Function(`${source}; return placeTip;`)();
  const make = (left) => {
    const style = {};
    const body = { style };
    const wrap = { getBoundingClientRect: () => ({ left, bottom: 100 }), querySelector: () => body };
    return { wrap, style };
  };
  globalThis.innerWidth = 1000;
  const right = make(950);
  placeTip({ currentTarget: right.wrap });
  assert.equal(right.style.width, "240px");
  assert.equal(right.style.left, "752px", "1000 - 240 - 8, not 950");
  const left = make(2);
  placeTip({ currentTarget: left.wrap });
  assert.equal(left.style.left, "8px", "never closer than 8px to the edge");
});

test("the heading list is a textarea, because it holds one heading per line", () => {
  // 用单行 input 时，parse 按换行拆——可用户根本敲不进换行，多段就只能靠粘贴。
  assert.match(CLIENT_SOURCE, /wide\(field\("sections", \{ multiline: true \}\)\)/);
  assert.match(CLIENT_SOURCE, /multiline \? "textarea" : "input"/);
});

test("the heading field shows what an entry looks like, not just 'write the headings'", () => {
  // 「想让它记住哪几段」看不出要填什么。原文里的例子必须两语都在。
  for (const key of ["sectionsHint", "sectionsWhy"]) {
    for (const marker of ["const en = {", "const zh = {"]) {
      const from = CLIENT_SOURCE.indexOf(marker);
      const block = CLIENT_SOURCE.slice(from, CLIENT_SOURCE.indexOf("\n    };", from));
      assert.match(block, new RegExp(`${key}:`), `${key} missing from ${marker}`);
    }
  }
  assert.ok(CLIENT_SOURCE.includes("`## 常被提起` becomes"), "the English hint must show the transformation");
  assert.ok(CLIENT_SOURCE.includes("就填 `常被提起`"), "the Chinese hint must show the transformation");
});
