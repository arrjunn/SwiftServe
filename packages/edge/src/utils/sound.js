/**
 * Order notification sound — plays a short "ding" using Web Audio API.
 * No external audio files needed.
 */
let audioCtx = null;

export function playOrderSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Pleasant two-tone ding
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.1); // D6

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (_) {
    // Audio not available — silent fail
  }
}

export function playReadySound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Three ascending tones — "order ready"
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);     // C5
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
    osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.24); // G5

    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (_) {}
}
