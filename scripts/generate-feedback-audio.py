#!/usr/bin/env python3
"""生成反馈语音 MP3 — Edge TTS zh-CN-YunxiNeural（云希阳光活泼男声）。

文案随 2026-09-09 的流程改版整体重写：
- welcome 改为「每一步都算数」的定场语
- 每 15 词按顺序循环 encourage-1..5（不再是每 8 词随机）
- complete 改为「早读完成 → 进入测试」的过渡
- 新增 test-complete（测试结束）

文案改动后必须加 --force，否则已存在的 MP3 会被跳过、继续播旧文案。

用法：python3.12 scripts/generate-feedback-audio.py [--force] [--dry-run]
"""

import argparse
import os
import subprocess
import sys
import time

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(DIR, "assets", "audio", "feedback")

VOICE = "zh-CN-YunxiNeural"

# 顺序即播放顺序；encourage 必须保持 1..5 连续编号
SCRIPTS = [
    ("welcome.mp3",       "早上好，陈浩谦。你现在走的每一步，将来都算数。"),
    ("review-start.mp3",  "先把上次课堂讲过的单词，一个一个过一遍。"),
    ("encourage-1.mp3",   "不要分心，保持专注。"),
    ("encourage-2.mp3",   "陈浩谦，很棒。深呼吸，我们继续。"),
    ("encourage-3.mp3",   "陈浩谦，很好，就是这个节奏。"),
    ("encourage-4.mp3",   "陈浩谦，这是一条不得不走的路，坚持住。"),
    ("encourage-5.mp3",   "陈浩谦，太棒了，越来越顺了，继续坚持。"),
    ("complete.mp3",      "陈浩谦，做得好！早读部分已经完成。接下来我们开始测试，看着中文提示说出英文，想不起来也没关系。"),
    ("test-complete.mp3", "测试完成，陈浩谦，今天这一遍走得很扎实。测试没有通过的词，接下来，靠你自己了，继续加油！"),
]


def existing(path):
    return os.path.exists(path) and os.path.getsize(path) > 100


def generate(path, text):
    for _ in range(3):
        try:
            result = subprocess.run(
                ["edge-tts", "--voice", VOICE, "--text", text, "--write-media", path],
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
    parser.add_argument("--force", action="store_true", help="已存在的 MP3 也重新生成（文案改版后必用）")
    parser.add_argument("--dry-run", action="store_true", help="只列出将生成的文件与文案")
    args = parser.parse_args()

    os.makedirs(OUT, exist_ok=True)
    print(f"声线：{VOICE}｜共 {len(SCRIPTS)} 条\n")

    done, skipped, failed = 0, 0, []
    for filename, text in SCRIPTS:
        path = os.path.join(OUT, filename)
        if existing(path) and not args.force:
            skipped += 1
            print(f"  ⏭  {filename}（已存在，未改动）")
            continue
        print(f"  ·  {filename}\n     {text}")
        if args.dry_run:
            continue
        if generate(path, text):
            done += 1
            print("     ✅")
        else:
            failed.append(filename)
            print("     ❌")

    if args.dry_run:
        return

    print(f"\n✅ 生成 {done}｜⏭ 跳过 {skipped}｜❌ 失败 {len(failed)}")
    if failed:
        for filename in failed:
            print(f"  - {filename}")
        sys.exit(1)


if __name__ == "__main__":
    main()
