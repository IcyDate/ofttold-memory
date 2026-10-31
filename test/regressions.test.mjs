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
  const tpl = readFileSync(new URL('../templates/MEMORY.md', import.meta.url), 'utf8');
  writeFileSync(join(memoryDir, 'MEMORY.md'), tpl.replace('## 常被提起\n', '## 常被提起\n\n- **项目的规矩** → `docs/rules.md`｜别每次重讲\n'));
  writeFileSync(join(memoryDir, 'INDEX.md'), readFileSync(new URL('../templates/INDEX.md', import.meta.url), 'utf8'));

  const rendered = renderSources({}, memoryDir);
  assert.equal(rendered.loaded, 1);
  assert.ok(rendered.text.includes('项目的规矩'), '真锚点必须进块');
  assert.ok(!rendered.text.includes('示例·'), '我们编的示例不能进块');
});

test('the INDEX template does not claim to be the default injection source', () => {
  const indexTpl = readFileSync(new URL('../templates/INDEX.md', import.meta.url), 'utf8');
  for (const line of indexTpl.split('\n')) {
    const heading = line.startsWith('## ') ? line.slice(3).trim() : '';
    assert.ok(
      heading !== '常被提起' && !heading.startsWith('常被提起（'),
      'INDEX 模板里出现「常被提起」会让用户以为写了就生效，而默认读的是 MEMORY.md',
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
    join(memoryDir, 'INDEX.md'),
    '## 常被提起\n\n- **真锚点** → 没有日期\n',
  );
  writeFileSync(
    join(memoryDir, 'MEMORY.md'),
    '## 常被提起\n\n- **别的文件里的东西** → 没有日期\n',
  );

  stampSourceDates({sections: [{file: 'INDEX.md', heading: '常被提起'}]}, memoryDir, '2026-10-30');

  const index = readFileSync(join(memoryDir, 'INDEX.md'), 'utf8');
  const memory = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf8');
  assert.ok(index.includes('2026-10-30'), '配置的 INDEX.md 要被盖章');
  assert.ok(!memory.includes('2026-10-30'), '没配置的 MEMORY.md 不该被改');
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
    join(memoryDir, 'MEMORY.md'),
    '## 常被提起\n\n<!-- 说明：示例写在这里，不该被注入 -->\n- **真的** → x\n',
  );
  const r = renderSources({}, memoryDir);
  assert.equal(r.loaded, 1);
  assert.ok(!r.text.includes('<!--'), 'HTML 注释是给人看的，不能进上下文');
  assert.ok(r.text.includes('真的'));
});

test("a section holding only template samples counts as empty, not as memory", () => {
  // 0.1.5 修好了模板，但**老文件夹不会被迁移**：锚点在 INDEX.md，MEMORY.md 里
  // 留着建文件夹时的示例。结果是 `loaded: 1` 一切正常，注入的是我们编的假锚点。
  // 真实撞上的一次：Windows 机器上注入块里出现 `Example · where the project is`。
  const dir = mkdtempSync(join(tmpdir(), "ofttold-samples-"));
  writeFileSync(
    join(dir, "MEMORY.md"),
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
    join(dir, "MEMORY.md"),
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
