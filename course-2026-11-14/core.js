(function (root) {
  'use strict';
  function buildPlan(data, startPosition = 1) {
    if (!data.items.some(item => item.position === startPosition)) throw new Error('Invalid start position');
    const plan = [], config = data.config;
    const selected = data.items.filter(item => item.position >= startPosition);
    for (const [index, item] of selected.entries()) {
      for (const term of item.terms) {
        const common = {item, term};
        const whole = (stage, round) => {
          plan.push({...common, type: 'audio', stage, round, language: 'en', file: data.audio[term.enAudio].file, seconds: data.audio[term.enAudio].seconds});
          if (stage === 'reveal' && config.revealHoldMs > 0) plan.push({...common, type: 'wait', stage, round, ms: config.revealHoldMs});
          plan.push({...common, type: 'audio', stage, round, language: 'cn', file: data.audio[term.cnAudio].file, seconds: data.audio[term.cnAudio].seconds});
        };
        if (term.phrase) {
          for (let round = 1; round <= config.phraseRounds; round++) whole('phrase', round);
        } else {
          for (let round = 1; round <= config.spellRounds; round++) {
            const spelling = data.spellings[term.spellAudio];
            plan.push({...common, type: 'audio', stage: 'spell', round, language: 'letters', file: spelling.file, seconds: spelling.seconds, marks: spelling.marks});
            whole('reveal', round);
          }
          for (let round = 1; round <= config.burstRounds; round++) whole('burst', round);
        }
        plan.push({...common, type: 'termEnd'});
      }
      plan.push({type: 'itemEnd', item});
      const cue = data.encouragements.find(c => c.afterPosition === item.position);
      if (cue) {
        plan.push({type: 'audio', stage: 'encouragement', item, cue, file: cue.file, seconds: cue.seconds});
        plan.push({type: 'countdown', stage: 'recovery', item, cue, ms: config.recoverySeconds * 1000});
      }
      if (index < selected.length - 1 && config.itemGapMs > 0) plan.push({type: 'wait', stage: 'gap', item, ms: config.itemGapMs});
    }
    return plan;
  }
  function duration(plan) { return plan.reduce((sum, event) => sum + (event.seconds || 0) + (event.ms || 0) / 1000, 0); }
  class Countdown {
    constructor(ms, now = () => performance.now()) { this.left = ms; this.now = now; this.deadline = null; }
    start() { if (this.deadline === null) this.deadline = this.now() + this.left; }
    remaining() { return this.deadline === null ? this.left : Math.max(0, this.deadline - this.now()); }
    pause() { this.left = this.remaining(); this.deadline = null; }
  }
  const api = {buildPlan, duration, Countdown};
  root.Nov14Core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
