#!/usr/bin/env python3
"""Apply the approved vocabulary corrections to the Markdown source of truth.

The correction map is intentionally separate and auditable.  This script keeps
day/order fixed, updates every formerly unreviewed 688-only item to reviewed,
and writes a human-readable location report.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "陈浩谦高考英语1200高频词终极版_人工修订版.md"
CORRECTIONS = ROOT / "vocabulary" / "vocabulary-corrections-2026-08-03.json"
REPORT = ROOT / "vocabulary" / "2026-08-03-词义词性大小写修订清单.md"


corrections = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
by_location = {(row["day"], row["order"]): row for row in corrections}
if len(by_location) != len(corrections):
    raise SystemExit("修订映射中存在重复的 Day/Order")

lines = SOURCE.read_text(encoding="utf-8").splitlines()
current_day = None
seen = set()
applied = []
reviewed_status_count = 0
output = []

for line in lines:
    day_match = re.fullmatch(r"## Day (\d{2})", line)
    if day_match:
        current_day = int(day_match.group(1))

    if current_day and re.match(r"^\|\s*\d+\s*\|", line):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 10 and cells[0].isdigit():
            order = int(cells[0])
            key = (current_day, order)
            old_item, old_cn, old_pos, old_status = cells[1], cells[2], cells[4], cells[6]

            if key in by_location:
                change = by_location[key]
                cells[1] = change.get("word", old_item)
                cells[2] = change["cn"]
                cells[4] = change["pos"]
                seen.add(key)
                applied.append({
                    "day": current_day,
                    "order": order,
                    "old_item": old_item,
                    "new_item": cells[1],
                    "old_cn": old_cn,
                    "new_cn": cells[2],
                    "old_pos": old_pos,
                    "new_pos": cells[4],
                    "reason": change["reason"],
                })

            if old_status == "未审核（688独有）":
                cells[6] = "已审核（688独有）"
                reviewed_status_count += 1

            line = "| " + " | ".join(cells) + " |"

    if line.startswith("> 本文件已完成人工裁定："):
        line = (
            "> 本文件已完成人工裁定：删除低迁移词、补全遗漏字母、合并重复词、补入候补词，"
            "并完成1200项词义、词性和大小写复核。不规则动词过去式按学习需要独立保留。"
        )
    output.append(line)

missing = sorted(set(by_location) - seen)
if missing:
    raise SystemExit(f"以下修订位置未在源文件中找到：{missing}")

SOURCE.write_text("\n".join(output) + "\n", encoding="utf-8")

report_lines = [
    "# 词义、词性与大小写修订清单",
    "",
    "- 修订日期：2026-08-03",
    f"- 实质修订：{len(applied)} 项",
    f"- 688 独有词审核状态更新：{reviewed_status_count} 项",
    "- 定位方式：Day 表示第几天，Order 表示当天第几个词。",
    "- 结构约束：未更换词条，未改变天数、日内顺序和每天40项结构。",
    "",
    "| Day | Order | 原英文 | 修订后英文 | 原词性 | 修订后词性 | 原词义 | 修订后词义 | 修订原因 |",
    "|---:|---:|---|---|---|---|---|---|---|",
]
for row in sorted(applied, key=lambda item: (item["day"], item["order"])):
    values = [
        f'{row["day"]:02d}',
        f'{row["order"]:02d}',
        row["old_item"],
        row["new_item"],
        row["old_pos"],
        row["new_pos"],
        row["old_cn"],
        row["new_cn"],
        row["reason"],
    ]
    report_lines.append("| " + " | ".join(value.replace("|", "\\|") for value in values) + " |")

REPORT.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
print(f"已应用 {len(applied)} 项修订；已更新 {reviewed_status_count} 项审核状态")
print(f"修订报告：{REPORT}")
