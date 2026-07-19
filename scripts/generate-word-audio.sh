#!/bin/bash
# 批量生成单词朗读 MP3
# 英文：en-US-GuyNeural（自然友好男声）
# 中文：zh-CN-YunxiNeural（云希，年轻可爱男声）

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
EN_DIR="$DIR/assets/audio/words-en"
CN_DIR="$DIR/assets/audio/words-cn"

# 单词列表（从 word-rain.html 中提取或直接定义）
WORDS_EN=(
  # 动词
  "abandon" "absorb" "achieve" "acquire" "adapt" "adopt" "affect" "analyze"
  "apply" "appreciate" "attempt" "attract" "benefit" "challenge" "communicate"
  "compare" "compete" "complain" "concentrate" "confirm" "connect" "consider"
  "contribute" "convince" "cover" "deliver" "demand" "depend" "desire"
  "determine" "develop" "devote" "discover" "encourage" "escape" "exist"
  "explore" "express" "focus" "guarantee"
  # 名词
  "ability" "achievement" "advantage" "ambition" "anxiety" "atmosphere"
  "attitude" "background" "balance" "behavior" "campaign" "confidence"
  "connection" "consequence" "contribution" "curiosity" "determination"
  "environment" "evidence" "experience" "impression" "influence" "knowledge"
  "opportunity" "patience" "phenomenon" "population" "protection"
  "responsibility" "significance" "strategy" "tradition" "volunteer"
  # 形容词&副词
  "accessible" "accurate" "aggressive" "anxious" "appropriate" "available"
  "beneficial" "comfortable" "confident" "constant" "curious" "desperate"
  "efficient" "essential" "familiar" "flexible" "fortunate" "generous"
  "gradually" "helplessly" "independent" "inevitable" "natural" "official"
  "peaceful" "permanent" "precious" "previous" "reasonable" "significant"
  "temporary" "uncomfortable" "unforgettable" "wonderful" "worried"
)

# 需要特殊处理的短语（文件名用短横线替代空格和斜杠）
declare -A PHRASES
PHRASES=(
  ["account-for"]="account for"
  ["add-up-to"]="add up to"
  ["break-down"]="break down"
  ["bring-up"]="bring up"
  ["call-off"]="call off"
  ["carry-on"]="carry on"
  ["come-across"]="come across"
  ["cut-down"]="cut down"
  ["deal-with"]="deal with"
  ["figure-out"]="figure out"
  ["get-along-with"]="get along with"
  ["give-in"]="give in"
  ["go-through"]="go through"
  ["hold-on"]="hold on"
  ["instead-of"]="instead of"
  ["keep-up-with"]="keep up with"
  ["look-forward-to"]="look forward to"
  ["make-up"]="make up"
  ["pay-off"]="pay off"
  ["put-forward"]="put forward"
  ["run-out-of"]="run out of"
  ["serve-as"]="serve as"
  ["set-up"]="set up"
  ["take-over"]="take over"
  ["turn-out"]="turn out"
)

# 中文翻译
declare -A CN_MAP
CN_MAP=(
  # 动词
  ["abandon"]="放弃，抛弃"
  ["absorb"]="吸收，专心于"
  ["achieve"]="达成，取得"
  ["acquire"]="获得，习得"
  ["adapt"]="适应，改编"
  ["adopt"]="采纳，收养"
  ["affect"]="影响，使感动"
  ["analyze"]="分析"
  ["apply"]="申请，应用"
  ["appreciate"]="感激，欣赏"
  ["attempt"]="尝试"
  ["attract"]="吸引"
  ["benefit"]="有益于，获益"
  ["challenge"]="向…挑战"
  ["communicate"]="交流"
  ["compare"]="比较"
  ["compete"]="竞争"
  ["complain"]="抱怨"
  ["concentrate"]="集中"
  ["confirm"]="确认，证实"
  ["connect"]="连接"
  ["consider"]="考虑，认为"
  ["contribute"]="贡献"
  ["convince"]="使信服，说服"
  ["cover"]="覆盖，涉及"
  ["deliver"]="递送"
  ["demand"]="要求"
  ["depend"]="依靠"
  ["desire"]="渴望，向往"
  ["determine"]="下定决心，确定"
  ["develop"]="发展，培养"
  ["devote"]="致力于，奉献"
  ["discover"]="发现"
  ["encourage"]="鼓励，激励"
  ["escape"]="逃离，逃避"
  ["exist"]="存在，生存"
  ["explore"]="探索"
  ["express"]="表达，传递"
  ["focus"]="集中"
  ["guarantee"]="保证，担保"
  # 名词
  ["ability"]="能力"
  ["achievement"]="成就"
  ["advantage"]="优势"
  ["ambition"]="抱负"
  ["anxiety"]="焦虑"
  ["atmosphere"]="气氛，大气"
  ["attitude"]="态度"
  ["background"]="背景"
  ["balance"]="平衡"
  ["behavior"]="行为"
  ["campaign"]="活动，运动"
  ["confidence"]="信心"
  ["connection"]="连接，关系"
  ["consequence"]="后果"
  ["contribution"]="贡献"
  ["curiosity"]="好奇心"
  ["determination"]="决心"
  ["environment"]="环境"
  ["evidence"]="证据"
  ["experience"]="经历，经验"
  ["impression"]="印象"
  ["influence"]="影响"
  ["knowledge"]="知识"
  ["opportunity"]="机会"
  ["patience"]="耐心"
  ["phenomenon"]="现象"
  ["population"]="种群，人口"
  ["protection"]="保护"
  ["responsibility"]="责任"
  ["significance"]="重要性，意义"
  ["strategy"]="策略"
  ["tradition"]="传统"
  ["volunteer"]="志愿者"
  # 形副
  ["accessible"]="可进入的"
  ["accurate"]="准确的"
  ["aggressive"]="侵略的，好斗的"
  ["anxious"]="焦虑的"
  ["appropriate"]="适当的"
  ["available"]="可用的"
  ["beneficial"]="有益的"
  ["comfortable"]="舒服的"
  ["confident"]="自信的"
  ["constant"]="持续的"
  ["curious"]="好奇的"
  ["desperate"]="绝望的，拼命的"
  ["efficient"]="高效的"
  ["essential"]="必要的"
  ["familiar"]="熟悉的"
  ["flexible"]="灵活的"
  ["fortunate"]="幸运的"
  ["generous"]="慷慨的"
  ["gradually"]="逐渐地"
  ["helplessly"]="无助地"
  ["independent"]="独立的"
  ["inevitable"]="不可避免的"
  ["natural"]="自然的"
  ["official"]="官方的"
  ["peaceful"]="平和的"
  ["permanent"]="永久的"
  ["precious"]="珍贵的"
  ["previous"]="先前的"
  ["reasonable"]="合理的"
  ["significant"]="显著的，重要的"
  ["temporary"]="临时的"
  ["uncomfortable"]="不舒服的"
  ["unforgettable"]="难忘的"
  ["wonderful"]="极好的"
  ["worried"]="担心的"
  # 短语
  ["account-for"]="解释，占比例"
  ["add-up-to"]="总计"
  ["break-down"]="分解，出故障"
  ["bring-up"]="抚养，提出"
  ["call-off"]="取消"
  ["carry-on"]="继续"
  ["come-across"]="偶遇"
  ["cut-down"]="削减"
  ["deal-with"]="处理，应对"
  ["figure-out"]="弄清楚"
  ["get-along-with"]="与…相处"
  ["give-in"]="屈服"
  ["go-through"]="经历，仔细检查"
  ["hold-on"]="坚持，稍等"
  ["instead-of"]="替代，而不是"
  ["keep-up-with"]="跟上"
  ["look-forward-to"]="期待"
  ["make-up"]="编造，弥补，组成"
  ["pay-off"]="还清，取得成功"
  ["put-forward"]="提出"
  ["run-out-of"]="用完"
  ["serve-as"]="作为，充当"
  ["set-up"]="建立"
  ["take-over"]="接管"
  ["turn-out"]="结果是"
)

TOTAL=$((${#WORDS_EN[@]} + ${#PHRASES[@]}))
CURRENT=0

echo "========================================="
echo "  批量生成单词朗读 MP3"
echo "  英文声线：en-US-GuyNeural"
echo "  中文声线：zh-CN-YunxiNeural"
echo "  总计：${TOTAL} 个单词 × 2 = $((TOTAL * 2)) 个文件"
echo "========================================="

# 生成单个单词的英文 MP3
generate_en() {
  local word="$1"
  local safe="$2"
  local out="$EN_DIR/${safe}.mp3"
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "  ⏭ 跳过(已存在) $safe"
    return
  fi
  edge-tts --voice en-US-GuyNeural --text "$word" --write-media "$out" 2>/dev/null
  CURRENT=$((CURRENT + 1))
  echo "  [$CURRENT/$((TOTAL * 2))] EN ✓ $word → ${safe}.mp3"
}

# 生成单个单词的中文 MP3
generate_cn() {
  local safe="$1"
  local text="$2"
  local out="$CN_DIR/${safe}.mp3"
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "  ⏭ 跳过(已存在) $safe"
    return
  fi
  edge-tts --voice zh-CN-YunxiNeural --text "$text" --write-media "$out" 2>/dev/null
  CURRENT=$((CURRENT + 1))
  echo "  [$CURRENT/$((TOTAL * 2))] CN ✓ $text → ${safe}.mp3"
}

# 处理普通单词
for word in "${WORDS_EN[@]}"; do
  safe=$(echo "$word" | tr ' ' '-' | tr '/' '-')
  generate_en "$word" "$safe"
  cn_text="${CN_MAP[$word]:-$word}"
  generate_cn "$safe" "$cn_text"
done

# 处理短语
for safe in "${!PHRASES[@]}"; do
  phrase="${PHRASES[$safe]}"
  generate_en "$phrase" "$safe"
  cn_text="${CN_MAP[$safe]:-$phrase}"
  generate_cn "$safe" "$cn_text"
done

echo ""
echo "========================================="
echo "  ✅ 生成完成！"
echo "  英文 MP3：$EN_DIR/"
echo "  中文 MP3：$CN_DIR/"
echo "========================================="
ls "$EN_DIR" | wc -l | xargs echo "  英文文件数："
ls "$CN_DIR" | wc -l | xargs echo "  中文文件数："
du -sh "$EN_DIR" "$CN_DIR"
