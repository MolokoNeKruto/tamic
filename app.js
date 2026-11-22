/* ============================================================
   ГОЛОС В КАДРЕ
   Переход — снятое видео. Панели вытекают из точки нажатия.
   ============================================================ */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const tamicFrame = $('tamicFrame');
  const tamicStill = $('tamicStill');
  const tamicVideo = $('tamicVideo');
  const playerToggle = $('playerToggle');
  const playerWrap = $('playerWrap');
  const player = $('player');
  const playBtn = $('playBtn');
  const playIcon = $('playIcon');
  const playLabel = $('playLabel');
  const gearBtn = $('gearBtn');
  const gearIcon = $('gearIcon');
  const soundMenu = $('soundMenu');
  const speedRow = $('speedRow');
  const soundFile = $('soundFile');
  const soundReset = $('soundReset');
  const soundName = $('soundName');
  const progress = $('progress');
  const progressFill = $('progressFill');
  const timeEl = $('time');
  const durationEl = $('duration');
  const visualizer = $('visualizer');
  const audio = $('audio');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULT_SRC = 'assets/tamic-voice.mp3';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.3v13.4L19 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1.5"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.5"/></svg>'
  };

  let tamicOn = false;
  let playerOpen = false;
  let soundOpen = false;
  let animTimer = null;
  let speechTimer = null;
  let returnTimer = null;
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let objectUrl = null;

  function audioOn() { return !audio.paused && !audio.ended; }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  }

  function updateProgress() {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    const value = clamp(pct, 0, 100);
    progressFill.style.width = `${value}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(value)));
    timeEl.textContent = formatTime(audio.currentTime);
  }

  function updateUI() {
    const on = audioOn();
    document.body.classList.toggle('tamic-on', tamicOn);
    document.body.classList.toggle('audio-on', on);
    tamicFrame.setAttribute('aria-pressed', String(tamicOn));
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Пауза' : 'Включить звук');
    playIcon.innerHTML = on ? ICONS.pause : ICONS.play;
    playLabel.textContent = on ? 'Пауза' : 'Включить звук';
  }

  /* ---------- Переход кадра ---------- */
  function animateTamic(on) {
    const src = on ? 'assets/tamic-on.mp4' : 'assets/tamic-off.mp4';
    const still = on ? 'assets/tamic-music-card.jpg' : 'assets/tamic-calm-card.jpg';

    const finish = () => {
      clearTimeout(animTimer);
      tamicStill.src = still;
      tamicFrame.classList.remove('is-animating');
      tamicVideo.removeEventListener('ended', finish);
    };

    clearTimeout(animTimer);
    tamicVideo.removeEventListener('ended', finish);
    tamicVideo.addEventListener('ended', finish, { once: true });
    tamicVideo.pause();
    if (tamicVideo.getAttribute('src') !== src) tamicVideo.src = src;

    if (reduceMotion) { finish(); return; }

    tamicFrame.classList.add('is-animating');
    tamicVideo.currentTime = 0;
    const p = tamicVideo.play();
    if (p && typeof p.catch === 'function') p.catch(finish);
    animTimer = setTimeout(finish, 1600);
  }

  /* ---------- Звук ---------- */
  function initAudioGraph() {
    if (audioCtx) return;
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
    } catch (err) { analyser = null; }
  }
  function resumeContext() {
    initAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function toggleTamic() {
    clearTimeout(speechTimer);
    clearTimeout(returnTimer);
    tamicOn = !tamicOn;
    animateTamic(tamicOn);
    resumeContext();

    if (tamicOn) {
      audio.pause();
      audio.currentTime = 0;
      // Кадр меняется раньше — голос вступает после переворота.
      speechTimer = setTimeout(() => { if (tamicOn) audio.play().catch(() => {}); }, 460);
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
    updateUI();
    updateProgress();
  }

  function toggleAudio() {
    resumeContext();
    if (audioOn()) audio.pause();
    else {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    updateUI();
  }

  tamicFrame.addEventListener('click', toggleTamic);
  playBtn.addEventListener('click', toggleAudio);

  audio.addEventListener('play', updateUI);
  audio.addEventListener('pause', updateUI);
  audio.addEventListener('ended', () => {
    updateUI();
    if (tamicOn) {
      // Возврат — позже, чем закончилась фраза.
      returnTimer = setTimeout(() => { if (tamicOn && audio.ended) toggleTamic(); }, 900);
    }
  });
  audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
    updateProgress();
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('seeked', updateProgress);

  /* ---------- Genie-открытие: источник — точка нажатия ---------- */
  function setOrigin(el, event, fallbackEl, fromTop, prefix) {
    const px = prefix ? `--${prefix}x` : '--ox';
    const py = prefix ? `--${prefix}y` : '--oy';
    if (event && typeof event.clientX === 'number') {
      const r = el.getBoundingClientRect();
      el.style.setProperty(px, `${clamp(event.clientX - r.left, 0, r.width)}px`);
      el.style.setProperty(py, `${clamp(event.clientY - r.top, 0, Math.max(r.height, 40))}px`);
    } else if (fallbackEl) {
      const r = fallbackEl.getBoundingClientRect();
      el.style.setProperty(px, `${r.width / 2}px`);
      el.style.setProperty(py, fromTop ? '0px' : `${r.height / 2}px`);
    }
  }

  function setPlayer(open, event) {
    setOrigin(player, event, playerToggle, true);
    playerOpen = open;
    playerWrap.classList.toggle('open', open);
    player.setAttribute('aria-hidden', String(!open));
    playerToggle.setAttribute('aria-expanded', String(open));
    if (!open) setSound(false);
  }

  function setSound(open, event) {
    if (open) setOrigin(soundMenu, event, gearBtn, false, 'm');
    soundOpen = open;
    soundMenu.classList.toggle('open', open);
    soundMenu.setAttribute('aria-hidden', String(!open));
    gearBtn.setAttribute('aria-expanded', String(open));
    gearBtn.setAttribute('aria-label', open ? 'Закрыть настройки звука' : 'Настройки звука');
    gearIcon.textContent = open ? '×' : '⚙';
  }

  playerToggle.addEventListener('click', (e) => setPlayer(!playerOpen, e));
  gearBtn.addEventListener('click', (e) => { e.stopPropagation(); setSound(!soundOpen, e); });

  document.addEventListener('click', (e) => {
    if (soundOpen && !soundMenu.contains(e.target) && e.target !== gearBtn && !gearBtn.contains(e.target)) setSound(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (soundOpen) setSound(false);
    else if (playerOpen) setPlayer(false);
  });

  /* ---------- Скорость и замена звука ---------- */
  speedRow.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    audio.playbackRate = parseFloat(btn.dataset.speed);
    speedRow.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  });

  function releaseCustom() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } }
  function loadSource(src, label) {
    releaseCustom();
    if (src.startsWith('blob:')) objectUrl = src;
    audio.pause();
    clearTimeout(speechTimer);
    audio.src = src;
    audio.load();
    audio.currentTime = 0;
    if (tamicOn) { clearTimeout(returnTimer); tamicOn = false; animateTamic(false); }
    soundName.textContent = `Сейчас: ${label}`;
    durationEl.textContent = '0:00';
    updateProgress();
    updateUI();
    setSound(false);
  }
  soundFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    loadSource(URL.createObjectURL(file), file.name);
    e.target.value = '';
  });
  soundReset.addEventListener('click', () => loadSource(DEFAULT_SRC, 'голос в кадре'));

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

  /* ---------- Визуализация ---------- */
  const BAR_COUNT = 36;
  const bars = [];
  const heights = new Array(BAR_COUNT).fill(0.08);
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
        const v = freqData[idx] / 255;
        heights[i] = lerp(heights[i], 0.04 + Math.pow(v, 0.72) * 0.96, 0.42);
      }
    } else if (on) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const wave = Math.sin(t / 160 + i * 0.45) * 0.5 + 0.5;
        heights[i] = lerp(heights[i], 0.12 + wave * 0.7, 0.24);
      }
    } else {
      for (let i = 0; i < BAR_COUNT; i++) {
        const idle = 0.08 + 0.05 * Math.sin(t / 700 + i * 0.32) + 0.03 * Math.sin(t / 1200 + i * 0.11);
        heights[i] = lerp(heights[i], idle, 0.12);
      }
    }
    for (let i = 0; i < BAR_COUNT; i++) bars[i].style.setProperty('--h', clamp(heights[i], 0.03, 1).toFixed(3));
  }
  let lastVisual = 0;
  function frame(t) {
    if (document.hidden) { requestAnimationFrame(frame); return; }
    if (t - lastVisual > 32) { lastVisual = t; updateVisualizer(t); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (Number.isFinite(audio.duration)) durationEl.textContent = formatTime(audio.duration);
  updateUI();
  updateProgress();
})();
