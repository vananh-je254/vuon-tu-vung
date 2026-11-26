/* Vườn từ của cô Vân Anh — ứng dụng học từ vựng theo buổi. Không cần máy chủ, dữ liệu lưu trong trình duyệt.
 * © 2026 Vườn từ của cô Vân Anh. Bảo lưu mọi quyền. Không sao chép, phân phối hoặc chạy lại khi chưa được phép (xem tệp LICENSE). */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Tiện ích                                                            */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ------------------------------------------------------------------ */
  /* Dữ liệu                                                             */
  /* ------------------------------------------------------------------ */
  const LESSONS = window.VOCAB.lessons;
  const ALL = [];
  const BY_ID = new Map();
  LESSONS.forEach((lesson) =>
    lesson.decks.forEach((deck) =>
      deck.words.forEach((w) => {
        w.lesson = lesson;
        w.deck = deck;
        ALL.push(w);
        BY_ID.set(w.id, w);
      })
    )
  );

  const LEVELS = [
    { icon: '🌰', name: 'Chưa gieo' },
    { icon: '🌱', name: 'Nảy mầm' },
    { icon: '🌿', name: 'Cây non' },
    { icon: '🪴', name: 'Lớn nhanh' },
    { icon: '🌷', name: 'Ra nụ' },
    { icon: '🌻', name: 'Nở hoa' },
  ];
  const INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 };
  const HOUR = 3600e3;

  /* ------------------------------------------------------------------ */
  /* Lưu trữ                                                             */
  /* ------------------------------------------------------------------ */
  const KEY = 'vuontu.v1';
  const DEFAULTS = {
    accent: 'auto', // auto = theo phiên âm của từng buổi
    voiceUs: '',
    voiceUk: '',
    rate: 0.9,
    music: true,
    musicVol: 0.6,
    sfx: true,
    batch: 10,
    autoSpeak: true,
  };
  let memoryOnly = false;
  function loadState() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) {
      memoryOnly = true;
    }
    return {
      words: raw.words || {},
      xp: raw.xp || 0,
      streak: raw.streak || { last: '', count: 0 },
      tourSeen: !!raw.tourSeen,
      // Lịch: classDays theo Date.getDay() (0 = Chủ Nhật … 6 = Thứ Bảy); marks = { 'YYYY-MM-DD': ghi chú }
      cal: { classDays: [1, 5], marks: {}, ...(raw.cal || {}) },
      // Nhật ký học: { 'YYYY-MM-DD': số lượt học xong trong ngày }
      days: raw.days || seedDays(raw.streak),
      settings: { ...DEFAULTS, ...(raw.settings || {}) },
    };
  }
  /** Người dùng cũ chưa có nhật ký: dựng lại các ngày gần nhất từ chuỗi ngày học. */
  function seedDays(streak) {
    const out = {};
    if (!streak || !streak.last || !streak.count) return out;
    const [y, m, d] = streak.last.split('-').map(Number);
    for (let i = 0; i < Math.min(streak.count, 60); i++) out[dayKey(new Date(y, m - 1, d - i))] = 1;
    return out;
  }
  const S = loadState();
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      memoryOnly = true;
    }
  }

  const levelOf = (id) => (S.words[id] ? S.words[id].lv : 0);
  const isDue = (id, now = Date.now()) => !!S.words[id] && S.words[id].due <= now;
  const dueWords = () => {
    const now = Date.now();
    return ALL.filter((w) => isDue(w.id, now)).sort((a, b) => S.words[a.id].due - S.words[b.id].due);
  };
  const learnedIn = (words) => words.filter((w) => levelOf(w.id) > 0).length;
  const lessonWords = (lesson) => lesson.decks.flatMap((d) => d.words);
  const streakNow = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return S.streak.last === dayKey() || S.streak.last === dayKey(y) ? S.streak.count : 0;
  };
  function touchStreak() {
    const today = dayKey();
    if (S.streak.last === today) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    S.streak.count = S.streak.last === dayKey(y) ? S.streak.count + 1 : 1;
    S.streak.last = today;
  }
  function schedule(id, lv, soon) {
    S.words[id] = {
      lv,
      due: soon ? Date.now() + 10 * 60e3 : Date.now() + INTERVAL_DAYS[lv] * 24 * HOUR - 4 * HOUR,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Âm thanh                                                            */
  /* ------------------------------------------------------------------ */
  function applyAudioSettings() {
    Speech.preferred.us = S.settings.voiceUs;
    Speech.preferred.uk = S.settings.voiceUk;
    Speech.rate = S.settings.rate;
    Sound.setSfx(S.settings.sfx);
    Sound.setMusicVolume(S.settings.musicVol);
  }
  applyAudioSettings();
  Sound.preferMusic(S.settings.music);
  // Trình duyệt chỉ cho phát âm thanh sau thao tác đầu tiên của người dùng.
  const unlock = () => Sound.unlock();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);

  const accentFor = (w) => (S.settings.accent === 'auto' ? w.lesson.accent : S.settings.accent);
  const sayText = (w) => w.say || w.w.replace(/\s*\([^)]*\)/g, '');
  let warnedNoVoice = false;
  function say(w, slow = false) {
    if (!Speech.supported || !Speech.hasVoices()) {
      if (!warnedNoVoice) {
        warnedNoVoice = true;
        toast('Thiết bị này chưa có giọng đọc tiếng Anh 😢 Hãy thử Chrome, Edge hoặc Safari nhé.');
      }
      return Promise.resolve(false);
    }
    return Speech.speak(sayText(w), { accent: accentFor(w), slow });
  }
  const canListen = () => Speech.supported && Speech.hasVoices();

  /* ------------------------------------------------------------------ */
  /* Nhân vật: bé Mầm (chậu cây)                                         */
  /* ------------------------------------------------------------------ */
  function mascot(mood = 'happy', cls = '') {
    const ink = '#4A3B5C';
    const eyes = {
      happy: `<circle cx="46" cy="80" r="6" fill="${ink}"/><circle cx="74" cy="80" r="6" fill="${ink}"/>
              <circle cx="48" cy="77.6" r="2.1" fill="#fff"/><circle cx="76" cy="77.6" r="2.1" fill="#fff"/>`,
      cheer: `<path d="M39 82q7-10 14 0M67 82q7-10 14 0" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`,
      sad: `<circle cx="46" cy="82" r="5.5" fill="${ink}"/><circle cx="74" cy="82" r="5.5" fill="${ink}"/>
            <path d="M38 77l12-5M82 77l-12-5" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
            <path d="M82 88q4 6 0 9q-4-3 0-9z" fill="#7CC6FE"/>`,
      think: `<circle cx="46" cy="79" r="6" fill="${ink}"/><circle cx="74" cy="79" r="6" fill="${ink}"/>
              <circle cx="48.5" cy="76" r="2.1" fill="#fff"/><circle cx="76.5" cy="76" r="2.1" fill="#fff"/>
              <path d="M66 69l14-3" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    };
    const mouth = {
      happy: `<path d="M53 91q7 7 14 0" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`,
      cheer: `<path d="M51 89h18a9 9 0 0 1-18 0z" fill="${ink}"/><path d="M55 95a6 4 0 0 1 10 0a8 8 0 0 1-10 0z" fill="#FF8FA3"/>`,
      sad: `<path d="M53 96q7-6 14 0" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`,
      think: `<circle cx="60" cy="93" r="3.4" fill="${ink}"/>`,
    };
    const sparkle =
      mood === 'cheer'
        ? `<g fill="#FFC94D"><path d="M12 30l2.4 5.6L20 38l-5.6 2.4L12 46l-2.4-5.6L4 38l5.6-2.4z"/><path d="M106 18l1.8 4.2L112 24l-4.2 1.8L106 30l-1.8-4.2L100 24l4.2-1.8z"/></g>`
        : '';
    return `<svg class="mascot mascot-${mood} ${cls}" viewBox="0 0 120 126" role="img" aria-label="Bé Mầm">
      <ellipse cx="60" cy="120" rx="30" ry="5" fill="rgba(74,59,92,.13)"/>
      <g class="sprout">
        <path d="M60 52C60 40 60 34 60 24" fill="none" stroke="#2FA374" stroke-width="5" stroke-linecap="round"/>
        <path d="M60 28C50 10 32 12 28 22C40 32 54 32 60 28Z" fill="#56C596"/>
        <path d="M60 28C70 8 90 10 94 20C82 32 66 32 60 28Z" fill="#7BDDAF"/>
      </g>
      ${sparkle}
      <path d="M27 62h66l-7 48q-1 8-9 8H43q-8 0-9-8z" fill="#F6A483"/>
      <path d="M27 62h66l-1.6 11H28.6z" fill="#E98B68" opacity=".55"/>
      <rect x="19" y="48" width="82" height="17" rx="8.5" fill="#EE8A68"/>
      <rect x="25" y="51" width="38" height="4" rx="2" fill="#fff" opacity=".35"/>
      <ellipse cx="38" cy="92" rx="6.5" ry="4" fill="#FF8FA3" opacity=".65"/>
      <ellipse cx="82" cy="92" rx="6.5" ry="4" fill="#FF8FA3" opacity=".65"/>
      ${eyes[mood] || eyes.happy}
      ${mouth[mood] || mouth.happy}
    </svg>`;
  }

  /* ------------------------------------------------------------------ */
  /* Thông báo, hộp thoại, pháo giấy                                     */
  /* ------------------------------------------------------------------ */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('modal-open');
  }
  function openModal(html, onReady) {
    $('#modal-root').innerHTML = `<div class="modal-veil" data-act="modal-close"></div>
      <div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.classList.add('modal-open');
    if (onReady) onReady($('#modal-root .modal'));
  }
  function confirmBox({ title, text, yes, no = 'Thôi', mood = 'think', onYes }) {
    openModal(
      `<div class="confirm">
        ${mascot(mood, 'mascot-sm')}
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="row-btns">
          <button class="btn ghost" data-act="modal-close">${esc(no)}</button>
          <button class="btn coral" id="confirm-yes">${esc(yes)}</button>
        </div>
      </div>`,
      (m) => {
        $('#confirm-yes', m).addEventListener('click', () => {
          closeModal();
          onYes();
        });
      }
    );
  }

  function confetti() {
    const box = $('#confetti');
    const bits = ['🌸', '🌼', '🍃', '⭐', '🎉', '🌱', '💛', '🌷'];
    let html = '';
    for (let i = 0; i < 36; i++) {
      html += `<span style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 0.7).toFixed(2)}s;animation-duration:${(
        2.2 + Math.random() * 1.6
      ).toFixed(2)}s;font-size:${(16 + Math.random() * 18).toFixed(0)}px">${pick(bits)}</span>`;
    }
    box.innerHTML = html;
    setTimeout(() => (box.innerHTML = ''), 4500);
  }

  /* ------------------------------------------------------------------ */
  /* Thanh trên cùng                                                     */
  /* ------------------------------------------------------------------ */
  function topbar() {
    return `<header class="topbar">
      <a class="brand" href="#/" aria-label="Trang chủ Vườn từ của cô Vân Anh">
        ${mascot('happy', 'mascot-logo')}
        <span class="brand-name">Vườn từ <span class="brand-sub">của cô Vân Anh</span></span>
      </a>
      <div class="top-actions">
        <button class="btn ghost small tour-top" data-act="tour">📖 Hướng dẫn</button>
        <span class="chip" title="Chuỗi ngày học liên tiếp">🔥 <b>${streakNow()}</b></span>
        <span class="chip chip-xp" title="Điểm kinh nghiệm">⭐ <b>${S.xp}</b></span>
        <button class="icon-btn ${S.settings.music ? 'on' : ''}" data-act="toggle-music" aria-pressed="${S.settings.music}"
          aria-label="${S.settings.music ? 'Tắt nhạc nền' : 'Bật nhạc nền'}" title="Nhạc nền">${S.settings.music ? '🎵' : '🔇'}</button>
        <button class="icon-btn" data-act="settings" aria-label="Cài đặt" title="Cài đặt">⚙️</button>
      </div>
    </header>`;
  }

  /* ------------------------------------------------------------------ */
  /* Trang chủ                                                           */
  /* ------------------------------------------------------------------ */
  function nextDeck() {
    for (const lesson of LESSONS) {
      for (const deck of lesson.decks) {
        if (learnedIn(deck.words) < deck.words.length) return deck;
      }
    }
    return null;
  }

  function lessonCard(lesson, i) {
    const words = lessonWords(lesson);
    const done = learnedIn(words);
    const pct = Math.round((done / words.length) * 100);
    return `<a class="lesson-card tone-${i % 6} ${pct === 100 ? 'complete' : ''}" href="#/lesson/${lesson.id}">
      <span class="lesson-emoji" aria-hidden="true">${lesson.emoji}</span>
      <span class="lesson-info">
        <span class="lesson-label">${esc(lesson.label)}${pct === 100 ? ' · ✅' : ''}</span>
        <span class="lesson-topic">${esc(lesson.topic)}</span>
        <span class="lesson-vi">${esc(lesson.topicVi)}</span>
        <span class="bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <span class="lesson-count">${done}/${words.length} từ</span>
      </span>
    </a>`;
  }

  function renderHome() {
    const due = dueWords();
    const learned = Object.keys(S.words).filter((id) => BY_ID.has(id)).length;
    const nd = nextDeck();
    const counts = [0, 0, 0, 0, 0, 0];
    ALL.forEach((w) => counts[levelOf(w.id)]++);

    let bubble, mood;
    if (!learned) {
      bubble = S.tourSeen
        ? 'Xin chào! Mình là <b>Mầm</b> 🌱 Cùng gieo những hạt từ vựng đầu tiên nhé!'
        : 'Xin chào! Mình là <b>Mầm</b> 🌱 Lần đầu tới đây à? Bấm <b>📖 Hướng dẫn</b> để mình dẫn bạn đi một vòng nhé!';
      mood = 'happy';
    } else if (due.length) {
      bubble = `Có <b>${due.length} cây</b> đang khát nước! Ôn lại để chúng lớn nhanh nào 💧`;
      mood = 'happy';
    } else {
      bubble = 'Vườn đang xanh tốt lắm! Gieo thêm từ mới nha? 🌼';
      mood = 'cheer';
    }

    const reviewBtn = due.length
      ? `<button class="btn sky big" data-act="review">💧 Tưới cây · ôn ${due.length} từ</button>`
      : '';
    const learnBtn = nd
      ? `<button class="btn mint big" data-act="learn" data-deck="${nd.id}">🌱 ${learned ? 'Học tiếp' : 'Bắt đầu'}: ${esc(
          nd.words[0].lesson.label
        )} <small>${esc(nd.name)}</small></button>`
      : `<div class="all-done">🎉 Bạn đã gieo hết tất cả các từ!</div>`;
    const tourBtn = `<button class="btn big ${S.tourSeen ? 'ghost' : 'sun pulse'}" data-act="tour">📖 Hướng dẫn</button>`;

    const main = LESSONS.filter((l) => !l.bonus);
    const bonus = LESSONS.filter((l) => l.bonus);

    app.innerHTML = `${topbar()}
      <main class="page">
        <section class="hero">
          <div class="hero-mascot">${mascot(mood)}</div>
          <div class="hero-body">
            <p class="bubble">${bubble}</p>
            <div class="hero-cta">${reviewBtn}${learnBtn}${tourBtn}</div>
          </div>
        </section>

        <section class="garden" aria-label="Khu vườn của bạn">
          <h2>Khu vườn của bạn <small>${learned}/${ALL.length} từ đã gieo</small></h2>
          <div class="pots">
            ${LEVELS.map(
              (lv, i) => `<div class="pot lv${i}"><span class="pot-icon">${lv.icon}</span><b>${counts[i]}</b><span>${lv.name}</span></div>`
            ).join('')}
          </div>
        </section>

        <section>
          <h2>Các buổi học</h2>
          <div class="lesson-grid">${main.map(lessonCard).join('')}</div>
        </section>

        <section>
          <h2>Bài bổ trợ <small>cho Part 5 · 6</small></h2>
          <div class="lesson-grid">${bonus.map((l, i) => lessonCard(l, i + 3)).join('')}</div>
        </section>

        <footer class="foot">
          Tiến độ được lưu ngay trên thiết bị này${memoryOnly ? ' (trình duyệt đang chặn lưu trữ nên sẽ mất khi đóng trang)' : ''}.
          Phát âm dùng giọng đọc có sẵn của trình duyệt.
          <span class="copyright">© 2026 Vườn từ của cô Vân Anh · Bảo lưu mọi quyền. Không sao chép hoặc chạy lại trang này khi chưa được phép.</span>
        </footer>
      </main>`;
  }

  /* ------------------------------------------------------------------ */
  /* Trang một buổi học                                                  */
  /* ------------------------------------------------------------------ */
  let hideMeaning = false;
  let playlist = null; // { deckId, stop }

  function wordRow(w) {
    const lv = levelOf(w.id);
    return `<li>
      <button class="word-row" data-act="say" data-id="${w.id}" aria-label="Nghe ${esc(w.w)}">
        <span class="w-emoji" aria-hidden="true">${w.e || w.lesson.emoji}</span>
        <span class="w-main">
          <span class="w-term">${esc(w.w)}</span>
          ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}
        </span>
        <span class="w-vi">${esc(w.vi)}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span>
        <span class="w-lv" title="${LEVELS[lv].name}">${LEVELS[lv].icon}</span>
        <span class="w-play" aria-hidden="true">🔊</span>
      </button>
    </li>`;
  }

  function renderLesson(id) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) return go('#/');
    const words = lessonWords(lesson);
    const done = learnedIn(words);
    const idx = LESSONS.indexOf(lesson);
    const prev = LESSONS[idx - 1];
    const next = LESSONS[idx + 1];

    const decks = lesson.decks
      .map((deck) => {
        const d = learnedIn(deck.words);
        const left = deck.words.length - d;
        return `<section class="deck" id="deck-${deck.id}">
          <div class="deck-head">
            <h2>${esc(deck.name)} <small>${d}/${deck.words.length}</small></h2>
            <div class="deck-actions">
              ${
                left
                  ? `<button class="btn mint" data-act="learn" data-deck="${deck.id}">🌱 Học từ mới <small>còn ${left}</small></button>`
                  : `<span class="tag done">✅ Đã gieo hết</span>`
              }
              <button class="btn sun" data-act="practice" data-deck="${deck.id}">🎯 Luyện tập</button>
              <button class="btn ghost" data-act="playlist" data-deck="${deck.id}">▶ Nghe lần lượt</button>
            </div>
          </div>
          <ol class="word-list">${deck.words.map(wordRow).join('')}</ol>
        </section>`;
      })
      .join('');

    app.innerHTML = `${topbar()}
      <main class="page lesson-page ${hideMeaning ? 'hide-vi' : ''}">
        <a class="back" href="#/">← Tất cả các buổi</a>
        <section class="lesson-hero tone-${idx % 6}">
          <span class="lesson-emoji big" aria-hidden="true">${lesson.emoji}</span>
          <div>
            <p class="lesson-label">${esc(lesson.label)}</p>
            <h1>${esc(lesson.topic)}</h1>
            <p class="lesson-vi">${esc(lesson.topicVi)} · phiên âm giọng ${lesson.accent === 'uk' ? 'Anh-Anh' : 'Anh-Mỹ'}</p>
            <span class="bar"><i style="width:${Math.round((done / words.length) * 100)}%"></i></span>
            <p class="lesson-count">${done}/${words.length} từ đã gieo</p>
          </div>
        </section>
        <div class="list-tools">
          <span class="hint">👆 Chạm vào từ để nghe phát âm</span>
          <button class="btn ghost small" data-act="toggle-vi" aria-pressed="${hideMeaning}">${hideMeaning ? '🙉 Hiện nghĩa' : '🙈 Ẩn nghĩa'}</button>
        </div>
        ${decks}
        <nav class="lesson-nav">
          ${prev ? `<a class="btn ghost" href="#/lesson/${prev.id}">← ${esc(prev.label)}</a>` : '<span></span>'}
          ${next ? `<a class="btn ghost" href="#/lesson/${next.id}">${esc(next.label)} →</a>` : '<span></span>'}
        </nav>
      </main>`;
  }

  function stopPlaylist() {
    if (!playlist) return;
    playlist.stopped = true;
    playlist = null;
    Speech.stop();
    document.querySelectorAll('.word-row.playing').forEach((el) => el.classList.remove('playing'));
    document.querySelectorAll('[data-act="playlist"]').forEach((b) => (b.textContent = '▶ Nghe lần lượt'));
  }
  async function startPlaylist(deck, btn) {
    stopPlaylist();
    if (!canListen()) return say(deck.words[0]);
    const me = { stopped: false };
    playlist = me;
    btn.textContent = '⏹ Dừng nghe';
    for (const w of deck.words) {
      if (me.stopped) return;
      const row = document.querySelector(`.word-row[data-id="${w.id}"]`);
      if (!row) break;
      row.classList.add('playing');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await say(w);
      await new Promise((r) => setTimeout(r, 900));
      row.classList.remove('playing');
    }
    if (!me.stopped) stopPlaylist();
  }

  /* ------------------------------------------------------------------ */
  /* Phiên học: thẻ từ + câu hỏi                                          */
  /* ------------------------------------------------------------------ */
  let sess = null;

  const normType = (type) => {
    if (canListen()) return type;
    if (type === 'listen-mc') return 'mc-en-vi';
    if (type === 'listen-type') return 'type';
    return type;
  };
  const q = (w, type) => ({ kind: 'q', w, type: normType(w.noType && /type/.test(type) ? 'mc-vi-en' : type) });

  function startSession(cfg) {
    stopPlaylist();
    sess = {
      i: 0,
      done: 0,
      firstTotal: 0,
      firstOk: 0,
      xp: 0,
      missed: new Set(),
      ...cfg,
    };
    sess.total = sess.steps.length;
    if (location.hash === '#/study') renderStep();
    else location.hash = '#/study';
  }

  function startLearn(deck) {
    const fresh = deck.words.filter((w) => !levelOf(w.id)).slice(0, S.settings.batch);
    if (!fresh.length) return toast('Bộ từ này bạn đã gieo hết rồi! 🌻');
    const steps = [];
    for (let i = 0; i < fresh.length; i += 5) {
      const chunk = fresh.slice(i, i + 5);
      chunk.forEach((w) => steps.push({ kind: 'card', w }));
      shuffle(chunk).forEach((w) => steps.push(q(w, pick(['mc-en-vi', 'listen-mc']))));
    }
    shuffle(fresh).forEach((w) => steps.push(q(w, pick(['mc-vi-en', 'type']))));
    startSession({
      mode: 'learn',
      title: `${deck.words[0].lesson.label} · ${deck.name}`,
      back: `#/lesson/${deck.words[0].lesson.id}`,
      deck,
      words: fresh,
      steps,
    });
  }

  function startPractice(deck) {
    const words = shuffle(deck.words).slice(0, 15);
    const steps = words.map((w) => q(w, pick(['mc-en-vi', 'mc-vi-en', 'listen-mc', 'type', 'listen-type'])));
    startSession({
      mode: 'practice',
      title: `Luyện tập · ${deck.words[0].lesson.label}`,
      back: `#/lesson/${deck.words[0].lesson.id}`,
      deck,
      words,
      steps,
    });
  }

  function startReview() {
    const words = dueWords().slice(0, 20);
    if (!words.length) return toast('Chưa có cây nào cần tưới. Quay lại sau nhé! 🌤️');
    const steps = shuffle(words).map((w) =>
      q(w, levelOf(w.id) <= 2 ? pick(['mc-en-vi', 'mc-vi-en', 'listen-mc']) : pick(['type', 'listen-type', 'mc-vi-en']))
    );
    startSession({ mode: 'review', title: 'Tưới cây · ôn tập', back: '#/', words, steps });
  }

  function options(st) {
    if (st.opts) return st.opts;
    const w = st.w;
    const seen = new Set([w.w.toLowerCase()]);
    const seenVi = new Set([w.vi.toLowerCase()]);
    const out = [];
    const take = (pool) => {
      for (const c of shuffle(pool)) {
        if (out.length >= 3) return;
        if (seen.has(c.w.toLowerCase()) || seenVi.has(c.vi.toLowerCase())) continue;
        seen.add(c.w.toLowerCase());
        seenVi.add(c.vi.toLowerCase());
        out.push(c);
      }
    };
    take(w.deck.words);
    take(lessonWords(w.lesson));
    take(ALL);
    st.opts = shuffle([w, ...out]);
    return st.opts;
  }

  function sessionShell(inner, footer = '') {
    const pct = Math.round((sess.done / sess.total) * 100);
    return `<div class="study">
      <header class="study-top">
        <button class="icon-btn" data-act="quit" aria-label="Thoát phiên học">✕</button>
        <div class="bar thick" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <button class="icon-btn ${S.settings.music ? 'on' : ''}" data-act="toggle-music" aria-label="Bật/tắt nhạc nền">${S.settings.music ? '🎵' : '🔇'}</button>
      </header>
      <p class="study-title">${esc(sess.title)}</p>
      <div class="study-body">${inner}</div>
      <div class="study-foot">${footer}</div>
    </div>`;
  }

  function audioBtns(id) {
    return `<div class="audio-btns">
      <button class="round-btn" data-act="say" data-id="${id}" aria-label="Nghe phát âm">🔊</button>
      <button class="round-btn slow" data-act="say-slow" data-id="${id}" aria-label="Nghe chậm" title="Nghe chậm">🐢</button>
    </div>`;
  }

  function renderStep() {
    const st = sess.steps[sess.i];
    if (!st) return finishSession();
    const w = st.w;
    window.scrollTo(0, 0);

    if (st.kind === 'card') {
      const cards = sess.steps.filter((s) => s.kind === 'card');
      const n = cards.indexOf(st) + 1;
      app.innerHTML = sessionShell(
        `<p class="q-label">Từ mới ${n}/${cards.length} · chạm thẻ để lật</p>
        <div class="flash ${st.flipped ? 'flipped' : ''}" data-act="flip" tabindex="0" role="button" aria-label="Lật thẻ">
          <div class="flash-inner">
            <div class="flash-face front">
              <span class="flash-emoji">${w.e || w.lesson.emoji}</span>
              <span class="flash-term">${esc(w.w)}</span>
              ${w.ipa ? `<span class="ipa big">${esc(w.ipa)}</span>` : ''}
              <span class="flash-tip">Nghĩa là gì nhỉ? 🤔</span>
            </div>
            <div class="flash-face back">
              <span class="flash-emoji">${w.e || w.lesson.emoji}</span>
              <span class="flash-vi">${esc(w.vi)}</span>
              ${w.note ? `<span class="flash-note">${esc(w.note)}</span>` : ''}
              <span class="flash-term small">${esc(w.w)} ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}</span>
            </div>
          </div>
        </div>
        ${audioBtns(w.id)}`,
        `<button class="btn ghost" data-act="card-prev" ${sess.i === 0 || sess.steps[sess.i - 1].kind !== 'card' ? 'disabled' : ''}>← Trước</button>
         <button class="btn mint grow" data-act="card-next">Tiếp theo →</button>`
      );
      if (S.settings.autoSpeak && !st.spoken) {
        st.spoken = true;
        say(w);
      }
      return;
    }

    // Câu hỏi
    let prompt = '';
    let body = '';
    const t = st.type;
    if (t === 'mc-en-vi') {
      prompt = `<p class="q-label">Chọn nghĩa đúng</p>
        <div class="q-card">
          <span class="q-emoji">${w.e || w.lesson.emoji}</span>
          <span class="q-term">${esc(w.w)}</span>
          ${w.ipa ? `<span class="ipa big">${esc(w.ipa)}</span>` : ''}
          ${audioBtns(w.id)}
        </div>`;
    } else if (t === 'mc-vi-en') {
      prompt = `<p class="q-label">Từ tiếng Anh nào có nghĩa là…</p>
        <div class="q-card"><span class="q-vi">${esc(w.vi)}</span>${w.note ? `<span class="flash-note">${esc(w.note)}</span>` : ''}</div>`;
    } else if (t === 'listen-mc') {
      prompt = `<p class="q-label">Nghe và chọn nghĩa đúng</p>
        <div class="q-card listen">${audioBtns(w.id)}<span class="q-hint">Bấm 🔊 để nghe lại</span></div>`;
    } else if (t === 'type') {
      prompt = `<p class="q-label">Gõ từ tiếng Anh</p>
        <div class="q-card"><span class="q-emoji">${w.e || w.lesson.emoji}</span><span class="q-vi">${esc(w.vi)}</span>
        ${w.note ? `<span class="flash-note">${esc(w.note)}</span>` : ''}</div>`;
    } else {
      prompt = `<p class="q-label">Nghe và gõ lại từ bạn nghe được</p>
        <div class="q-card listen">${audioBtns(w.id)}<span class="q-hint">Bấm 🔊 để nghe lại · 🐢 để nghe chậm</span></div>`;
    }

    if (t.startsWith('mc') || t === 'listen-mc') {
      const showVi = t !== 'mc-vi-en';
      body = `<div class="opts">${options(st)
        .map(
          (o, k) => `<button class="opt" data-act="choose" data-id="${o.id}"><kbd>${k + 1}</kbd><span>${esc(showVi ? o.vi : o.w)}</span></button>`
        )
        .join('')}</div>`;
    } else {
      body = `<form class="type-form" data-form="type" autocomplete="off">
        <input id="type-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"
          placeholder="Gõ câu trả lời…" aria-label="Câu trả lời">
        <div class="type-actions">
          <button type="button" class="btn ghost" data-act="hint">💡 Gợi ý</button>
          <button type="submit" class="btn mint grow">Kiểm tra</button>
        </div>
        <p class="type-hint" id="type-hint" aria-live="polite"></p>
      </form>`;
    }

    // Khung phản hồi nằm ngay dưới các đáp án để không che lên chúng.
    app.innerHTML = sessionShell(prompt + body + '<div id="feedback"></div>');
    if (t === 'mc-en-vi' && S.settings.autoSpeak && sess.mode !== 'demo') say(w);
    if (t.startsWith('listen')) say(w);
    const input = $('#type-input');
    if (input) input.focus();
  }

  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[’'`.,!?-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const accepted = (w) => {
    const list = w.w.split(' / ').map(norm);
    list.push(norm(w.w));
    return list.filter(Boolean);
  };

  function answer(correct, chosenId) {
    const st = sess.steps[sess.i];
    if (st.answered) return;
    st.answered = true;
    const w = st.w;

    document.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.id === w.id) b.classList.add('right');
      else if (b.dataset.id === chosenId) b.classList.add('wrong');
    });
    const input = $('#type-input');
    if (input) {
      input.readOnly = true;
      input.classList.add(correct ? 'right' : 'wrong');
      document.querySelectorAll('.type-actions button').forEach((b) => (b.disabled = true));
    }

    if (!st.retry) {
      sess.firstTotal++;
      if (correct) sess.firstOk++;
      else sess.missed.add(w.id);
      if (sess.mode === 'review') {
        const lv = levelOf(w.id) || 1;
        if (correct) schedule(w.id, Math.min(5, lv + 1), false);
        else schedule(w.id, Math.max(1, lv - 1), true);
        save();
      }
    }
    if (correct) {
      sess.done++;
      sess.xp += st.retry ? 4 : 10;
    } else {
      const again = { kind: 'q', w, type: st.type.startsWith('listen') ? 'mc-en-vi' : st.type, retry: true };
      sess.steps.splice(Math.min(sess.i + 4, sess.steps.length), 0, again);
    }

    Sound.sfx(correct ? 'correct' : 'wrong');
    const praise = pick(['Chính xác! 🎉', 'Giỏi quá! 🌟', 'Tuyệt vời! 🌻', 'Đúng rồi! 💚', 'Xuất sắc! ✨']);
    const fb = $('#feedback');
    fb.className = `feedback ${correct ? 'ok' : 'no'}`;
    fb.innerHTML = `<div class="fb-mascot">${mascot(correct ? 'cheer' : 'sad', 'mascot-sm')}</div>
      <div class="fb-text">
        <b>${correct ? praise : 'Chưa đúng rồi, không sao cả!'}</b>
        <span><span class="fb-term">${esc(w.w)}</span> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}</span>
        <span>${esc(w.vi)}</span>
      </div>
      <button class="round-btn" data-act="say" data-id="${w.id}" aria-label="Nghe phát âm">🔊</button>
      <button class="btn ${correct ? 'mint' : 'coral'}" data-act="next" id="next-btn">Tiếp tục</button>`;
    const bar = $('.study-top .bar i');
    if (bar) bar.style.width = `${Math.round((sess.done / sess.total) * 100)}%`;
    // Sau khi trả lời luôn đọc lại để nhớ âm (trừ khi vừa nghe ở đề bài)
    if (st.type !== 'mc-en-vi' || !correct) setTimeout(() => say(w), 350);
    $('#next-btn').focus({ preventScroll: true });
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function nextStep() {
    Speech.stop();
    sess.i++;
    renderStep();
  }

  function finishSession() {
    const s = sess;
    if (s.mode === 'learn') {
      s.words.forEach((w) => schedule(w.id, 1, s.missed.has(w.id)));
    }
    const bonus = s.mode === 'learn' ? s.words.length * 5 : 0;
    const gained = s.xp + bonus;
    S.xp += gained;
    touchStreak();
    S.days[dayKey()] = (S.days[dayKey()] || 0) + 1;
    save();

    const acc = s.firstTotal ? Math.round((s.firstOk / s.firstTotal) * 100) : 100;
    const left = s.deck ? s.deck.words.filter((w) => !levelOf(w.id)).length : 0;
    const dueLeft = dueWords().length;
    const headline =
      s.mode === 'learn' ? `Bạn vừa gieo ${s.words.length} từ mới!` : s.mode === 'review' ? 'Vườn đã được tưới mát!' : 'Luyện tập xong rồi!';
    let more = '';
    if (s.mode === 'learn' && left) more = `<button class="btn mint big" data-act="learn" data-deck="${s.deck.id}">🌱 Học tiếp ${Math.min(left, S.settings.batch)} từ</button>`;
    else if (s.mode === 'review' && dueLeft) more = `<button class="btn sky big" data-act="review">💧 Ôn tiếp ${dueLeft} từ</button>`;
    else if (s.mode === 'practice') more = `<button class="btn sun big" data-act="practice" data-deck="${s.deck.id}">🎯 Luyện thêm lượt nữa</button>`;

    const missed = [...s.missed].map((id) => BY_ID.get(id));
    app.innerHTML = `<div class="study done-screen">
      <div class="done-mascot">${mascot('cheer')}</div>
      <h1>${headline}</h1>
      <div class="done-stats">
        <div><b>${acc}%</b><span>Chính xác</span></div>
        <div><b>+${gained}</b><span>Điểm ⭐</span></div>
        <div><b>${streakNow()}</b><span>Ngày liên tiếp 🔥</span></div>
      </div>
      ${
        missed.length
          ? `<div class="missed"><h2>Những từ nên xem lại</h2><ol class="word-list">${missed.map(wordRow).join('')}</ol>
             ${s.mode !== 'practice' ? '<p class="hint">Các từ này sẽ sớm quay lại trong phần 💧 Tưới cây.</p>' : ''}</div>`
          : '<p class="hint">Không sai câu nào luôn! 🏆</p>'
      }
      <div class="done-actions">
        ${more}
        <a class="btn ghost big" href="${s.back}">${s.back === '#/' ? 'Về trang chủ' : 'Về buổi học'}</a>
      </div>
    </div>`;
    sess = null;
    Sound.sfx('win');
    confetti();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Cài đặt                                                             */
  /* ------------------------------------------------------------------ */
  /** Tên giọng gọn gàng: "Microsoft Sonia Online (Natural) - English (United Kingdom)" → "Sonia ✨". */
  function voiceLabel(v) {
    const q = Speech.quality(v);
    const name = v.name
      .replace(/^Microsoft\s+/i, '')
      .replace(/\s+-\s+English.*$/i, '')
      .replace(/\s*Online\s*\(Natural\)/i, '')
      .replace(/\s*\((Enhanced|Premium)\)/i, '')
      .trim();
    return `${name}${q === 'good' ? ' ✨' : q === 'robot' ? ' (giọng máy)' : ''}`;
  }

  function voiceOptions(accent, current) {
    const all = Speech.list(accent);
    const hasNice = all.some((v) => Speech.quality(v) !== 'robot');
    // Máy có giọng tốt thì ẩn các giọng máy đời cũ (vẫn giữ giọng người dùng đã tự chọn trước đó).
    const list = hasNice ? all.filter((v) => Speech.quality(v) !== 'robot' || v.name === current) : all;
    const auto = Speech.auto(accent);
    return (
      `<option value="">Tự động${auto ? `: ${esc(voiceLabel(auto))}` : ''}</option>` +
      list.map((v) => `<option value="${esc(v.name)}" ${v.name === current ? 'selected' : ''}>${esc(voiceLabel(v))}</option>`).join('')
    );
  }

  /** Cảnh báo khi trình duyệt chỉ có giọng máy đời cũ cho tiếng Anh. */
  function voiceWarning() {
    if (!Speech.supported) return '<p class="warn">Trình duyệt này không hỗ trợ giọng đọc. Hãy dùng Edge, Chrome hoặc Safari.</p>';
    if (!Speech.hasVoices()) return '';
    const robotOnly = ['us', 'uk'].filter((a) => Speech.quality(Speech.auto(a)) === 'robot');
    if (!robotOnly.length) return '';
    return `<p class="warn">Trình duyệt này chỉ có giọng máy đời cũ cho ${
      robotOnly.length === 2 ? 'tiếng Anh' : robotOnly[0] === 'us' ? 'giọng Anh-Mỹ' : 'giọng Anh-Anh'
    }, nghe sẽ hơi "robot". Mở trang bằng <b>Microsoft Edge</b> trên máy tính để có giọng đọc tự nhiên ✨.</p>`;
  }

  function openSettings() {
    const st = S.settings;
    openModal(
      `<div class="settings">
        <div class="modal-head"><h2>⚙️ Cài đặt</h2><button class="icon-btn" data-act="modal-close" aria-label="Đóng">✕</button></div>

        <h3>🔊 Phát âm</h3>
        <label class="field"><span>Giọng đọc</span>
          <select data-set="accent">
            <option value="auto" ${st.accent === 'auto' ? 'selected' : ''}>Theo phiên âm của từng buổi (nên dùng)</option>
            <option value="us" ${st.accent === 'us' ? 'selected' : ''}>Luôn dùng giọng Anh-Mỹ</option>
            <option value="uk" ${st.accent === 'uk' ? 'selected' : ''}>Luôn dùng giọng Anh-Anh</option>
          </select>
        </label>
        <label class="field"><span>Giọng Anh-Mỹ</span><select data-set="voiceUs">${voiceOptions('us', st.voiceUs)}</select></label>
        <label class="field"><span>Giọng Anh-Anh</span><select data-set="voiceUk">${voiceOptions('uk', st.voiceUk)}</select></label>
        <label class="field"><span>Tốc độ đọc <b id="rate-out">${st.rate.toFixed(2)}×</b></span>
          <input type="range" min="0.6" max="1.1" step="0.05" value="${st.rate}" data-set="rate"></label>
        <div class="row-btns">
          <button class="btn ghost small" data-act="test-voice" data-accent="us">▶ Nghe thử Anh-Mỹ</button>
          <button class="btn ghost small" data-act="test-voice" data-accent="uk">▶ Nghe thử Anh-Anh</button>
        </div>
        <label class="field check"><input type="checkbox" data-set="autoSpeak" ${st.autoSpeak ? 'checked' : ''}><span>Tự đọc khi hiện từ mới</span></label>
        ${voiceWarning()}

        <h3>🎵 Âm thanh</h3>
        <label class="field check"><input type="checkbox" data-set="music" ${st.music ? 'checked' : ''}><span>Nhạc nền vui vẻ</span></label>
        <label class="field"><span>Âm lượng nhạc</span>
          <input type="range" min="0.1" max="1" step="0.05" value="${st.musicVol}" data-set="musicVol"></label>
        <label class="field check"><input type="checkbox" data-set="sfx" ${st.sfx ? 'checked' : ''}><span>Tiếng đúng / sai</span></label>

        <h3>🌱 Học tập</h3>
        <label class="field"><span>Số từ mới mỗi lượt</span>
          <select data-set="batch">${[5, 10, 15, 20].map((n) => `<option value="${n}" ${st.batch === n ? 'selected' : ''}>${n} từ</option>`).join('')}</select>
        </label>

        <h3>🧹 Dữ liệu</h3>
        <button class="btn coral small" data-act="reset">Xoá toàn bộ tiến độ</button>
      </div>`
    );
  }

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    const st = S.settings;
    if (el.type === 'checkbox') st[key] = el.checked;
    else if (el.type === 'range' || key === 'batch') st[key] = Number(el.value);
    else st[key] = el.value;
    if (key === 'rate') $('#rate-out').textContent = `${st.rate.toFixed(2)}×`;
    if (key === 'music') {
      Sound.setMusic(st.music);
      document.querySelectorAll('[data-act="toggle-music"]').forEach((b) => {
        b.textContent = st.music ? '🎵' : '🔇';
        b.classList.toggle('on', st.music);
      });
    }
    applyAudioSettings();
    save();
  });

  /* ------------------------------------------------------------------ */
  /* Hướng dẫn cho người mới                                             */
  /* ------------------------------------------------------------------ */
  // Mỗi bước: màn hình cần mở (view), phần tử được làm sáng (sel), tiêu đề và lời dẫn.
  const TOUR = [
    {
      view: 'home',
      sel: null,
      title: 'Chào mừng đến Vườn từ của cô Vân Anh! 🌱',
      text: 'Mình là <b>Mầm</b>. Mình sẽ dẫn bạn đi một vòng quanh khu vườn từ vựng, chỉ mất khoảng 1 phút thôi.',
    },
    {
      view: 'home',
      sel: '.hero-cta',
      title: 'Bắt đầu nhanh',
      text: 'Nút xanh lá đưa bạn vào ngay bài đang học dở. Khi có từ đến hạn ôn, nút <b>💧 Tưới cây</b> sẽ hiện ở đây.',
    },
    {
      view: 'home',
      sel: '.pots',
      title: 'Khu vườn của bạn',
      text: 'Mỗi từ là một cái cây. Ôn đúng thì cây lớn dần: 🌱 → 🌿 → 🪴 → 🌷 → 🌻. Trả lời sai thì cây lùi một cấp và sớm được hỏi lại.',
    },
    {
      view: 'home',
      sel: '.lesson-card',
      title: 'Các buổi học',
      text: 'Từ vựng chia theo từng buổi giống trên lớp. Chạm vào một buổi để xem danh sách từ; thanh xanh cho biết bạn đã học được bao nhiêu.',
    },
    {
      view: 'lesson',
      sel: '.word-row',
      title: 'Nghe phát âm',
      text: 'Chạm vào bất kỳ từ nào để nghe đọc. Dòng màu tím là <b>phiên âm IPA</b>, biểu tượng bên phải là cấp độ cây của từ đó.',
    },
    {
      view: 'lesson',
      sel: '[data-act="toggle-vi"]',
      title: 'Tự kiểm tra',
      text: 'Bấm <b>🙈 Ẩn nghĩa</b> để che phần tiếng Việt, rồi thử nhớ lại nghĩa của từng từ.',
    },
    {
      view: 'lesson',
      sel: '.deck-actions',
      title: 'Ba cách học',
      text: () =>
        `<b>🌱 Học từ mới</b>: mỗi lượt ${S.settings.batch} từ, có thẻ và câu hỏi.<br><b>🎯 Luyện tập</b>: làm bài nhanh, không ảnh hưởng lịch ôn.<br><b>▶ Nghe lần lượt</b>: nghe cả danh sách.`,
    },
    {
      view: 'card',
      sel: '.flash',
      title: 'Thẻ từ',
      text: 'Mỗi từ mới hiện trên một tấm thẻ kèm phiên âm và được đọc to. <b>Chạm vào thẻ</b> để lật xem nghĩa.',
    },
    {
      view: 'card',
      sel: '.audio-btns',
      title: 'Nghe lại và đọc theo',
      text: '<b>🔊</b> để nghe lại, <b>🐢</b> để nghe chậm từng âm. Hãy đọc theo thành tiếng nhé!',
    },
    {
      view: 'q',
      sel: '.opts',
      title: 'Câu hỏi',
      text: 'Sau vài thẻ sẽ có câu hỏi: chọn nghĩa, nghe rồi chọn, hoặc gõ lại từ. Trả lời sai không sao cả, từ đó sẽ được hỏi lại.',
    },
    {
      view: 'home',
      sel: '.top-actions',
      title: 'Thanh công cụ',
      text: '<b>🔥</b> số ngày học liên tiếp, <b>⭐</b> điểm của bạn.<br><b>🎵</b> bật / tắt nhạc nền.<br><b>⚙️</b> chọn giọng Anh-Anh hay Anh-Mỹ, tốc độ đọc và số từ mỗi lượt.',
    },
    {
      view: 'home',
      sel: '#cal',
      title: 'Lịch học và nhóm lớp',
      text: 'Chạm vào tờ lịch ở góc phải để xem ngày tháng. Ngày có lịch học được <b>khoanh tròn</b>; bạn đổi được lịch học hằng tuần và đánh dấu ⭐ ngày quan trọng. Nút xanh phía trên mở <b>nhóm Facebook của lớp</b>.',
    },
    {
      view: 'home',
      sel: '.hero [data-act="tour"]',
      title: 'Sẵn sàng rồi!',
      text: 'Muốn xem lại hướng dẫn, bấm nút này bất cứ lúc nào. Mỗi ngày học một chút, khu vườn sẽ nở đầy hoa 🌻',
    },
  ];

  let tour = null; // { i, view, busy }

  /** Chuyển màn hình trong lúc hướng dẫn và chờ màn hình mới dựng xong. */
  function tourNav(hash) {
    return new Promise((resolve) => {
      const done = () => setTimeout(resolve, 40);
      if ((location.hash || '#/') === hash) {
        route();
        done();
      } else {
        window.addEventListener('hashchange', done, { once: true });
        location.hash = hash;
      }
    });
  }

  /** Phiên học "xem thử": chỉ để minh hoạ, không lưu gì vào tiến độ. */
  function tourDemo(i) {
    const lesson = LESSONS[0];
    const deck = lesson.decks[0];
    const w = deck.words[0];
    sess = {
      mode: 'demo',
      title: `${lesson.label} · ${deck.name} (xem thử)`,
      back: '#/',
      deck,
      words: [w],
      steps: [
        { kind: 'card', w },
        { kind: 'q', type: 'mc-en-vi', w },
      ],
      i,
      done: i,
      total: 4,
      firstTotal: 0,
      firstOk: 0,
      xp: 0,
      missed: new Set(),
    };
    return tourNav('#/study');
  }

  const TOUR_VIEWS = {
    home: () => tourNav('#/'),
    lesson: () => tourNav(`#/lesson/${LESSONS[0].id}`),
    card: () => tourDemo(0),
    q: () => tourDemo(1),
  };

  function placeTour() {
    if (!tour) return;
    const step = TOUR[tour.i];
    const hole = $('.tour-hole');
    const tip = $('.tour-tip');
    const el = step.sel ? document.querySelector(step.sel) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const px = (n) => `${Math.round(n)}px`;
    if (!el) {
      hole.classList.add('none');
      Object.assign(hole.style, { left: px(vw / 2), top: px(vh / 2), width: '0px', height: '0px' });
      Object.assign(tip.style, { left: px((vw - tw) / 2), top: px(Math.max(12, (vh - th) / 2)) });
      return;
    }
    hole.classList.remove('none');
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(hole.style, {
      left: px(r.left - pad),
      top: px(r.top - pad),
      width: px(r.width + pad * 2),
      height: px(r.height + pad * 2),
    });
    // Đặt lời dẫn ở phía còn nhiều chỗ trống hơn (dưới hoặc trên phần được làm sáng).
    const below = vh - r.bottom;
    const above = r.top;
    let top = below >= th + 30 || below >= above ? r.bottom + 20 : r.top - th - 20;
    top = Math.min(Math.max(12, top), vh - th - 12);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), vw - tw - 12);
    Object.assign(tip.style, { left: px(left), top: px(top) });
  }

  async function showTourStep(i) {
    if (!tour || tour.busy || i < 0 || i >= TOUR.length) return;
    const step = TOUR[i];
    if (tour.view !== step.view) {
      tour.busy = true;
      await TOUR_VIEWS[step.view]();
      if (!tour) return;
      tour.busy = false;
      tour.view = step.view;
    }
    tour.i = i;
    const last = i === TOUR.length - 1;
    const text = typeof step.text === 'function' ? step.text() : step.text;
    $('.tour-tip').innerHTML = `
      <span class="bar" aria-hidden="true"><i style="width:${Math.round(((i + 1) / TOUR.length) * 100)}%"></i></span>
      <div class="tour-head">${mascot(last ? 'cheer' : 'happy', 'mascot-sm')}<h3>${step.title}</h3></div>
      <p>${text}</p>
      <div class="tour-foot">
        <span class="tour-count">${i + 1}/${TOUR.length}</span>
        ${last ? '' : '<button class="btn ghost small" data-act="tour-end">Bỏ qua</button>'}
        ${i > 0 ? '<button class="btn ghost small" data-act="tour-prev" aria-label="Bước trước">←</button>' : ''}
        <button class="btn mint small" id="tour-next" data-act="${last ? 'tour-end' : 'tour-next'}">${last ? 'Bắt đầu học 🌱' : 'Tiếp →'}</button>
      </div>`;
    const el = step.sel ? document.querySelector(step.sel) : null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    placeTour();
    $('#tour-next').focus({ preventScroll: true });
  }

  function startTour() {
    if (tour) return;
    closeModal();
    closeCal();
    stopPlaylist();
    Speech.stop();
    if (!S.tourSeen) {
      S.tourSeen = true;
      save();
    }
    const box = document.createElement('div');
    box.id = 'tour';
    box.innerHTML =
      '<div class="tour-block"></div><div class="tour-hole none"></div><div class="tour-tip" role="dialog" aria-label="Hướng dẫn sử dụng"></div>';
    document.body.appendChild(box);
    tour = { i: 0, view: null, busy: false };
    showTourStep(0);
  }

  function removeTour() {
    const box = $('#tour');
    if (box) box.remove();
    tour = null;
    if (sess && sess.mode === 'demo') sess = null;
    Speech.stop();
  }

  function endTour() {
    removeTour();
    go('#/');
  }

  window.addEventListener('resize', placeTour);
  window.addEventListener('scroll', placeTour, { passive: true });

  /* ------------------------------------------------------------------ */
  /* Lịch nổi ở góc phải                                                 */
  /* ------------------------------------------------------------------ */
  // Nhóm Facebook của lớp: nút tròn ngay phía trên tờ lịch dẫn tới đây.
  const CLASS_GROUP_URL = 'https://www.facebook.com/groups/1618454816289788/';

  const DOW_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // tuần bắt đầu từ Thứ Hai

  let calOpen = false;
  let calView = null; // { y, m } tháng đang xem
  let calSel = null; // 'YYYY-MM-DD' ngày đang chọn

  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fromKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const isClassDay = (d) => S.cal.classDays.includes(d.getDay());
  const fullDate = (d) => `${DOW_NAMES[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  const daysFromToday = (d) => Math.round((midnight(d) - midnight(new Date())) / 864e5);
  function relDay(d) {
    const n = daysFromToday(d);
    if (n === 0) return 'Hôm nay';
    if (n === 1) return 'Ngày mai';
    if (n === -1) return 'Hôm qua';
    return n > 0 ? `Còn ${n} ngày nữa` : `${-n} ngày trước`;
  }
  function nextClass() {
    const t = midnight(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
      if (isClassDay(d)) return d;
    }
    return null;
  }

  function mountCal() {
    const box = document.createElement('div');
    box.id = 'cal';
    box.innerHTML = `<div class="cal-pop" role="dialog" aria-label="Lịch" hidden></div>
      <a class="fb-fab" href="${CLASS_GROUP_URL}" target="_blank" rel="noopener noreferrer"
        aria-label="Mở nhóm lớp trên Facebook (tab mới)" title="Nhóm lớp trên Facebook">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.6 21.5v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.6V4.1c-.3 0-1.3-.1-2.4-.1-2.3 0-3.9 1.4-3.9 4v2.4H7.8v3.1h2.7v8z"/></svg>
      </a>
      <button class="cal-fab" data-act="cal-toggle" aria-haspopup="dialog"></button>`;
    document.body.appendChild(box);
  }

  function renderCal() {
    const now = new Date();
    const todayK = dayKey(now);
    const fab = $('.cal-fab');
    fab.innerHTML = `<span class="cal-fab-top">Tháng ${now.getMonth() + 1}</span>
      <span class="cal-fab-day ${isClassDay(now) ? 'ring' : ''}">${now.getDate()}</span>
      <span class="cal-fab-dow">${DOW_NAMES[now.getDay()]}</span>`;
    fab.setAttribute('aria-expanded', calOpen);
    fab.setAttribute('aria-label', `${calOpen ? 'Đóng' : 'Mở'} lịch. Hôm nay là ${fullDate(now)}`);
    const pop = $('.cal-pop');
    pop.hidden = !calOpen;
    if (!calOpen) return;

    const { y, m } = calView;
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const inMonth = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((offset + inMonth) / 7);
    let cells = '';
    for (let i = 0; i < rows * 7; i++) {
      const d = new Date(y, m, 1 - offset + i);
      const k = dayKey(d);
      const marked = S.cal.marks[k] !== undefined;
      const cls = ['cal-day'];
      if (d.getMonth() !== m) cls.push('out');
      if (k === todayK) cls.push('today');
      if (isClassDay(d)) cls.push('class');
      if (marked) cls.push('mark');
      if (k === calSel) cls.push('sel');
      const label = `${fullDate(d)}${isClassDay(d) ? ', có lịch học' : ''}${marked ? ', ngày quan trọng' : ''}`;
      cells += `<button class="${cls.join(' ')}" data-act="cal-day" data-date="${k}" aria-label="${esc(label)}" aria-pressed="${k === calSel}">
        <span class="cal-num">${d.getDate()}</span>${marked ? '<i class="cal-star">⭐</i>' : ''}${S.days[k] ? '<i class="cal-sprout">🌱</i>' : ''}
      </button>`;
    }

    const sel = fromKey(calSel);
    const note = S.cal.marks[calSel];
    const tags = [];
    if (isClassDay(sel)) tags.push('<span class="cal-tag class">📚 Có lịch học</span>');
    if (note !== undefined) tags.push(`<span class="cal-tag mark">⭐ ${esc(note || 'Ngày quan trọng')}</span>`);
    if (S.days[calSel]) tags.push(`<span class="cal-tag done">🌱 Đã học ${S.days[calSel]} lượt</span>`);
    if (!tags.length) tags.push('<span class="cal-tag">Không có lịch gì</span>');

    const nc = nextClass();
    const ncText = !nc
      ? 'Chưa chọn ngày học nào trong tuần'
      : daysFromToday(nc) === 0
        ? 'Hôm nay có buổi học! 📚'
        : `Buổi học tới: ${DOW_NAMES[nc.getDay()]} ${nc.getDate()}/${nc.getMonth() + 1} · ${
            daysFromToday(nc) === 1 ? 'ngày mai' : `còn ${daysFromToday(nc)} ngày`
          }`;

    pop.innerHTML = `
      <div class="cal-head">
        <button class="icon-btn" data-act="cal-prev" aria-label="Tháng trước">‹</button>
        <button class="cal-title" data-act="cal-today" title="Về hôm nay">Tháng ${m + 1} <small>${y}</small></button>
        <button class="icon-btn" data-act="cal-next" aria-label="Tháng sau">›</button>
      </div>
      <p class="cal-next">${ncText}</p>
      <div class="cal-grid" role="grid">
        ${WEEK.map((w) => `<span class="cal-dow ${S.cal.classDays.includes(w) ? 'class' : ''}">${DOW_SHORT[w]}</span>`).join('')}
        ${cells}
      </div>
      <div class="cal-detail">
        <b>${fullDate(sel)}</b>
        <small>${relDay(sel)}</small>
        <div class="cal-tags">${tags.join('')}</div>
        ${
          note !== undefined
            ? '<button class="btn ghost small" data-act="cal-unmark">Bỏ đánh dấu ⭐</button>'
            : `<form class="cal-mark" data-form="cal-mark" autocomplete="off">
                <input id="cal-note" type="text" maxlength="40" placeholder="Ghi chú, vd: Thi thử" aria-label="Ghi chú cho ngày quan trọng">
                <button type="submit" class="btn sun small">⭐ Đánh dấu</button>
              </form>`
        }
      </div>
      <div class="cal-week">
        <span>Lịch học hằng tuần</span>
        <div class="cal-chips">
          ${WEEK.map(
            (w) =>
              `<button class="cal-chip ${S.cal.classDays.includes(w) ? 'on' : ''}" data-act="cal-dow" data-dow="${w}" aria-pressed="${S.cal.classDays.includes(
                w
              )}" aria-label="${DOW_NAMES[w]}">${DOW_SHORT[w]}</button>`
          ).join('')}
        </div>
      </div>
      <p class="cal-legend"><i class="lg-ring"></i> lịch học <span>⭐ ngày quan trọng</span> <span>🌱 ngày đã học</span></p>`;
  }

  function openCal() {
    const now = new Date();
    calOpen = true;
    calView = { y: now.getFullYear(), m: now.getMonth() };
    calSel = dayKey(now);
    renderCal();
  }
  function closeCal() {
    if (!calOpen) return;
    calOpen = false;
    renderCal();
  }
  function shiftMonth(delta) {
    const d = new Date(calView.y, calView.m + delta, 1);
    calView = { y: d.getFullYear(), m: d.getMonth() };
    renderCal();
  }

  /* ------------------------------------------------------------------ */
  /* Sự kiện                                                             */
  /* ------------------------------------------------------------------ */
  const deckById = (id) => LESSONS.flatMap((l) => l.decks).find((d) => d.id === id);

  const ACTIONS = {
    say: (el) => {
      if (playlist) stopPlaylist();
      say(BY_ID.get(el.dataset.id));
    },
    'say-slow': (el) => say(BY_ID.get(el.dataset.id), true),
    'toggle-music': () => {
      S.settings.music = !S.settings.music;
      Sound.setMusic(S.settings.music);
      save();
      document.querySelectorAll('[data-act="toggle-music"]').forEach((b) => {
        b.textContent = S.settings.music ? '🎵' : '🔇';
        b.classList.toggle('on', S.settings.music);
        b.setAttribute('aria-pressed', S.settings.music);
      });
    },
    settings: openSettings,
    'modal-close': closeModal,
    'cal-toggle': () => (calOpen ? closeCal() : openCal()),
    'cal-prev': () => shiftMonth(-1),
    'cal-next': () => shiftMonth(1),
    'cal-today': () => openCal(),
    'cal-day': (el) => {
      calSel = el.dataset.date;
      const d = fromKey(calSel);
      calView = { y: d.getFullYear(), m: d.getMonth() }; // bấm ngày của tháng kề thì chuyển sang tháng đó
      renderCal();
    },
    'cal-dow': (el) => {
      const w = Number(el.dataset.dow);
      const set = new Set(S.cal.classDays);
      if (set.has(w)) set.delete(w);
      else set.add(w);
      S.cal.classDays = [...set].sort();
      save();
      renderCal();
    },
    'cal-unmark': () => {
      delete S.cal.marks[calSel];
      save();
      renderCal();
    },
    tour: startTour,
    'tour-next': () => tour && showTourStep(tour.i + 1),
    'tour-prev': () => tour && showTourStep(tour.i - 1),
    'tour-end': endTour,
    'test-voice': (el) => {
      const accent = el.dataset.accent;
      if (!Speech.hasVoices()) return toast('Thiết bị chưa có giọng đọc tiếng Anh.');
      Speech.speak('Hello! Let’s grow your vocabulary garden today.', { accent });
    },
    reset: () =>
      confirmBox({
        title: 'Xoá toàn bộ tiến độ?',
        text: 'Mọi cây trong vườn, điểm và chuỗi ngày học sẽ trở về 0. Không thể hoàn tác.',
        yes: 'Xoá hết',
        mood: 'sad',
        onYes: () => {
          S.words = {};
          S.xp = 0;
          S.streak = { last: '', count: 0 };
          S.days = {};
          save();
          toast('Đã xoá tiến độ. Bắt đầu lại nào! 🌱');
          route();
        },
      }),
    learn: (el) => startLearn(deckById(el.dataset.deck)),
    practice: (el) => startPractice(deckById(el.dataset.deck)),
    review: startReview,
    playlist: (el) => {
      const deck = deckById(el.dataset.deck);
      if (playlist && playlist.deckId === deck.id) return stopPlaylist();
      startPlaylist(deck, el);
      if (playlist) playlist.deckId = deck.id;
    },
    'toggle-vi': (el) => {
      hideMeaning = !hideMeaning;
      $('.lesson-page').classList.toggle('hide-vi', hideMeaning);
      el.textContent = hideMeaning ? '🙉 Hiện nghĩa' : '🙈 Ẩn nghĩa';
      el.setAttribute('aria-pressed', hideMeaning);
    },
    flip: () => {
      const st = sess && sess.steps[sess.i];
      if (!st || st.kind !== 'card') return;
      st.flipped = !st.flipped;
      $('.flash').classList.toggle('flipped', st.flipped);
      Sound.sfx('flip');
    },
    'card-next': () => {
      const st = sess.steps[sess.i];
      if (!st.counted) {
        st.counted = true;
        sess.done++;
        sess.xp += 2;
      }
      Sound.sfx('tap');
      nextStep();
    },
    'card-prev': () => {
      if (sess.i > 0 && sess.steps[sess.i - 1].kind === 'card') {
        Speech.stop();
        sess.i--;
        sess.steps[sess.i].spoken = false;
        renderStep();
      }
    },
    choose: (el) => answer(el.dataset.id === sess.steps[sess.i].w.id, el.dataset.id),
    hint: () => {
      const st = sess.steps[sess.i];
      st.hints = (st.hints || 0) + 1;
      const w = st.w;
      const letters = w.w.replace(/\s*\([^)]*\)/g, '');
      const shown = Math.min(st.hints - 1, letters.length - 1);
      const mask = letters
        .split('')
        .map((ch, i) => (i < shown || /[\s/-]/.test(ch) ? ch : '•'))
        .join('');
      $('#type-hint').innerHTML = `${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span> · ` : ''}<span class="mask">${esc(mask)}</span>`;
      $('#type-input').focus();
    },
    next: nextStep,
    quit: () => {
      if (!sess || sess.i === 0) return leaveSession();
      confirmBox({
        title: 'Dừng giữa chừng?',
        text: sess.mode === 'learn' ? 'Các từ mới trong lượt này sẽ chưa được gieo vào vườn.' : 'Bạn có thể quay lại ôn tiếp bất cứ lúc nào.',
        yes: 'Thoát',
        no: 'Học tiếp',
        mood: 'sad',
        onYes: leaveSession,
      });
    },
  };

  function leaveSession() {
    const back = sess ? sess.back : '#/';
    sess = null;
    Speech.stop();
    go(back);
  }

  document.addEventListener('click', (e) => {
    // Phải xét trước khi chạy hành động: lịch vẽ lại sẽ gỡ phần tử vừa bấm khỏi trang.
    const inCal = !!e.target.closest('#cal');
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled) {
      const fn = ACTIONS[el.dataset.act];
      if (fn) fn(el, e);
    }
    if (calOpen && !inCal) closeCal(); // bấm ra ngoài thì đóng lịch
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'cal-mark') {
      e.preventDefault();
      S.cal.marks[calSel] = $('#cal-note').value.trim();
      save();
      renderCal();
      return;
    }
    if (e.target.dataset.form !== 'type') return;
    e.preventDefault();
    const st = sess && sess.steps[sess.i];
    if (!st || st.answered) return;
    const val = norm($('#type-input').value);
    if (!val) return $('#type-input').focus();
    answer(accepted(st.w).includes(val));
  });

  document.addEventListener('keydown', (e) => {
    if (tour) {
      // Trong lúc hướng dẫn, bàn phím chỉ điều khiển hướng dẫn.
      const onButton = e.target.closest('button');
      if (e.key === 'Escape') endTour();
      else if (e.repeat) return;
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) ACTIONS[tour.i === TOUR.length - 1 ? 'tour-end' : 'tour-next']();
      else if (e.key === 'ArrowLeft') ACTIONS['tour-prev']();
      else if (e.key === ' ' && !onButton) e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && $('#modal-root').innerHTML) return closeModal();
    if (e.key === 'Escape' && calOpen) {
      closeCal();
      return $('.cal-fab').focus();
    }
    if (!sess || $('#modal-root').innerHTML || e.repeat) return;
    const st = sess.steps[sess.i];
    if (!st) return;
    const typing = e.target.tagName === 'INPUT';
    // Enter/Space trên một nút đã tự kích hoạt nút đó — không xử lý lần hai.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button, a, select')) return;
    if (st.kind === 'card') {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        ACTIONS.flip();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        ACTIONS['card-next']();
      } else if (e.key === 'ArrowLeft') ACTIONS['card-prev']();
      return;
    }
    if (st.answered) {
      if (e.key === 'Enter' || (e.key === ' ' && !typing)) {
        e.preventDefault();
        nextStep();
      }
      return;
    }
    if (!typing && /^[1-4]$/.test(e.key)) {
      const btn = document.querySelectorAll('.opt')[Number(e.key) - 1];
      if (btn) btn.click();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Điều hướng                                                          */
  /* ------------------------------------------------------------------ */
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function route() {
    const hash = location.hash || '#/';
    // Người dùng tự rời trang (nút Back…) giữa lúc hướng dẫn → kết thúc hướng dẫn.
    if (tour && !tour.busy) removeTour();
    closeModal();
    stopPlaylist();
    // Trong phiên học thì ẩn lịch để không che nút bấm.
    document.body.classList.toggle('studying', hash === '#/study');
    calOpen = false;
    renderCal();
    if (hash === '#/study') {
      if (sess) return renderStep();
      return go('#/');
    }
    if (sess) {
      // rời phiên học bằng nút Back của trình duyệt
      sess = null;
      Speech.stop();
    }
    const m = /^#\/lesson\/([\w-]+)/.exec(hash);
    if (m) renderLesson(m[1]);
    else renderHome();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  Speech.onVoices(() => {
    // danh sách giọng thường về muộn; cập nhật lại hộp cài đặt nếu đang mở
    if ($('.settings')) openSettings();
  });
  mountCal();
  route();
})();
