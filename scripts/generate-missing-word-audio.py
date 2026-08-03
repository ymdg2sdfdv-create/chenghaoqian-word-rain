#!/usr/bin/env python3
"""增量补缺：只为缺失的单词生成 EN+CN MP3。

与 generate-all-word-audio.py 的区别：
- 不清空任何目录
- 已存在且 >100 字节的文件直接跳过
- 只生成缺失的音频，用于断网缺词后补跑
"""
import subprocess, os, re, json, time, sys

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(DIR, "assets", "audio", "words-en")
CN_DIR = os.path.join(DIR, "assets", "audio", "words-cn")
os.makedirs(EN_DIR, exist_ok=True)
os.makedirs(CN_DIR, exist_ok=True)

EN_VOICE = "en-US-GuyNeural"
CN_VOICE = "zh-CN-YunxiNeural"

def sanitize(w):
    return w.replace(" ", "-").replace("/", "-").replace("\\", "-")

# ===== 从 D30_PLAN 提取全部词 =====
data_file = os.path.join(DIR, "word-bank-data.js")
with open(data_file) as f:
    content = f.read()

m = re.search(r"const D30_PLAN = (\{.*?\});\n\nconst CAT_META", content, re.S)
if not m:
    print("❌ 无法提取 D30_PLAN")
    sys.exit(1)

result = subprocess.run(
    ["node", "-e", f"const obj={m.group(1)}; console.log(JSON.stringify(obj));"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("❌ Node 解析失败:", result.stderr)
    sys.exit(1)

plan = json.loads(result.stdout)
word_map = {}
for d in sorted(plan.keys(), key=int):
    for item in plan[d]:
        safe = sanitize(item["word"])
        if safe not in word_map:
            word_map[safe] = (item["word"], item["cn"])

words = list(word_map.values())
total_words = len(words)
print(f"词库唯一拼写: {total_words}")

# ===== 找出缺失 =====
missing = []
for en, cn in words:
    safe = sanitize(en)
    en_path = os.path.join(EN_DIR, f"{safe}.mp3")
    cn_path = os.path.join(CN_DIR, f"{safe}.mp3")
    if not (os.path.exists(en_path) and os.path.getsize(en_path) > 100):
        missing.append((en, cn, "EN"))
    if not (os.path.exists(cn_path) and os.path.getsize(cn_path) > 100):
        missing.append((en, cn, "CN"))

if not missing:
    print("✅ 所有音频已齐全，无需补缺")
    sys.exit(0)

print(f"缺失 {len(missing)} 个音频，开始补生成...")

def gen(voice, text, path, timeout=90):
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

done, failed = 0, []
for en, cn, kind in missing:
    safe = sanitize(en)
    path = os.path.join(EN_DIR if kind == "EN" else CN_DIR, f"{safe}.mp3")
    text = en if kind == "EN" else cn.replace("；", "，")
    voice = EN_VOICE if kind == "EN" else CN_VOICE
    r = gen(voice, text, path)
    if r == "ok":
        done += 1
    else:
        failed.append(f"{kind}:{en}")

print(f"\n✅ 补生成完成：{done}/{len(missing)} ❌ 失败:{len(failed)}")
if failed:
    for f in failed:
        print(f"  - {f}")
