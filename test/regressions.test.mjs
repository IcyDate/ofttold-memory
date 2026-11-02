import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {readVocabulary} from '../lib/emotion.js';
import {scoreAnchors, parseAnchors, countRecalls} from '../lib/anchors.js';
import {renderSources, stampSourceDates} from '../lib/sources.js';
import {buildNotice} from '../lib/notice.js';

const dir = (name) => {
  const d = join(tmpdir(), `ofttold-reg-${name}-${process.pid}`);
  rmSync(d, {recursive: true, force: true});
  mkdirSync(d, {recursive: true});
  return d;
};

test('a fresh install injects the anchors the user wrote, not our samples', () => {
  const memoryDir = dir('fresh');
  const tpl = readFileSync(new URL('../templates/memory.md', import.meta.url), 'utf8');
  writeFileSync(join(memoryDir, 'memory.md'), tpl.replace('## 常被提起\n', '## 常被提起\n\n- **项目的规矩** → `docs/rules.md`｜别每次重讲\n'));
  writeFileSync(join(memoryDir, 'index.md'), readFileSync(new URL('../templates/index.md', import.meta.url), 'utf8'));

  const rendered = renderSources({}, memoryDir);
  assert.equal(rendered.loaded, 1);
  assert.ok(rendered.text.includes('项目的规矩'), '真锚点必须进块');
  assert.ok(!rendered.text.includes('示例·'), '我们编的示例不能进块');
});

test('the INDEX template does not claim to be the default injection source', () => {
  const indexTpl = readFileSync(new URL('../templates/index.md', import.meta.url), 'utf8');
  for (const line of indexTpl.split('\n')) {
    const heading = line.startsWith('## ') ? line.slice(3).trim() : '';
    assert.ok(
      heading !== '常被提起' && !heading.startsWith('常被提起（'),
      'INDEX 模板里出现「常被提起」会让用户以为写了就生效，而默认读的是 memory.md',
    );
  }
});

test('the template vocabulary is a placeholder, not a word', () => {
  const tpl = readFileSync(new URL('../templates/relationship.md', import.meta.url), 'utf8');
  assert.deepEqual(readVocabulary(tpl), []);
});

test('an undated anchor is neutral, not "newest"', () => {
  const now = Date.UTC(2026, 9, 30) / 86400000;
  const text = '- **老事** → 有日期\n- **无日期的老事** → 没日期\n'.replace(
    '- **老事** → 有日期',
    '- **老事** → `2026-10-29` 起｜x',
  );
  const {anchors} = scoreAnchors({text, diaries: [], nowDay: now});
  const undated = anchors.find((a) => a.title === '无日期的老事');
  assert.equal(undated.date, undefined);
  assert.equal(undated.R, 0.5, '无日期取中性值，不能等于 1（那会永远排第一）');
  const dated = anchors.find((a) => a.title === '老事');
  assert.ok(dated.R < 0.5, '一天的年龄应当低于中性值，真实年龄要能体现出来');
});

test('stamping is driven by the configured sections, not the built-in list', () => {
  const memoryDir = dir('stamp');
  writeFileSync(
    join(memoryDir, 'index.md'),
    '## 常被提起\n\n- **真锚点** → 没有日期\n',
  );
  writeFileSync(
    join(memoryDir, 'memory.md'),
    '## 常被提起\n\n- **别的文件里的东西** → 没有日期\n',
  );

  stampSourceDates({sections: [{file: 'index.md', heading: '常被提起'}]}, memoryDir, '2026-10-30');

  const index = readFileSync(join(memoryDir, 'index.md'), 'utf8');
  const memory = readFileSync(join(memoryDir, 'memory.md'), 'utf8');
  assert.ok(index.includes('2026-10-30'), '配置的 index.md 要被盖章');
  assert.ok(!memory.includes('2026-10-30'), '没配置的 memory.md 不该被改');
});

test('the plugin passes the config object to stampSourceDates', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(
    /stampSourceDates\(config,\s*memoryDir/.test(source),
    '传 sections 数组会让函数内部取不到 .sections，退回默认文件',
  );
  assert.ok(!/stampSourceDates\(configValue\(/.test(source));
});

test('sample titles never become anchors', () => {
  const parsed = parseAnchors('- **示例·项目在哪** → x\n- **Example · where** → y\n- **真的** → z\n');
  assert.deepEqual(parsed.map((a) => a.title), ['真的']);
});

test('counting recalls still works with the sample filter in place', () => {
  const anchor = {title: '真事', dayString: undefined, line: '- **真事** → x'};
  assert.equal(typeof countRecalls(anchor, []), 'number');
});

test('the template comments never reach the injected block', () => {
  const memoryDir = dir('comments');
  writeFileSync(
    join(memoryDir, 'memory.md'),
    '## 常被提起\n\n<!-- 说明：示例写在这里，不该被注入 -->\n- **真的** → x\n',
  );
  const r = renderSources({}, memoryDir);
  assert.equal(r.loaded, 1);
  assert.ok(!r.text.includes('<!--'), 'HTML 注释是给人看的，不能进上下文');
  assert.ok(r.text.includes('真的'));
});

test("a section holding only template samples counts as empty, not as memory", () => {
  // 0.1.5 修好了模板，但**老文件夹不会被迁移**：锚点在 index.md，memory.md 里
  // 留着建文件夹时的示例。结果是 `loaded: 1` 一切正常，注入的是我们编的假锚点。
  // 真实撞上的一次：Windows 机器上注入块里出现 `Example · where the project is`。
  const dir = mkdtempSync(join(tmpdir(), "ofttold-samples-"));
  writeFileSync(
    join(dir, "memory.md"),
    [
      "# 我的记忆",
      "",
      "## 常被提起",
      "",
      "> 上限 8 条。",
      "",
      "- **示例·项目在哪** → `~/work/my-project`｜省得每次问",
      "- **示例·别动的东西** → 不要改 `config/prod.yml`",
      "",
    ].join("\n"),
  );
  const rendered = renderSources({}, dir);
  assert.equal(rendered.loaded, 0, "samples are documentation, not memory");
  assert.equal(rendered.text.includes("示例·项目在哪"), false, "fake anchors must not reach the block");
  assert.equal(rendered.attempts[0].reason, "only_samples", "and the reason has to be recorded");

  // 提示语得说「写在别处了」，不能笼统说「还没写」——说成后者，用户会去写新的，
  // 而他真正写的那些一直在另一个文件里。
  const notice = buildNotice({
    attempts: rendered.attempts,
    memoryDir: dir,
    header: "HEADER",
  });
  assert.match(notice, /only the template's example lines/);
  assert.match(notice, /another file/);
  assert.doesNotMatch(notice, /nothing to read yet/);
});

test("one real anchor makes the section real again", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-samples-mixed-"));
  writeFileSync(
    join(dir, "memory.md"),
    [
      "## 常被提起",
      "",
      "- **示例·项目在哪** → `~/work/my-project`",
      "- **大肥鱼·是蓝鲸只是圆润** → 名字的由来",
      "",
    ].join("\n"),
  );
  const rendered = renderSources({}, dir);
  assert.equal(rendered.loaded, 1);
  assert.match(rendered.text, /大肥鱼/);
});

test("remember_emotion computes the folder from the call, not from a name that isn't there", () => {
  // 真机上撞到的：Windows 那边调用报 `memoryDir is not defined`。工具跑在
  // `execute` 自己的作用域里，`memoryDir` 是 pre-step 里的局部变量，那里没有。
  // 单测全在测 lib/emotion.js，没有一条走过这条接线。
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /execute\(args, exec\)/, "the tool handler has to receive the call context");
  assert.match(source, /memoryDirectory\(exec\?\.agent, config\)/, "and resolve the folder from it");
  assert.doesNotMatch(source, /rememberEmotion\(\{ memoryDir, word/, "the old bare name is the bug");
});

test("the notice reports the most specific reason, not the first one that fails", () => {
  // 默认现在还会顺带找「我是谁」「硬约定」。用户没有这两节时，attempts 里就会有一条
  // heading_not_found；要是它抢在前面，真正的原因（那节只剩示例 / 还空着）就看不见了。
  const header = "HEADER";
  const mixed = buildNotice({
    header,
    memoryDir: "/tmp/m",
    attempts: [
      { file: "memory.md", heading: "常被提起", reason: "only_samples" },
      { file: "memory.md", heading: "我是谁", reason: "heading_not_found" },
      { file: "memory.md", heading: "硬约定", reason: "heading_not_found" },
    ],
  });
  assert.match(mixed, /only the template's example lines/);
  assert.doesNotMatch(mixed, /none of its headings matched/);

  // 真的一个标题都没匹配上时，才报那条。
  const allWrong = buildNotice({
    header,
    memoryDir: "/tmp/m",
    attempts: [{ file: "memory.md", heading: "常被提起", reason: "heading_not_found" }],
  });
  assert.match(allWrong, /none of its headings matched/);
});

test("the anchor cap never sinks a hard rule", () => {
  // 上限（anchorCap）属于锚点那节：它按「被想起」的权重决定谁沉底，而「硬约定」
  // 里没有「被想起」这回事——每条算出来都是 R=0.50，沉的纯属排后面的那些，
  // 等于随机丢掉一条不能破的规矩。用户早先拍板「先不改」时只有锚点会被读；
  // 这两节进了默认读取之后，这就是真问题。
  const dir = mkdtempSync(join(tmpdir(), "rules-"));
  const rules = Array.from({ length: 10 }, (_, i) => `- **规矩 ${i + 1}** → 第 ${i + 1} 条`).join("\n");
  const anchors = Array.from({ length: 12 }, (_, i) => `- **锚点 ${i + 1}** → 第 ${i + 1} 条`).join("\n");
  writeFileSync(
    join(dir, "memory.md"),
    `# 记忆\n\n## 常被提起\n\n${anchors}\n\n## 硬约定\n\n${rules}\n`,
    "utf8",
  );
  const rendered = renderSources({}, dir);
  assert.equal((rendered.text.match(/^- \*\*规矩 /gm) || []).length, 10, "一条硬规矩都不许沉");
  assert.equal((rendered.text.match(/^- \*\*锚点 /gm) || []).length, 8, "锚点仍然按上限沉");
});

test("raising anchorCap actually shows more anchors, without also raising maxChars", () => {
  // 实测过的坑：`maxChars` 原来在 `anchorCap` 之前生效，把条数上限抬到 12
  // 也一条都进不来，末尾只多一句 `(3 more line(s) omitted)`——两个数必须一起
  // 调，而没人知道这件事。现在预算是从条数算出来的，只调一个就该生效。
  const dir = mkdtempSync(join(tmpdir(), "budget-"));
  const long = "说明文字，故意写得接近真实锚点的长度，让字符预算真的会咬人";
  const anchors = Array.from({ length: 14 }, (_, i) => `- **锚点 ${i + 1}·一条标题** → \`2026-11-01\` 起｜\`relationship.md\`｜${long}`).join("\n");
  writeFileSync(join(dir, "memory.md"), `# 记忆\n\n## 常被提起\n\n${anchors}\n`, "utf8");

  const eight = renderSources({}, dir);
  assert.equal((eight.text.match(/^- \*\*锚点 /gm) || []).length, 8);
  assert.doesNotMatch(eight.text, /omitted|cut mid-line/, "默认预算不该切掉第八条");

  const twelve = renderSources({ anchorCap: 12 }, dir);
  assert.equal((twelve.text.match(/^- \*\*锚点 /gm) || []).length, 12);
  assert.doesNotMatch(twelve.text, /omitted|cut mid-line/);

  // 显式给这一节设 maxChars 仍然是用户说了算。
  const pinned = renderSources(
    { anchorCap: 12, sections: [{ file: "memory.md", heading: "常被提起", maxChars: 300 }] },
    dir,
  );
  assert.match(pinned.text, /omitted|cut mid-line/);
});
