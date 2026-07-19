#!/usr/bin/env python3
"""生成反馈语音 MP3 — Edge TTS zh-CN-YunxiNeural（云希阳光活泼男孩）"""

import subprocess, os, sys, time

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(DIR, "assets", "audio", "feedback")
os.makedirs(OUT, exist_ok=True)

VOICE = "zh-CN-YunxiNeural"

SCRIPTS = [
    ("welcome.mp3",        "浩谦，新的一天，准备好了吗？单词轰炸，开始！"),
    ("review-start.mp3",   "先来复习一下之前的单词。"),
    ("review-done.mp3",    "复习完成！接下来是今天的新词。"),
    ("encourage-1.mp3",    "继续保持，你做得很好！"),
    ("encourage-2.mp3",    "加油浩谦，这些词已经快进入你的大脑了！"),
    ("encourage-3.mp3",    "不错哦，离目标越来越近了！"),
    ("encourage-4.mp3",    "浩谦，你就是单词收割机！"),
    ("encourage-5.mp3",    "坚持住，每一个词都是分数！"),
    ("new-words-start.mp3","准备好了吗？开始今天的新词学习！"),
    ("complete.mp3",       "全部完成！今天的单词都进入浩谦的大脑了。从80分到110分，每一步都算数！"),
]

def gen(filename, text):
    path = os.path.join(OUT, filename)
    if os.path.exists(path) and os.path.getsize(path) > 100:
        return "skip"
    for attempt in range(3):
        try:
            r = subprocess.run(
                ["edge-tts", "--voice", VOICE, "--text", text, "--write-media", path],
                capture_output=True, text=True, timeout=60
            )
            if r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 100:
                return "ok"
            time.sleep(1)
        except subprocess.TimeoutExpired:
            time.sleep(2)
    return "fail"

print(f"声线: {VOICE} | 共 {len(SCRIPTS)} 条")
done, skipped, failed = 0, 0, []

for fn, txt in SCRIPTS:
    r = gen(fn, txt)
    if r == "ok": done += 1; print(f"  ✅ {fn}")
    elif r == "skip": skipped += 1; print(f"  ⏭ {fn} (已有)")
    else: failed.append(fn); print(f"  ❌ {fn}")

print(f"\n✅ 新生成:{done} ⏭ 跳过:{skipped} ❌ 失败:{len(failed)}")
if failed:
    for f in failed: print(f"  - {f}")
