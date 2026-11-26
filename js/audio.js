/* Âm thanh: nhạc nền tự tạo bằng Web Audio, hiệu ứng, và giọng đọc (Web Speech).
 * © 2026 Vườn từ của cô Vân Anh. Bảo lưu mọi quyền. Không sao chép, phân phối hoặc chạy lại khi chưa được phép (xem tệp LICENSE). */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Nhạc nền + hiệu ứng                                                 */
  /* ------------------------------------------------------------------ */
  const N = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const hz = (name) => {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    return 440 * Math.pow(2, (N[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
  };
  const bar = (s) => s.trim().split(/\s+/).map((n) => (n === '.' ? null : hz(n)));

  const CHORDS = {
    C: { bass: 'C3', notes: ['E4', 'G4', 'C5'] },
    G: { bass: 'G2', notes: ['D4', 'G4', 'B4'] },
    Am: { bass: 'A2', notes: ['E4', 'A4', 'C5'] },
    F: { bass: 'F2', notes: ['F4', 'A4', 'C5'] },
  };
  // 16 ô nhịp, mỗi ô 8 móc đơn
  const SONG = [
    ['C', 'E5 G5 C6 G5 E5 G5 A5 G5'],
    ['G', 'D5 G5 B5 G5 D5 G5 A5 B5'],
    ['Am', 'C6 A5 E5 A5 C6 B5 A5 E5'],
    ['F', 'F5 A5 C6 A5 G5 F5 E5 D5'],
    ['C', 'E5 . G5 E5 C5 E5 G5 C6'],
    ['G', 'B5 . G5 D5 G5 B5 D6 B5'],
    ['F', 'A5 C6 A5 F5 A5 G5 F5 E5'],
    ['G', 'D5 G5 B5 D6 B5 G5 D5 .'],
    ['F', 'A5 . C6 A5 F5 A5 C6 .'],
    ['C', 'G5 . E5 G5 C6 . G5 E5'],
    ['G', 'D5 G5 B5 . A5 G5 D5 .'],
    ['Am', 'E5 A5 C6 E6 . C6 A5 .'],
    ['F', 'F5 A5 C6 . A5 . F5 .'],
    ['C', 'E5 G5 C6 . G5 . E5 .'],
    ['G', 'D5 . G5 . B5 . D6 .'],
    ['G', 'B5 A5 G5 D5 G5 . . .'],
  ].map(([c, m]) => ({ chord: CHORDS[c], melody: bar(m) }));

  const STEP = 60 / 104 / 2; // độ dài một móc đơn (giây)
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let timer = null, nextTime = 0, stepIdx = 0;
  let musicOn = false, musicVol = 0.6, sfxOn = true, ducked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.5;
      sfxBus.connect(master);
      const len = ctx.sampleRate * 0.2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function tone(bus, freq, t, dur, type, vol, attack = 0.006) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function shaker(t, vol) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(musicBus);
    s.start(t);
    s.stop(t + 0.08);
  }

  function scheduleStep(i, t) {
    const b = SONG[Math.floor(i / 8) % SONG.length];
    const s = i % 8;
    const note = b.melody[s];
    if (note) {
      // tiếng "kalimba": sóng sin + một hoạ âm ngắn
      tone(musicBus, note, t, 0.42, 'sine', 0.22);
      tone(musicBus, note * 3, t, 0.09, 'sine', 0.035, 0.002);
    }
    if (s === 0 || s === 4) tone(musicBus, hz(b.chord.bass), t, 0.5, 'triangle', 0.2, 0.01);
    if (s === 3) tone(musicBus, hz(b.chord.bass) * 1.5, t, 0.25, 'triangle', 0.1, 0.01);
    if (s === 2 || s === 6) {
      b.chord.notes.forEach((n, k) => tone(musicBus, hz(n), t + k * 0.012, 0.28, 'triangle', 0.055));
    }
    if (s % 2 === 1) shaker(t, 0.03);
    else if (s === 2 || s === 6) shaker(t, 0.05);
  }

  function pump() {
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(stepIdx, nextTime);
      nextTime += STEP;
      stepIdx++;
    }
  }

  function applyMusicGain(fast) {
    if (!ctx) return;
    const target = musicOn ? musicVol * 0.5 * (ducked ? 0.18 : 1) : 0;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(target, ctx.currentTime, fast ? 0.05 : 0.25);
  }

  const Sound = {
    /** Gọi trong một thao tác chạm/nhấn của người dùng để mở khoá âm thanh. */
    unlock() {
      if (!ensure()) return;
      if (musicOn && !timer) this.startMusic();
    },
    startMusic() {
      musicOn = true;
      if (!ensure()) return;
      if (!timer) {
        nextTime = ctx.currentTime + 0.08;
        timer = setInterval(pump, 40);
      }
      applyMusicGain();
    },
    stopMusic() {
      musicOn = false;
      applyMusicGain(true);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    setMusic(on) {
      if (on) this.startMusic();
      else this.stopMusic();
    },
    /** Chỉ ghi nhớ lựa chọn; nhạc sẽ bật ở lần chạm đầu tiên. */
    preferMusic(on) {
      musicOn = on;
    },
    setMusicVolume(v) {
      musicVol = v;
      applyMusicGain(true);
    },
    setSfx(on) {
      sfxOn = on;
    },
    duck(on) {
      ducked = on;
      applyMusicGain(true);
    },
    get musicOn() {
      return musicOn;
    },
    sfx(name) {
      if (!sfxOn || !ensure()) return;
      const t = ctx.currentTime + 0.01;
      if (name === 'correct') {
        tone(sfxBus, hz('E6'), t, 0.16, 'triangle', 0.35);
        tone(sfxBus, hz('G6'), t + 0.09, 0.16, 'triangle', 0.35);
        tone(sfxBus, hz('C7'), t + 0.18, 0.34, 'triangle', 0.35);
      } else if (name === 'wrong') {
        tone(sfxBus, hz('A3'), t, 0.2, 'triangle', 0.35);
        tone(sfxBus, hz('F3'), t + 0.14, 0.34, 'triangle', 0.35);
      } else if (name === 'tap') {
        tone(sfxBus, 720, t, 0.07, 'sine', 0.22, 0.003);
      } else if (name === 'flip') {
        tone(sfxBus, 520, t, 0.06, 'sine', 0.2, 0.003);
        tone(sfxBus, 780, t + 0.05, 0.08, 'sine', 0.2, 0.003);
      } else if (name === 'win') {
        ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(sfxBus, hz(n), t + i * 0.09, 0.3, 'triangle', 0.3));
        ['C5', 'E5', 'G5', 'C6'].forEach((n) => tone(sfxBus, hz(n), t + 0.6, 0.9, 'triangle', 0.2));
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Giọng đọc                                                           */
  /* ------------------------------------------------------------------ */
  const synth = window.speechSynthesis;
  const LANG = { us: 'en-US', uk: 'en-GB' };
  const GOOD = /natural|neural|premium|enhanced|siri/i;
  const NICE = /samantha|ava|allison|daniel|kate|serena|stephanie|aria|jenny|michelle|sonia|libby|ryan|guy/i;
  // Giọng máy đời cũ: giọng SAPI cài sẵn của Windows (tên "Microsoft …" mà không có "Online"/"Natural") và eSpeak.
  const LEGACY = /^microsoft (?!.*(online|natural))|espeak/i;
  const BAD = /compact|eloquence|albert|bad news|bahh|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|jester|wobble|fred|junior|ralph|kathy|superstar|good news|grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed/i;

  let voices = [];
  const listeners = [];
  let speakToken = 0;

  const langOf = (v) => (v.lang || '').replace('_', '-');

  function refreshVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
    listeners.forEach((fn) => fn());
  }
  if (synth) {
    refreshVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
    else synth.onvoiceschanged = refreshVoices;
  }

  /** Xếp loại một giọng: 'good' (tự nhiên), 'ok' (tạm được), 'robot' (giọng máy đời cũ / giọng đùa). */
  function quality(v) {
    if (BAD.test(v.name) || LEGACY.test(v.name)) return 'robot';
    if (GOOD.test(v.name) || /google/i.test(v.name)) return 'good';
    return 'ok';
  }

  function score(v, accent) {
    const lang = langOf(v).toLowerCase();
    let s = 0;
    if (lang === LANG[accent].toLowerCase()) s += 100;
    else if (accent === 'uk' && /en-(au|ie|nz|za|in)/.test(lang)) s += 30;
    else if (accent === 'us' && /en-ca/.test(lang)) s += 30;
    const q = quality(v);
    if (q === 'good') s += GOOD.test(v.name) ? 60 : 40; // giọng tự nhiên > giọng Google
    if (q === 'robot') s -= 90;
    if (q !== 'robot' && NICE.test(v.name)) s += 15;
    // giọng đa ngữ / giọng trẻ em đọc từ đơn kém ổn định hơn giọng thuần tiếng Anh
    if (/multilingual/i.test(v.name)) s -= 10;
    if (/\bana\b/i.test(v.name)) s -= 30;
    return s;
  }

  const Speech = {
    supported: !!synth && typeof window.SpeechSynthesisUtterance === 'function',
    preferred: { us: '', uk: '' },
    rate: 0.9,
    onVoices(fn) {
      listeners.push(fn);
    },
    hasVoices() {
      return voices.length > 0;
    },
    quality,
    list(accent) {
      const want = LANG[accent].toLowerCase();
      return voices
        .filter((v) => langOf(v).toLowerCase() === want)
        .sort((a, b) => score(b, accent) - score(a, accent));
    },
    /** Giọng tốt nhất máy đang có cho kiểu giọng này (không xét lựa chọn của người dùng). */
    auto(accent) {
      return [...voices].sort((a, b) => score(b, accent) - score(a, accent))[0] || null;
    },
    pick(accent) {
      const name = this.preferred[accent];
      if (name) {
        const hit = voices.find((v) => v.name === name);
        if (hit) return hit;
      }
      return this.auto(accent);
    },
    stop() {
      speakToken++;
      if (synth) synth.cancel();
      Sound.duck(false);
    },
    /** Đọc `text`; trả về Promise kết thúc khi đọc xong (hoặc lỗi / bị ngắt). */
    speak(text, { accent = 'us', slow = false } = {}) {
      return new Promise((resolve) => {
        if (!this.supported || !text) return resolve(false);
        const token = ++speakToken;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pick(accent);
        if (v) {
          u.voice = v;
          u.lang = langOf(v);
        } else {
          u.lang = LANG[accent];
        }
        u.rate = slow ? 0.55 : this.rate;
        u.pitch = 1;
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          if (token === speakToken) Sound.duck(false);
          resolve(ok && token === speakToken);
        };
        const guard = setTimeout(() => finish(true), 9000);
        u.onend = () => finish(true);
        u.onerror = () => finish(false);
        Sound.duck(true);
        // Chrome đôi khi bỏ qua speak() gọi ngay sau cancel()
        setTimeout(() => {
          if (token !== speakToken) return finish(false);
          try {
            synth.resume();
            synth.speak(u);
          } catch (e) {
            finish(false);
          }
        }, 60);
      });
    },
  };

  window.Sound = Sound;
  window.Speech = Speech;
})();
