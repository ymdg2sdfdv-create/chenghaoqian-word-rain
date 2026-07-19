#!/usr/bin/env python3
"""补全所有单词的 EN+CN MP3（增量：已有跳过）"""
import subprocess, os, sys, json, time, re

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(DIR, "assets", "audio", "words-en")
CN_DIR = os.path.join(DIR, "assets", "audio", "words-cn")
os.makedirs(EN_DIR, exist_ok=True)
os.makedirs(CN_DIR, exist_ok=True)

EN_VOICE = "en-US-GuyNeural"
CN_VOICE = "zh-CN-YunxiNeural"

def sanitize(w):
    return w.replace(" ", "-").replace("/", "-").replace("\\", "-")

# 从 JS 数据文件提取词库
data_file = os.path.join(DIR, "ppts", "word-bank-data.js")
with open(data_file) as f:
    content = f.read()

words = []  # [(en, cn), ...]
for line in content.split("\n"):
    m = re.match(r'\s+"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$', line)
    if m:
        words.append((m.group(1), m.group(2)))

print(f"词库总量: {len(words)} 词")
total = len(words) * 2

def gen(voice, text, path, timeout=90):
    if os.path.exists(path) and os.path.getsize(path) > 100:
        return "skip"
    for _ in range(3):
        try:
            r = subprocess.run(
                ["edge-tts", "--voice", voice, "--text", text, "--write-media", path],
                capture_output=True, text=True, timeout=timeout
            )
            if r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 100:
                return "ok"
            time.sleep(1.5)
        except subprocess.TimeoutExpired:
            time.sleep(3)
    return "fail"

done, skipped, failed = 0, 0, []

for en, cn in words:
    safe = sanitize(en)
    en_path = os.path.join(EN_DIR, f"{safe}.mp3")
    cn_path = os.path.join(CN_DIR, f"{safe}.mp3")

    r = gen(EN_VOICE, en, en_path)
    if r == "ok": done += 1
    elif r == "skip": skipped += 1
    else: failed.append(f"EN:{en}")

    r = gen(CN_VOICE, cn.replace("；", "，"), cn_path)
    if r == "ok": done += 1
    elif r == "skip": skipped += 1
    else: failed.append(f"CN:{cn}")

    if (done + skipped) % 100 == 0:
        print(f"  进度: {done + skipped}/{total} (新生成{done}, 跳过{skipped})")
    time.sleep(0.15)

print(f"\n✅ 新生成:{done} ⏭ 跳过:{skipped} ❌ 失败:{len(failed)}")
if failed:
    for f in failed: print(f"  - {f}")
