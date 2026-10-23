(function(root){'use strict';
function buildPlan(data){
 const events=[];let formIndex=0;
 const add=(e,common)=>events.push({...common,...e});
 data.items.forEach((item,itemIndex)=>{
  item.terms.forEach((term,termIndex)=>{
   const common={itemIndex,termIndex,formIndex,number:item.number,group:item.group,forms:item.forms,word:term.word,cn:term.cn};
   for(let round=1;round<=data.config.spellRounds;round++){
    for(const step of term.steps)add({kind:'audio',stage:'spell',round,visible:step.visible,file:step.letter?data.letters[step.audio].file:data.audio[step.audio].file},common);
    add({kind:'audio',stage:'reveal',round,visible:term.word,file:data.audio[term.enAudio].file},common);
    add({kind:'wait',stage:'reveal',round,visible:term.word,ms:data.config.revealHoldMs},common);
    add({kind:'audio',stage:'reveal',round,visible:term.word,file:data.audio[term.cnAudio].file},common);
   }
   for(let round=1;round<=data.config.burstRounds;round++){
    add({kind:'audio',stage:'burst',round,visible:term.word,language:'en',file:data.audio[term.enAudio].file},common);
    add({kind:'audio',stage:'burst',round,visible:term.word,language:'cn',file:data.audio[term.cnAudio].file},common);
   }
   add({kind:'formEnd'},common);formIndex++;
  });
  events.push({kind:'itemEnd',itemIndex});
  const cue=data.encouragements.find(c=>c.afterItems===itemIndex+1);
  if(cue)events.push({kind:'cue',file:cue.file,text:cue.text,itemIndex,cueIndex:data.encouragements.indexOf(cue),afterItems:cue.afterItems});
  if(itemIndex<data.items.length-1)events.push({kind:'wait',ms:data.config.itemGapMs});
 });return events;
}
const api={buildPlan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Oct24Core=api;
})(typeof window!=='undefined'?window:globalThis);
