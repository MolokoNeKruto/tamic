/* ============================================================
   ТАМИК — SOUND EDITION
   Тамик запускает плеер. Плеер управляет только звуком.
   ============================================================ */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const card = $('card');
  const cardFlip = $('cardFlip');
  const stagePlay = $('stagePlay');
  const stagePlayIcon = $('stagePlayIcon');
  const stageMode = $('stageMode');
  const navStatus = $('navStatus');
  const playerLive = $('playerLive');
  const audio = $('audio');
  const timeEl = $('time');
  const durationEl = $('duration');
  const progressFill = $('progressFill');
  const progress = $('progress');
  const muteBtn = $('muteBtn');
  const muteIcon = $('muteIcon');
  const stopBtn = $('stopBtn');
  const playBtn = $('playBtn');
  const playIcon = $('playIcon');
  const playLabel = $('playLabel');
  const soundMenuBtn = $('soundMenuBtn');
  const soundMenu = $('soundMenu');
  const soundMenuClose = $('soundMenuClose');
  const soundFile = $('soundFile');
  const soundReset = $('soundReset');
  const soundName = $('soundName');
  const visualizer = $('visualizer');
  const ringsHost = $('rings');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULT_SRC = 'assets/tamic-voice.mp3';

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.3v13.4L19 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1.5"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>',
    volume: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.6a5 5 0 0 1 0 6.8"/><path d="M18.4 5.7a9 9 0 0 1 0 12.6"/></svg>',
    muted: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>'
  };

  /* ---------- Состояние ---------- */
  let tamicActive = false;
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let holdTimer = null;
  let objectUrl = null;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function audioOn() { return !audio.paused && !audio.ended; }

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

  function updateUI() {
    const on = audioOn();
    document.body.classList.toggle('is-playing', tamicActive);
    document.body.classList.toggle('audio-on', on);

    card.setAttribute('aria-pressed', String(tamicActive));
    stagePlay.setAttribute('aria-pressed', String(tamicActive));
    stagePlay.setAttribute('aria-label', tamicActive ? 'Вернуть Тамика в обычный режим' : 'Включить звук');
    stagePlayIcon.innerHTML = tamicActive ? ICONS.stop : ICONS.play;
    stageMode.textContent = tamicActive ? 'LIVE' : 'IDLE';

    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Пауза' : 'Включить звук');
    playIcon.innerHTML = on ? ICONS.pause : ICONS.play;
    playLabel.textContent = on ? 'Пауза' : 'Включить звук';

    navStatus.textContent = tamicActive ? 'тамик поёт' : (on ? 'играет' : 'ожидание');
    playerLive.lastChild.textContent = on ? ' звук идёт' : ' звук выключен';
  }

  /* ---------- Web Audio: реальный анализ звука ---------- */
  function initAudioGraph() {
    if (audioCtx) return;
    // file:// не даёт подключать локальный файл к Web Audio — там будет процедурная визуализация.
    if (location.protocol === 'file:') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const source = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      analyser = null;
    }
  }

  function resumeContext() {
    initAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  /* ---------- Визуализатор ---------- */
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
    const on = audioOn();
    if (on && analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      for (let i = 0; i < BAR_COUNT; i++) {
        const ratio = Math.pow(i / (BAR_COUNT - 1), 1.5);
        const idx = Math.min(freqData.length - 1, Math.floor(ratio * freqData.length * 0.8));
        const value = freqData[idx] / 255;
        const target = 0.04 + Math.pow(value, 0.72) * 0.96;
        barHeights[i] = lerp(barHeights[i], target, 0.42);
      }
    } else if (on) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const wave = Math.sin(t / 160 + i * 0.45) * 0.5 + 0.5;
        const target = 0.12 + wave * 0.7;
        barHeights[i] = lerp(barHeights[i], target, 0.24);
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

  /* ---------- Наклон карточки ---------- */
  let targetRX = 0, targetRY = 0, currentRX = 0, currentRY = 0, tiltSettled = true;
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
      targetRX = 0; targetRY = 0; tiltSettled = false;
    });
  }

  /* ---------- Дешёвый «взрыв» без нот ---------- */
  function playBurst() {
    if (reduceMotion) return;
    ringsHost.classList.remove('burst');
    void ringsHost.offsetWidth;
    ringsHost.classList.add('burst');
    clearTimeout(playBurst.timer);
    playBurst.timer = setTimeout(() => ringsHost.classList.remove('burst'), 1100);
  }

  function prepareFlip() {
    if (reduceMotion) return;
    cardFlip.classList.add('is-flipping');
    clearTimeout(prepareFlip.timer);
    prepareFlip.timer = setTimeout(() => cardFlip.classList.remove('is-flipping'), 780);
  }

  /* ---------- Тамик → плеер ---------- */
  function startFromTamic() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    resumeContext();
    audio.pause();
    audio.currentTime = 0;
    tamicActive = true;
    prepareFlip();
    playBurst();
    audio.play().catch(() => {
      navStatus.textContent = 'разреши звук в браузере';
    });
    updateUI();
    updateProgress();
  }

  function stopFromTamic() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    audio.pause();
    audio.currentTime = 0;
    tamicActive = false;
    prepareFlip();
    updateUI();
    updateProgress();
  }

  function toggleTamic() {
    if (tamicActive) stopFromTamic();
    else startFromTamic();
  }

  /* ---------- Плеер → только звук ---------- */
  function toggleAudio() {
    resumeContext();
    if (audioOn()) {
      audio.pause();
    } else {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    updateUI();
  }

  card.addEventListener('click', toggleTamic);
  stagePlay.addEventListener('click', toggleTamic);
  playBtn.addEventListener('click', toggleAudio);

  audio.addEventListener('play', updateUI);
  audio.addEventListener('pause', updateUI);
  audio.addEventListener('ended', () => {
    updateUI();
    if (tamicActive) {
      clearTimeout(holdTimer);
      holdTimer = setTimeout(stopFromTamic, 1200);
    }
  });
  audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
    updateProgress();
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('seeked', updateProgress);

  muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; updateMute(); });
  stopBtn.addEventListener('click', () => {
    audio.currentTime = 0;
    updateProgress();
    resumeContext();
    audio.play().catch(() => {});
  });

  /* ---------- Перемотка ---------- */
  function seekTo(clientX) {
    const rect = progress.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = clamp((clientX - rect.left) / rect.width, 0, 1) * audio.duration;
    updateProgress();
  }
  let seeking = false;
  progress.addEventListener('pointerdown', (e) => {
    seeking = true;
    progress.classList.add('is-dragging');
    if (progress.setPointerCapture) progress.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  });
  progress.addEventListener('pointermove', (e) => { if (seeking) seekTo(e.clientX); });
  function endSeek(e) {
    if (!seeking) return;
    seeking = false;
    progress.classList.remove('is-dragging');
    if (progress.releasePointerCapture && progress.hasPointerCapture && progress.hasPointerCapture(e.pointerId)) {
      progress.releasePointerCapture(e.pointerId);
    }
  }
  progress.addEventListener('pointerup', endSeek);
  progress.addEventListener('pointercancel', endSeek);
  progress.addEventListener('keydown', (e) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const step = audio.duration * 0.05;
    if (e.key === 'Home') audio.currentTime = 0;
    else if (e.key === 'End') audio.currentTime = audio.duration;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') audio.currentTime = Math.min(audio.duration, audio.currentTime + step);
    else audio.currentTime = Math.max(0, audio.currentTime - step);
    updateProgress();
  });

  /* ---------- Меню замены звука ---------- */
  function setMenu(open) {
    soundMenu.classList.toggle('open', open);
    soundMenu.setAttribute('aria-hidden', String(!open));
    soundMenuBtn.setAttribute('aria-expanded', String(open));
  }
  soundMenuBtn.addEventListener('click', () => setMenu(!soundMenu.classList.contains('open')));
  soundMenuClose.addEventListener('click', () => setMenu(false));

  function releaseCustom() {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function loadSource(src, label) {
    releaseCustom();
    if (src.startsWith('blob:')) objectUrl = src;
    audio.pause();
    audio.src = src;
    audio.load();
    audio.currentTime = 0;
    if (tamicActive) stopFromTamic();
    soundName.textContent = `Сейчас: ${label}`;
    durationEl.textContent = '0:00';
    updateProgress();
    updateUI();
    setMenu(false);
  }
  soundFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    loadSource(URL.createObjectURL(file), file.name);
    e.target.value = '';
  });
  soundReset.addEventListener('click', () => loadSource(DEFAULT_SRC, 'голос Тамика'));

  /* ---------- Появление блоков ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---------- Главный цикл ---------- */
  let lastVisual = 0;
  function frame(t) {
    if (document.hidden) { requestAnimationFrame(frame); return; }
    if (!reduceMotion && !tiltSettled) {
      currentRX = lerp(currentRX, targetRX, 0.13);
      currentRY = lerp(currentRY, targetRY, 0.13);
      if (Math.abs(currentRX - targetRX) < 0.06 && Math.abs(currentRY - targetRY) < 0.06) {
        currentRX = targetRX; currentRY = targetRY; tiltSettled = true;
      }
      card.style.setProperty('--rx', `${currentRX.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${currentRY.toFixed(2)}deg`);
    }
    if (t - lastVisual > 32) { lastVisual = t; updateVisualizer(t); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- Старт ---------- */
  if (Number.isFinite(audio.duration)) durationEl.textContent = formatTime(audio.duration);
  updateUI();
  updateProgress();
  updateMute();
})();
