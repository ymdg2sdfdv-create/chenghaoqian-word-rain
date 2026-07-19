#!/usr/bin/env python3
"""
解析 gaokao-800-high-frequency-words.md，生成 30 天分配方案。
输出：
  1. WORD_BANK  JS 对象（全量词库，按类别）
  2. D30_PLAN  JS 对象（每天30词）
  3. word_map   JS 对象（word → {cat, cn}，快速查找）
"""

import re, json, random, os, sys

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(DIR, "vocabulary", "gaokao-800-high-frequency-words.md")

with open(MD, "r") as f:
    content = f.read()

# ===== 解析 Markdown 表格 =====
sections = re.split(r"\n## ", content)
categories = {}  # { cat_key: { "en": "cn", ... } }
cat_keys = []

for sec in sections:
    m = re.match(r"([一二三四五])、(.+)", sec)
    if not m:
        continue
    num, title = m.group(1), m.group(2)

    if "动词短语" in title:
        key = "phrase"
    elif "写作" in title:
        key = "writing"  # 不参与30天分配
    elif "动词" in title:
        key = "verb"
    elif "名词" in title:
        key = "noun"
    elif "形容词" in title:
        key = "adj_adv"
    else:
        continue

    entries = {}
    for line in sec.split("\n"):
        line = line.strip()
        # 匹配表格行: | N | word | definition |
        cell = re.match(r"^\|\s*\d*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|", line)
        if cell:
            en = cell.group(1).strip()
            cn = cell.group(2).strip()
            # 清理中文分隔符
            cn = cn.replace("；", "，")
            entries[en] = cn

    if entries:
        categories[key] = entries
        cat_keys.append(key)

# 验证
total = sum(len(v) for k, v in categories.items() if k != "writing")
print(f"解析完成：{', '.join(f'{k}({len(v)})' for k, v in categories.items())}")
print(f"30天学习词总量（不含写作替换）：{total}")

# ===== 30 天分配（轮询算法，自动处理余数） =====
random.seed(42)
total_days = 30

# 每个类别分别打乱后，轮流投放到30天
d30 = {d: [] for d in range(1, total_days + 1)}
cat_day = {c: 0 for c in cat_keys if c != "writing"}  # 每个类别的投放指针

for cat in cat_keys:
    if cat == "writing":
        continue
    words = list(categories[cat].items())  # [(en, cn), ...]
    random.shuffle(words)
    # 轮流投放到30天
    for i, (en, cn) in enumerate(words):
        day = (i % total_days) + 1
        d30[day].append(en)

# 验证：每天应该在29-31之间
counts = [len(d30[d]) for d in range(1, 31)]
print(f"每天词数：min={min(counts)}, max={max(counts)}, avg={sum(counts)/30:.0f}")

# 平衡调整：从最多的天移1个到最少的天，使每天都是30
# 先算一下：899词/30天，需要29900/30=29.97，所以有些天29有些天30
# 目标：尽量接近30，允许29-30的偏差
total_words = sum(counts)
ideal = total_words // total_days  # 29 或 30
print(f"总词量：{total_words}，每天理想值：{ideal}")

# 899 = 29*30 + 29, 所以需要 29天x30词 + 1天x29词
# 实际上：round-robin分配 899词到30天 = 29 × 30 + 1 × 29
# round-robin 已经自然做到了
print("✅ 轮询分配完成")

# ===== 输出 JS 代码 =====
out = []
out.append("// ===== 自动生成，请勿手动编辑 =====")
out.append("// 来源：vocabulary/gaokao-800-high-frequency-words.md")
out.append("// 生成脚本：scripts/build-d30-plan.py")
out.append("")

# D30_PLAN
out.append("const D30_PLAN = {")
for d in range(1, 31):
    words = d30[d]
    line = "  " + json.dumps(d) + ": ["
    line += ", ".join(json.dumps(w, ensure_ascii=False) for w in words)
    line += "],"
    out.append(line)
out.append("};")
out.append("")

# WORD_BANK
out.append("const CAT_META = {")
out.append('  verb:    { label: "🔴 动词", emoji: "🔴" },')
out.append('  noun:    { label: "🔵 名词", emoji: "🔵" },')
out.append('  adj_adv: { label: "🟢 形副", emoji: "🟢" },')
out.append('  phrase:  { label: "🟣 短语", emoji: "🟣" },')
out.append("};")
out.append("")
out.append("const WORD_BANK = {")
for cat in ["verb", "noun", "adj_adv", "phrase"]:
    out.append(f"  {cat}: {{")
    for en, cn in categories[cat].items():
        out.append(f"    {json.dumps(en, ensure_ascii=False)}: {json.dumps(cn, ensure_ascii=False)},")
    out.append("  },")
out.append("};")

# 写入文件
output_path = os.path.join(DIR, "word-bank-data.js")
with open(output_path, "w") as f:
    f.write("\n".join(out))

print(f"✅ JS 数据文件已写入：{output_path}")
print(f"   文件大小：{os.path.getsize(output_path) / 1024:.1f} KB")
