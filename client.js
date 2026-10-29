window.__ModuleLoader__.load({
  id: "dsh-ofttold-memory",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { SettingsForm, SettingsValueField, settingsTextField, settingsNumberField, SettingsFormModel } = primitives;

    /** Dictionary namespace owned by this plugin. */
    const NS = "ofttold-memory";

    const en = {
      nav: "Oft-told",
      title: "Oft-told",
      description: "A few notes from your memory folder ride along in every session, so recall stops depending on remembering to look. The name is the idea: what is told often enough stops needing to be remembered.",
      memoryDir: "Memory folder",
      memoryDirHint: "Markdown notes live here. Created with a starter file on first run.",
      sections: "Sections to keep visible",
      sectionsHint: "One heading per line, written exactly as it appears in your file.",
      sectionsComplexHint: "This config uses the object form (per-section file or budget), so it is edited in the profile file rather than here.",
      maxChars: "Characters per section",
      maxCharsHint: "600 characters is roughly 400 tokens, once per session.",
      header: "First line of the injected block",
      headerHint: "It arrives as a user message, so it must not read like something you just said.",
      refreshIntervalMs: "Minimum milliseconds between refreshes",
      refreshIntervalMsHint: "0 means inject once and never refresh.",
      refreshAfterMessages: "Refresh after this many messages",
      refreshAfterMessagesHint: "0 means never. Useful when a compactor folds old messages away.",
      workspaceRelative: "Resolve relative folders against the session",
      workspaceRelativeHint: "Off resolves them against the process directory instead.",
      overridden: "Overridden",
      reset: "Reset to default",
      readOnly: "This deployment stores settings read-only.",
      unavailable: "This plugin is not loaded, so it cannot be configured right now.",
      save: "Save",
      saving: "Saving…",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
      invalidNumber: "Enter a number, or leave blank to use the default.",
      diagnostics: "Troubleshooting",
      diagnosticsHint: "The plugin never fails a session to report a problem, so 'nothing was injected' stays silent by design — it only leaves a record here. The file holds paths and per-injection outcomes, never the text of your notes, so it is safe to paste into an issue.",
      copyReport: "Copy issue summary",
    };

    const zh = {
      nav: "拾光",
      title: "拾光",
      description: "把记忆文件夹里的几节带进每个会话，回忆就不再依赖「记得去看」。它叫拾光——把散落在字里行间的自己，一次一次拾回来。",
      memoryDir: "记忆文件夹",
      memoryDirHint: "markdown 笔记放在这里。第一次运行会自动创建并放一份起始文件。",
      sections: "常驻的小节",
      sectionsHint: "一行一个小节名，必须和文件里的标题一字不差。",
      sectionsComplexHint: "这份配置用了对象写法（某节单独的文件或预算），请在 profile 文件里改，这里只读。",
      maxChars: "每节字符上限",
      maxCharsHint: "600 字符约 400 token，每个会话一次。",
      header: "注入块的第一行",
      headerHint: "它以用户身份到达，所以不能写成像是你刚说的话。",
      refreshIntervalMs: "两次刷新的最小间隔（毫秒）",
      refreshIntervalMsHint: "0 表示只注入一次，之后不再刷新。",
      refreshAfterMessages: "新增多少条消息后刷新",
      refreshAfterMessagesHint: "0 表示从不。压缩器把旧消息折掉时有用。",
      workspaceRelative: "相对文件夹按会话工作目录解析",
      workspaceRelativeHint: "关掉则按进程目录解析。",
      overridden: "已覆盖",
      reset: "恢复默认",
      readOnly: "本部署的设置是只读的。",
      unavailable: "这个插件当前没有加载，无法配置。",
      save: "保存",
      saving: "保存中…",
      saveFailed: "本部署没有接受这些值，已保留供你修改。",
      invalidNumber: "请填数字；留空表示使用默认值。",
      diagnostics: "排查问题",
      diagnosticsHint: "插件从不因为出错而中断会话，所以「什么都没注入」不会报错——它只在这里留下记录。这个文件里有路径和每次注入的结果，但没有你笔记的正文，可以直接贴进 issue。",
      copyReport: "复制问题摘要",
    };

    /**
     * A config scope that follows whichever namespace the Host actually serves.
     *
     * Three separate facts force this indirection:
     *
     * 1. `configForms` may not be served yet. A client service that is still
     *    starting is `undefined` through `ctx.get()`, and reaching for
     *    `ctx.configForms` directly throws. Reads therefore go through a getter
     *    and degrade to `unavailable` until the service arrives.
     * 2. The namespace is not a stable string. A profile's insert row can be
     *    served as `ofttold-memory`, `include:ofttold-memory`, or the package
     *    name, and binding one exact string left every write refused while the
     *    controls still looked enabled.
     * 3. The describe mirror is the only honest answer to "what exists". It is
     *    refreshed on first miss and subscribed to, so a namespace that appears
     *    later still binds without a reload.
     *
     * Before the mirror answers, `writable` is false, so the page renders
     * read-only rather than offering controls that cannot save.
     */
    function liveScope(ctx) {
      let current;
      let currentOff;
      let mirrorOff;
      let refreshed = false;
      const listeners = new Set();
      const notify = () => {
        for (const listener of [...listeners]) listener();
      };
      const pick = (namespaces) =>
        namespaces.find((entry) => entry.ns === "ofttold-memory") ??
        namespaces.find((entry) => /ofttold-memory/i.test(entry.ns));
      const rebind = () => {
        const forms = ctx.get("configForms");
        let served;
        try {
          served = pick(forms?.describe().getSnapshot().view?.namespaces ?? []);
        } catch {
          served = undefined;
        }
        const next = served === undefined || forms === undefined ? undefined : forms.get(served.ns);
        if (next !== current) {
          currentOff?.();
          current = next;
          currentOff = current?.subscribe(notify);
          notify();
        }
        if (next === undefined && !refreshed) {
          refreshed = true;
          try {
            forms?.describe().load?.();
          } catch {}
        }
      };
      // The mirror is only subscribable once the service exists, and a service
      // that arrives after `apply` does NOT re-run `apply` — verified against the
      // real cordis Context. Waiting for it therefore has to be an event, not a
      // `ctx.inject` call: the dynamic client facade deliberately withholds
      // `inject` from its verb whitelist (only effect/on/once/provide/timer
      // helpers are exposed), so calling it here would throw in the browser.
      // `internal/service` fires on every provide, carrying the service name and
      // its value, and `on` is in that whitelist.
      const attach = () => {
        const forms = ctx.get("configForms");
        mirrorOff?.();
        mirrorOff = forms?.describe().subscribe?.(rebind);
        rebind();
      };
      const serviceOff = ctx.on?.("internal/service", (name) => {
        if (name !== "configForms") return;
        attach();
      });
      if (ctx.get("configForms") !== undefined) attach();
      return {
        getSnapshot: () => current?.getSnapshot() ?? { status: "unavailable", value: undefined, writable: false },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        /**
         * Release every subscription this scope holds.
         *
         * The service-event listener and the mirror subscription both outlive
         * `apply` unless they are dropped explicitly; without this, a page that is
         * unloaded and reloaded leaks one listener per load.
         */
        dispose: () => {
          currentOff?.();
          mirrorOff?.();
          serviceOff?.();
          current = undefined;
          listeners.clear();
        },
        // The form model writes through `mutate(ops, revision)`, never through a
        // per-field setter: a save is one atomic batch of JSON-patch operations
        // against the Host's revision. Forgetting this method makes every save
        // throw inside the shared model, which surfaces as "save did nothing".
        mutate: (ops, revision) => (current === undefined ? Promise.resolve(false) : current.mutate(ops, revision)),
      };
    }

    /**
     * Render a `sections` array as the one-heading-per-line text the field edits.
     *
     * Object entries are still flattened to their heading so the read-only view
     * shows what the file actually contains instead of a row of blanks; the
     * field is disabled in that case, so the flattened text is never written back.
     */
    function headingsOf(raw) {
      if (!Array.isArray(raw)) return "";
      return raw
        .map((entry) =>
          typeof entry === "string" ? entry : typeof entry?.heading === "string" ? entry.heading : "",
        )
        .join("\n");
    }

    class MemoryForm {
      constructor(scope) {
        this.scope = scope;
        this.form = new SettingsFormModel(scope, [
          { ...settingsTextField("memoryDir") },
          {
            ...settingsTextField("sections"),
            // Both directions are overridden: the shared text helpers only know
            // strings, so without these an array would render as "" and every
            // save would look like "unchanged" and write nothing.
            format: (value) => headingsOf(value),
            parse: (text) => {
              const lines = text
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== "");
              return lines.length === 0 ? { kind: "clear" } : { kind: "set", value: lines };
            },
          },
          { ...settingsNumberField("maxChars") },
          { ...settingsTextField("header") },
          { ...settingsNumberField("refreshIntervalMs") },
          { ...settingsNumberField("refreshAfterMessages") },
          {
            ...settingsTextField("workspaceRelative"),
            // Same trap in the boolean direction: `format` must round-trip the
            // value it parses, or the staged text never equals the stored value
            // and the field reads as permanently dirty.
            format: (value) => (typeof value === "boolean" ? String(value) : ""),
            parse: (text) => {
              const value = text.trim().toLowerCase();
              if (value === "") return { kind: "clear" };
              if (value === "true") return { kind: "set", value: true };
              if (value === "false") return { kind: "set", value: false };
              return undefined;
            },
          },
        ]);
        this.state = this.form.bind(() => {
          const value = this.form.field("sections");
          // `field()` yields `{ text, overridden, invalid }` — the *staged* text
          // form of the value, already formatted by the field's `format`. Reading
          // a `.value` that does not exist made this look like "nothing
          // configured" on every render, so the list always showed blank.
          const raw = this.rawValue("sections");
          // An object entry (`{ file, heading, maxChars, label }`) cannot be
          // represented in a one-heading-per-line text field. Round-tripping it
          // through text would replace the whole array on save and silently drop
          // every per-section file and budget, so the field is shown read-only
          // instead. Only the entries the text form can express are editable.
          const complex = Array.isArray(raw) && raw.some((entry) => typeof entry === "object" && entry !== null);
          return {
            ...this.form.shell(),
            memoryDir: this.form.field("memoryDir"),
            sections: complex ? { ...value, text: headingsOf(raw), invalid: false } : value,
            sectionsComplex: complex,
            maxChars: this.form.field("maxChars"),
            header: this.form.field("header"),
            refreshIntervalMs: this.form.field("refreshIntervalMs"),
            refreshAfterMessages: this.form.field("refreshAfterMessages"),
            workspaceRelative: this.form.field("workspaceRelative"),
          };
        });
      }
      /**
       * The stored value of one field, before the field's `format` touched it.
       *
       * `field()` deliberately hands back staged text; the raw value is only
       * reachable through the scope snapshot. Wrapped because a scope with no
       * served namespace has no snapshot to read.
       */
      rawValue(id) {
        const snapshot = this.scope?.getSnapshot?.();
        return snapshot?.value?.[id];
      }
      inject() {
        return { hooks: { memoryForm: this.state }, ...this.form.actions() };
      }
      dispose() {
        this.form.dispose();
      }
    }

    /**
     * The configuration page, rendered both as the bundle's own page and as a
     * settings section, because two entry points exist and duplicating the
     * component would let the two drift.
     */
    function MemoryPanel(props) {
      const { t } = props;
      const state = props.useMemoryForm((snapshot) => snapshot);
      if (props.view === "summary") return t("description");
      const disabled = !state.writable;
      // A config that uses the object form for any section is not editable here:
      // the text field can only express bare headings, so saving would rewrite
      // the array and drop every per-section file and budget. Showing it read-only
      // is honest; silently mangling it is not.
      const sectionsDisabled = disabled || state.sectionsComplex === true;
      // A plain HTML section rather than a primitives component: the panel must
      // stay usable even when the deployment ships a reduced primitive set, and
      // a diagnostic surface that needs a component to exist is not a diagnostic
      // surface. The path is what a user pastes into an issue; the summary is what
      // they paste when they cannot find the file.
      const diagnostics = h(
        "details",
        { className: "ofttold-diagnostics", style: { marginTop: "12px" } },
        h("summary", { style: { cursor: "pointer" } }, t("diagnostics")),
        h("p", { style: { margin: "8px 0", opacity: 0.8 } }, t("diagnosticsHint")),
        h(
          "p",
          { style: { margin: "8px 0" } },
          h("code", {}, state.memoryDir?.text ?? ""),
          " → ",
          h("code", {}, "~/.dsh/ofttold-memory/diagnostics.json"),
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              const summary = [
                "dsh-ofttold-memory issue report",
                `memoryDir: ${state.memoryDir?.text ?? "(not set)"}`,
                `sections: ${state.sections?.text ?? "(not set)"}`,
                `maxChars: ${state.maxChars?.text ?? "(not set)"}`,
                `refreshIntervalMs: ${state.refreshIntervalMs?.text ?? "(not set)"}`,
                `refreshAfterMessages: ${state.refreshAfterMessages?.text ?? "(not set)"}`,
                `workspaceRelative: ${state.workspaceRelative?.text ?? "(not set)"}`,
                `namespace served: ${state.available === true ? "yes" : "no"}`,
                `writable: ${state.writable === true ? "yes" : "no"}`,
                "diagnostics file: ~/.dsh/ofttold-memory/diagnostics.json",
              ].join("\n");
              // `navigator.clipboard` is absent on insecure origins, so the button
              // must not be the only way to get the text out: it also selects the
              // summary in place, and the hint tells the user to copy manually.
              const clipboard = globalThis.navigator?.clipboard;
              if (clipboard?.writeText !== undefined) {
                clipboard.writeText(summary).catch(() => {});
              }
            },
          },
          t("copyReport"),
        ),
      );

      const field = (id, label, hint, extra) =>
        h(SettingsValueField, {
          id: `ofttold-${id}`,
          label: t(label),
          hint: t(id === "sections" && state.sectionsComplex ? "sectionsComplexHint" : hint),
          overriddenLabel: t("overridden"),
          resetLabel: t("reset"),
          invalidLabel: t("invalidNumber"),
          disabled: id === "sections" ? sectionsDisabled : disabled,
          ...state[id],
          onEdit: (text) => props.edit(id, text),
          onReset: () => props.resetField(id),
          ...extra,
        });
      return h(
        SettingsForm,
        {
          labels: {
            unavailable: t("unavailable"),
            readOnly: t("readOnly"),
            saveFailed: t("saveFailed"),
            save: t("save"),
            saving: t("saving"),
          },
          state,
          onSave: props.save,
          onDiscard: props.discard,
        },
        field("memoryDir", "memoryDir", "memoryDirHint"),
        field("sections", "sections", "sectionsHint"),
        field("maxChars", "maxChars", "maxCharsHint", { numeric: true }),
        field("header", "header", "headerHint"),
        field("refreshIntervalMs", "refreshIntervalMs", "refreshIntervalMsHint", { numeric: true }),
        field("refreshAfterMessages", "refreshAfterMessages", "refreshAfterMessagesHint", { numeric: true }),
        field("workspaceRelative", "workspaceRelative", "workspaceRelativeHint"),
        diagnostics,
      );
    }

    return {
      // `configForms` is deliberately NOT in this list. A client service listed
      // here is a hard dependency: while it is unserved the whole client half
      // never applies, so the page silently never appears and the plugin looks
      // installed-but-dead. It is probed through `ctx.get()` instead, which
      // returns undefined rather than throwing, and the page registers anyway so
      // it can show itself as unavailable until the service arrives.
      inject: ["slots", "locale"],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ofttold-memory: dictionaries");

        // The namespace this page edits is the Host entry id, which is not a
        // stable string: a bundle insert row can surface as `ofttold-memory`,
        // `include:ofttold-memory`, or the package name depending on how the
        // profile composed it. Matching one exact string bound the form to a
        // namespace the Host may never serve, so every write was refused while
        // the controls stayed enabled. The scope therefore follows whatever the
        // describe mirror currently lists.
        const scope = liveScope(ctx);
        const form = new MemoryForm(scope);
        ctx.effect(() => () => {
          form.dispose();
          scope.dispose();
        }, "ofttold-memory: form subscription");

        // Registered unconditionally: the card must exist before configForms
        // answers, or the page cannot report that it is waiting. A slot-API
        // breakage degrades to a console.error instead of failing the loader.
        // Two seats, deliberately. `plugins.bundle.config` is where someone who
        // opened this plugin's own card expects its settings to live; the
        // top-level `settings.section` is the shorter path the sidebar settings
        // dialog offers, so a user does not have to find the plugin card first.
        // Both render the same panel over the same scope, so a value saved in one
        // place is the same value the other reads.
        ctx.effect(
          () =>
            ctx.slots.inject("plugins.bundle.config", () =>
              ctx.slots.register(
                {
                  name: "plugins.bundle.config",
                  key: "dsh-ofttold-memory",
                  locale: NS,
                  inject: () => form.inject(),
                },
                MemoryPanel,
              ),
            ),
          "ofttold-memory: bundle page",
        );

        // `order: 35` sits between Agent presets (20) and the plugin market (40):
        // memory is a personal preference, not a plugin-management concern, and it
        // should not be pushed to the bottom of a growing list.
        ctx.effect(
          () =>
            ctx.slots.inject("settings.section", () =>
              ctx.slots.register(
                {
                  name: "settings.section",
                  id: "ofttold-memory",
                  order: 35,
                  label: () => t("nav"),
                  locale: NS,
                  inject: () => form.inject(),
                },
                MemoryPanel,
              ),
            ),
          "ofttold-memory: settings section",
        );
      },
    };
  },
});
