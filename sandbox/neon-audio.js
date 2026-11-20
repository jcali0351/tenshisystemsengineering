// neon-audio.js: sound for the neon preview, all made in code (no audio files, nothing copyrighted).
//
//   - A looping synthwave track: kick, snare, hi-hat, a pulsing bass arpeggio and warm pad chords (A minor, F, C, G).
//   - Sound effects the game asks for: neonAudio.sfx("laser" | "boom" | "bigboom" | "power" | "hit" | "combo" |
//     "bomb" | "achievement" | "miss" | "car").
//   - The beat: on every kick, window.neonBeatAt is set to the time of that beat. Anything can work out how "on the
//     beat" it is right now with neonBeat() (1 right on the kick, fading to 0). The floor, sun and headline pulse with it.
//
// Browsers only allow sound after a click, so it starts OFF; the 🔊 button bottom-left turns it on and off.
(function () {
  const TEMPO = 112;                       // beats per minute
  const STEP = 60 / TEMPO / 4;             // one 16th note, in seconds
  // Chords, one per bar: root note for the bass and three notes for the pad (in Hz).
  const BARS = [
    { bass: 110.0, pad: [220.0, 261.6, 329.6] },   // A minor
    { bass: 87.31, pad: [174.6, 220.0, 261.6] },   // F
    { bass: 130.8, pad: [261.6, 329.6, 392.0] },   // C
    { bass: 98.00, pad: [196.0, 246.9, 293.7] },   // G
  ];
  const BASS_PATTERN = [1, 1, 2, 1, 1, 2, 1, 1.5, 1, 1, 2, 1, 1, 2, 1.5, 2];   // multiples of the root, per 16th

  let ac = null, master = null, noise = null, on = false, step = 0, nextTime = 0, timer = null;
  window.neonBeatAt = -1e9;
  window.neonBeat = () => Math.exp(-(performance.now() - window.neonBeatAt) / 160);

  function setup() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ac.destination);
    // One second of white noise, reused for drums and explosions.
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---- Little instruments ----
  function env(g, t, attack, hold, release, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }
  function tone(type, freq, t, dur, peak, opts = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + (opts.slideTime || dur));
    if (opts.detune) o.detune.value = opts.detune;
    let out = g;
    if (opts.lowpass) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opts.lowpass; f.Q.value = opts.q || 1; g.connect(f); out = f; }
    env(g, t, opts.attack || 0.005, opts.hold || 0, dur, peak);
    o.connect(g); out.connect(opts.dest || master);
    o.start(t); o.stop(t + (opts.attack || 0.005) + (opts.hold || 0) + dur + 0.05);
  }
  function hiss(t, dur, peak, type, freq, q = 1) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.002, 0, dur, peak);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- The track: schedule one 16th note at a time, a little ahead of when it plays ----
  function playStep(i, t) {
    const bar = BARS[Math.floor(i / 16) % BARS.length], s = i % 16;
    if (s % 4 === 0) {                                                   // kick on every beat
      tone("sine", 150, t, 0.28, 0.9, { slideTo: 42, slideTime: 0.12 });
      const delay = Math.max(0, (t - ac.currentTime) * 1000);
      setTimeout(() => { window.neonBeatAt = performance.now(); }, delay);
    }
    if (s === 4 || s === 12) { hiss(t, 0.18, 0.35, "bandpass", 1800, 0.8); tone("triangle", 190, t, 0.1, 0.25); }   // snare
    if (s % 2 === 1) hiss(t, 0.04, 0.12, "highpass", 8000);              // hi-hat on the off-beats
    tone("sawtooth", bar.bass * BASS_PATTERN[s], t, STEP * 0.9, 0.16, { lowpass: 700 + 500 * Math.sin(i / 10), q: 6 });   // bass
    if (s === 0) for (const f of bar.pad) for (const dt of [-8, 8])      // pad chord, two detuned voices per note
      tone("sawtooth", f, t, STEP * 16, 0.035, { detune: dt, attack: 0.4, hold: STEP * 10, lowpass: 1400 });
    if (i % 64 >= 32 && s % 3 === 0)                                     // a sparkly arpeggio every other phrase
      tone("square", bar.pad[(s / 3) % 3] * 2, t, 0.12, 0.04, { lowpass: 3000 });
  }
  function scheduler() {
    while (nextTime < ac.currentTime + 0.12) { playStep(step++, nextTime); nextTime += STEP; }
  }

  // ---- Sound effects ----
  const SFX = {
    laser: t => tone("sawtooth", 1400, t, 0.16, 0.12, { slideTo: 180, slideTime: 0.15, lowpass: 4000 }),
    miss: t => tone("square", 300, t, 0.06, 0.05, { slideTo: 200 }),
    hit: t => { hiss(t, 0.25, 0.35, "lowpass", 1600); tone("square", 520, t, 0.08, 0.08, { slideTo: 900 }); },
    boom: t => { hiss(t, 0.5, 0.6, "lowpass", 900); tone("sine", 120, t, 0.4, 0.5, { slideTo: 40 }); },
    bigboom: t => { hiss(t, 1.4, 0.9, "lowpass", 500); tone("sine", 80, t, 1.2, 0.8, { slideTo: 25 }); },
    combo: t => tone("triangle", 880, t, 0.1, 0.12, { slideTo: 1320 }),
    power: t => [523, 659, 784, 1046].forEach((f, k) => tone("square", f, t + k * 0.06, 0.12, 0.08, { lowpass: 3500 })),
    achievement: t => [784, 988, 1175, 1568].forEach((f, k) => tone("triangle", f, t + k * 0.08, 0.25, 0.12)),
    bomb: t => { tone("sine", 70, t, 0.6, 0.7, { slideTo: 30 }); hiss(t, 0.6, 0.5, "lowpass", 400); },
    car: t => tone("sawtooth", 220, t, 0.3, 0.1, { slideTo: 110, lowpass: 900 }),
  };

  // ---- The 🔊 button ----
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "neon-sound";
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = '<span aria-hidden="true">🔇</span> SOUND';
  document.body.appendChild(btn);
  btn.addEventListener("click", () => {
    if (!ac) setup();
    on = !on;
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = (on ? '<span aria-hidden="true">🔊</span>' : '<span aria-hidden="true">🔇</span>') + " SOUND";
    btn.classList.toggle("is-on", on);
    if (on) { ac.resume(); nextTime = ac.currentTime + 0.05; timer = setInterval(scheduler, 25); }
    else { clearInterval(timer); ac.suspend(); window.neonBeatAt = -1e9; }
  });

  // The headline throbs gently with the beat while the music plays.
  const headline = document.querySelector(".hero-card h1");
  (function beatLoop() {
    if (on && headline) headline.style.transform = `scale(${1 + window.neonBeat() * 0.025})`;
    requestAnimationFrame(beatLoop);
  })();

  window.neonAudio = {
    get on() { return on; },
    sfx(name) { if (on && ac && SFX[name]) SFX[name](ac.currentTime + 0.001); },
  };
})();
