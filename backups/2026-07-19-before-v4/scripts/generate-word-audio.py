#!/usr/bin/env python3
"""批量生成单词朗读 MP3 — Edge TTS（含重试+续传）"""

import subprocess, os, sys, re, time, random

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(DIR, "assets", "audio", "words-en")
CN_DIR = os.path.join(DIR, "assets", "audio", "words-cn")
os.makedirs(EN_DIR, exist_ok=True)
os.makedirs(CN_DIR, exist_ok=True)
HTML = os.path.join(DIR, "ppts", "word-rain.html")

EN_VOICE = "en-US-GuyNeural"
CN_VOICE = "zh-CN-YunxiNeural"

def sanitize(word):
    return word.replace(" ", "-").replace("/", "-").replace("\\", "-")

def extract_words():
    with open(HTML) as f:
        content = f.read()
    start = content.find("const WORD_BANK = {")
    if start < 0:
        print("❌ 未找到 WORD_BANK"); sys.exit(1)
    start = content.index("{", start)
    depth, end = 0, start
    for i in range(start, len(content)):
        ch = content[i]
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: end = i; break
    js_obj = content[start:end+1]
    words, current_cat = {}, None
    for line in js_obj.split("\n"):
        line = line.strip()
        m = re.match(r'^(\w+)\s*:\s*\{', line)
        if m: current_cat = m.group(1); words[current_cat] = {}; continue
        if current_cat:
            m = re.match(r'"([^"]+)"\s*:\s*"([^"]*)"', line)
            if m: words[current_cat][m.group(1)] = m.group(2)
    return words

def gen(voice, text, out_path, label, retries=3):
    """生成单个 MP3，含重试"""
    if os.path.exists(out_path) and os.path.getsize(out_path) > 100:
        return "skip"
    for attempt in range(retries):
        try:
            r = subprocess.run(
                ["edge-tts", "--voice", voice, "--text", text, "--write-media", out_path],
                capture_output=True, text=True, timeout=90
            )
            if r.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 100:
                return "ok"
            if attempt < retries - 1:
                time.sleep(1 + random.random() * 2)
        except subprocess.TimeoutExpired:
            if attempt < retries - 1:
                time.sleep(2 + random.random() * 3)
    return "fail"

words = extract_words()
total = sum(len(v) for v in words.values())
total_files = total * 2
done, skipped, failed = 0, 0, []

print(f"总词数:{total} | 总文件:{total_files} | EN:{EN_VOICE} | CN:{CN_VOICE}")
print("=" * 60)

for cat, entries in words.items():
    print(f"\n📦 {cat} ({len(entries)})")
    for en, cn in entries.items():
        safe = sanitize(en)
        en_path = os.path.join(EN_DIR, f"{safe}.mp3")
        cn_path = os.path.join(CN_DIR, f"{safe}.mp3")

        # EN
        r = gen(EN_VOICE, en, en_path, "EN")
        if r == "ok": done += 1; print(f"  [{done}/{total_files}] EN {en} ✅")
        elif r == "skip": skipped += 1
        else: failed.append(f"EN:{en}"); print(f"  ❌ EN {en}")

        # CN (用中文逗号)
        cn_clean = cn.replace("；", "，").replace(";", ",")
        r = gen(CN_VOICE, cn_clean, cn_path, "CN")
        if r == "ok": done += 1; print(f"  [{done}/{total_files}] CN {cn_clean} ✅")
        elif r == "skip": skipped += 1
        else: failed.append(f"CN:{cn}"); print(f"  ❌ CN {cn}")

        # 短暂休息，避免 API 限流
        time.sleep(0.3)

print("\n" + "=" * 60)
print(f"✅ 新生成:{done} | ⏭ 跳过:{skipped} | ❌ 失败:{len(failed)}")
if failed:
    for f in failed: print(f"  - {f}")
