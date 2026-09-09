#!/usr/bin/env python3
"""增量补缺：只为课堂词库缺失的 EN/CN MP3 生成音频。

与 generate-missing-word-audio.py 的区别：
- 数据源改为 classroom-bank-data.js（课堂 92 词），不再读已归档的 word-bank-data.js
- 短语词条按拼读块补 EN（每个块一个文件），按整短语补 CN（内容为中文释义）
- 已存在且 >100 字节的文件一律跳过，不覆盖、不清空

用法：python3.12 scripts/generate-classroom-audio.py [--dry-run]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(DIR, "assets", "audio", "words-en")
CN_DIR = os.path.join(DIR, "assets", "audio", "words-cn")
BANK_FILE = os.path.join(DIR, "classroom-bank-data.js")

EN_VOICE = "en-US-GuyNeural"
CN_VOICE = "zh-CN-YunxiNeural"
WORD_PATTERN = re.compile(r"[A-Za-z]+")

# 拼读块 → 实际朗读文本。缩写必须读全，否则 TTS 会逐字母念成「ess-tee-aitch」。
SPOKEN_OVERRIDES = {
    "sth": "something",
}


def sanitize(word):
    return word.replace(" ", "-").replace("/", "-").replace("\\", "-")


def load_bank():
    with open(BANK_FILE, encoding="utf-8") as handle:
        source = handle.read()
    marker = "const CLASSROOM_BANK = "
    start = source.index(marker) + len(marker)
    end = source.index(";\n", start)
    return json.loads(source[start:end])


def spelling_blocks(item):
    """与 word-rain.html 的 buildSpellingSteps 同规则：短语按词块，其余按单词。"""
    if item["cat"] == "phrase":
        return WORD_PATTERN.findall(item["word"])
    return [item["word"]]


def spoken_text(text):
    """展开缩写：sth → something。逐词替换，整条短语同样适用。"""
    return " ".join(SPOKEN_OVERRIDES.get(token, token) for token in text.split())


def existing(path):
    return os.path.exists(path) and os.path.getsize(path) > 100


def generate(path, text, voice):
    for _ in range(3):
        try:
            result = subprocess.run(
                ["edge-tts", "--voice", voice, "--text", text, "--write-media", path],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode == 0 and existing(path):
                return True
        except subprocess.TimeoutExpired:
            pass
        time.sleep(1)
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只列出缺失项，不生成")
    args = parser.parse_args()

    bank = load_bank()
    jobs = []
    for item in bank["items"]:
        targets = list(spelling_blocks(item))
        if item["cat"] == "phrase":
            # 揭晓时 speakEN(item.word) 读的是整条短语，逐块之外还要单独一份
            targets.append(item["word"])
        for target in targets:
            path = os.path.join(EN_DIR, f"{sanitize(target)}.mp3")
            if existing(path):
                continue
            spoken = spoken_text(target)
            label = f"EN {target}" if spoken == target else f"EN {target} → {spoken}"
            jobs.append((path, spoken, EN_VOICE, label))
        cn_path = os.path.join(CN_DIR, f"{sanitize(item['word'])}.mp3")
        if not existing(cn_path):
            jobs.append((cn_path, item["cn"], CN_VOICE, f"CN {item['word']} → {item['cn']}"))

    if not jobs:
        print("✅ 课堂词库音频齐全，无需补缺")
        return

    print(f"缺失 {len(jobs)} 个文件：")
    for _, text, voice, label in jobs:
        print(f"  - {label}  [{voice}]")

    if args.dry_run:
        return

    done, failed = 0, []
    for path, text, voice, label in jobs:
        if generate(path, text, voice):
            done += 1
            print(f"  ✅ {label}")
        else:
            failed.append(label)
            print(f"  ❌ {label}")

    print(f"\n✅ 生成 {done}/{len(jobs)}")
    if failed:
        print("失败项：")
        for label in failed:
            print(f"  - {label}")
        sys.exit(1)


if __name__ == "__main__":
    main()
