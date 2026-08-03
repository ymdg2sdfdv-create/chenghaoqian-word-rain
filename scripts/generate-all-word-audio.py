#!/usr/bin/env python3
"""全量生成 1200 词库的 EN+CN MP3。

- 数据源：word-bank-data.js 的 D30_PLAN（覆盖全部1200个课程条目）
- 先清空旧 words-en / words-cn 目录（旧词库音频已废弃）
- 用 Edge TTS 生成：EN=en-US-GuyNeural，CN=zh-CN-YunxiNeural
"""
import subprocess, os, re, json, time, shutil

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(DIR, "assets", "audio", "words-en")
CN_DIR = os.path.join(DIR, "assets", "audio", "words-cn")

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
    print("❌ 无法从 word-bank-data.js 提取 D30_PLAN")
    sys.exit(1)

plan_text = m.group(1)
result = subprocess.run(
    ["node", "-e", f"const obj={plan_text}; console.log(JSON.stringify(obj));"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("❌ Node 解析 D30_PLAN 失败:", result.stderr)
    sys.exit(1)

plan = json.loads(result.stdout)

# 收集唯一拼写 + 中文（同形词取第一次出现的中文）
word_map = {}  # {safe_name: (en, cn)}
for d in sorted(plan.keys(), key=int):
    for item in plan[d]:
        safe = sanitize(item["word"])
        if safe not in word_map:
            word_map[safe] = (item["word"], item["cn"])

words = list(word_map.values())
print(f"D30_PLAN 提取唯一拼写: {len(words)} 词")
total = len(words) * 2

# ===== 清空旧音频目录 =====
print("清空旧音频目录...")
for d in (EN_DIR, CN_DIR):
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)
print("✅ 旧音频已清理")

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
for i, (en, cn) in enumerate(words, 1):
    safe = sanitize(en)
    en_path = os.path.join(EN_DIR, f"{safe}.mp3")
    cn_path = os.path.join(CN_DIR, f"{safe}.mp3")

    r = gen(EN_VOICE, en, en_path)
    if r == "ok": done += 1
    else: failed.append(f"EN:{en}")

    r = gen(CN_VOICE, cn.replace("；", "，"), cn_path)
    if r == "ok": done += 1
    else: failed.append(f"CN:{en}")

    if i % 50 == 0 or i == len(words):
        print(f"  进度: {i}/{len(words)} 词 (已生成{done}/{total} 文件)")

print(f"\n✅ 生成完成：{done}/{total} 个文件 ❌ 失败:{len(failed)}")
if failed:
    for f in failed[:30]:
        print(f"  - {f}")
    if len(failed) > 30:
        print(f"  ... 共{len(failed)}个失败")
