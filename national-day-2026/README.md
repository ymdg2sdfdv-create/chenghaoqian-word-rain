# 国庆六天早读（2026）

当前目录版本：semantic-v2，2026-09-30本地待用户验收，未推送GitHub。

入口index.html。维护源属于同级“陈浩谦高考英语提升系统”，data.js由源端生成器产出，不手改。保留静态本地交付，不更改Unit1、Week2或wordrain_v3记录。

## 当前范围和流程

- 629条课堂来源、488个词族复习单元、47个语义组、170个学习块全部保留；549个不同英文主词条，对应568项独立核对任务。
- 合并28组重叠释义，整理amuse/confuse/say的词族备注；13组真实多词性或多义项拆为32项分别核对。英文相同但义项不同的任务保留相邻学习和独立答案；认识一个义项不代表认识全部。
- 新队列每天“词条数 / 义项任务数”：225/235、256/275、192/201、225/235、195/204、253/272；这是基础计划，实际还包含前日不认识义项去重后优先回访。
- 第1—3天每项2轮拆分拼写＋4次英中单词爆炸。每轮拆分后完整英文＋本义项中文，每次爆炸也按英文→中文顺序播放，所以完整英文6遍、中文6遍，另有2轮逐字母或词块拼读。取消中文提示回忆环节。
- 首轮结束后看英文、课堂词性及必要英文搭配，选择认识或不认识；不认识显示答案并发音，整轮结束后仅补读不认识项，不自动再次复测。
- 第4—6天用课堂原句挖空或词义＋词性提示主动回忆，口述或输入后揭晓核对；多义任务按当前义项回忆，分别自评。补读不等于掌握，原不认识记录继续保留。
- 每个环节完成15项跟读/核对后播放一条激励，最后一项不额外插播。固定10条无放回乱序轮换，相邻不重复；暂停和刷新保留未播完的提醒，已完成不重复触发。按义项任务计数，不按字母、拼读轮次或爆炸次数计数。

## 旧记录保护

- 存储仍用wordrain_national_day_2026_v1，在原对象上增加catalogVersion、dayVersions。首次识别旧记录时，先保存原始字符串的独立pre_semantic_v2恢复副本，随后才允许写入兼容元数据。
- 已开始或已完成的日期使用compat/legacy-v1.json中冻结的593旧卡目录，原cardIds、answers、unknown、readIndex/testIndex/replayIndex、时间戳与激励提醒保持不变。页面明确显示“按原队列续读”；这类日期仍会显示原任务数，不中途缩短或改排。
- 未开始日期使用新队列；此前旧不认识ID通过生成的legacyIdToTaskIds映射到对应义项。合并去重不生成新答案，冲突的旧认识/不认识记录原样保留；多义旧卡可对应多个新任务，保留复习而不推断掌握。
- 无法无损解释的记录不会清空或覆盖，进入停止写入状态；保存学习记录按钮可导出原始字符串。不要通过清空浏览器存储来升级。
- compat/legacy-v1.json仅为恢复与旧队列续读快照，不是另行维护的主词库。旧ID到主词条及义项映射在源项目output/national-day-2026-qa/旧ID-主词条-义项任务映射.json。
- 暂停、切后台、刷新、关闭后从当前未完成项继续；不同浏览器和地址的记录互不共享。测试只使用独立浏览器上下文，不修改学生实际记录。

## 视觉与音频

参考封面的校园背景铺满视口，真实文字与控件悬浮于玻璃面板。支持11寸iPad横竖屏、安全区、长词组换行、大触控按钮和减少动态效果；Safari首次播放需要点击。

当前全部1237个词汇/字母/词块/释义音频使用固定专属音色：英文en-US-GuyNeural，中文zh-CN-YunxiNeural（云希），生成后以本地MP3播放。专属录音位于audio/guy-yunxi-v1，音色、文本、时长与哈希记录在audio-manifest.json；没有操作系统或浏览器TTS回退。录音失败会提示重试并保留位置，不用其他音色替代。

2轮拆分和4次爆炸合计每项完整英文6遍、当前义项中文6遍，另有2轮字母/词块朗读。每次爆炸等英文和中文都结束才进入下一次，激励仍按15个完整任务计数。

固定10条激励录音保持已确认的云希音色及原文件不变。原audio根目录录音仅作为旧版恢复素材保留；当前载荷不引用这些旧路径。新路径同时避免Safari继续使用旧音色缓存。

完整目录可离线本地托管。GitHub网站首次使用和未缓存语音需要联网，不声称Safari已自动缓存全部资源。

## 字母间隔（2026-09-30调整）

仅逐字母拼读使用26个Guy专属录音的缩短空白版本，录音前后空白各去掉三分之一，因此相邻字母的录音停顿为原来的三分之二；发音采样保持不变，不加速或变调。字母最小计时间隔由340ms改为227ms；真正的停顿变化来自录音空白调整。

拼读文件使用audio/letters-gap-two-thirds-v1中的PCM WAV，原专属MP3保留。词组分块、完整英文、中文、4次爆炸和10条激励均不变。letter-audio-manifest.json记录原文件哈希、删除的空白采样数和新文件哈希。

生成脚本为scripts/build_national_day_letter_audio.py；专属字母原录音改变时，先重建拼读录音，再运行课程生成器。检查入口tests/national-day/letter-gap.cjs覆盖26个文件及所有676种字母组合的停顿比例。

## 生成与验收

音频文本有变化时，先执行课程生成器的--prepare-audio准备待录音载荷；使用Python 3.12运行音频生成器并以--catalog传入output/national-day-2026-qa/pending-audio-catalog.json，最后再运行课程生成器发布已核验的专属路径。录音不齐全时不会切换运行载荷。

源端生成器：scripts/build_national_day_2026.py、scripts/build_national_day_audio.py（使用已安装edge_tts的Python 3.12；先生成完整专属录音清单，再执行课程生成器切换路径）、scripts/build_national_day_encouragement.py。
语义规则：scripts/national_day_pdf_merge_rules.json（本轮已审核的合并参考）、scripts/national_day_sense_rules.json（早读义项与例句选择规则）。不使用PDF题号替代课程ID，不修改已交付PDF。

检查包括core.cjs、semantic.cjs、encouragement.cjs、app-vm.cjs和WebKit的browser.cjs、advanced.cjs、cues-browser.cjs、real-cue.cjs、semantic-browser.cjs、semantic-audio.cjs、dedicated-voice.cjs，位于源端tests/national-day。

本地验收服务：源端python3 scripts/serve_national_day_course.py，只开放本课程包，默认8784端口。iPad使用服务实际打印的Network地址，与电脑同Wi-Fi，保持服务运行。

本地自动检查与截图审核不代替真实11寸iPad Safari触控、扬声器、切后台和锁屏续读验收。用户本地测试并明确确认后，才能推送原GitHub仓库。
