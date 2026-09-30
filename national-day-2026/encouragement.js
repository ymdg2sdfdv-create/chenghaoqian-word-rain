/* Additive cue state: learning records and mastery remain untouched. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NDCues=factory();})(typeof window!=='undefined'?window:this,()=>{
 'use strict';const ids=Array.from({length:10},(_,i)=>'encourage-'+(i+1));
 function fresh(){return {bag:[],last:null,pending:{},completed:{}};}
 function valid(s){return !!s&&Array.isArray(s.bag)&&new Set(s.bag).size===s.bag.length&&s.bag.every(x=>ids.includes(x))&&(s.last===null||ids.includes(s.last))&&s.pending&&typeof s.pending==='object'&&!Array.isArray(s.pending)&&s.completed&&typeof s.completed==='object'&&!Array.isArray(s.completed)&&Object.entries(s.pending).every(([d,p])=>/^[1-6]$/.test(d)&&p&&new RegExp('^'+d+':(reading|test|replay):[1-9][0-9]*$').test(p.key)&&(p.id===null||ids.includes(p.id)))&&Object.entries(s.completed).every(([k,v])=>/^[1-6]:(reading|test|replay):[1-9][0-9]*$/.test(k)&&v===true);}
 function prepare(s,day,phase,index,total){if(!index||index%15||index>=total)return false;const key=day+':'+phase+':'+index;if(s.completed[key]||s.pending[day])return false;s.pending[day]={key,id:null};return true;}
 function draw(s,random=Math.random){if(!s.bag.length){s.bag=[...ids];for(let i=9;i>0;i--){const j=Math.floor(random()*(i+1));[s.bag[i],s.bag[j]]=[s.bag[j],s.bag[i]];}}if(s.bag[0]===s.last&&s.bag.length>1)[s.bag[0],s.bag[1]]=[s.bag[1],s.bag[0]];return s.bag.shift();}
 function begin(s,day,random=Math.random){const p=s.pending[day];if(!p)return null;if(!p.id)p.id=draw(s,random);return p;}
 function finish(s,day,key){const p=s.pending[day];if(!p||p.key!==key||!p.id)return false;s.last=p.id;s.completed[key]=true;delete s.pending[day];return true;}
 return {fresh,valid,prepare,begin,finish,ids};
});
