#!/usr/bin/env python3
"""
解析「陈浩谦高考英语1200高频词终极版_人工修订版.md」，生成 30 天分配方案。

新词库已人工按 Day 01-30 分好，每天 40 项（36词+4短语），脚本直接采用：
  1. D30_PLAN  JS 对象（1200个课程条目，保留人工日顺序）
  2. CAT_META  JS 对象（verb/noun/adj_adv/phrase/prep/conj，其余边缘词性不显示）
  3. WORD_BANK JS 对象（全量词库，用于音频脚本提取）

词性映射规则（人工确认）：
  - word + v.           → verb     （动词）
  - word + n.           → noun     （名词）
  - word + adj./adv.    → adj_adv  （形副）
  - phrase / v. phr. / prep. phr. / fixed struct. → phrase（短语）
  - word + prep.        → prep     （介词，新增标签）
  - word + conj.        → conj     （连词，新增标签）
  - 其余边缘词性（num./det./n./v./adj./n.等）→ 不显示词性（cat 置空）

每个课程条目使用独立 ID，dayNN-序数-单词，与旧格式保持一致。
"""

import re, json, os

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(DIR, "陈浩谦高考英语1200高频词终极版_人工修订版.md")

with open(MD, "r") as f:
    content = f.read()

# ===== 词性映射表 =====
def map_pos(pos: str) -> str:
    """将 POS/Type 标注映射到系统分类（空串=不显示词性）。

    映射规则（人工确认）：
      - v.  → verb（动词）
      - n.  → noun（名词）
      - adj./adv. → adj_adv（形副）
      - prep. → prep（介词）
      - conj. → conj（连词）
      - 其余边缘词性（n./v.、adj./n.、num.、det.、adj./v.、n./adj.等）→ 不显示词性
      - 短语类（Type=phrase）在解析循环中统一归 phrase
    """
    pos = pos.strip()
    if pos in ("prep.",):
        return "prep"
    if pos in ("conj.",):
        return "conj"
    if pos in ("n.",):
        return "noun"
    if pos in ("v.",):
        return "verb"
    if pos in ("adj.", "adv."):
        return "adj_adv"
    # 其余边缘词性均不显示词性
    return ""

# ===== 解析 Markdown =====
days = re.split(r"\n## ", content)
d30 = {d: [] for d in range(1, 31)}

for sec in days:
    m = re.match(r"Day (\d+)", sec)
    if not m:
        continue
    day = int(m.group(1))
    if day < 1 or day > 30:
        continue

    # 匹配表格行: | Order | Item | 中文 | Type | POS/Type | ... |
    rows = re.findall(r"^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(word|phrase)\s*\|\s*(.+?)\s*\|", sec, re.M)
    for item, cn, typ, pos in rows:
        item = item.strip()
        cn = cn.strip().replace("；", "，")
        pos = pos.strip()

        if typ == "phrase":
            cat = "phrase"
        else:
            cat = map_pos(pos)

        d30[day].append({"word": item, "cn": cn, "cat": cat, "pos": pos})

# ===== 验证 =====
total = sum(len(d30[d]) for d in d30)
print(f"解析完成：共 {total} 个课程条目")
print(f"每天词数：min={min(len(d30[d]) for d in d30)}, max={max(len(d30[d]) for d in d30)}")

cat_counts = {}
for d in d30:
    for entry in d30[d]:
        cat = entry["cat"] or "none"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
print(f"分类分布：{cat_counts}")

# ===== 输出 JS 代码 =====
out = []
out.append("// ===== 自动生成，请勿手动编辑 =====")
out.append("// 来源：陈浩谦高考英语1200高频词终极版_人工修订版.md（人工修订，唯一数据源）")
out.append("// 生成脚本：scripts/build-d30-plan.py")
out.append("")

# D30_PLAN
out.append("const D30_PLAN = {")
for d in range(1, 31):
    entries = d30[d]
    line = "  " + json.dumps(d) + ": ["
    encoded = []
    for index, entry in enumerate(entries, start=1):
        safe = re.sub(r"[ /\\]+", "-", entry["word"]).lower()
        course_id = f"day{d:02d}-{index:02d}-{safe}"
        item = {
            "id": course_id,
            "word": entry["word"],
            "cn": entry["cn"],
            "cat": entry["cat"],
            "day": d,
            "order": index,
        }
        encoded.append(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
    line += ", ".join(encoded)
    line += "],"
    out.append(line)
out.append("};")
out.append("")

# CAT_META（含新增的 prep/conj，none 不显示）
out.append("const CAT_META = {")
out.append('  verb:    { label: "🔴 动词", emoji: "🔴" },')
out.append('  noun:    { label: "🔵 名词", emoji: "🔵" },')
out.append('  adj_adv: { label: "🟢 形副", emoji: "🟢" },')
out.append('  phrase:  { label: "🟣 短语", emoji: "🟣" },')
out.append('  prep:    { label: "🟡 介词", emoji: "🟡" },')
out.append('  conj:    { label: "🟠 连词", emoji: "🟠" },')
out.append("};")
out.append("")
out.append("const WORD_BANK = {")
for cat in ["verb", "noun", "adj_adv", "phrase", "prep", "conj"]:
    out.append(f"  {cat}: {{")
    for entry in d30[d] if False else []:
        pass
    # 从所有天收集该 cat 的词
    for entry in [e for d in d30 for e in d30[d] if e["cat"] == cat]:
        out.append(f"    {json.dumps(entry['word'], ensure_ascii=False)}: {json.dumps(entry['cn'], ensure_ascii=False)},")
    out.append("  },")
out.append("};")

# 写入文件
output_path = os.path.join(DIR, "word-bank-data.js")
with open(output_path, "w") as f:
    f.write("\n".join(out))

print(f"✅ JS 数据文件已写入：{output_path}")
print(f"   文件大小：{os.path.getsize(output_path) / 1024:.1f} KB")
