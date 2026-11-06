(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const voice = $('voice'), home = $('home'), reader = $('reader');
  let data, plan = [], cursor = 0, generation = 0, status = 'idle', pending = null;
  let startPosition = 1, completedItems = 0, completedTerms = 0, wakeLock = null;
  let unlockReady = Promise.resolve(), unlockFailed = false, loadState = 'idle', lastFailure = null;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const minutes = seconds => `${Math.ceil(seconds / 60)}分钟`;
  const displayTime = ms => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock || document.hidden) return;
    try { const lock = await navigator.wakeLock.request('screen'); if (status !== 'running') { await lock.release(); return; } wakeLock = lock; lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; }); } catch (_) {}
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  function controls() {
    if (!$('pause')) return;
    $('pause').textContent = status === 'running' ? '暂停' : status === 'error' ? '重试并继续' : '继续';
    $('play-state').textContent = status === 'running' ? '正在朗读' : status === 'error' ? '等待重试' : '已暂停';
    if (status === 'running' && pending?.event.type === 'audio' && loadState !== 'playing') $('play-state').textContent = '正在准备当前声音，请稍候…';
    if (pending?.event.type === 'countdown') $('play-state').textContent = status === 'running' ? '恢复注意力 · 计时中' : '恢复注意力 · 已暂停';
  }
  function pause(message) {
    if (status !== 'running') return;
    status = 'paused'; pending?.pause(); if (loadState !== 'downloading') voice.pause(); releaseWakeLock(); controls();
    if (message) $('reader-note').textContent = message;
  }
  function resume() {
    if (status !== 'paused' && status !== 'error') return;
    const retry = status === 'error'; status = 'running'; $('play-error').hidden = true;
    if (unlockFailed) unlockSound();
    $('reader-note').textContent = '跟着声音读；需要休息时，随时暂停。'; controls(); keepAwake(); pending?.resume(retry);
  }
  function cancel() {
    generation++; status = 'idle'; pending?.cancel(); pending = null; voice.pause();
    voice.removeAttribute('src'); voice.load(); Nov07Audio.cancelDownloads(); loadState = 'idle'; releaseWakeLock();
  }
  function unlockSound() {
    const token = generation; unlockFailed = false;
    unlockReady = Nov07Audio.unlock(voice).then(() => null, error => { if (token === generation) unlockFailed = true; return error; });
  }
  function renderShell() {
    reader.innerHTML = `<header class="read-head"><div><h1>11月7日 · 模拟试卷一早读</h1><p id="play-state">正在朗读</p></div><button id="back" type="button">返回封面</button></header><div class="progress" role="progressbar" aria-label="本轮朗读进度" aria-valuemin="0" aria-valuemax="${82 - startPosition}" aria-valuenow="0"><span id="progress-fill"></span></div><section id="focus" class="focus"></section><div id="play-error" class="play-error" role="alert" hidden></div><div class="actions"><button id="pause" type="button">暂停</button><button id="restart" class="secondary" type="button">从本次起点重读</button></div><p id="reader-note" class="read-note">跟着声音读；需要休息时，随时暂停。</p>`;
    $('pause').onclick = () => status === 'running' ? pause() : resume();
    $('restart').onclick = () => start(startPosition);
    $('back').onclick = () => { cancel(); reader.hidden = true; home.hidden = false; $('start').focus(); };
  }
  function paint(event) {
    const box = $('focus'), item = event.item, term = event.term;
    if (event.type === 'wait') return;
    box.className = 'focus ' + event.stage;
    if (event.stage === 'encouragement') {
      box.innerHTML = `<div class="stage">第 ${data.encouragements.indexOf(event.cue) + 1} 次小休息</div><p class="cue">${safe(event.cue.text)}</p><p class="pattern">听完这句话，休息60秒。</p>`;
    } else if (event.type === 'countdown') {
      const ticks = Array.from({length:60}, (_, i) => `<line x1="160" y1="${i % 5 ? 29 : 23}" x2="160" y2="${i % 5 ? 35 : 38}" transform="rotate(${i * 6} 160 160)" class="${i % 5 ? 'tick' : 'tick major'}"/>`).join('');
      box.innerHTML = `<div class="stage">60秒 · 注意力恢复</div><div class="stopwatch"><svg viewBox="0 0 320 320" aria-hidden="true"><rect x="145" y="1" width="30" height="11" rx="4"/><circle class="watch-track" cx="160" cy="160" r="143"/><circle id="watch-ring" class="watch-ring" cx="160" cy="160" r="143"/>${ticks}<g id="watch-hand"><line x1="160" y1="160" x2="160" y2="52"/><circle cx="160" cy="160" r="5"/></g></svg><div class="watch-face"><span id="countdown-time" role="timer" aria-label="剩余恢复时间">01:00</span><small>剩余时间</small></div></div><p class="recovery-note">眼睛离开屏幕，放松肩膀，慢慢呼吸。</p><p class="pattern">倒计时结束后，自动继续朗读。</p>`;
    } else {
      const phase = event.stage === 'spell' ? `拼读 ${event.round} / 2` : event.stage === 'reveal' ? `第 ${event.round} 轮拼读后 · 整词与中文` : event.stage === 'phrase' ? `短语整体朗读 ${event.round} / 5` : `整体朗读 ${event.round} / 4`;
      const isSpelling = event.stage === 'spell';
      const relations = item.terms.length > 1 ? item.terms.map(t => t.word).join(' → ') + (item.word === 'leave' ? ' → left' : '') : item.derivedFrom ? `${item.derivedFrom} → ${term.word}` : '';
      box.innerHTML = `<div class="meta"><span>播放 ${item.position} / 81 · 原编号 ${item.number}</span><span>${safe(item.group)}</span></div><div class="stage">${phase}</div><div id="english" class="english ${term.word.length > 17 ? 'long' : ''}" lang="en">${isSpelling ? safe(term.word).split('').map(letter => `<span class="letter upcoming">${letter}</span>`).join('') : safe(term.word)}</div><div class="meaning ${isSpelling ? 'concealed' : ''}"><span class="pos">${safe(term.pos)}</span>${safe(term.cn)}</div><div class="pattern">${safe(relations)}</div><div class="rounds" aria-hidden="true">${Array.from({length:event.stage === 'phrase' ? 5 : event.stage === 'burst' ? 4 : 2}, (_, i) => `<i class="${i < event.round ? 'active' : ''}"></i>`).join('')}</div>`;
    }
    controls();
  }
  function warmAhead(currentFile) {
    const paths = [...new Set(plan.slice(cursor + 1).filter(e => e.type === 'audio' && e.file !== currentFile).map(e => e.file))];
    Nov07Audio.prefetch(paths.slice(0, 2));
  }
  function audioStep(event, token) {
    return new Promise(resolve => {
      let raf = 0, watchdog = 0, lastTime = -1, lastProgress = 0, savedOffset = 0, settled = false;
      let attempt = 0, readyURL = '', failedCode = '';
      const current = number => token === generation && !settled && number === attempt;
      const cleanup = () => { cancelAnimationFrame(raf); clearInterval(watchdog); voice.onended = voice.onerror = voice.onloadedmetadata = voice.onplaying = null; };
      const finish = () => { if (settled) return; settled = true; cleanup(); resolve(); };
      const failure = (code, number) => {
        if (!current(number) || status !== 'running') return;
        failedCode = code; loadState = 'failed';
        lastFailure = {version:Nov07Audio.version, code, file:event.file, mediaCode:voice.error?.code || null, readyState:voice.readyState, networkState:voice.networkState};
        if (readyURL && voice.src === new URL(readyURL, document.baseURI).href) savedOffset = Math.max(savedOffset, voice.currentTime || 0);
        status = 'error'; voice.pause(); releaseWakeLock();
        const explanation = code === 'TAP_REQUIRED' ? 'Safari还没有开启声音。请点“重试并继续”开启。' : code.startsWith('DOWNLOAD') || code.startsWith('HTTP') ? '当前录音尚未下载完成。请点“重试并继续”，会保留当前朗读位置。' : '当前声音未能启动。请点“重试并继续”；如果仍不播放，可展开下方故障信息。';
        $('play-error').innerHTML = `${explanation}<details><summary>查看故障信息</summary><pre>${safe(JSON.stringify(lastFailure, null, 2))}</pre></details>`;
        $('play-error').hidden = false; controls();
      };
      const animate = () => {
        if (settled || token !== generation) return;
        if (event.stage === 'spell') {
          const time = readyURL && voice.src === new URL(readyURL, document.baseURI).href ? voice.currentTime : 0;
          const count = event.marks.filter(mark => mark.startSeconds <= time).length;
          document.querySelectorAll('#english .letter').forEach((letter, i) => { letter.className = 'letter ' + (i < count - 1 ? 'spoken' : i === count - 1 ? 'current' : 'upcoming'); });
        }
        raf = requestAnimationFrame(animate);
      };
      const playReady = (number, retry) => {
        if (!current(number) || status !== 'running') return;
        loadState = 'starting'; lastProgress = performance.now(); lastTime = -1; controls();
        voice.onended = () => { if (current(number) && status === 'running') finish(); };
        voice.onerror = () => failure('MEDIA_' + (voice.error?.code || 'ERROR'), number);
        voice.onplaying = () => {
          if (!current(number) || status !== 'running') return;
          loadState = 'playing'; lastProgress = performance.now(); controls(); warmAhead(event.file);
        };
        const needsReload = voice.src !== new URL(readyURL, document.baseURI).href || Boolean(voice.error) || (retry && failedCode === 'PLAY_ABORTED');
        if (needsReload) {
          voice.onloadedmetadata = () => { if (current(number) && savedOffset) voice.currentTime = Math.min(savedOffset, Math.max(0, voice.duration - .05)); };
          voice.src = readyURL; voice.load();
        }
        voice.play().then(() => {
          if (!current(number)) return;
          if (status !== 'running') voice.pause();
          else { loadState = 'playing'; controls(); warmAhead(event.file); }
        }).catch(error => failure(error.name === 'NotAllowedError' ? 'TAP_REQUIRED' : error.name === 'AbortError' ? 'PLAY_ABORTED' : 'PLAY_' + error.name, number));
      };
      const play = retry => {
        if (token !== generation || settled || status !== 'running') return;
        const number = ++attempt;
        if (retry && readyURL && failedCode && failedCode !== 'TAP_REQUIRED') { Nov07Audio.invalidate(event.file); readyURL = ''; }
        if (location.protocol === 'file:') readyURL = event.file;
        if (readyURL && !unlockFailed) { playReady(number, retry); return; }
        loadState = 'downloading'; controls();
        Promise.all([unlockReady, Nov07Audio.prepare(event.file, retry)]).then(([unlockError, url]) => {
          if (!current(number)) return;
          if (unlockError) { failure(unlockError.code || 'TAP_REQUIRED', number); return; }
          readyURL = url; playReady(number, retry);
        }).catch(error => failure(typeof error.code === 'string' ? error.code : 'DOWNLOAD_FAILED', number));
      };
      pending = {event, pause: () => { attempt++; savedOffset = readyURL ? voice.currentTime || 0 : 0; if (readyURL) voice.pause(); }, resume: play, cancel: finish};
      watchdog = setInterval(() => {
        if (status !== 'running' || token !== generation || !['starting','playing'].includes(loadState)) return;
        if (voice.currentTime !== lastTime) lastProgress = performance.now();
        lastTime = voice.currentTime;
        if (performance.now() - lastProgress >= 15000) failure('PLAY_TIMEOUT', attempt);
      }, 1000);
      animate(); play(false);
    });
  }
  function timedStep(event, token) {
    return new Promise(resolve => {
      const clock = new Nov07Core.Countdown(event.ms); let timer = 0, settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      const update = () => {
        if (event.type !== 'countdown' || !$('countdown-time')) return;
        const left = clock.remaining(), fraction = left / event.ms;
        $('countdown-time').textContent = displayTime(left);
        $('watch-ring').style.strokeDashoffset = String(2 * Math.PI * 143 * (1 - fraction));
        $('watch-hand').style.transform = `rotate(${360 * (1 - fraction)}deg)`;
      };
      const tick = () => { if (settled || token !== generation || status !== 'running') return; update(); if (clock.remaining() <= 0) finish(); else timer = setTimeout(tick, Math.min(50, clock.remaining())); };
      pending = {event, pause: () => { clock.pause(); clearTimeout(timer); update(); }, resume: () => { clock.start(); controls(); tick(); }, cancel: finish, remaining: () => clock.remaining()};
      clock.start(); controls(); tick();
    });
  }
  async function run(token) {
    while (cursor < plan.length && token === generation) {
      const event = plan[cursor];
      if (event.type === 'termEnd') completedTerms++;
      else if (event.type === 'itemEnd') {
        completedItems++; $('progress-fill').style.width = `${100 * completedItems / (82 - startPosition)}%`;
        document.querySelector('.progress').setAttribute('aria-valuenow', completedItems);
      } else {
        paint(event);
        if (event.type === 'audio') await audioStep(event, token);
        else await timedStep(event, token);
      }
      if (token !== generation) return;
      pending = null; cursor++;
    }
    if (token !== generation) return;
    status = 'done'; releaseWakeLock(); voice.pause();
    reader.innerHTML = `<section class="done"><div class="eyebrow">今天的声音，留下来了。</div><h2>这一遍，读完了。</h2><p>${startPosition === 1 ? '81项词汇与短语' : `从第 ${startPosition} 项到第81项`}，认真读过一遍。<br>带着这份熟悉感，开始新的一天。</p><div class="actions"><button id="done-home" type="button">返回封面</button><button id="again" class="secondary" type="button">再读一遍</button></div></section>`;
    $('done-home').onclick = () => { cancel(); reader.hidden = true; home.hidden = false; $('start').focus(); };
    $('again').onclick = () => start(startPosition);
  }
  function start(from = 1) {
    if (!data) return;
    cancel(); startPosition = from; completedItems = completedTerms = cursor = 0;
    plan = Nov07Core.buildPlan(data, from); status = 'running'; home.hidden = true; reader.hidden = false;
    renderShell(); window.scrollTo(0, 0); lastFailure = null; unlockSound(); keepAwake();
    const token = generation;
    run(token).catch(() => { if (token !== generation) return; status = 'error'; $('play-error').textContent = '播放未能继续，请返回封面后重新开始。'; $('play-error').hidden = false; controls(); });
  }
  function ready() {
    data = window.NOV07_DATA;
    if (!data || data.version !== 'nov07-tight-audio-v3' || data.items.length !== 81) throw new Error('Incomplete data');
    $('start').disabled = false; $('start').innerHTML = '开始今天的早读 <span aria-hidden="true">→</span>'; $('start').onclick = () => start(1);
    document.querySelectorAll('[data-part]').forEach(button => {
      const section = data.sections.find(s => s.id === button.dataset.part);
      button.disabled = false; button.querySelector('.duration').textContent = `第${section.from}–${section.to}项 · 本段约${minutes(section.readingSeconds)}`;
      button.onclick = () => start(section.from);
    });
    $('status').textContent = '词汇已就绪 · 72个单词 + 9个短语；left、paid随原词朗读。声音兼容版。'; $('retry').hidden = true;
  }
  function load() {
    $('status').textContent = '正在准备本次词汇，封面已就绪。'; $('retry').hidden = true;
    if (window.NOV07_DATA) { try { ready(); return; } catch (_) { window.NOV07_DATA = null; } }
    const script = document.createElement('script'); script.src = `data.js?v=nov07-tight-audio-v3&attempt=${Date.now()}`;
    let timer = setTimeout(failure, 20000);
    function failure() { clearTimeout(timer); script.remove(); script.onload = script.onerror = null; $('status').textContent = '词汇暂时没有加载好，请检查网络后重试。'; $('retry').hidden = false; }
    script.onload = () => { clearTimeout(timer); try { ready(); } catch (_) { failure(); } };
    script.onerror = failure; document.head.appendChild(script);
  }
  $('retry').onclick = load;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('离开页面时已暂停；回来后点击“继续”。'); });
  window.addEventListener('pagehide', () => pause());
  window.NOV07_PLAYER = Object.freeze({snapshot: () => ({status, cursor, startPosition, completedItems, completedTerms, stage: pending?.event.stage, position: pending?.event.item?.position, word: pending?.event.term?.word, remainingMs: pending?.remaining?.(), runtimeVersion:Nov07Audio.version, loadState, lastFailure})});
  load();
})();
