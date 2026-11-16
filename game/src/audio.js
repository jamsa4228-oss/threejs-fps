// Every sound is synthesized with WebAudio: no audio files, no network.
// One shared noise buffer, one master gain, short envelopes per effect.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  // A filtered noise burst: the body of every gunshot, footstep and impact.
  function noise(when, duration, filterType, frequency, gainValue, quality = 1) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  // A pitched oscillator blip: clicks, beeps, stingers.
  function tone(when, duration, type, fromFreq, toFreq, gainValue) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, when);
    if (toFreq !== fromFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  const api = {
    unlock,
    get ready() {
      return unlocked && !!ctx;
    },
    shot(kind) {
      if (!ensure() || !unlocked) return;
      const t = now();
      if (kind === 'rifle') {
        noise(t, 0.14, 'lowpass', 2400, 0.9);
        noise(t, 0.05, 'highpass', 3000, 0.5);
        tone(t, 0.07, 'square', 220, 70, 0.25);
      } else if (kind === 'smg') {
        noise(t, 0.09, 'bandpass', 1800, 0.7, 1.4);
        tone(t, 0.05, 'square', 300, 90, 0.18);
      } else if (kind === 'pistol') {
        noise(t, 0.11, 'lowpass', 1800, 0.8);
        tone(t, 0.06, 'square', 180, 60, 0.22);
      } else if (kind === 'bot') {
        // Distant enemy fire: duller, quieter, lowpassed harder.
        noise(t, 0.12, 'lowpass', 900, 0.28);
        tone(t, 0.06, 'square', 160, 60, 0.08);
      }
    },
    dryFire() {
      if (!ensure() || !unlocked) return;
      tone(now(), 0.03, 'square', 900, 700, 0.12);
    },
    reload() {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.04, 'square', 1200, 900, 0.14);
      tone(t + 0.28, 0.04, 'square', 900, 1200, 0.14);
      noise(t + 0.55, 0.05, 'bandpass', 2400, 0.2, 2);
    },
    hit(kill) {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.06, 'sine', kill ? 1560 : 1180, kill ? 1560 : 1180, 0.22);
      if (kill) tone(t + 0.07, 0.09, 'sine', 1960, 1960, 0.2);
    },
    hurt() {
      if (!ensure() || !unlocked) return;
      noise(now(), 0.12, 'lowpass', 500, 0.4);
      tone(now(), 0.12, 'sawtooth', 140, 70, 0.12);
    },
    step() {
      if (!ensure() || !unlocked) return;
      noise(now(), 0.05, 'lowpass', 700, 0.1);
    },
    explosion() {
      if (!ensure() || !unlocked) return;
      const t = now();
      noise(t, 0.7, 'lowpass', 900, 1.0);
      noise(t, 0.25, 'highpass', 2000, 0.4);
      tone(t, 0.5, 'sine', 90, 28, 0.9);
    },
    pin() {
      if (!ensure() || !unlocked) return;
      tone(now(), 0.03, 'square', 2000, 1600, 0.12);
    },
    beep(final) {
      if (!ensure() || !unlocked) return;
      tone(now(), final ? 0.16 : 0.08, 'sine', final ? 1560 : 1040, final ? 1560 : 1040, 0.2);
    },
    plant() {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.09, 'sine', 880, 880, 0.2);
      tone(t + 0.12, 0.09, 'sine', 1174, 1174, 0.2);
      tone(t + 0.24, 0.18, 'sine', 1568, 1568, 0.22);
    },
    roundWin() {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.16, 'triangle', 523, 523, 0.25);
      tone(t + 0.16, 0.16, 'triangle', 659, 659, 0.25);
      tone(t + 0.32, 0.32, 'triangle', 784, 784, 0.28);
    },
    roundLose() {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.22, 'triangle', 392, 392, 0.25);
      tone(t + 0.22, 0.22, 'triangle', 330, 330, 0.25);
      tone(t + 0.44, 0.44, 'triangle', 262, 262, 0.28);
    },
    buy() {
      if (!ensure() || !unlocked) return;
      const t = now();
      tone(t, 0.05, 'sine', 1320, 1320, 0.18);
      tone(t + 0.06, 0.08, 'sine', 1760, 1760, 0.18);
    },
    denied() {
      if (!ensure() || !unlocked) return;
      tone(now(), 0.12, 'square', 220, 180, 0.14);
    },
  };
  return api;
}
