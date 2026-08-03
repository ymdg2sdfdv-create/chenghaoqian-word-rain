#!/usr/bin/env python3
"""Build and validate the canonical union of the 4151 reviewed words and 688 list."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.parse
from collections import Counter
from pathlib import Path


HISTORY_ROOT = Path(
    "/Users/lihaiou/Documents/Codex/2026-07-22/2025-docx-2008-2025-1-top50"
)
SOURCE_4151 = HISTORY_ROOT / "tmp/pdfs/words.json"
SOURCE_REVIEW = HISTORY_ROOT / "tmp/review_scan/review_classification.json"
SOURCE_688 = HISTORY_ROOT / "tmp/688_ocr/688_words.json"
SOURCE_1200 = HISTORY_ROOT / "tmp/1200_core/classified_scheduled_1200_manual_final.json"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CACHE = Path("/private/tmp/vocab-audit-019fc724/youdao")
DEFAULT_OUTPUT = REPO_ROOT / "vocabulary/vocabulary-audit-2026-08-03.json"

POS_ALIASES = {
    "n.": "n.",
    "noun": "n.",
    "v.": "v.",
    "vt.": "v.",
    "vi.": "v.",
    "verb": "v.",
    "adj.": "adj.",
    "adjective": "adj.",
    "adv.": "adv.",
    "adverb": "adv.",
    "prep.": "prep.",
    "preposition": "prep.",
    "conj.": "conj.",
    "conjunction": "conj.",
    "pron.": "pron.",
    "det.": "det.",
    "num.": "num.",
    "art.": "art.",
    "aux.": "aux.",
    "int.": "int.",
}

# These are confirmed OCR/form corrections documented by the earlier 1200 audit.
CONFIRMED_FORMS = {
    "specie": ("species", "OCR 截断；语料义为“物种”，且主表已有 species"),
    "pas": ("pass", "OCR 漏字母 s；语料上下文为 pass"),
    "bos": ("boss", "OCR 漏字母 s"),
    "discus": ("discuss", "当前词性为动词，语料上下文为 discuss，不是名词 discus“铁饼”"),
    "clothe": ("clothes", "当前词性与语料义为名词“衣服”，OCR 漏字母 s"),
}

CONFIRMED_POS = {
    "fee": ("n.", "真题常用义为名词“费用”；原 v. 与词典及语境不符"),
}

PROPER_CASE = {
    "african": "African",
    "american": "American",
    "asian": "Asian",
    "british": "British",
    "chinese": "Chinese",
    "easterner": "Easterner",
    "english": "English",
    "european": "European",
    "french": "French",
    "german": "German",
    "indian": "Indian",
    "japanese": "Japanese",
    "lipitor": "Lipitor",
    "tv": "TV",
}


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def normalize(value: str) -> str:
    value = str(value or "").strip().lower()
    value = value.replace("’", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", value)


def cache_name(word: str) -> str:
    digest = hashlib.sha1(word.encode("utf-8")).hexdigest()[:12]
    safe = re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-")[:36] or "entry"
    return f"{safe}-{digest}.json"


def load_system_words() -> set[str]:
    words: set[str] = set()
    for path in [Path("/usr/share/dict/words"), Path("/usr/share/dict/web2"), Path("/usr/share/dict/propernames")]:
        if not path.exists():
            continue
        with path.open(errors="ignore") as handle:
            words.update(normalize(line) for line in handle if line.strip())
    return words


def load_wordnet():
    try:
        from nltk.corpus import wordnet as wn

        wn.ensure_loaded()
        return wn
    except Exception:
        return None


def wordnet_pos(wn, word: str) -> set[str]:
    if wn is None:
        return set()
    mapping = {"n": "n.", "v": "v.", "a": "adj.", "s": "adj.", "r": "adv."}
    return {mapping[synset.pos()] for synset in wn.synsets(word.replace(" ", "_")) if synset.pos() in mapping}


def parse_youdao(cache_dir: Path, word: str) -> dict:
    path = cache_dir / cache_name(word)
    if not path.exists():
        return {"recognized": False, "pos_glosses": {}, "headword": "", "path": str(path)}
    try:
        payload = load_json(path)
    except Exception:
        return {"recognized": False, "pos_glosses": {}, "headword": "", "path": str(path)}
    ec_words = payload.get("ec", {}).get("word", []) or []
    simple_words = payload.get("simple", {}).get("word", []) or []
    headword = ""
    if ec_words:
        phrase = ec_words[0].get("return-phrase", {})
        if isinstance(phrase, dict):
            headword = str(phrase.get("l", {}).get("i", ""))
        else:
            headword = str(phrase or "")
    if not headword and simple_words:
        headword = str(simple_words[0].get("return-phrase", ""))

    pos_glosses: dict[str, list[str]] = {}
    for entry in ec_words:
        for translation in entry.get("trs", []) or []:
            for item in translation.get("tr", []) or []:
                for line in item.get("l", {}).get("i", []) or []:
                    match = re.match(r"^([a-z]+\.)\s*(.+)$", str(line).strip(), re.I)
                    if not match:
                        continue
                    pos = POS_ALIASES.get(match.group(1).lower(), match.group(1).lower())
                    gloss = compact_gloss(match.group(2))
                    if gloss and gloss not in pos_glosses.setdefault(pos, []):
                        pos_glosses[pos].append(gloss)
    recognized = bool(ec_words) and normalize(headword or word) in {normalize(word), normalize(headword)}
    return {
        "recognized": recognized,
        "pos_glosses": pos_glosses,
        "headword": headword,
        "path": str(path),
    }


def compact_gloss(text: str) -> str:
    text = re.sub(r"[（(][^）)]*[）)]", "", str(text or ""))
    text = re.sub(r"\s+", "", text).strip("；;，,。 ")
    first = re.split(r"[；;]", text, maxsplit=1)[0]
    parts = [part.strip("，,。 ") for part in re.split(r"[，,]", first) if part.strip("，,。 ")]
    return "；".join(parts[:2])


def trusted_1200_glosses() -> dict[str, tuple[str, str]]:
    payload = load_json(SOURCE_1200)
    result = {}
    for row in payload["rows"]:
        if row.get("itemType") != "word":
            continue
        result[normalize(row["item"])] = (str(row.get("posType", "")), str(row.get("chineseMeaning", "")))
    return result


def build_union() -> tuple[list[dict], dict]:
    source_rows = load_json(SOURCE_4151)["rows"]
    review_rows = load_json(SOURCE_REVIEW)["results"]
    review_by_rank = {int(row["rank"]): row for row in review_rows}
    rows688 = load_json(SOURCE_688)["rows"]
    by_key: dict[str, dict] = {}

    for row in source_rows:
        key = normalize(row["text"])
        review = review_by_rank.get(int(row["rank"]), {})
        by_key[key] = {
            "originalWord": row["text"],
            "canonicalWord": row["text"],
            "originalPos": row.get("type", ""),
            "validatedPos": row.get("type", ""),
            "rank4151": row["rank"],
            "frequency4151": row.get("frequency"),
            "yearCoverage": row.get("yearCoverage"),
            "reviewStatus": review.get("status", ""),
            "rank688": None,
            "frequency688": None,
            "frequencyBand688": "",
            "verification688": "",
            "source": "4151真题人工审核表",
        }

    matched = 0
    unmatched = 0
    for row in rows688:
        keys = [normalize(row.get("matchKey", row["word"])), normalize(row.get("alternateMatchKey", ""))]
        key = next((candidate for candidate in keys if candidate and candidate in by_key), "")
        if key:
            target = by_key[key]
            matched += 1
            target.update(
                {
                    "rank688": row["rank"],
                    "frequency688": row.get("sourceFrequency"),
                    "frequencyBand688": row.get("frequencyBand", ""),
                    "verification688": row.get("verification", ""),
                    "source": "4151真题人工审核表＋688专业版",
                }
            )
            continue
        unmatched += 1
        key = normalize(row.get("matchKey", row["word"]))
        by_key[key] = {
            "originalWord": row["word"],
            "canonicalWord": row["word"],
            "originalPos": "",
            "validatedPos": "",
            "rank4151": None,
            "frequency4151": None,
            "yearCoverage": None,
            "reviewStatus": "688原表已核对",
            "rank688": row["rank"],
            "frequency688": row.get("sourceFrequency"),
            "frequencyBand688": row.get("frequencyBand", ""),
            "verification688": row.get("verification", ""),
            "source": "688专业版",
        }
    rows = sorted(by_key.values(), key=lambda row: (row["rank4151"] is None, row["rank4151"] or row["rank688"] or 0))
    return rows, {"source4151": len(source_rows), "source688": len(rows688), "matched688": matched, "unmatched688": unmatched, "rawUnion": len(rows)}


def validate(rows: list[dict], cache_dir: Path) -> tuple[list[dict], dict]:
    system_words = load_system_words()
    wn = load_wordnet()
    trusted = trusted_1200_glosses()
    validated = []
    merged_keys: set[str] = set()
    duplicate_merges = []

    for row in rows:
        original_key = normalize(row["originalWord"])
        canonical, form_reason = CONFIRMED_FORMS.get(original_key, (row["originalWord"], ""))
        canonical_key = normalize(canonical)
        if canonical_key in merged_keys:
            duplicate_merges.append({"original": row["originalWord"], "canonical": canonical, "reason": form_reason})
            continue
        merged_keys.add(canonical_key)

        display_word = PROPER_CASE.get(canonical_key, canonical)
        dictionary = parse_youdao(cache_dir, canonical_key)
        wn_pos = wordnet_pos(wn, canonical_key)
        dict_pos = set(dictionary["pos_glosses"])

        original_pos = str(row.get("originalPos", ""))
        validated_pos = CONFIRMED_POS.get(canonical_key, (original_pos, ""))[0]
        pos_reason = CONFIRMED_POS.get(canonical_key, ("", ""))[1]
        if not validated_pos:
            validated_pos = next(iter(dictionary["pos_glosses"]), "") or next(iter(sorted(wn_pos)), "")
        normalized_pos = POS_ALIASES.get(validated_pos, validated_pos)
        pos_verified = not normalized_pos or normalized_pos in dict_pos or normalized_pos in wn_pos

        if canonical_key in trusted:
            trusted_pos, chinese = trusted[canonical_key]
            gloss_source = "1200人工定稿释义"
            if not normalized_pos:
                validated_pos = trusted_pos
                normalized_pos = POS_ALIASES.get(validated_pos, validated_pos)
        else:
            glosses = dictionary["pos_glosses"].get(normalized_pos, [])
            if not glosses:
                glosses = [item for values in dictionary["pos_glosses"].values() for item in values]
            chinese = "；".join(glosses[:2]) if glosses else "待人工补充"
            gloss_source = "有道词典" if glosses else "无词典结果"

        spelling_verified = (
            canonical_key in system_words
            or bool(wn_pos)
            or dictionary["recognized"]
            or canonical_key in PROPER_CASE
        )
        issues = []
        if form_reason:
            issues.append(form_reason)
        if not spelling_verified:
            issues.append("系统词典、WordNet 与有道词典均未确认该词形")
        if not pos_verified:
            issues.append(
                f"原词性 {original_pos or '空'} 未被词典支持；词典词性为 {'/'.join(sorted(dict_pos or wn_pos)) or '未知'}"
            )
        if pos_reason:
            issues.append(pos_reason)
        if chinese == "待人工补充":
            issues.append("未取得可靠中文释义")

        result = dict(row)
        result.update(
            {
                "canonicalWord": display_word,
                "validatedPos": validated_pos,
                "chineseMeaning": chinese,
                "spellingStatus": "已确认" if spelling_verified else "需人工复核",
                "posStatus": "已确认" if pos_verified else "需人工复核",
                "meaningStatus": "已确认" if chinese != "待人工补充" else "需人工复核",
                "glossSource": gloss_source,
                "dictionaryUrl": f"https://dict.youdao.com/result?word={urllib.parse.quote(canonical_key)}&lang=en",
                "auditIssues": "；".join(issues),
            }
        )
        validated.append(result)

    summary = {
        "canonicalTotal": len(validated),
        "duplicateMerges": duplicate_merges,
        "spellingReview": sum(row["spellingStatus"] != "已确认" for row in validated),
        "posReview": sum(row["posStatus"] != "已确认" for row in validated),
        "meaningReview": sum(row["meaningStatus"] != "已确认" for row in validated),
        "glossSources": dict(Counter(row["glossSource"] for row in validated)),
        "wordnetAvailable": wn is not None,
    }
    return validated, summary


def prepare_manifest(rows: list[dict], cache_dir: Path, manifest_path: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    unique = sorted({normalize(CONFIRMED_FORMS.get(normalize(row["originalWord"]), (row["originalWord"], ""))[0]) for row in rows})
    lines = []
    for word in unique:
        target = cache_dir / cache_name(word)
        if target.exists() and target.stat().st_size > 20:
            continue
        url = "https://dict.youdao.com/jsonapi?q=" + urllib.parse.quote(word)
        lines.append(f"{url}\t{target}")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), "requests": len(lines), "cache": str(cache_dir)}, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--prepare-manifest", type=Path)
    args = parser.parse_args()

    rows, source_summary = build_union()
    if args.prepare_manifest:
        prepare_manifest(rows, args.cache_dir, args.prepare_manifest)
        return 0

    validated, audit_summary = validate(rows, args.cache_dir)
    payload = {
        "title": "陈浩谦高考英语完整词库可靠性审计",
        "auditDate": "2026-08-03",
        "sources": {
            "reviewed4151": str(SOURCE_4151),
            "reviewClassification": str(SOURCE_REVIEW),
            "professional688": str(SOURCE_688),
            "trusted1200": str(SOURCE_1200),
            "dictionary": "https://dict.youdao.com",
            "wordnet": "NLTK WordNet",
            "systemDictionary": "/usr/share/dict",
        },
        "summary": {**source_summary, **audit_summary},
        "rows": validated,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
