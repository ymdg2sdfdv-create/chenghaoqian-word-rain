/* National Day is isolated from all older classroom progress namespaces. */
(()=>{'use strict';
const D=window.NATIONAL_DAY_DATA,C=window.NDCore,R=window.NDRecords,$=s=>document.querySelector(s),main=$('#main'),player=$('#voice');
const E=window.NDCues,feedback=new Map(window.ND_FEEDBACK.records.map(r=>[r.id,{...r,lang:'cn',file:'feedback/'+r.file}]));
const cards=new Map([...D.legacy.cards,...D.cards].map(c=>[c.id,c])),links=new Map(D.links.map(l=>[l.linkId,l]));
let preservedRaw=null,store=R.fresh(C),day=null,state=null,running=false,token=0,cancelAudio=null,storageBlocked=false,lastAction=-Infinity,lastActionKey=null,externalChange=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text){$('#notice').hidden=!text;$('#notice').textContent=text;}
try{const raw=localStorage.getItem(C.KEY);if(raw){preservedRaw=raw;const result=R.load(raw,D,C);store=result.store;
 if(store.encouragement&&!E.valid(store.encouragement))throw Error('激励进度无法无损解释');
 if(result.upgrading){localStorage.setItem(C.KEY+'_pre_semantic_v2_'+Date.now(),raw);notice('已保留更新前记录；已开始的日期按原队列续读，未开始日期使用整理后的词表。');}
}}
catch(e){store=R.fresh(C);externalChange=true;storageBlocked=true;notice('原记录已保留，未被清空或改写。'+e.message+'；请先保存原始记录，当前暂停学习写入。');}
if(!store.encouragement)store.encouragement=E.fresh();
function taskCounts(ids){return `${new Set(ids.map(id=>cards.get(id).word.toLowerCase())).size}个词条 · ${ids.length}项核对`;}
function pendingCue(){return state&&store.encouragement.pending[day.day];}
function prepareCue(previous){if(state.phase===previous)E.prepare(store.encouragement,day.day,state.phase,C.index(state),C.queue(state,day).length);}
function save(){if(externalChange)return false;try{localStorage.setItem(C.KEY,JSON.stringify(store));return true;}catch(_){storageBlocked=true;notice('浏览器暂时无法保存进度。请先点“保存学习记录”留存，关闭页面可能丢失本次进度。');return false;}}
function stop(){token++;running=false;if(cancelAudio){cancelAudio();cancelAudio=null;}player.pause(); }
function btn(action,text,style=''){return `<button data-action="${action}" class="${style}">${text}</button>`;}
function home(){stop();day=null;state=null;main.dataset.phase='home';$('#home').hidden=true;main.innerHTML=`<section class="intro"><div class="hero-copy"><div class="eyebrow">早安，浩谦。 · 10.01—10.06</div><h1>把英语，<br>读出声来。</h1><p>从一个词开始，跟着声音读。<br>还不认识的，我们再读一遍。</p><button class="primary hero-start" data-day="${D.days.find(d=>store.days[d.day]?.phase!=='done')?.day||1}">进入国庆早读 <span>→</span></button><small>可以暂停，接着上次读。</small></div><aside class="intro-guide glass"><h2>前三天，这样读</h2><ol><li><strong>拆分跟读</strong><span>2轮拆分拼写 · 4次英中单词爆炸</span></li><li><strong>当日自测</strong><span>看英文和词性，选择认识 / 不认识</span></li><li><strong>重点再读</strong><span>复测结束，不认识的词再读一遍</span></li></ol></aside></section><div class="schedule-title"><h2>六天，把课堂词汇再走一遍。</h2><span>跟读 · 自测 · 补读 · 回访</span></div><div class="day-grid">${D.days.map(base=>{const d=effectiveDay(base.day),s=store.days[d.day];return `<section class="day-card"><div class="day-number"><strong>0${d.day}</strong><span>10月${d.day}日</span></div><h2>${d.title}</h2><p>${taskCounts(d.cardIds)}<br>${d.mode==='reading'?'拆分拼写 → 单词爆炸 → 复测':'主动回忆 → 关联辨析 → 不认识词补读'}</p><p>${d.catalogVersion===R.LEGACY?'按原队列续读 · ':''}${s?(s.phase==='done'?`本日已完成 · 保留${s.unknown.length}个不认识记录`:`已保存：${phaseName(s.phase)} ${C.index(s)+1}/${C.queue(s,d).length}`):'尚未开始'}</p><button class="${s?.phase==='done'?'':'primary'}" data-day="${d.day}">${s?.phase==='done'?'查看本日记录':s?'继续本日学习':'开始第'+d.day+'天'}</button></section>`;}).join('')}</div><div class="meta-strip"><span>优先复习跨课重复词</span><span>同族、近义与反义词相邻学习</span><span>暂停后可以接着读</span></div>`;}
function phaseName(p){return {reading:'首轮早读',test:day?.day>3?'回忆复习':'当日复测',replay:'不认识词再读',done:'本日完成'}[p];}
function effectiveDay(n){return R.effective(D,store,n);}
function openDay(n){if(externalChange)return;const pending=Object.keys(store.encouragement.pending)[0];if(pending&&Number(pending)!==n){notice('先完成第'+pending+'天暂停的激励提醒，再切换日期。');n=Number(pending);}stop();day=effectiveDay(n);store.dayVersions[n]??=day.catalogVersion;store.days[n]??=C.fresh(day);state=store.days[n];save();$('#home').hidden=false;render();}
function details(c){const related=c.links.map(id=>links.get(id)).filter(Boolean);const peers=D.cards.filter(x=>x.blockId===c.blockId&&x.id!==c.id);return `<details class="study-note" ${day.day>3?'open':''}><summary>词族、替换与辨析</summary><p><strong>${esc(c.group)}</strong> · 本课词义：${esc(c.cn)}</p>${peers.length?`<p>同组回顾（同主题不等于同义）：<br>${peers.map(x=>esc(x.word)+' ('+esc(x.pos)+') '+esc(x.cn)).join('； ')}</p>`:''}${c.senseNote?`<p>${esc(c.senseNote)}</p>`:''}${c.familyHint?`<p>${esc(c.familyHint)}</p>`:''}${related.map(l=>`<p><strong>${esc(l.kind)} · ${esc(l.families.join(' / '))}</strong><br>${esc(l.note)}</p>`).join('')}${c.contexts.slice(0,1).map(t=>`<p class="context">${esc(t)}</p>`).join('')}</details>`;}
function question(c){
 if(c.senseCount>1)return {stem:c.cn,hint:'根据当前词义和词性回忆英文；同词的其他义项分别核对。'};
 const escaped=c.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp('(^|[^A-Za-z])('+escaped+')(?=$|[^A-Za-z])','gi');
 const context=c.contexts.find(t=>{pattern.lastIndex=0;return pattern.test(t);});pattern.lastIndex=0;
 if(context)return {stem:context.replace(pattern,'$1 ______ '),hint:'根据课堂原句，回忆空缺处的词或词组。'};
 return {stem:c.cn,hint:'根据课堂词义和词性，回忆英文。口述后再揭晓核对。'};
}
function render(){
 if(!day||!state)return;
 main.dataset.phase=state.phase;
 if(pendingCue()){renderCue();return;}
 if(state.phase==='done'){main.innerHTML=`<section class="done"><div class="eyebrow">第${day.day}天 · 本日流程已完成</div><h1>这一遍，读完了。</h1><p>${taskCounts(day.cardIds)}已完成${day.mode==='retrieval'?'回忆核对':'自评'}。<br>${state.unknown.length?`${state.unknown.length}项不认识记录已按原形式补读一遍。`:'本轮没有标记不认识的词。'}</p><p>“认识”是本次自评；补读完成不会改写原来的不认识记录。</p><div class="unknown-list">${state.unknown.map(id=>`<span>${esc(cards.get(id).word)} · ${esc(cards.get(id).pos)}${cards.get(id).cue?' · '+esc(cards.get(id).cue):''}</span>`).join('')}</div>${btn('home','返回六天安排','primary')}</section>`;return;}
 const c=cards.get(C.current(state,day)),isTest=state.phase==='test',retrieval=isTest&&day.mode==='retrieval',showAnswer=isTest&&(state.revealed||state.promptRevealed),qinfo=retrieval?question(c):null,q=C.queue(state,day),i=C.index(state);
 main.innerHTML=`<div class="session-head"><h1>第${day.day}天 · ${phaseName(state.phase)}</h1><div class="counter">${i+1} / ${q.length}</div></div><div class="progress-track" role="progressbar" aria-label="本环节完成进度" aria-valuenow="${i}" aria-valuemin="0" aria-valuemax="${q.length}"><span style="width:${100*i/q.length}%"></span></div><section class="focus"><div class="focus-meta">${isTest?'':`<span>${esc(c.group)}</span><span>${esc(c.formType)}</span>${c.priority==='P1'?'<span class="priority">★ 跨课重点</span>':''}`}</div><div class="stage-label" id="stage">${isTest?(showAnswer?'核对答案与同组辨析':retrieval?'主动回忆 · 先口述或写下答案':'看英文和词性，回忆中文意思'):'准备跟读'}</div><h2 id="word" class="english ${c.word.length>18?'long':''} ${retrieval&&!showAnswer?'question-text':''}">${esc(retrieval&&!showAnswer?qinfo.stem:c.word)}</h2><div class="pos">${esc(c.pos)}</div>${c.senseCount>1?`<div class="sense-label">同词义项 ${c.senseNumber} / ${c.senseCount} · 只判断当前义项</div>${!retrieval||showAnswer?`<div class="sense-cue">${esc(c.cue)}</div>`:''}`:''}<div class="meaning" id="meaning" ${showAnswer?'':'hidden'}>${showAnswer?esc(c.cn):''}</div><div class="sense-note" id="sense-note" ${showAnswer?'':'hidden'}>${showAnswer?esc(c.senseNote||''):''}</div><div class="prompt" id="prompt">${isTest?(showAnswer?'核对答案后，如实记录本次回忆。':retrieval?qinfo.hint:'先自己想，再选择。'):'点下方开始，跟着声音读。'}</div>${retrieval&&!showAnswer?`<textarea id="response" aria-label="我的回忆答案（也可口述）" placeholder="可口述，也可在这里写下答案">${esc(state.responses[c.id]||'')}</textarea>`:''}<div class="rounds" id="rounds"></div></section><div class="controls ${isTest?'test':''}" id="controls">${isTest?(state.revealed?btn('hear','重听答案')+btn('next','下一词','primary'):retrieval?(showAnswer?btn('unknown','还需复习','unknown')+btn('known','独立答出','primary'):btn('reveal-prompt','揭晓并核对','primary')):btn('unknown','不认识','unknown')+btn('known','认识','primary')):btn('play',running?'暂停':'开始跟读','primary')}</div>${showAnswer?details(c):''}<p class="session-help">${isTest?'不认识的词会在这一轮全部结束后，集中再读一遍。':'每项2轮拆分拼写＋4次英中单词爆炸 · 暂停或离开后，从当前词继续。'}</p>`;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function live(t){return running&&t===token&&!document.hidden;}
function audioFile(aid,t,spelling=false){return new Promise((resolve,reject)=>{
 const item=(spelling&&D.letterAudio[aid])||feedback.get(aid)||D.audio[aid];if(!item){reject(Error('缺少当前词的语音'));return;}
 let settled=false;const finish=(ok,error)=>{if(settled)return;settled=true;clearTimeout(watch);player.onended=null;player.onerror=null;cancelAudio=null;error?reject(error):resolve(ok);};
 const watch=setTimeout(()=>{player.pause();finish(false,Error('语音加载较慢，请检查网络后继续'));},Math.max(30000,item.text.length*600));
 cancelAudio=()=>finish(false);player.onended=()=>finish(true);player.onerror=()=>{player.pause();finish(false,Error(feedback.has(aid)?'激励语音未能加载，请点继续重试':'专属录音未能加载，请点继续重试'));};
 player.src=item.file;player.playbackRate=1;player.play().catch(()=>finish(false,Error('Safari需要你再次点“开始跟读”或“重听答案”开启声音')));
 });}
function showWord(c,text){$('#word').textContent=text;$('#word').classList.toggle('long',c.word.length>18);}
async function reveal(c,t){if(!live(t))return false;showWord(c,c.word);$('#meaning').hidden=false;$('#meaning').textContent=c.cn;$('#sense-note').textContent=c.senseNote||'';$('#sense-note').hidden=!c.senseNote;await audioFile(c.enAudio,t);if(!live(t))return false;await delay(D.config.revealHoldMs);if(!live(t))return false;await audioFile(c.cnAudio,t);return live(t);}
async function playCard(c,t){
 for(let round=1;round<=D.config.spellRounds;round++){
  if(!live(t))return false;$('.focus').classList.remove('burst');$('#stage').textContent=`拆分拼写 ${round} / ${D.config.spellRounds}`;$('#meaning').hidden=true;$('#meaning').textContent='';$('#sense-note').hidden=true;$('#prompt').textContent=c.phrase?'按组成单词跟读，再读完整词组。':'逐字母跟读，再读完整单词。';$('#rounds').innerHTML=[1,2].map(n=>`<i class="${n<=round?'active':''}"></i>`).join('');
  for(const step of c.steps){if(!live(t))return false;showWord(c,step.visible);const start=performance.now();await audioFile(step.audio,t,!c.phrase);if(!live(t))return false;if(!c.phrase)await delay(Math.max(0,D.config.letterMs-(performance.now()-start)));}
  if(!await reveal(c,t))return false;
 }
 for(let n=1;n<=D.config.flashCount;n++){
  if(!live(t))return false;$('#stage').textContent=`单词爆炸 ${n} / ${D.config.flashCount}`;$('#prompt').textContent='跟读英文，再听中文意思。';$('#rounds').innerHTML=[1,2,3,4].map(v=>`<i class="${v<=n?'active':''}"></i>`).join('');const f=$('.focus');f.classList.remove('burst');void f.offsetWidth;f.classList.add('burst');showWord(c,c.word);await audioFile(c.enAudio,t);if(!live(t))return false;await audioFile(c.cnAudio,t);if(!live(t))return false;
 }
 return live(t);
}
async function play(){
 if(running){stop();render();return;}
 if(externalChange)return;
 if(pendingCue()){playCue();return;}
 if(!['reading','replay'].includes(state.phase))return;
 running=true;const t=++token;render();$('#controls button').textContent='暂停';
 try{
  while(live(t)&&['reading','replay'].includes(state.phase)){
   const id=C.current(state,day),c=cards.get(id);if(!await playCard(c,t))return;if(!live(t))return;
   const previous=state.phase;C.finishCard(state,day,id);prepareCue(previous);save();render();
   if(pendingCue()){if(!await deliverCue(t))return;render();}
   if(state.phase==='test'||state.phase==='done'){running=false;render();return;}
   await delay(320);
  }
 }catch(e){if(t===token){stop();notice(e.message+'。当前词未记为完成。');render();}}
}
function renderCue(){
 const p=pendingCue(),item=p.id?feedback.get(p.id):null;
 main.innerHTML=`<div class="session-head"><h1>第${day.day}天 · ${phaseName(state.phase)}</h1><div class="counter">已完成 ${C.index(state)} 项</div></div><section class="focus encouragement"><div class="eyebrow">又完成了15项跟读或核对</div><div class="cue-symbol" aria-hidden="true">✦</div><h2>收回注意力，继续向前。</h2><p class="cue-text" role="status">${esc(item?.text||'深呼吸，听一句提醒，再接着读。')}</p><p class="prompt">语音结束后自动继续</p></section><div class="controls">${btn('cue',running?'暂停':'继续播放','primary')}</div><p class="session-help">下一张词卡已保留，暂停后可以接着读。</p>`;
}
async function deliverCue(t){
 const cueDay=day.day,p=E.begin(store.encouragement,cueDay);if(!p)return true;
 save();renderCue();const ok=await audioFile(p.id,t);if(!ok||!live(t))return false;
 E.finish(store.encouragement,cueDay,p.key);save();return true;
}
async function playCue(){
 if(running){stop();render();return;}if(externalChange||!pendingCue())return;
 running=true;const t=++token;
 try{if(!await deliverCue(t))return;running=false;render();if(['reading','replay'].includes(state.phase))play();}
 catch(e){if(t===token){stop();notice(e.message+'。激励尚未完成，下一词仍保留。');render();}}
}
function afterAnswer(previous){prepareCue(previous);save();render();if(pendingCue())playCue();else if(state.phase==='replay')play();}
async function hearAnswer(){
 stop();const t=token,id=C.current(state,day),c=cards.get(id);const next=$('[data-action="next"]');if(next)next.disabled=true;
 try{await audioFile(c.enAudio,t);if(token!==t)return;await audioFile(c.cnAudio,t);}catch(e){if(token===t)notice(e.message+'。可点“重听答案”重试。');}finally{if(token===t&&C.current(state,day)===id&&next)next.disabled=false;}
}
function handleAction(action){
 if(externalChange){notice('另一页面更新了记录。请刷新本页后继续。');return;}
 if(action==='home'){home();return;}
 if(action==='cue'){playCue();return;}
 if(pendingCue())return;
 if(action==='play'){play();return;}
 if(action==='hear'){hearAnswer();return;}
 if(action==='reveal-prompt'&&state?.phase==='test'&&day.mode==='retrieval'&&!state.promptRevealed){const id=C.current(state,day);state.responses[id]=$('#response')?.value||'';state.promptRevealed=true;save();render();hearAnswer();return;}
 if(!state)return;const id=C.current(state,day);
 if(action==='known'||action==='unknown'){
  stop();const previous=state.phase;if(C.answer(state,day,id,action==='known')){if(action==='unknown'){save();render();hearAnswer();}else afterAnswer(previous);}
 }else if(action==='next'){stop();const previous=state.phase;if(C.nextAnswer(state,day,id))afterAnswer(previous);}
}
main.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const now=performance.now(),key=b.dataset.day?'day-'+b.dataset.day:b.dataset.action;if(key===lastActionKey&&now-lastAction<300)return;lastAction=now;lastActionKey=key;if(b.dataset.day)openDay(Number(b.dataset.day));else handleAction(b.dataset.action);});
main.addEventListener('input',e=>{if(e.target.id==='response'&&state){state.responses[C.current(state,day)]=e.target.value;save();}});
$('#home').addEventListener('click',home);
$('#export').addEventListener('click',()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([externalChange&&preservedRaw?preservedRaw:JSON.stringify(store,null,2)],{type:'application/json'}));a.href=url;a.download='陈浩谦-国庆早读记录-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(day)render();}});
window.addEventListener('pagehide',stop);
window.addEventListener('storage',e=>{if(e.key===C.KEY){externalChange=true;stop();notice('另一页面更新了早读记录。请刷新本页后继续，避免覆盖已保存的进度。');if(day)render();}});
home();
})();
