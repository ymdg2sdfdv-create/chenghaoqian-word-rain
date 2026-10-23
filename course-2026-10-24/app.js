/* October 24: transient playback only. No learning-record or test dependencies. */
(()=>{'use strict';
const D=window.OCT24_DATA,plan=Oct24Core.buildPlan(D),main=document.querySelector('#main'),player=document.querySelector('#voice'),notice=document.querySelector('#notice');
const totalForms=D.items.reduce((n,x)=>n+x.terms.length,0);
let cursor=0,completedItems=0,completedForms=0,cuesPlayed=0,running=false,token=0,cancelPending=null,position=0,activeAudio=-1,started=false,finished=false,wakeLock=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s){notice.hidden=!s;notice.textContent=s;}
function welcome(){main.dataset.phase='welcome';main.innerHTML=`<section class="welcome-panel"><p class="eyebrow">10月24日 · 周末作业与月考复盘</p><h1>把每一个词，<br>清楚地读出来。</h1><p class="welcome-copy">按语义主题跟读319项单词与短语，同行词族也一起复习。</p><div class="rule-grid"><div><strong>2遍</strong><span>拆分拼读</span></div><div><strong>4遍</strong><span>整体爆炸</span></div><div><strong>6次</strong><span>中途语音激励</span></div></div><p class="run-note">共${totalForms}个具体词形，每个词形都按2＋4播放。<br>录音及拼读预计约${Math.ceil(D.estimatedSeconds/60)}分钟，可随时暂停。</p><button class="primary" data-action="start">开始本次早读</button><p class="privacy-note">本次不保存学习成果，不进行系统测试。<br>刷新或关闭后从头开始；同页暂停可继续。</p><details class="catalog"><summary>查看本次词汇范围</summary>${D.items.map(x=>`<p><span>${String(x.number).padStart(3,'0')}</span> ${esc(x.forms)}</p>`).join('')}</details></section>`;}
function controls(){return `<div class="controls"><button class="primary" data-action="toggle">${running?'暂停':'继续早读'}</button><button data-action="restart">重新开始</button></div>`;}
function shell(e){const item=D.items[e.itemIndex??Math.min(completedItems,D.items.length-1)];main.dataset.phase='reading';main.innerHTML=`<div class="session-head"><h1>${esc(item.group)}</h1><div class="counter">${Math.min(completedItems+1,D.items.length)} / ${D.items.length} 项</div></div><div class="progress-track" role="progressbar" aria-label="本次播放位置" aria-valuenow="${completedForms}" aria-valuemin="0" aria-valuemax="${totalForms}"><span style="width:${100*completedForms/totalForms}%"></span></div><section class="focus"><div class="focus-meta"><span>原编号 ${String(item.number).padStart(3,'0')}</span><span>本项词形 ${(e.termIndex??0)+1} / ${item.terms.length}</span></div><div id="stage" class="stage-label"></div><h2 id="word" class="english"></h2><div id="meaning" class="meaning"></div><div id="rounds" class="rounds"></div><p class="family">${item.terms.length>1?'同编号词族：'+esc(item.forms):''}</p></section>${controls()}<p class="session-help">拆分2遍 · 整体爆炸4遍 · 激励已播放 ${cuesPlayed} / 6 次</p>`;}
let renderedItem=-1,renderedTerm=-1,lastBurst='';
function eventUI(e){
 if(e.kind==='cue'){
  main.dataset.phase='encouragement';main.innerHTML=`<div class="session-head"><h1>深呼吸，继续向前。</h1><div class="counter">已跟读 ${e.afterItems} / ${D.items.length} 项</div></div><section class="focus encouragement"><div class="eyebrow">中途激励 ${e.cueIndex+1} / 6</div><div class="cue-symbol" aria-hidden="true">✦</div><h2>把注意力带回来。</h2><p class="cue-text">${esc(e.text)}</p><p class="prompt">语音结束后继续下一项</p></section>${controls()}`;renderedItem=-1;return;
 }
 if(e.word===undefined)return;
 if(renderedItem!==e.itemIndex||renderedTerm!==e.termIndex||main.dataset.phase!=='reading'){shell(e);renderedItem=e.itemIndex;renderedTerm=e.termIndex;}
 const stage=document.querySelector('#stage'),word=document.querySelector('#word'),meaning=document.querySelector('#meaning');
 stage.textContent=e.stage==='spell'?`拆分拼读 ${e.round} / 2`:e.stage==='reveal'?`完整跟读 · 拆分第 ${e.round} 遍`:`整体爆炸 ${e.round} / 4`;
 word.textContent=e.visible;word.classList.toggle('long',e.word.length>18);meaning.hidden=e.stage==='spell';meaning.textContent=e.stage==='spell'?'':e.cn;
 document.querySelector('#rounds').innerHTML=Array.from({length:e.stage==='burst'?4:2},(_,i)=>`<i class="${i<e.round?'active':''}"></i>`).join('');
 const burstKey=`${e.formIndex}-${e.round}`;
 if(e.stage==='burst'&&e.language==='en'&&lastBurst!==burstKey){const focus=document.querySelector('.focus');focus.classList.remove('burst');void focus.offsetWidth;focus.classList.add('burst');lastBurst=burstKey;}
}
function buttonState(){const button=main.querySelector('[data-action="toggle"]');if(button)button.textContent=running?'暂停':'继续早读';}
function releaseWake(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}}
function stop(){running=false;token++;if(activeAudio===cursor&&Number.isFinite(player.currentTime))position=player.currentTime;player.pause();if(cancelPending)cancelPending();releaseWake();buttonState();}
function playAudio(e,t){return new Promise((resolve,reject)=>{
 let settled=false;const finish=(ok,error)=>{if(settled)return;settled=true;clearTimeout(timeout);player.onended=null;player.onerror=null;cancelPending=null;error?reject(error):resolve(ok);};
 const timeout=setTimeout(()=>{player.pause();position=0;activeAudio=-1;finish(false,Error('语音加载较慢，请检查网络后点继续重试。'));},45000);
 cancelPending=()=>finish(false);player.onended=()=>{position=0;activeAudio=-1;finish(true);};player.onerror=()=>{player.pause();position=0;activeAudio=-1;finish(false,Error('当前录音未能加载，请检查网络后点继续重试。'));};
 if(activeAudio!==cursor){player.src=e.file;position=0;activeAudio=cursor;}else if(position>0){try{player.currentTime=position;}catch{}}
 player.playbackRate=1;player.play().catch(()=>{position=0;activeAudio=-1;finish(false,Error('请再点一次“继续早读”开启声音。'));});
 });}
function wait(ms){return new Promise(resolve=>{const timer=setTimeout(()=>{cancelPending=null;resolve(true);},ms);cancelPending=()=>{clearTimeout(timer);cancelPending=null;resolve(false);};});}
function complete(){running=false;finished=true;player.pause();releaseWake();main.dataset.phase='done';main.innerHTML=`<section class="done"><p class="eyebrow">本次朗读流程结束</p><h1>这一遍，读完了。</h1><p>请交由老师进行人工验收和测验。</p><p class="completion-note">本次未记录成绩、掌握情况或学习成果，<br>也没有进行系统测试。</p><button class="primary" data-action="restart">重新开始本次早读</button><p><a href="../national-day-2026/index.html">查看往期课程</a></p></section>`;}
async function play(){
 if(running||finished)return;started=true;running=true;const t=++token;message('');buttonState();
 if(navigator.wakeLock)navigator.wakeLock.request('screen').then(lock=>{if(running&&t===token)wakeLock=lock;else lock.release().catch(()=>{});}).catch(()=>{});
 try{
  while(running&&t===token&&cursor<plan.length){
   const e=plan[cursor];
   if(e.kind==='formEnd'){completedForms++;cursor++;continue;}
   if(e.kind==='itemEnd'){completedItems++;cursor++;continue;}
   eventUI(e);buttonState();
   const ok=e.kind==='wait'?await wait(e.ms):await playAudio(e,t);
   if(!ok||!running||t!==token)return;
   if(e.kind==='cue')cuesPlayed++;
   cursor++;
  }
  if(cursor===plan.length&&running&&t===token)complete();
 }catch(error){if(t===token){stop();message(error.message);}}
}
function restart(){stop();cursor=0;completedItems=0;completedForms=0;cuesPlayed=0;position=0;activeAudio=-1;renderedItem=-1;renderedTerm=-1;lastBurst='';started=false;finished=false;message('');welcome();}
main.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const action=b.dataset.action;if(action==='start')play();else if(action==='toggle'){if(running)stop();else play();}else if(action==='restart'){if(!started||finished||confirm('重新开始会回到第一项。确定重新开始吗？'))restart();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stop();message('早读已暂停。回来后点继续，即可接着当前播放位置读。');}});window.addEventListener('pagehide',stop);
welcome();
})();
