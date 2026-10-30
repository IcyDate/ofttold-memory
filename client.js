window.__ModuleLoader__.load({
  id: "ofttold-memory",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { SettingsForm, SettingsValueField, settingsTextField, settingsNumberField, SettingsFormModel } = primitives;

    /** Dictionary namespace owned by this plugin. */
    const NS = "ofttold-memory";

    /**
     * 页脚要显示版本号。浏览器里拿不到 package.json，所以只能写死一份——那就用一条
     * 测试盯着它，免得发布时忘了改：版本是唯一会「安静地过期」的东西。
     */
    const VERSION = "0.1.2";
    const REPO = "https://github.com/IcyDate/ofttold-memory";

    const en = {
      nav: "Oft-told",
      title: "Oft-told",
      description: "Your notes stay in the room in every session, so you stop depending on remembering to look. The name is the idea: what is told often enough stops needing to be remembered.",
      memoryDir: "Where your notes live",
      memoryDirHint: "Created with a starter file on first run, so you can leave this alone. Point it at a folder you already keep and the plugin only reads it.",
      sections: "Which parts it should remember",
      sectionsHint: "Write the headings as they appear in your notes, one per line.",
      sectionsComplexHint: "This config names a separate file or budget per section, so edit it in the profile file rather than here.",
      maxChars: "How much of each section to read",
      maxCharsHint: "Longer text is cut. 600 characters is about 400 tokens, charged once per session.",
      header: "The line that opens the block",
      headerHint: "It tells the model this is background, not something you said. Usually no need to change it.",
      refreshIntervalMs: "Bring the notes in again every",
      refreshIntervalMsHint: "In milliseconds, within one session. 0 means once at the start; 60000 means at most once a minute.",
      refreshAfterMessages: "Bring them in again after how many messages",
      refreshAfterMessagesHint: "0 means never. Only needed in long sessions, where the notes get pushed out of the context.",
      workspaceRelative: "Count relative paths from this session's folder",
      workspaceRelativeHint: "On, paths are resolved against the folder this session runs in. Off, against the folder the process started in. Usually leave it on.",
      anchorCap: "Keep how many lines in view",
      anchorCapHint: "0 turns it off.",
      diaryCadence: "Expected to grow how often",
      diaryCadenceHint: "daily / weekly / off. Weekly stays quiet while anything was written in the last 7 days. No diary folder means silence either way.",
      summaryFrom: "Expect the day's summary from",
      summaryFromHint: "HH:mm. Before this hour the top-of-file summary is not required; after it, a summary the body has run past is named.",
      diarySections: "Sections a single day may hold",
      diarySectionsHint: "Past this the entry stops being a record and becomes a transcript. Three to five is the normal range.",
      diaryCheck: "Check today's entry",
      diaryCheckHint: "Names what is wrong with today's entry.",
      cardNotes: "Your notes",
      cardDiary: "The diary",
      cadenceDaily: "Daily",
      diaryCheckWhy: "Because a missing emotion line or a tag outside the vocabulary makes that day unreachable later — and nothing about it looks wrong at the time. The check reports these; it never edits your entry.",
      anchorCapWhy: "Any more than about eight standing facts stops being a reminder and becomes a second document. Past the cap the oldest and least-recalled lines stop being injected but stay in the file.",
      skillsWhy: "Two how-to documents: how to write a diary entry, and how to edit the who-I-am file. They load on demand rather than every session.",
      cadenceWeekly: "Weekly",
      cadenceOff: "Off",
      advanced: "More settings",
      advancedHint: "Refresh behaviour, path resolution, and the writing guides. Defaults are fine for most setups.",
      skills: "Ship the two writing guides",
      skillsHint: "关掉不影响笔记，只是模型手边少两份说明书。".replace("关掉不影响笔记，只是模型手边少两份说明书。", "Two how-to documents the model can open when writing. Off leaves your notes working."),
      starLead: "Finding it useful?",
      starLink: "Star it on GitHub",
      feedbackLink: "Feedback or an issue",
      overridden: "Overridden",
      reset: "Reset to default",
      readOnly: "This deployment stores settings read-only.",
      unavailable: "This plugin is not loaded, so it cannot be configured right now.",
      save: "Save",
      saving: "Saving…",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
      invalidNumber: "Enter a number, or leave blank to use the default.",
      diagnostics: "Troubleshooting",
      diagnosticsHint: "The plugin never fails a session to report a problem, so 'the notes never arrived' stays silent by design — it only leaves a record here. The file holds paths and per-injection outcomes, never the text of your notes, so it is safe to paste into an issue.",
      copyReport: "Copy issue summary",
    };

    const zh = {
      nav: "拾光",
      title: "拾光",
      description: "你的笔记在每个会话里都在场，不用再依赖「记得去看」。它叫拾光——把散落在字里行间的自己，一次一次拾回来。",
      memoryDir: "你的笔记文件夹在哪",
      memoryDirHint: "第一次使用会自动建好并放一份起始文件，所以这里可以不管。已经有笔记文件夹的话，把路径指过去就行，插件只读不写。",
      sections: "想让它记住哪几段",
      sectionsHint: "写笔记里的小标题原文，一行一个，可以写好几段。",
      sectionsComplexHint: "这份配置给每段单独指定了文件或字数，请在 profile 文件里改，这里只读。",
      maxChars: "每段最多读多少字",
      maxCharsHint: "太长会被截断。600 字大约 400 token，一个会话只算一次。",
      header: "这段记忆开头的说明",
      headerHint: "它要告诉模型「这是背景资料，不是用户说的话」。一般不用改。",
      refreshIntervalMs: "隔多久再带一次笔记",
      refreshIntervalMsHint: "单位毫秒，只在同一个会话里算。0 = 开头带一次就够；60000 = 最多每分钟再带一次。",
      refreshAfterMessages: "聊过多少条消息后再带一次",
      refreshAfterMessagesHint: "0 = 不再带。只有会话特别长、前面的笔记被挤掉时才需要。",
      workspaceRelative: "相对路径从这次会话的目录算",
      workspaceRelativeHint: "开着按这次会话的目录算，关掉按程序启动时的目录算。一般保持开着。",
      anchorCap: "一节里最多摆几条",
      anchorCapHint: "填 0 关掉。",
      diaryCadence: "多久写一次",
      diaryCadenceHint: "daily 每天催 / weekly 最近 7 天有写过就不催 / off 永不提醒。没有 diary 目录时三种都闭嘴。",
      summaryFrom: "从几点开始要求当天摘要",
      summaryFromHint: "HH:mm。这个点之前不要求顶部摘要；之后摘要落后于正文就会被点名。",
      diarySections: "一天最多几节",
      diarySectionsHint: "超过就不像记录了，像流水账。三五节是正常量。",
      diaryCheck: "检查今天那篇日记",
      diaryCheckHint: "把今天那篇的问题说出来。",
      cardNotes: "你的笔记",
      cardDiary: "日记",
      cadenceDaily: "每天",
      diaryCheckWhy: "因为缺一行情绪、或者标签不在词表里，那天的记忆以后就找不回来了——而当时看着完全正常。这里只把问题说出来，不会改你写的东西。",
      anchorCapWhy: "超过八条左右，「常被提起」就不再是提醒，而是第二份文档了。超出的会按权重沉底：不再注入，但留在文件里。",
      skillsWhy: "两份「怎么做」的说明：日记怎么写、我是谁那份文件怎么改。需要时才打开，不是每次都带上。",
      cadenceWeekly: "每周",
      cadenceOff: "关掉",
      advanced: "更多设置",
      advancedHint: "重新注入的时机、路径从哪算、以及那两份写作说明。默认值大多数情况都够用。",
      skills: "附带那两份写作说明",
      skillsHint: "两份「怎么做」的说明书，写的时候才打开。关掉不影响笔记。",
      starLead: "觉得好用？",
      starLink: "去 GitHub 点个 Star",
      feedbackLink: "反馈建议 / 提 issue",
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
          { ...settingsNumberField("anchorCap") },
          { ...settingsTextField("diaryCadence") },
          { ...settingsTextField("summaryFrom") },
          { ...settingsNumberField("diarySections") },
          {
            ...settingsTextField("diaryCheck"),
            format: (value) => (typeof value === "boolean" ? String(value) : ""),
            parse: (text) => {
              const value = text.trim().toLowerCase();
              if (value === "") return { kind: "clear" };
              if (value === "true") return { kind: "set", value: true };
              if (value === "false") return { kind: "set", value: false };
              return undefined;
            },
          },
          {
            ...settingsTextField("skills"),
            format: (value) => (typeof value === "boolean" ? String(value) : ""),
            parse: (text) => {
              const value = text.trim().toLowerCase();
              if (value === "") return { kind: "clear" };
              if (value === "true") return { kind: "set", value: true };
              if (value === "false") return { kind: "set", value: false };
              return undefined;
            },
          },
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
                "ofttold-memory issue report",
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

      // 勾选框而不是输入框：这个值只有开/关两种，让用户手打 true/false 是在暴露
      // 内部表示。宿主自带的表单只认文本和数字，所以这里用原生 input 自己画——
      // 与上面那个自带 DOM 的排查面板同一个理由：不依赖更高级的组件存在。
      // 页脚：版本 + Star + 反馈入口。装完插件的人通常只会打开这个面板，
      // 这是他们唯一能看到「这东西去哪儿提意见」的地方。
      const footer = h(
        "p",
        {
          style: {
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid rgba(127,127,127,0.25)",
            opacity: 0.75,
            fontSize: "0.9em",
          },
        },
        `v${VERSION}`,
        " · ",
        t("starLead"),
        " ",
        h("a", { href: REPO, target: "_blank", rel: "noreferrer noopener" }, t("starLink")),
        " · ",
        h("a", { href: `${REPO}/issues`, target: "_blank", rel: "noreferrer noopener" }, t("feedbackLink")),
      );

      // ---- 一组控件自己画 -------------------------------------------------------
      // 不再用宿主的 SettingsValueField：它每一块自带下边框，并排两列时那几道线会变成
      // 断开的横线（截图里那两条）。自己画还有一个好处——「同类放一张卡片、卡片有标题」
      // 和「? 小提示」都能做到，不用猜宿主的原子类名。
      const CARD = {
        border: "1px solid rgba(127,127,127,0.25)",
        borderRadius: "10px",
        padding: "4px 16px 14px",
        marginTop: "12px",
      };
      const CARD_TITLE = { margin: "12px 0 0", fontSize: "0.95em", fontWeight: 600, opacity: 0.85 };
      const INPUT = {
        width: "100%",
        boxSizing: "border-box",
        padding: "7px 10px",
        borderRadius: "6px",
        border: "1px solid rgba(127,127,127,0.4)",
        background: "transparent",
        color: "inherit",
        font: "inherit",
      };
      const HINT = { margin: "6px 0 0", opacity: 0.65, fontSize: "0.86em", lineHeight: 1.45 };
      const CELL = { padding: "10px 0 0" };

      const helpDot = (id) => {
        const why = t(`${id}Why`);
        if (why === `${id}Why`) return null; // 没写说明就不画问号
        return h(
          "span",
          {
            title: why,
            "aria-label": why,
            style: {
              marginLeft: "6px",
              opacity: 0.55,
              cursor: "help",
              border: "1px solid currentColor",
              borderRadius: "50%",
              display: "inline-block",
              width: "13px",
              height: "13px",
              lineHeight: "12px",
              textAlign: "center",
              fontSize: "10px",
              verticalAlign: "middle",
            },
          },
          "?",
        );
      };

      const labelRow = (id, reset) =>
        h(
          "div",
          { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" } },
          h(
            "label",
            { htmlFor: `ofttold-${id}`, style: { fontSize: "0.92em", opacity: 0.9 } },
            t(id),
            helpDot(id),
          ),
          reset,
        );

      // 覆盖过才出现的两个小动作，和宿主原来的行为一致。
      const resetFor = (id) =>
        state[id]?.overridden === true
          ? h(
              "button",
              {
                type: "button",
                disabled,
                onClick: () => props.resetField(id),
                style: {
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  opacity: 0.6,
                  fontSize: "0.82em",
                  cursor: disabled ? "default" : "pointer",
                  padding: 0,
                },
              },
              t("reset"),
            )
          : null;

      const control = (id, { numeric = false } = {}) =>
        h("input", {
          id: `ofttold-${id}`,
          type: "text",
          inputMode: numeric ? "numeric" : undefined,
          value: state[id]?.text ?? "",
          disabled,
          onChange: (event) => props.edit(id, event.target.value),
          style: INPUT,
        });

      const field = (id, opts = {}) =>
        h(
          "div",
          { style: CELL },
          labelRow(id, resetFor(id)),
          control(id, opts),
          h("p", { style: HINT }, t(`${id}Hint`)),
        );

      const selectRow = (id, options) =>
        h(
          "div",
          { style: CELL },
          labelRow(id, resetFor(id)),
          h(
            "select",
            {
              id: `ofttold-${id}`,
              disabled,
              value: String(state[id]?.text ?? "").trim() === "" ? options[0][0] : String(state[id].text).trim(),
              onChange: (event) => props.edit(id, event.target.value),
              style: INPUT,
            },
            ...options.map(([value, labelKey]) => h("option", { value }, t(labelKey))),
          ),
          h("p", { style: HINT }, t(`${id}Hint`)),
        );

      const booleanRow = (id) =>
        h(
          "div",
          { style: CELL },
          h(
            "label",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: disabled ? "default" : "pointer",
                fontSize: "0.92em",
              },
            },
            h("input", {
              id: `ofttold-${id}`,
              type: "checkbox",
              checked: String(state[id]?.text ?? "").trim().toLowerCase() === "true",
              disabled,
              onChange: (event) => props.edit(id, event.target.checked ? "true" : "false"),
            }),
            h("span", {}, t(id), helpDot(id)),
          ),
          h("p", { style: { ...HINT, marginLeft: "22px" } }, t(`${id}Hint`)),
        );

      const COLUMNS = (children) =>
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 18px" } },
          ...children,
        );
      const wide = (node) => h("div", { style: { gridColumn: "1 / -1" } }, node);

      const card = (titleKey, children) =>
        h("section", { style: CARD }, h("h4", { style: CARD_TITLE }, t(titleKey)), ...children);

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
        card("cardNotes", [
          wide(field("memoryDir")),
          wide(field("sections")),
          COLUMNS([field("maxChars", { numeric: true }), field("anchorCap", { numeric: true })]),
        ]),
        card("cardDiary", [
          COLUMNS([
            selectRow("diaryCadence", [
              ["daily", "cadenceDaily"],
              ["weekly", "cadenceWeekly"],
              ["off", "cadenceOff"],
            ]),
            field("summaryFrom"),
            field("diarySections", { numeric: true }),
            wide(booleanRow("diaryCheck")),
          ]),
        ]),
        h(
          "details",
          { className: "ofttold-advanced", style: { ...CARD, paddingTop: "12px" } },
          h("summary", { style: { cursor: "pointer", opacity: 0.85, fontSize: "0.95em" } }, t("advanced")),
          h("p", { style: HINT }, t("advancedHint")),
          COLUMNS([
            wide(field("header")),
            field("refreshIntervalMs", { numeric: true }),
            field("refreshAfterMessages", { numeric: true }),
            wide(booleanRow("workspaceRelative")),
            wide(booleanRow("skills")),
          ]),
        ),
        diagnostics,
        footer,
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
                  key: "ofttold-memory",
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
