/* Store each set of complete recordings together. Both file URLs and HTTPS use the same path. */
(() => {
  'use strict';
  const packs = new Map();
  const pending = new Map();
  function receive(name, files) {
    packs.set(name, files);
    if (name !== 'media/alphabet.js') {
      const sections = [...packs.keys()].filter(id => id !== 'media/alphabet.js');
      if (sections.length > 2) packs.delete(sections[0]);
    }
  }
  function load(name) {
    if (packs.has(name)) return Promise.resolve(packs.get(name));
    if (pending.has(name)) return pending.get(name);
    const result = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const finish = error => {
        clearTimeout(timer); script.remove(); pending.delete(name);
        if (error) reject(error); else resolve(packs.get(name));
      };
      const timer = setTimeout(() => finish(new Error('Audio pack timed out')), 45000);
      script.onload = () => finish(packs.has(name) ? null : new Error('Missing audio pack'));
      script.onerror = () => finish(new Error('Audio pack did not load'));
      script.src = name + '?v=nov21-reading-v2'; document.head.appendChild(script);
    });
    pending.set(name, result); return result;
  }
  function bytes(encoded) { return Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); }
  function spellingWav(word, alphabet) {
    const clips = [...word].filter(c => c !== '-').map(c => bytes(alphabet[c]));
    const length = clips.reduce((n,clip) => n + clip.length + 384, 0);
    const wav = new Uint8Array(44 + length), view = new DataView(wav.buffer);
    function label(offset, value) { [...value].forEach((c,i) => { wav[offset+i]=c.charCodeAt(0); }); }
    label(0,'RIFF');view.setUint32(4,36 + length,true);label(8,'WAVE');label(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);
    view.setUint16(34,16,true);label(36,'data');view.setUint32(40,length,true);
    let offset=44+192;
    for (const clip of clips) { wav.set(clip,offset); offset+=clip.length+384; }
    return wav;
  }
  async function blob(file) {
    if (file.startsWith('audio/spell/')) {
      const word=file.slice('audio/spell/'.length,-4);
      return new Blob([spellingWav(word,await load('media/alphabet.js'))],{type:'audio/wav'});
    }
    const name=window.NOV21_DATA.mediaPacks[file];
    if (!name) throw new Error('Unknown recording');
    const recordings=await load(name);
    if (!recordings[file]) throw new Error('Missing recording');
    return new Blob([bytes(recordings[file])],{type:'audio/mpeg'});
  }
  window.Nov21Packs={receive,blob};
})();
