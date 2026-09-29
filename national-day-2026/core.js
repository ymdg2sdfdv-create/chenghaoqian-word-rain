(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NDCore=api;})(globalThis,()=>{
'use strict';
const VERSION='national-day-2026-v1',KEY='wordrain_national_day_2026_v1';
function fresh(day){return {day:day.day,phase:day.mode==='reading'?'reading':'test',readIndex:0,testIndex:0,replayIndex:0,answers:{},unknown:[],revealed:false,promptRevealed:false,responses:{},cardIds:[...day.cardIds],carryIds:[...(day.carryIds||[])],startedAt:new Date().toISOString(),completedAt:null};}
function queue(s,day){return s.phase==='replay'?s.unknown:day.cardIds;}
function index(s){return s.phase==='reading'?s.readIndex:s.phase==='replay'?s.replayIndex:s.testIndex;}
function current(s,day){return s.phase==='done'?null:queue(s,day)[index(s)];}
function complete(s){if(!s.completedAt)s.completedAt=new Date().toISOString();s.phase='done';s.revealed=false;}
function advanceTest(s,day){s.testIndex++;s.revealed=false;s.promptRevealed=false;if(s.testIndex===day.cardIds.length){s.phase=s.unknown.length?'replay':'done';if(s.phase==='done')complete(s);}}
function answer(s,day,id,known){if(s.phase!=='test'||s.revealed||current(s,day)!==id||s.answers[id]||(day.mode==='retrieval'&&!s.promptRevealed))return false;s.answers[id]={known,at:new Date().toISOString(),response:s.responses?.[id]||'',kind:day.mode==='retrieval'?'retrieval-self-report':'recognition-self-report'};if(known)advanceTest(s,day);else{s.unknown.push(id);s.revealed=true;}return true;}
function nextAnswer(s,day,id){if(s.phase!=='test'||!s.revealed||current(s,day)!==id)return false;advanceTest(s,day);return true;}
function finishCard(s,day,id){if(!['reading','replay'].includes(s.phase)||current(s,day)!==id)return false;if(s.phase==='reading'){s.readIndex++;if(s.readIndex===day.cardIds.length)s.phase='test';}else{s.replayIndex++;if(s.replayIndex===s.unknown.length)complete(s);}return true;}
function validate(s,day,allIds=day.cardIds,previousUnknown=[]){
 if(!s||!Array.isArray(s.cardIds)||!Array.isArray(s.carryIds)||new Set(s.cardIds).size!==s.cardIds.length||s.cardIds.some(id=>!allIds.includes(id))||day.cardIds.some(id=>!s.cardIds.includes(id))||s.carryIds.some(id=>!s.cardIds.includes(id)))return false;
 const expected=[...new Set([...s.carryIds,...day.cardIds])];
 if(s.carryIds.some((id,i)=>previousUnknown[i]!==id)||expected.length!==s.cardIds.length||expected.some((id,i)=>s.cardIds[i]!==id))return false;
 day={...day,cardIds:s.cardIds};
 if(!s.responses||typeof s.responses!=='object'||Array.isArray(s.responses)||Object.entries(s.responses).some(([id,v])=>!s.cardIds.includes(id)||typeof v!=='string')||typeof s.promptRevealed!=='boolean')return false;
 if(!s||s.day!==day.day||!['reading','test','replay','done'].includes(s.phase)||typeof s.revealed!=='boolean'||!s.answers||typeof s.answers!=='object'||Array.isArray(s.answers)||!Array.isArray(s.unknown))return false;
 const n=day.cardIds.length,ids=new Set(day.cardIds);
 if(!['readIndex','testIndex','replayIndex'].every(k=>Number.isInteger(s[k])&&s[k]>=0)||s.readIndex>n||s.testIndex>n||s.replayIndex>s.unknown.length)return false;
 if(new Set(s.unknown).size!==s.unknown.length||s.unknown.some(id=>!ids.has(id)||s.answers[id]?.known!==false))return false;
 if(Object.entries(s.answers).some(([id,a])=>!ids.has(id)||!a||typeof a.known!=='boolean'||typeof a.at!=='string'||!Number.isFinite(Date.parse(a.at))||typeof a.response!=='string'||a.response!==(s.responses[id]||'')||a.kind!==(day.mode==='retrieval'?'retrieval-self-report':'recognition-self-report')))return false;
 const answered=s.testIndex+(s.revealed?1:0);
 if(Object.keys(s.answers).length!==answered||day.cardIds.slice(0,answered).some(id=>!s.answers[id]))return false;
 if(JSON.stringify(day.cardIds.filter(id=>s.answers[id]?.known===false))!==JSON.stringify(s.unknown))return false;
 if(s.revealed&&(s.phase!=='test'||s.answers[day.cardIds[s.testIndex]]?.known!==false))return false;
 if(s.phase==='reading'&&(day.mode!=='reading'||s.readIndex>=n||s.testIndex!==0))return false;
 if(s.phase!=='reading'&&day.mode==='reading'&&s.readIndex!==n)return false;
 if(s.phase==='test'&&s.testIndex>=n)return false;
 if(['replay','done'].includes(s.phase)&&s.testIndex!==n)return false;
 if(s.phase==='replay'&&s.replayIndex>=s.unknown.length)return false;
 if(s.phase==='done'&&(s.replayIndex!==s.unknown.length||typeof s.completedAt!=='string'))return false;
 return true;
}
return {VERSION,KEY,fresh,current,queue,index,answer,nextAnswer,finishCard,validate};
});
