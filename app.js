/* ============================================================
   ТАМИК — SOUND EDITION / интерактивная логика
   ============================================================ */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const card = $('card');
  const primaryBtn = $('primaryBtn');
  const primaryLabel = $('primaryLabel');
  const primarySymbol = $('primarySymbol');
  const navStatus = $('navStatus');
  const stageCaption = $('stageCaption');
  const stagePlay = $('stagePlay');
  const stagePlayIcon = $('stagePlayIcon');
  const stageMode = $('stageMode');
  const playerLive = $('playerLive');
  const audio = $('audio');
  const timeEl = $('time');
  const durationEl = $('duration');
  const progressFill = $('progressFill');
  const progress = $('progress');
  const stopBtn = $('stopBtn');
  const playBtn = $('playBtn');
  const playIcon = $('playIcon');
  const playLabel = $('playLabel');
  const muteBtn = $('muteBtn');
  const muteIcon = $('muteIcon');
  const visualizer = $('visualizer');
  const notesHost = $('notes');
  const ringsHost = $('rings');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Состояние ---------- */
  let playing = false;
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let holdTimer = null;

  /* ---------- Вспомогательное ---------- */
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.3v13.4L19 12z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>',
    volume: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.6a5 5 0 0 1 0 6.8"/><path d="M18.4 5.7a9 9 0 0 1 0 12.6"/></svg>',
    muted: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>'
  };

  function updateProgress() {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    const value = clamp(pct, 0, 100);
    progressFill.style.width = `${value}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(value)));
    timeEl.textContent = formatTime(audio.currentTime);
  }

  function updateMute() {
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.setAttribute('aria-label', audio.muted ? 'Включить звук' : 'Выключить звук');
    muteIcon.innerHTML = audio.muted ? ICONS.muted : ICONS.volume;
  }

  /* ---------- Web Audio ---------- */
  function initAudioGraph() {
    if (audioCtx) return;
    // На file:// createMediaElementSource уходит в CORS-тишину —
    // оставляем обычный <audio> и процедурную визуализацию.
    if (location.protocol === 'file:') return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      // Если Web Audio недоступен — звук всё равно играет через <audio>,
      // а визуализация переключится на процедурный режим.
      analyser = null;
    }
  }

  /* ---------- Визуализатор (трансforms вместо layout) ---------- */
  const BAR_COUNT = 36;
  const bars = [];
  const barHeights = new Array(BAR_COUNT).fill(0.08);

  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('span');
    bar.className = 'bar';
    visualizer.appendChild(bar);
    bars.push(bar);
  }

  function updateVisualizer(t) {
    if (playing && analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor(Math.pow(i / BAR_COUNT, 1.25) * freqData.length * 0.75);
        const value = freqData[idx] / 255;
        const target = 0.04 + value * 0.96;
        barHeights[i] = lerp(barHeights[i], target, 0.38);
      }
    } else if (playing) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const wave = Math.sin(t / 160 + i * 0.45) * 0.5 + 0.5;
        const jitter = Math.sin(t / 70 + i * 1.7) * 0.18;
        const target = 0.12 + (wave + jitter) * 0.72;
        barHeights[i] = lerp(barHeights[i], target, 0.22);
      }
    } else {
      for (let i = 0; i < BAR_COUNT; i++) {
        const idle = 0.08 + 0.05 * Math.sin(t / 700 + i * 0.32) + 0.03 * Math.sin(t / 1200 + i * 0.11);
        barHeights[i] = lerp(barHeights[i], idle, 0.12);
      }
    }
    for (let i = 0; i < BAR_COUNT; i++) {
      bars[i].style.setProperty('--h', clamp(barHeights[i], 0.03, 1).toFixed(3));
    }
  }

  /* ---------- 3D-наклон карточки ---------- */
  let targetRX = 0, targetRY = 0, currentRX = 0, currentRY = 0;
  let tiltSettled = true;

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const px = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      const py = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
      targetRY = px * 14;
      targetRX = -py * 11;
      tiltSettled = false;
    }, { passive: true });
    stage.addEventListener('pointerleave', () => {
      targetRX = 0;
      targetRY = 0;
      tiltSettled = false;
    });
  }

  /* ---------- Анимации-взрывы ---------- */
  const NOTE_CHARS = ['♪', '♫', '♩', '♬', '𝄞'];
  const NOTE_COLORS = ['#ffb35c', '#ff6a45', '#ffffff', '#8b6cff', '#48d7ff'];

  function spawnNotes() {
    if (reduceMotion) return;
    const count = 10;
    for (let i = 0; i < count; i++) {
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = NOTE_CHARS[i % NOTE_CHARS.length];
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const distance = 150 + Math.random() * 190;
      note.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      note.style.setProperty('--y', `${Math.sin(angle) * distance - 120}px`);
      note.style.setProperty('--rot', `${Math.round(Math.random() * 80 - 40)}deg`);
      note.style.setProperty('--size', `${18 + Math.round(Math.random() * 24)}px`);
      note.style.setProperty('--dur', `${1.4 + Math.random() * 1.1}s`);
      note.style.setProperty('--delay', `${Math.random() * 0.35}s`);
      note.style.setProperty('--note-color', NOTE_COLORS[i % NOTE_COLORS.length]);
      note.addEventListener('animationend', () => note.remove(), { once: true });
      notesHost.appendChild(note);
    }
  }

  function playBurst() {
    if (reduceMotion) return;
    ringsHost.classList.remove('burst');
    void ringsHost.offsetWidth;
    ringsHost.classList.add('burst');
    spawnNotes();
  }

  function ripple(button, event) {
    const host = button.querySelector('.btn-ripple');
    if (!host) return;
    const rect = button.getBoundingClientRect();
    const x = event && event.clientX ? event.clientX - rect.left : rect.width / 2;
    const y = event && event.clientY ? event.clientY - rect.top : rect.height / 2;
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.classList.remove('go');
    void host.offsetWidth;
    host.classList.add('go');
  }

  /* ---------- Переключение состояния ---------- */
  function updateUI() {
    document.body.classList.toggle('is-playing', playing);
    card.setAttribute('aria-pressed', String(playing));
    primaryBtn.setAttribute('aria-pressed', String(playing));
    primaryLabel.textContent = playing ? 'Выключить звук' : 'Включить звук';
    primarySymbol.textContent = playing ? '■' : '▶';
    navStatus.textContent = playing ? 'играет' : 'ожидание';
    stageCaption.textContent = playing ? 'Тамик в музыкальном режиме' : 'нажми, чтобы разбудить';
    stagePlayIcon.innerHTML = playing ? ICONS.stop : ICONS.play;
    stagePlay.setAttribute('aria-pressed', String(playing));
    stagePlay.setAttribute('aria-label', playing ? 'Остановить звук' : 'Включить звук');
    stageMode.textContent = playing ? 'LIVE' : 'IDLE';
    playerLive.lastChild.textContent = playing ? ' звук идёт' : ' звук выключен';
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? 'Остановить звук' : 'Включить звук');
    playIcon.innerHTML = playing ? ICONS.stop : ICONS.play;
    playLabel.textContent = playing ? 'Остановить' : 'Включить звук';
  }

  function activate(event) {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    initAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Позиция сохраняется, если пользователь сам перемотал трек.
    audio.pause();
    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        stageCaption.textContent = 'нажми ещё раз — браузер просит разрешения';
      });
    }

    playing = true;
    updateUI();
    playBurst();
    if (event && event.currentTarget === primaryBtn) ripple(primaryBtn, event);
  }

  function deactivate() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    audio.pause();
    audio.currentTime = 0;
    playing = false;
    updateUI();
    updateProgress();
  }

  function toggle(event) {
    if (playing) deactivate();
    else activate(event);
  }

  function replay() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    audio.currentTime = 0;
    updateProgress();
    if (playing) audio.play().catch(() => {});
    else activate();
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    updateMute();
  }

  function seekTo(clientX) {
    const rect = progress.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    audio.currentTime = ratio * audio.duration;
    updateProgress();
  }

  card.addEventListener('click', toggle);
  primaryBtn.addEventListener('click', toggle);
  stagePlay.addEventListener('click', toggle);
  playBtn.addEventListener('click', toggle);
  stopBtn.addEventListener('click', replay);
  muteBtn.addEventListener('click', toggleMute);

  // Перемотка: тап и перетаскивание пальцем/мышью.
  let seeking = false;
  progress.addEventListener('pointerdown', (event) => {
    seeking = true;
    progress.classList.add('is-dragging');
    if (progress.setPointerCapture) progress.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
  });
  progress.addEventListener('pointermove', (event) => {
    if (seeking) seekTo(event.clientX);
  });
  function endSeek(event) {
    if (!seeking) return;
    seeking = false;
    progress.classList.remove('is-dragging');
    if (progress.releasePointerCapture && progress.hasPointerCapture && progress.hasPointerCapture(event.pointerId)) {
      progress.releasePointerCapture(event.pointerId);
    }
  }
  progress.addEventListener('pointerup', endSeek);
  progress.addEventListener('pointercancel', endSeek);

  // Доступ с клавиатуры: стрелки — шаг 5%, Home/End — начало/конец.
  progress.addEventListener('keydown', (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const step = audio.duration * 0.05;
    if (event.key === 'Home') audio.currentTime = 0;
    else if (event.key === 'End') audio.currentTime = audio.duration;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') audio.currentTime = Math.min(audio.duration, audio.currentTime + step);
    else audio.currentTime = Math.max(0, audio.currentTime - step);
    updateProgress();
  });

  // Небольшая пауза после звука, чтобы переворот и ноты успели «дожить».
  audio.addEventListener('ended', () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { holdTimer = null; deactivate(); }, 1400);
  });
  audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
    updateProgress();
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('seeked', updateProgress);

  /* ---------- Появление блоков ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------- Главный цикл ---------- */
  let lastVisual = 0;
  function frame(t) {
    if (document.hidden) { requestAnimationFrame(frame); return; }

    // Наклон обновляем только пока он реально меняется.
    if (!reduceMotion && !tiltSettled) {
      currentRX = lerp(currentRX, targetRX, 0.12);
      currentRY = lerp(currentRY, targetRY, 0.12);
      if (Math.abs(currentRX - targetRX) < 0.06 && Math.abs(currentRY - targetRY) < 0.06) {
        currentRX = targetRX;
        currentRY = targetRY;
        tiltSettled = true;
      }
      card.style.setProperty('--rx', `${currentRX.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${currentRY.toFixed(2)}deg`);
    }

    // 30 кадров в секунду визуализатору достаточно — экономим CPU.
    if (t - lastVisual > 32) {
      lastVisual = t;
      updateVisualizer(t);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- Стартовое состояние ---------- */
  updateUI();
  updateProgress();
  updateMute();
})();
