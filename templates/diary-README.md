# diary/ — 一天一个文件 / one file per day

File name: `YYYY-MM-DD.md`, for example `2026-10-29.md`. If today's file already
exists, append a `## HH:mm` section instead of starting a new file.

Write what the day **grew**, not what happened in order — a question and its answer
written out verbatim is a log, not a diary. See the `ofttold-ritual` skill for the
four rituals (entry, index line, emotion tag, relationship.md).

A normal day is three to five sections. Past eight, the bar has slipped.

## The shape of one day

```markdown
# 2026-10-30

## 今天（17:40 更新）

Two or three sentences: what the day was, what it was like. Grumbling belongs here.

## 09:50 what got done

情绪：松

## 17:40 what else got done

情绪：定
```

**The `## 今天` block goes at the top and is rewritten as you go.** Whoever opens the
file reads the day before the detail; nobody scrolls to the end of a transcript to find
out how it went. Refresh it in the same breath as writing a section — the same act of
attention, not a second evening task. The `（HH:mm 更新）` stamp is what the plugin
compares against the body, so an entry that keeps growing after its summary is visible
instead of quietly wrong.

**Every `##` section carries one `情绪：<word>` line**, and the word must be in the
`情绪词表` section of `relationship.md`. That line is half of the loop: the live value in
the cache is copied from it, and the two are matched later. A section without one does not
fail — it just stops being reachable.

