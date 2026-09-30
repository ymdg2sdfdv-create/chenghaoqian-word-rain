/* Additive catalog compatibility. Never translate an old self-report into new mastery. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NDRecords=factory();})(globalThis,()=>{
'use strict';const CURRENT='semantic-v2',LEGACY='legacy-v1';
function fresh(C){return {version:C.VERSION,catalogVersion:CURRENT,dayVersions:{},days:{}};}
function catalog(D,version){return version===LEGACY?D.legacy:D;}
function carried(D,store,n,version=CURRENT){const previous=store.days[n-1];if(!previous)return [];if(version===LEGACY)return previous.unknown;
 const old=store.dayVersions[n-1]===LEGACY;
 return [...new Set(previous.unknown.flatMap(id=>old?D.legacyIdToTaskIds[id]:[id]))];}
function effective(D,store,n){const saved=store.days[n],version=saved?store.dayVersions[n]:CURRENT,base=catalog(D,version).days[n-1],carryIds=saved?saved.carryIds:carried(D,store,n,version);
 return {...base,catalogVersion:version,carryIds,cardIds:saved?saved.cardIds:[...new Set([...carryIds,...base.cardIds])]};}
function load(raw,D,C){const input=JSON.parse(raw);if(!input||input.version!==C.VERSION||!input.days||typeof input.days!=='object'||Array.isArray(input.days))throw Error('学习记录结构无法识别');
 const upgrading=input.catalogVersion===undefined;
 if(upgrading){if(input.dayVersions!==undefined)throw Error('记录版本不一致');input.catalogVersion=CURRENT;input.dayVersions=Object.fromEntries(Object.keys(input.days).map(k=>[k,LEGACY]));}
 if(input.catalogVersion!==CURRENT||!input.dayVersions||typeof input.dayVersions!=='object'||Array.isArray(input.dayVersions))throw Error('记录版本无法识别');
 if(Object.keys(input.dayVersions).length!==Object.keys(input.days).length)throw Error('日期版本不完整');
 for(const [k,s] of Object.entries(input.days)){
  const n=Number(k),version=input.dayVersions[k];if(!/^[1-6]$/.test(k)||![CURRENT,LEGACY].includes(version))throw Error('日期版本无法识别');
  const source=catalog(D,version);if(!C.validate(s,source.days[n-1],source.cards.map(c=>c.id),carried(D,input,n,version)))throw Error('原队列或答案无法无损解释');
 }
 return {store:input,upgrading};
}
return {CURRENT,LEGACY,fresh,catalog,carried,effective,load};
});
