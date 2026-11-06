/* Keep short recordings in memory: one playback element, complete HTTP downloads. */
(() => {
  'use strict';
  const VERSION = 'nov07-ipad-audio-v2';
  const cache = new Map(), loading = new Map();
  let requestNumber = 0;
  const problem = (code, cause) => Object.assign(new Error(code), {code, cause});

  // An in-memory silent WAV unlocks the same element directly inside the tap.
  // Wait for its end before installing the real recording's handlers.
  function unlock(voice) {
    if (location.protocol === 'file:') return Promise.resolve();
    const rate = 24000, frames = 480, bytes = new Uint8Array(44 + frames * 2), view = new DataView(bytes.buffer);
    const label = (offset, value) => [...value].forEach((letter, i) => { bytes[offset + i] = letter.charCodeAt(0); });
    label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    label(36, 'data'); view.setUint32(40, frames * 2, true);
    const url = URL.createObjectURL(new Blob([bytes], {type:'audio/wav'}));
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = error => {
        if (settled) return; settled = true; clearTimeout(timer);
        voice.removeEventListener('ended', ended); voice.removeEventListener('error', failed);
        URL.revokeObjectURL(url); error ? reject(error) : resolve();
      };
      const ended = () => done();
      const failed = () => done(problem('START_' + (voice.error?.code || 'ERROR')));
      const timer = setTimeout(() => done(problem('START_TIMEOUT')), 5000);
      voice.addEventListener('ended', ended); voice.addEventListener('error', failed);
      voice.src = url;
      voice.play().catch(error => done(problem(error.name === 'NotAllowedError' ? 'TAP_REQUIRED' : 'START_' + error.name, error)));
    });
  }

  async function prepare(file, refresh = false) {
    if (location.protocol === 'file:') return file;
    if (cache.has(file)) {
      const value = cache.get(file); cache.delete(file); cache.set(file, value); return value;
    }
    if (loading.has(file)) return loading.get(file).promise;
    const controller = new AbortController(), record = {controller, promise:null};
    const url = new URL(file, document.baseURI); url.searchParams.set('audio', VERSION);
    if (refresh) url.searchParams.set('retry', String(++requestNumber));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    record.promise = (async () => {
      try {
        const response = await fetch(url.href, {signal:controller.signal});
        if (!response.ok) throw problem('HTTP_' + response.status);
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength) throw problem('EMPTY_AUDIO');
        const blob = new Blob([bytes], {type:file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'});
        const objectURL = URL.createObjectURL(blob);
        cache.set(file, objectURL);
        while (cache.size > 8) {
          const oldest = [...cache.keys()].find(key => cache.get(key) !== document.getElementById('voice')?.src);
          if (!oldest) break;
          URL.revokeObjectURL(cache.get(oldest)); cache.delete(oldest);
        }
        return objectURL;
      } catch (error) {
        if (typeof error.code === 'string') throw error;
        throw problem(timedOut ? 'DOWNLOAD_TIMEOUT' : error.name === 'AbortError' ? 'CANCELLED' : 'DOWNLOAD_FAILED', error);
      } finally {
        clearTimeout(timer);
        if (loading.get(file) === record) loading.delete(file);
      }
    })();
    loading.set(file, record);
    return record.promise;
  }

  function cancelDownloads() {
    const records = [...loading.values()]; loading.clear(); records.forEach(record => record.controller.abort());
  }
  function invalidate(file) {
    if (cache.has(file)) { URL.revokeObjectURL(cache.get(file)); cache.delete(file); }
  }
  function prefetch(files) { files.slice(0, 2).forEach(file => prepare(file).catch(() => {})); }
  window.Nov07Audio = {version:VERSION, unlock, prepare, prefetch, cancelDownloads, invalidate};
})();
