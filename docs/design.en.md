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

## `refreshAfterMessages`

A context compactor folds old messages into summaries. The injected block is one
old message, so an aggressively compacting session will eventually fold it away.

`refreshAfterMessages` re-injects once the message count passes a threshold. It is
an approximation — compaction rewrites payloads without adding messages, so message
count does not measure compaction directly — but compaction correlates with message
growth, and the cost of guessing wrong is one extra injection.
