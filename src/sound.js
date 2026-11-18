let audio;
let enabled = false;
export function setSound(value) {
  enabled = value;
  if (value) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) { audio ??= new Audio(); audio.resume().catch(() => {}); }
  }
}
export function sound(type) {
  if (!enabled || !audio || audio.state !== 'running') return;
  const tones = type === 'deal' ? [330, 440, 550] : type === 'call' ? [392, 523] : [180];
  tones.forEach((hz, i) => {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    const at = audio.currentTime + i * .075;
    oscillator.type = type === 'card' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hz, at);
    oscillator.frequency.exponentialRampToValueAtTime(hz * .7, at + .12);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.075, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + .15);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .16);
  });
}
