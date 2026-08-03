#!/usr/bin/env python3
"""Regenerate only the Chinese audio affected by the 2026-08-03 audit."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "陈浩谦高考英语1200高频词终极版_人工修订版.md"
CORRECTIONS = ROOT / "vocabulary" / "vocabulary-corrections-2026-08-03.json"
REPORT = ROOT / "vocabulary" / "2026-08-03-词义词性大小写修订清单.md"
EN_DIR = ROOT / "assets" / "audio" / "words-en"
CN_DIR = ROOT / "assets" / "audio" / "words-cn"
VOICE = "zh-CN-YunxiNeural"


def sanitize(text: str) -> str:
    return text.replace(" ", "-").replace("/", "-").replace("\\", "-")


def load_current_rows() -> dict[tuple[int, int], tuple[str, str]]:
    current_day = 0
    result = {}
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        day_match = re.fullmatch(r"## Day (\d{2})", line)
        if day_match:
            current_day = int(day_match.group(1))
            continue
        if current_day and re.match(r"^\|\s*\d+\s*\|", line):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) == 10 and cells[0].isdigit():
                result[(current_day, int(cells[0]))] = (cells[1], cells[2])
    return result


def load_old_words() -> dict[tuple[int, int], str]:
    result = {}
    for line in REPORT.read_text(encoding="utf-8").splitlines():
        if not re.match(r"^\| \d{2} \| \d{2} \|", line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        result[(int(cells[0]), int(cells[1]))] = cells[2]
    return result


def spoken_cn(day: int, order: int, cn: str) -> str:
    special = {
        (11, 32): "当某事发生时，然而",
        (13, 22): "以某事为基础",
        (28, 18): "给某人留下深刻印象",
        (30, 12): "在文字下画线，强调",
        (30, 21): "由某人或某物组成",
    }
    return special.get((day, order), cn).replace("；", "，")


def generate_one(day: int, order: int, word: str, cn: str) -> tuple[str, bool, str]:
    target = CN_DIR / f"{sanitize(word)}.mp3"
    text = spoken_cn(day, order, cn)
    for attempt in range(1, 4):
        fd, temporary_name = tempfile.mkstemp(prefix="cn-audio-", suffix=".mp3", dir=CN_DIR)
        os.close(fd)
        temporary = Path(temporary_name)
        try:
            result = subprocess.run(
                ["edge-tts", "--voice", VOICE, "--text", text, "--write-media", str(temporary)],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if result.returncode == 0 and temporary.exists() and temporary.stat().st_size > 100:
                os.replace(temporary, target)
                return word, True, ""
            error = result.stderr.strip() or result.stdout.strip() or "unknown edge-tts error"
        except subprocess.TimeoutExpired:
            error = "timeout"
        finally:
            temporary.unlink(missing_ok=True)
        time.sleep(attempt)
    return word, False, error


corrections = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
current_rows = load_current_rows()
old_words = load_old_words()

# Capitalization-only filename changes must also be reflected on case-sensitive hosts.
for change in corrections:
    key = (change["day"], change["order"])
    new_word, _ = current_rows[key]
    old_word = old_words[key]
    if old_word == new_word:
        continue
    for directory in (EN_DIR, CN_DIR):
        old_path = directory / f"{sanitize(old_word)}.mp3"
        new_path = directory / f"{sanitize(new_word)}.mp3"
        if old_path.exists():
            if old_path.name.lower() == new_path.name.lower():
                temporary_path = directory / f".__casefix__{new_path.name}"
                os.replace(old_path, temporary_path)
                os.replace(temporary_path, new_path)
            else:
                shutil.copy2(old_path, new_path)
                old_path.unlink()

jobs = []
with ThreadPoolExecutor(max_workers=8) as executor:
    for change in corrections:
        key = (change["day"], change["order"])
        word, cn = current_rows[key]
        jobs.append(executor.submit(generate_one, key[0], key[1], word, cn))

    done = 0
    failed = []
    for future in as_completed(jobs):
        word, ok, error = future.result()
        if ok:
            done += 1
        else:
            failed.append((word, error))
        if (done + len(failed)) % 20 == 0:
            print(f"进度：{done + len(failed)}/{len(jobs)}", flush=True)

print(f"中文音频定向更新：{done}/{len(jobs)}", flush=True)
if failed:
    for word, error in failed:
        print(f"失败：{word}: {error}")
    raise SystemExit(1)
