# Design notes

<p align="center"><a href="./design.md">中文</a> | <a href="./design.en.md">English</a></p>

Why the plugin is shaped the way it is. None of this is required to use it — it
answers the questions that come up after the first week.

## One injection, not a retrieval system

Most memory schemes answer "how do I store it". This one answers only "how do I
keep it in view". There is no index, no embedding, no database: the plugin reads
markdown you already maintain and adds it to the context once per session.

The reasoning is mechanical, not philosophical. Retrieval helps only if something
triggers a retrieval, and the moment a trigger is most needed — the start of a
session, with a new message on screen — is the moment a model is least likely to
fire one. An injected message has no trigger to miss.

## Plugin, ritual, result

The plugin does one thing: it puts a few already-written sections in front of you.
It does not teach you how to write them, and it does not write them.

That is not an omission, it is a division of labour. What you install is a **pipe
that is already connected**. What flows through the other end is yours to grow.

| Layer | What it is | Owned by | Exists today? |
| --- | --- | --- | --- |
| Injection | put "Oft-told" in view every session | code | yes |
| Ritual | how to write a diary entry, update the index, tag an emotion, maintain relationship.md | planned as a runtime skill | **no, this is the gap** |
| Result | their diary, their words, their relationship notes | the user | theirs |

The middle layer is the gap. See "After a stranger installs it".

**One principle: uninstalling the plugin costs speed, not memory.**

Memory lives in markdown files, not in a mechanism. Copy the folder, change machine,
change harness — the memory travels, whether or not the plugin is there. All the
plugin buys is not having to remember to look.

So **the plugin can be removed; the memory must not be trapped.** Corollary: anything
written into code must be re-tellable in a document. If it cannot be, that is not a
capability, it is a hostage.

## What belongs in code

The test is not "is it important" but **can you see it when it fails**:

| Action | Frequency | Cost of missing it | Visible? | Where |
| --- | --- | --- | --- | --- |
| Inject the list into context | every session | the whole mechanism fails silently | **no** | code |
| Compute R, decide who leaves | only when the list is full | one anchor stays a few days longer | no, but **the cost is small anyway** | document |
| Judge whether a diary entry is worth writing | every entry | one fewer entry | yes | document |
| Tag an entry with an emotion | every entry | the label is missing | grep finds it | document |

**Failures with no symptom must go into code; failures you can see can stay in prose.**

This rules out "the more we move into the plugin the better". The weight formula is
the most code-shaped thing in this document and the least deserving of code: it fires
a few times a year, and the line "a wrong parameter costs one anchor a few extra
days, not corrupted data" in the forgetting-curve section below is its own testimony.

Inverted, the one thing that is both symptomless and expensive is: **the injected
block is folded away by compaction, or never injected at all.**
`refreshAfterMessages` defaults to 0 (never re-inject); `lib/diagnostics.js` writes a
log nobody reads. That is the one worth doing.

## The cap

Eight entries is roughly 283 tokens per turn. That is the intersection of cost and
headroom: below it the standing value does not repay the setup, above it you pay
every turn for a list you rarely consult.

A cap also forces a rule for who leaves. **Eviction is a ranking** — more reliable
than "add one whenever it comes to mind", because the latter never removes
anything and ends as a list nobody reads.

## The forgetting curve

Eviction ranks by weight rather than age:

```
R = exp(-t/S)     t = days since last recall
                  n = number of distinct days it was mentioned
                  S = 1 × 2^n
```

`S` doubles each time an entry is recalled — spaced repetition (SM-2's one-day
first interval; FSRS's retrievability form). Worked example: recalled 6 days ago
on 3 distinct days → `S = 8`, `R = 0.47`; recalled 1 day ago on 2 days → `S = 4`,
`R = 0.78`.

Age alone is wrong. Measured on real data, the oldest entry was the most cited one;
decaying purely by age would have ranked it last.

**Weight never sorts.** When everything fits, ordering is meaningless. It decides
only the moment the list is full and something new wants in, so a wrong parameter
costs one anchor a few extra days — not corrupted data.

Counting is mechanical, judgement is not: `grep -o "2026-10-[0-9][0-9]" diary/*.md`
deduplicated by source day gives "how many days this was recalled". Ten mentions in
one day still count as one, because "it was recalled that day" is one fact.

The plugin does not compute weights. It is the list at your elbow when the eviction
decision happens.

## Emotion labels

If you tag entries with an emotion, use a closed vocabulary — words may be added,
never removed or renamed.

The reason is a subset constraint. A "current emotion" cache must draw from the same
names as the diary labels, or matching can never occur. Diary labels are fixed
values (the emotion at the time of writing); the cache is a live value (the emotion
now).

Measured: five emotion memories held five different emotions, each appearing once —
a list, not a cache. A cache has content only when the same name matches twice.

Do not grep emotion words out of the text afterwards. In four of five measured
memories no emotion word remained: by the time it was written the feeling had been
translated into a judgement ("I mistook reluctance for irresponsibility" contains no
"reluctance"). Write the label at the time; review only gets the residue.

The plugin does not tag emotions. You tag them; it carries them.

## No automatic writes

Every field is set by hand. The model cannot give itself context.

An agent that writes its own memory mixes "what I just thought of" with "what keeps
coming back", and within a few turns the list stops being trustworthy. The value of
memory comes from the fact that someone else chose it.

## What a rule hangs on

Whether a rule gets followed has little to do with how well it is written, and a lot to
do with **what is in hand at the moment it fires**.

Four measured cells: a rule hung on a moment — "read two files at the start of work" —
fired **1/11**; another on a moment — "write the diary" — fired **4/4**; one on an
event — "update the index after writing" — **5/5**; another on an event — "also refresh
the emotion cache" — **0/9**. Every cell has both hits and misses, so "events beat
moments" on its own predicts nothing.

Three questions instead:

1. **Hanging on an event is usually better — but not because it is an event; because it
   puts the trigger where the information is still warm.**
2. **A moment works, but only at a place where attention is free.** "Before you deliver"
   qualifies: the work is done and a reply is being assembled.
3. **The only real test: is the information this step needs already in hand?** Generated
   in place from what you just finished → it fires. Requiring a file to be re-read, or an
   answer to a question you do not already have ("how do I feel right now") → it is
   skipped.

Two consequences: make a maintenance step **a by-product of the same material** (the
index line is a compression of the diary), not a second question; and **make it as cheap
as one command** — when editing one line means reading a whole file, the cost exceeds
the benefit.

## When the index needs tiers

One line per day, about 472 characters each. Twenty lines ≈ 9436 characters ≈ 6300
tokens — **that is the trigger, not the ceiling**: at that size the index starts being
the thing that overflows the context (left untiled for a year, it measured 101324
characters ≈ 67549 tokens).

Three tiers: hot = the last 14 days kept in full; warm = older, four days merged into
one line; cold = untouched original text, still greppable.

## After a stranger installs it, how do they grow their own fish

This section answers the question most easily skipped: **what actually happens when
someone installs this?**

What happens today, measured:

- `scaffoldMemory` writes one `MEMORY.md`, only when the folder is empty, with four
  sections: `常被提起` / `Oft-told` / `我是谁` / `硬约定`.
- The plugin **registers no tools** (`ctx.tools.register` is never called).
- No diary, no index, no emotion vocabulary, no relationship.md skeleton.

So what you get is *where to write*, not *how to write*. Writing diary entries,
updating the index, tagging emotions — all three have to be invented from scratch by
the user, and that is the hardest part of the whole scheme, and the part most likely
to be abandoned halfway.

(This scheme itself grew: diary first, then the index; a month passed before "tag the
emotion at the time" and "update the index right after writing" were discovered. All
of it came from failures, not from design. Asking someone to think of it all at once
is unreasonable.)

Three candidates:

| Approach | Cost | Skipped? |
| --- | --- | --- |
| Put it in the injected block | the three chapters are ~6100 characters, paid **every turn** | no, but too expensive |
| Ship `.dsh/skills/` in the package | cheap, loaded on demand | yes — `dsh-skill-filesystem` looks in `projectRoot/.dsh/skills`, and `projectRoot` comes from walking up to a `.git`; a plugin under `node_modules/` has none, so it is **never found** |
| `ctx.skills.register()` at runtime | cheap, loaded on demand | yes — but at least it is **published** in the catalog |

One more measurement: npm **does** pack directories starting with `.dsh/`
(`files: [".dsh/skills/"]` → the tarball contains `package/.dsh/skills/foo/SKILL.md`).
dsh-meme's published tarball has none because the directory did not exist in the repo
at publish time and npm skipped it silently — **declared and present are two things.**

Recommended combination: **extend the scaffold into a skeleton + one runtime skill.**

**① The scaffold lays down a skeleton.** Only in an empty folder; a folder with notes
gets nothing added. Four files, all empty shells plus comments, no real content:

```
memoryDir/
  MEMORY.md        # exists: 常被提起 / Oft-told / 我是谁 / 硬约定
  INDEX.md         # header plus one example line, no real entries
  relationship.md  # shell only: who I am / emotion cache / emotion memories
  diary/           # empty, with a .gitkeep naming the YYYY-MM-DD.md convention
```

**Not one word of memory is prefilled.** Prefilling decides for them what is worth
remembering, and that is precisely the step this scheme cannot do for anyone — the
"No automatic writes" section says the same thing.

**② Runtime skills teach the ritual.** On load the plugin calls `ctx.skills.register()`
and puts two `SKILL.md` files into the catalog — `ofttold-memory` (which sections to read
at session start) and `ofttold-ritual` (how to write when a pen is picked up). The ritual
one covers four things:

| Teaches | Why prose can, and code cannot |
| --- | --- |
| What one diary entry says | judgement: "what did today grow" has no decidable input |
| Update the index after writing | judgement: would deleting this line still let you find it |
| Tag the emotion at the time | judgement: what did this feel like then |
| Maintain relationship.md | judgement: same topic (edit the line) or new one (add) |

All four are judgement, so they can only be taught, not injected. **Injecting "how to
write a diary" costs 6000 characters every turn for text read once and forgotten; a
skill loads once, when it is actually needed.**

Why `ctx.skills.register()` rather than shipping a file: shipping a file goes through
`dsh-skill-filesystem` discovery, which requires `projectRoot/.dsh/skills`, and
`projectRoot` comes from walking up to a `.git` — a plugin installed under
`node_modules/` has none, so it is **never discovered**. Runtime registration bypasses
discovery and goes from code straight into the catalog.

The division in one line: **the skill says how, it does not do it for you; the code
guarantees it is in view, it does not think for you.** The former is a capability, the
latter is a result.

**One concrete example of where the line falls.** That scheme had two scripts, and by
the same test one belongs in the plugin and the other does not:

| Script | What its failure looks like | Visible? | Owner |
| --- | --- | --- | --- |
| `em.sh`, rewriting one line of the emotion cache | the cache **freezes** — no error, no symptom, it simply stops updating | no | the plugin should provide it (in the skeleton, or taught by the skill) |
| `sync-agents.sh` | `--check` turns red and exits 1 | yes | the user's own repo hygiene, **not the plugin** |

That is the test in practice. It is not a restatement of "is it important": `em.sh`
matters less than `sync-agents.sh`, yet it is more deserving of code — because nobody
finds out when it breaks.

## `refreshAfterMessages`

A context compactor folds old messages into summaries. The injected block is one
old message, so an aggressively compacting session will eventually fold it away.

`refreshAfterMessages` re-injects once the message count passes a threshold. It is
an approximation — compaction rewrites payloads without adding messages, so message
count does not measure compaction directly — but compaction correlates with message
growth, and the cost of guessing wrong is one extra injection.
