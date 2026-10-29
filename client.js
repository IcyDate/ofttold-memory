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
      nav: "Memory",
      title: "Memory",
      description: "A few notes from your memory folder ride along in every session, so recall stops depending on remembering to look.",
      memoryDir: "Memory folder",
      memoryDirHint: "Markdown notes live here. Created with a starter file on first run.",
      sections: "Sections to keep visible",
      sectionsHint: "One heading per line, written exactly as it appears in your file.",
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
      openFile: "Open the memory file",
      fileMissing: "Not created yet — the first session will make it.",
    };

    const zh = {
      nav: "记忆",
      title: "记忆",
      description: "把记忆文件夹里的几节带进每个会话，回忆就不再依赖「记得去看」。",
      memoryDir: "记忆文件夹",
      memoryDirHint: "markdown 笔记放在这里。第一次运行会自动创建并放一份起始文件。",
      sections: "常驻的小节",
      sectionsHint: "一行一个小节名，必须和文件里的标题一字不差。",
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
      openFile: "打开记忆文件",
      fileMissing: "还没建——第一次开会话时会自动建。",
    };

    /** Fields this page stages, in render order. */
    const FIELDS = [
      "memoryDir",
      "sections",
      "maxChars",
      "header",
      "refreshIntervalMs",
      "refreshAfterMessages",
      "workspaceRelative",
    ];

    /**
     * Stage the entry's config into a form the shared Plugins page can save.
     *
     * The list and boolean fields need explicit parse rules: the shared model
     * only knows how to stage text and numbers, and a `sections` list typed as
     * text must become an array before it reaches the Host schema.
     */
    class MemoryForm {
      constructor(scope) {
        this.form = new SettingsFormModel(scope, [
          { ...settingsTextField("memoryDir") },
          {
            ...settingsTextField("sections"),
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
            parse: (text) => {
              const value = text.trim().toLowerCase();
              if (value === "" ) return { kind: "clear" };
              if (value === "true") return { kind: "set", value: true };
              if (value === "false") return { kind: "set", value: false };
              return undefined;
            },
          },
        ]);
        this.state = this.form.bind(() => {
          const value = this.form.field("sections");
          return {
            ...this.form.shell(),
            memoryDir: this.form.field("memoryDir"),
            // The Host stores a list; the text field shows one heading per line.
            sections: Array.isArray(value?.value) ? value.value.join("\n") : value,
            maxChars: this.form.field("maxChars"),
            header: this.form.field("header"),
            refreshIntervalMs: this.form.field("refreshIntervalMs"),
            refreshAfterMessages: this.form.field("refreshAfterMessages"),
            workspaceRelative: this.form.field("workspaceRelative"),
          };
        });
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
      const field = (id, label, hint, extra) =>
        h(SettingsValueField, {
          id: `ofttold-${id}`,
          label: t(label),
          hint: t(hint),
          overriddenLabel: t("overridden"),
          resetLabel: t("reset"),
          invalidLabel: t("invalidNumber"),
          disabled,
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
      );
    }

    return {
      inject: ["slots", "locale", "configForms"],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ofttold-memory: dictionaries");

        // The Host entry id is the profile's patch row id, which the bundle's
        // own patch declares as `ofttold-memory`. Reading a form for an entry
        // this deployment never composed leaves it unavailable rather than
        // failing, so the page simply does not appear.
        const scope = ctx.configForms.get("ofttold-memory");
        const form = new MemoryForm(scope);
        ctx.effect(() => () => form.dispose(), "ofttold-memory: form subscription");

        ctx.effect(
          () =>
            ctx.configForms.whileServed(["ofttold-memory"], () =>
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
            ),
          "ofttold-memory: bundle page",
        );
      },
    };
  },
});
