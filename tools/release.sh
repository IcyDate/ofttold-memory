#!/bin/bash
# 发一个版本：改版本号 → 跑测试 → 打 tag → 推 → 用 CHANGELOG 那一节建 GitHub Release。
# 用法：tools/release.sh 0.1.7
# 前置：CHANGELOG.md 里已经有 "## [0.1.7]" 一节，工作区干净，在 main 上。
set -e
V="${1:?用法: tools/release.sh 0.1.7}"
TAG="v$V"

grep -q "^## \[$V\]" CHANGELOG.md || { echo "CHANGELOG.md 里没有 ## [$V] 这一节"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "工作区不干净，先提交"; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "不在 main 上"; exit 1; }

node -e '
const fs=require("fs");const v=process.argv[1];
const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.version=v;
fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");
const c=fs.readFileSync("client.js","utf8").replace(/const VERSION = "[^"]+";/,`const VERSION = "${v}";`);
fs.writeFileSync("client.js",c);
' "$V"

npm test 2>&1 | grep -E "^ℹ (pass|fail)"
git add -A && git commit -q -m "ofttold-memory: $V"
git tag -a "$TAG" -m "$V"
git push -q origin main && git push -q origin "$TAG"

awk -v v="$V" 'index($0,"## ["v"]"){f=1} f&&/^## \[/&&!index($0,"## ["v"]"){exit} f' CHANGELOG.md > /tmp/release-notes.md
GH_TOKEN=$(cat ~/.dsh/github-token) gh release create "$TAG" --title "$V" --notes-file /tmp/release-notes.md
echo "已发布 $TAG —— npm 那步仍要手动跑：npm publish --registry=https://registry.npmjs.org/"
