/* National Day is isolated from all older classroom progress namespaces. */
(()=>{'use strict';
const D=window.NATIONAL_DAY_DATA,C=window.NDCore,$=s=>document.querySelector(s),main=$('#main'),player=$('#voice');
const cards=new Map(D.cards.map(c=>[c.id,c])),links=new Map(D.links.map(l=>[l.linkId,l]));
let store={version:C.VERSION,days:{}},day=null,state=null,running=false,token=0,cancelAudio=null,storageBlocked=false,lastAction=-Infinity,lastActionKey=null,externalChange=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text){$('#notice').hidden=!text;$('#notice').textContent=text;}
try{const raw=localStorage.getItem(C.KEY);if(raw){const loaded=JSON.parse(raw);if(loaded.version!==C.VERSION||!loaded.days||Array.isArray(loaded.days)||Object.entries(loaded.days).some(([k,s])=>!D.days[Number(k)-1]||!C.validate(s,D.days[Number(k)-1],[...cards.keys()],loaded.days[Number(k)-1]?.unknown||[])))throw Error('旧版或不完整记录');store=loaded;}}
catch(e){try{const raw=localStorage.getItem(C.KEY);if(raw)localStorage.setItem(C.KEY+'_preserved_'+Date.now(),raw);}catch(_){storageBlocked=true;}notice('原记录未覆盖；已保留可恢复副本。当前从独立的新记录开始。');}
function save(){if(externalChange)return false;try{localStorage.setItem(C.KEY,JSON.stringify(store));return true;}catch(_){storageBlocked=true;notice('浏览器暂时无法保存进度。请先点“保存学习记录”留存，关闭页面可能丢失本次进度。');return false;}}
function stop(){token++;running=false;if(cancelAudio){cancelAudio();cancelAudio=null;}player.pause();try{speechSynthesis.cancel();}catch(_){} }
function btn(action,text,style=''){return `<button data-action="${action}" class="${style}">${text}</button>`;}
function home(){stop();day=null;state=null;$('#home').hidden=true;main.innerHTML=`<section class="intro"><div><div class="eyebrow">10月1日—10月6日 · 六天学习安排</div><h1>每天读透一组，<br>让旧词成为熟词。</h1><p>前三天：两轮拆分拼写，四次单词爆炸。读完再测，不认识的词当天再读一遍。</p></div></section><div class="day-grid">${D.days.map(base=>{const d=effectiveDay(base.day),s=store.days[d.day];return `<section class="day-card"><div class="day-number"><strong>0${d.day}</strong><span>10月${d.day}日</span></div><h2>${d.title}</h2><p>${d.cardIds.length}张词卡 · ${d.unitCount}个复习单元<br>${d.mode==='reading'?'拆分拼写 → 单词爆炸 → 复测':'看英文回忆 → 关联辨析 → 不认识词补读'}</p><p>${s?(s.phase==='done'?`本日已完成 · 保留${s.unknown.length}个不认识记录`:`已保存：${phaseName(s.phase)} ${C.index(s)+1}/${C.queue(s,d).length}`):'尚未开始'}</p><button class="${s?.phase==='done'?'':'primary'}" data-day="${d.day}">${s?.phase==='done'?'查看本日记录':s?'继续本日学习':'开始第'+d.day+'天'}</button></section>`;}).join('')}</div><div class="meta-strip"><span>优先复习跨课重复词</span><span>同族、近义与反义词相邻学习</span><span>暂停后可以接着读</span></div>`;}
function phaseName(p){return {reading:'首轮早读',test:day?.day>3?'回忆复习':'当日复测',replay:'不认识词再读',done:'本日完成'}[p];}
function effectiveDay(n){const base=D.days[n-1],saved=store.days[n],carryIds=saved?saved.carryIds:(store.days[n-1]?.unknown||[]);return {...base,carryIds,cardIds:saved?saved.cardIds:[...new Set([...carryIds,...base.cardIds])]};}
function openDay(n){stop();day=effectiveDay(n);store.days[n]??=C.fresh(day);state=store.days[n];save();$('#home').hidden=false;render();}
function details(c){const related=c.links.map(id=>links.get(id)).filter(Boolean);const peers=D.cards.filter(x=>x.blockId===c.blockId&&x.id!==c.id);return `<details class="study-note" ${day.day>3?'open':''}><summary>词族、替换与辨析</summary><p><strong>${esc(c.group)}</strong> · 本课词义：${esc(c.cn)}</p>${peers.length?`<p>同组回顾（同主题不等于同义）：<br>${peers.map(x=>esc(x.word)+' ('+esc(x.pos)+') '+esc(x.cn)).join('； ')}</p>`:''}${c.familyHint?`<p>${esc(c.familyHint)}</p>`:''}${related.map(l=>`<p><strong>${esc(l.kind)} · ${esc(l.families.join(' / '))}</strong><br>${esc(l.note)}</p>`).join('')}${c.contexts.slice(0,1).map(t=>`<p class="context">${esc(t)}</p>`).join('')}</details>`;}
function question(c){
 const escaped=c.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp('(^|[^A-Za-z])('+escaped+')(?=$|[^A-Za-z])','gi');
 const context=c.contexts.find(t=>{pattern.lastIndex=0;return pattern.test(t);});pattern.lastIndex=0;
 if(context)return {stem:context.replace(pattern,'$1 ______ '),hint:'根据课堂原句，回忆空缺处的词或词组。'};
 return {stem:c.cn,hint:'根据课堂词义和词性，回忆英文。口述后再揭晓核对。'};
}
function render(){
 if(!day||!state)return;
 main.dataset.phase=state.phase;
 if(state.phase==='done'){main.innerHTML=`<section class="done"><div class="eyebrow">第${day.day}天 · 本日流程已完成</div><h1>这一遍，读完了。</h1><p>${day.cardIds.length}张词卡已完成${day.mode==='retrieval'?'回忆核对':'自评'}。<br>${state.unknown.length?`${state.unknown.length}张不认识词卡已按原形式补读一遍。`:'本轮没有标记不认识的词。'}</p><p>“认识”是本次自评；补读完成不会改写原来的不认识记录。</p><div class="unknown-list">${state.unknown.map(id=>`<span>${esc(cards.get(id).word)} · ${esc(cards.get(id).pos)}</span>`).join('')}</div>${btn('home','返回六天安排','primary')}</section>`;return;}
 const c=cards.get(C.current(state,day)),isTest=state.phase==='test',retrieval=isTest&&day.mode==='retrieval',showAnswer=isTest&&(state.revealed||state.promptRevealed),qinfo=retrieval?question(c):null,q=C.queue(state,day),i=C.index(state);
 main.innerHTML=`<div class="session-head"><h1>第${day.day}天 · ${phaseName(state.phase)}</h1><div class="counter">${i+1} / ${q.length}</div></div><div class="progress-track" role="progressbar" aria-label="本环节完成进度" aria-valuenow="${i}" aria-valuemin="0" aria-valuemax="${q.length}"><span style="width:${100*i/q.length}%"></span></div><section class="focus"><div class="focus-meta">${isTest?'':`<span>${esc(c.group)}</span><span>${esc(c.formType)}</span>${c.priority==='P1'?'<span class="priority">★ 跨课重点</span>':''}`}</div><div class="stage-label" id="stage">${isTest?(showAnswer?'核对答案与同组辨析':retrieval?'主动回忆 · 先口述或写下答案':'看英文和词性，回忆中文意思'):'准备跟读'}</div><h2 id="word" class="english ${c.word.length>18?'long':''} ${retrieval&&!showAnswer?'question-text':''}">${esc(retrieval&&!showAnswer?qinfo.stem:c.word)}</h2><div class="pos">${esc(c.pos)}</div><div class="meaning" id="meaning" ${showAnswer?'':'hidden'}>${showAnswer?esc(c.cn):''}</div><div class="prompt" id="prompt">${isTest?(showAnswer?'核对答案后，如实记录本次回忆。':retrieval?qinfo.hint:'先自己想，再选择。'):'点下方开始，跟着声音读。'}</div>${retrieval&&!showAnswer?`<textarea id="response" aria-label="我的回忆答案（也可口述）" placeholder="可口述，也可在这里写下答案">${esc(state.responses[c.id]||'')}</textarea>`:''}<div class="rounds" id="rounds"></div></section><div class="controls ${isTest?'test':''}" id="controls">${isTest?(state.revealed?btn('hear','重听答案')+btn('next','下一词','primary'):retrieval?(showAnswer?btn('unknown','还需复习','unknown')+btn('known','独立答出','primary'):btn('reveal-prompt','揭晓并核对','primary')):btn('unknown','不认识','unknown')+btn('known','认识','primary')):btn('play',running?'暂停':'开始跟读','primary')}</div>${showAnswer?details(c):''}<p class="session-help">${isTest?'不认识的词会在这一轮全部结束后，集中再读一遍。':'每词2轮拆分拼写＋4次单词爆炸 · 暂停或离开后，从当前词继续。'}</p>`;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function live(t){return running&&t===token&&!document.hidden;}
function audioFile(aid,t){return new Promise((resolve,reject)=>{
 const item=D.audio[aid];if(!item){reject(Error('缺少当前词的语音'));return;}
 let settled=false;const finish=(ok,error)=>{if(settled)return;settled=true;clearTimeout(watch);player.onended=null;player.onerror=null;cancelAudio=null;error?reject(error):resolve(ok);};
 const watch=setTimeout(()=>{player.pause();finish(false,Error('语音加载较慢，请检查网络后继续'));},Math.max(30000,item.text.length*600));
 let fallbackStarted=false;
 const fallback=()=>{if(fallbackStarted||settled)return;fallbackStarted=true;player.pause();
  const cn=item.lang==='cn';let voices=[];try{voices=speechSynthesis.getVoices();}catch(_){}
  const voice=voices.find(v=>(cn?/zh[-_](CN|Hans)/i:/en[-_](US|GB)/i).test(v.lang)&&/Eddy|Reed|Rocko|Grandpa|Daniel|Alex|Tom|Fred|Guy|Yunxi/i.test(v.name));
  if(!voice){finish(false,Error('语音未能加载，请联网后点继续重试'));return;}
  const u=new SpeechSynthesisUtterance(item.text);u.voice=voice;u.lang=voice.lang;u.rate=.92;u.onend=()=>finish(true);u.onerror=()=>finish(false,Error('备用语音未播放，请点击继续重试'));window.ndCurrentUtterance=u;speechSynthesis.speak(u);
 };
 cancelAudio=()=>finish(false);player.onended=()=>finish(true);player.onerror=fallback;
 player.src=item.file;player.playbackRate=1;player.play().catch(()=>finish(false,Error('Safari需要你再次点“开始跟读”或“重听答案”开启声音')));
 });}
function showWord(c,text){$('#word').textContent=text;$('#word').classList.toggle('long',c.word.length>18);}
async function reveal(c,t){if(!live(t))return false;showWord(c,c.word);$('#meaning').hidden=false;$('#meaning').textContent=c.cn;await audioFile(c.enAudio,t);if(!live(t))return false;await delay(D.config.revealHoldMs);if(!live(t))return false;await audioFile(c.cnAudio,t);return live(t);}
async function playCard(c,t){
 for(let round=1;round<=D.config.spellRounds;round++){
  if(!live(t))return false;$('.focus').classList.remove('burst');$('#stage').textContent=`拆分拼写 ${round} / ${D.config.spellRounds}`;$('#meaning').hidden=true;$('#meaning').textContent='';$('#prompt').textContent=c.phrase?'按组成单词跟读，再读完整词组。':'逐字母跟读，再读完整单词。';$('#rounds').innerHTML=[1,2].map(n=>`<i class="${n<=round?'active':''}"></i>`).join('');
  for(const step of c.steps){if(!live(t))return false;showWord(c,step.visible);const start=performance.now();await audioFile(step.audio,t);if(!live(t))return false;if(!c.phrase)await delay(Math.max(0,D.config.letterMs-(performance.now()-start)));}
  if(!await reveal(c,t))return false;
 }
 for(let n=1;n<=D.config.flashCount;n++){
  if(!live(t))return false;$('#stage').textContent=`单词爆炸 ${n} / ${D.config.flashCount}`;$('#prompt').textContent='看清词形，大声跟读。';$('#rounds').innerHTML=[1,2,3,4].map(v=>`<i class="${v<=n?'active':''}"></i>`).join('');const f=$('.focus');f.classList.remove('burst');void f.offsetWidth;f.classList.add('burst');showWord(c,c.word);await audioFile(c.enAudio,t);
 }
 return live(t);
}
async function play(){
 if(running){stop();render();return;}
 if(!['reading','replay'].includes(state.phase)||externalChange)return;
 running=true;const t=++token;render();$('#controls button').textContent='暂停';
 try{
  while(live(t)&&['reading','replay'].includes(state.phase)){
   const id=C.current(state,day),c=cards.get(id);if(!await playCard(c,t))return;if(!live(t))return;
   C.finishCard(state,day,id);save();render();
   if(state.phase==='test'||state.phase==='done'){running=false;render();return;}
   await delay(320);
  }
 }catch(e){if(t===token){stop();notice(e.message+'。当前词未记为完成。');render();}}
}
async function hearAnswer(){
 stop();const t=token,id=C.current(state,day),c=cards.get(id);const next=$('[data-action="next"]');if(next)next.disabled=true;
 try{await audioFile(c.enAudio,t);if(token!==t)return;await audioFile(c.cnAudio,t);}catch(e){if(token===t)notice(e.message+'。可点“重听答案”重试。');}finally{if(token===t&&C.current(state,day)===id&&next)next.disabled=false;}
}
function handleAction(action){
 if(externalChange){notice('另一页面更新了记录。请刷新本页后继续。');return;}
 if(action==='home'){home();return;}
 if(action==='play'){play();return;}
 if(action==='hear'){hearAnswer();return;}
 if(action==='reveal-prompt'&&state?.phase==='test'&&day.mode==='retrieval'&&!state.promptRevealed){const id=C.current(state,day);state.responses[id]=$('#response')?.value||'';state.promptRevealed=true;save();render();hearAnswer();return;}
 if(!state)return;const id=C.current(state,day);
 if(action==='known'||action==='unknown'){
  stop();if(C.answer(state,day,id,action==='known')){save();render();if(action==='unknown')hearAnswer();else if(state.phase==='replay')play();}
 }else if(action==='next'){stop();if(C.nextAnswer(state,day,id)){save();render();if(state.phase==='replay')play();}}
}
main.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const now=performance.now(),key=b.dataset.day?'day-'+b.dataset.day:b.dataset.action;if(key===lastActionKey&&now-lastAction<300)return;lastAction=now;lastActionKey=key;if(b.dataset.day)openDay(Number(b.dataset.day));else handleAction(b.dataset.action);});
main.addEventListener('input',e=>{if(e.target.id==='response'&&state){state.responses[C.current(state,day)]=e.target.value;save();}});
$('#home').addEventListener('click',home);
$('#export').addEventListener('click',()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(store,null,2)],{type:'application/json'}));a.href=url;a.download='陈浩谦-国庆早读记录-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(day)render();}});
window.addEventListener('pagehide',stop);
window.addEventListener('storage',e=>{if(e.key===C.KEY){externalChange=true;stop();notice('另一页面更新了早读记录。请刷新本页后继续，避免覆盖已保存的进度。');if(day)render();}});
home();
})();
