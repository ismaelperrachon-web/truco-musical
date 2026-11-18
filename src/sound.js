let audio, effectsBus, musicBus, noiseBuffer;
let effectsEnabled = true, musicEnabled = false, musicVolume = .3;
let musicTimer, musicGeneration = 0, nextTime = 0, step = 0;
const musicVoices = new Set();

function context() {
  if (!audio) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audio = new AudioContext();
    effectsBus = audio.createGain(); effectsBus.gain.value = effectsEnabled ? .7 : 0;
    musicBus = audio.createGain(); musicBus.gain.value = 0;
    effectsBus.connect(audio.destination); musicBus.connect(audio.destination);
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  }
  return audio;
}
function voice(source, gain, filter, bus, at, duration) {
  source.connect(filter || gain); if (filter) filter.connect(gain); gain.connect(bus);
  if (bus === musicBus) musicVoices.add(source);
  source.onended = () => { musicVoices.delete(source); source.disconnect(); gain.disconnect(); filter?.disconnect(); };
  source.start(at); source.stop(at + duration + .03);
}
function envelope(at, duration, level, attack = .008) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(level, .0001), at + attack);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  return gain;
}
function tone(hz, at, duration, level, bus, type = 'sine', endHz = hz) {
  const oscillator = audio.createOscillator(); oscillator.type = type;
  oscillator.frequency.setValueAtTime(hz, at); oscillator.frequency.exponentialRampToValueAtTime(endHz, at + duration);
  voice(oscillator, envelope(at, duration, level), null, bus, at, duration);
}
function noise(at, duration, level, bus, frequency, type = 'highpass') {
  const source = audio.createBufferSource(); source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(frequency, at);
  voice(source, envelope(at, duration, level, .004), filter, bus, at, duration);
}
export function setSound(value) {
  effectsEnabled = Boolean(value);
  if (effectsEnabled) context()?.resume().catch(() => {});
  if (audio) effectsBus.gain.setTargetAtTime(effectsEnabled ? .7 : 0, audio.currentTime, .015);
}
export function sound(type) {
  if (!effectsEnabled || !audio || audio.state !== 'running') return;
  const at = audio.currentTime;
  if (type === 'card') {
    // Roce de cartón y golpe seco sobre el paño, sin archivos externos.
    noise(at, .13, .32, effectsBus, 1200, 'bandpass');
    noise(at + .035, .055, .17, effectsBus, 2900);
    tone(170, at + .045, .11, .22, effectsBus, 'triangle', 65);
    return;
  }
  const tones = type === 'deal' ? [330, 440, 550] : type === 'win' ? [523, 659, 784] : [392, 523];
  tones.forEach((hz, i) => tone(hz, at + i * .075, .17, .09, effectsBus));
}

const midi = n => 440 * 2 ** ((n - 69) / 12);
const roots = [48, 53, 55, 48];
const melody = [76, null, 79, 76, 74, 72, null, 74, 77, null, 81, 79, 77, 76, null, 72, 74, null, 79, 77, 74, 71, null, 74, 76, 79, 84, 79, 76, 74, 72, null];
function scheduleStep(index, at) {
  const position = index % 8, root = roots[Math.floor(index / 8) % roots.length];
  if ([0, 3, 4, 7].includes(position)) {
    const bass = root - 12 + ([3, 7].includes(position) ? 7 : 0);
    tone(midi(bass), at, .28, .3, musicBus, 'triangle');
  }
  if (position % 2 === 1) [0, 4, 7].forEach(interval => tone(midi(root + interval), at, .22, .035, musicBus, 'triangle'));
  // Guacharaca: raspados breves; congas suaves en contratiempo.
  for (let scrape = 0; scrape < (position % 2 ? 3 : 2); scrape++) noise(at + scrape * .032, .026, .055, musicBus, 3100);
  if ([2, 5, 6].includes(position)) {
    tone(position === 5 ? 240 : 175, at, .12, .13, musicBus, 'sine', 100);
    noise(at, .025, .035, musicBus, 1300, 'bandpass');
  }
  if (position === 0 || position === 4) tone(100, at, .18, .19, musicBus, 'sine', 45);
  const note = melody[index % melody.length];
  if (note !== null) {
    // Acordeón cálido: fundamental y armónicos, sin muestras de terceros.
    tone(midi(note), at, .43, .075, musicBus);
    tone(midi(note) * 2.003, at, .39, .023, musicBus);
    tone(midi(note) * 3, at, .32, .009, musicBus);
  }
}
function schedule() {
  if (!musicEnabled || audio.state !== 'running') return;
  if (nextTime < audio.currentTime - .1) nextTime = audio.currentTime + .02;
  while (nextTime < audio.currentTime + .12) {
    scheduleStep(step++, nextTime);
    nextTime += 60 / 84 / 2;
  }
}
export async function setMusic(value) {
  musicEnabled = Boolean(value);
  const generation = ++musicGeneration;
  clearInterval(musicTimer); musicTimer = null;
  if (audio) {
    musicBus.gain.setTargetAtTime(0, audio.currentTime, .015);
    for (const source of musicVoices) { try { source.stop(audio.currentTime + .04); } catch { /* Ya terminó. */ } }
  }
  if (!musicEnabled) return false;
  const ctx = context();
  if (!ctx) { musicEnabled = false; return false; }
  try { await ctx.resume(); } catch { musicEnabled = false; return false; }
  if (generation !== musicGeneration || !musicEnabled) return false;
  if (ctx.state !== 'running') { musicEnabled = false; return false; }
  musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, .025);
  step = 0; nextTime = ctx.currentTime + .05; schedule();
  musicTimer = setInterval(schedule, 25);
  return true;
}
export function setMusicVolume(value) {
  const number = Number(value);
  musicVolume = Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : .3;
  if (audio) musicBus.gain.setTargetAtTime(musicEnabled ? musicVolume : 0, audio.currentTime, .025);
}
