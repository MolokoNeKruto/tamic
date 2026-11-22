/* ТАМИК — звуковой режим */

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const tamicFrame = $('tamicFrame');
  const tamicStill = $('tamicStill');
  const tamicVideo = $('tamicVideo');
  const playerToggle = $('playerToggle');
  const playerWrap = $('playerWrap');
  const player = $('player');
  const playStack = $('playStack'), playBtn = $('playBtn'), pauseBtn = $('pauseBtn');
  const gearBtn = $('gearBtn'), gearIcon = $('gearIcon'), soundMenu = $('soundMenu');
  const speedRow = $('speedRow'), soundFile = $('soundFile'), soundReset = $('soundReset');
  const progress = $('progress'), progressFill = $('progressFill'), timeEl = $('time'), durationEl = $('duration');
  const visualizer = $('visualizer'), audio = $('audio'), toastEl = $('toast');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULT_SRC = 'assets/tamic-voice.mp3';
  const DEFAULT_ON = 'assets/tamic-on.mp4';
  const DEFAULT_OFF = 'assets/tamic-off.mp4';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  let tamicOn = false, playerOpen = false, soundOpen = false;
  let animTimer = null, speechTimer = null, returnTimer = null, toastTimer = null;
  let audioCtx = null, analyser = null, freqData = null, objectUrl = null;

  function audioOn() { return !audio.paused && !audio.ended; }
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  }
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
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
    playStack.classList.toggle('is-on', on);
    playBtn.setAttribute('aria-pressed', String(!on));
    pauseBtn.setAttribute('aria-pressed', String(on));
  }

  function animateTamic(on) {
    const src = on ? DEFAULT_ON : DEFAULT_OFF;
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
    animTimer = setTimeout(finish, 1900);
  }

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
    clearTimeout(speechTimer); clearTimeout(returnTimer);
    tamicOn = !tamicOn;
    animateTamic(tamicOn);
    resumeContext();
    if (tamicOn) {
      audio.pause(); audio.currentTime = 0;
      speechTimer = setTimeout(() => { if (tamicOn) audio.play().catch(() => toast('Браузер просит разрешить звук')); }, 460);
    } else { audio.pause(); audio.currentTime = 0; }
    updateUI(); updateProgress();
  }
  function toggleAudio() {
    resumeContext();
    if (audioOn()) audio.pause();
    else {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) audio.currentTime = 0;
      audio.play().catch(() => toast('Не удалось включить звук'));
    }
    updateUI();
  }
  tamicFrame.addEventListener('click', toggleTamic);
  playBtn.addEventListener('click', toggleAudio);
  pauseBtn.addEventListener('click', toggleAudio);

  audio.addEventListener('play', updateUI);
  audio.addEventListener('pause', updateUI);
  audio.addEventListener('ended', () => {
    updateUI();
    if (tamicOn) returnTimer = setTimeout(() => { if (tamicOn && audio.ended) toggleTamic(); }, 150);
  });
  audio.addEventListener('loadedmetadata', () => { durationEl.textContent = formatTime(audio.duration); updateProgress(); });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('seeked', updateProgress);

  function setOrigin(el, event, fallbackEl, fromTop, prefix) {
    const px = prefix ? `--${prefix}x` : '--ox', py = prefix ? `--${prefix}y` : '--oy';
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
    stage.classList.toggle('player-open', open);
    player.setAttribute('aria-hidden', String(!open));
    playerToggle.setAttribute('aria-expanded', String(open));
    if (!open) setSound(false);
  }
  function setSound(open, event) {
    if (open) setOrigin(soundMenu, event, gearBtn, false, 'm');
    soundOpen = open;
    soundMenu.classList.toggle('open', open);
    player.classList.toggle('is-settings', open);
    soundMenu.setAttribute('aria-hidden', String(!open));
    gearBtn.setAttribute('aria-expanded', String(open));
    gearBtn.setAttribute('aria-label', open ? 'Закрыть настройки плеера' : 'Настройки плеера');
    gearIcon.textContent = open ? '×' : '⚙';
  }
  playerToggle.addEventListener('click', (e) => setPlayer(!playerOpen, e));
  gearBtn.addEventListener('click', (e) => { e.stopPropagation(); setSound(!soundOpen, e); });
  document.addEventListener('click', (e) => {
    if (soundOpen && !soundMenu.contains(e.target) && e.target !== gearBtn && !gearBtn.contains(e.target)) setSound(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (soundOpen) setSound(false); else if (playerOpen) setPlayer(false);
  });

  speedRow.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    audio.playbackRate = parseFloat(btn.dataset.speed);
    speedRow.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  });

  function releaseCustom() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } }
  function loadSource(src, label, isCustom) {
    releaseCustom();
    if (src.startsWith('blob:')) objectUrl = src;
    audio.pause(); clearTimeout(speechTimer);
    audio.src = src; audio.load(); audio.currentTime = 0;
    if (tamicOn) { clearTimeout(returnTimer); tamicOn = false; animateTamic(false); }
    soundReset.hidden = !isCustom;
    durationEl.textContent = '0:00';
    updateProgress(); updateUI(); setSound(false);
  }
  soundFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const extOk = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(file.name);
    if (file.size > 10 * 1024 * 1024) { toast('Файл слишком большой — максимум 10 МБ'); e.target.value = ''; return; }
    if (!extOk && !file.type.startsWith('audio/')) { toast('Нужен аудиофайл'); e.target.value = ''; return; }
    loadSource(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''), true);
    toast('Звук заменён');
    e.target.value = '';
  });
  soundReset.addEventListener('click', () => { loadSource(DEFAULT_SRC, 'Тамик', false); toast('Вернул оригинальный звук'); });

  function seekTo(clientX) {
    const rect = progress.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = clamp((clientX - rect.left) / rect.width, 0, 1) * audio.duration;
    updateProgress();
  }
  let seeking = false;
  progress.addEventListener('pointerdown', (e) => {
    seeking = true; progress.classList.add('is-dragging');
    if (progress.setPointerCapture) progress.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  });
  progress.addEventListener('pointermove', (e) => { if (seeking) seekTo(e.clientX); });
  function endSeek(e) {
    if (!seeking) return;
    seeking = false; progress.classList.remove('is-dragging');
    if (progress.releasePointerCapture && progress.hasPointerCapture && progress.hasPointerCapture(e.pointerId)) progress.releasePointerCapture(e.pointerId);
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

  const BAR_COUNT = 36, bars = [], heights = new Array(BAR_COUNT).fill(0.08);
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('span'); bar.className = 'bar'; visualizer.appendChild(bar); bars.push(bar);
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
      for (let i = 0; i < BAR_COUNT; i++) heights[i] = lerp(heights[i], 0.12 + (Math.sin(t / 160 + i * 0.45) * 0.5 + 0.5) * 0.7, 0.24);
    } else {
      for (let i = 0; i < BAR_COUNT; i++) heights[i] = lerp(heights[i], 0.08 + 0.05 * Math.sin(t / 700 + i * 0.32) + 0.03 * Math.sin(t / 1200 + i * 0.11), 0.12);
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

  /* ---------- Подстройка под любой размер окна ---------- */
  const introEl = document.querySelector('.intro');
  const navEl = document.querySelector('.nav');
  function fitStage() {
    const w = innerWidth, h = innerHeight;
    document.documentElement.style.setProperty('--win-h', `${h}px`);
    if (w <= 700) {
      const navH = navEl.getBoundingClientRect().height;
      const introH = introEl.getBoundingClientRect().height;
      const reserved = navH + introH + 86 + (w < 400 ? 185 : 215);
      const available = Math.max(150, h - reserved);
      const card = Math.max(170, Math.min(w * 0.58, available * 0.75, 270));
      stage.style.setProperty('--card-base', `${Math.round(card)}px`);
      stage.style.setProperty('--card-small', `${Math.round(Math.min(w * 0.42, card * 0.62))}px`);
    } else {
      stage.style.removeProperty('--card-base');
      stage.style.removeProperty('--card-small');
    }
  }
  fitStage();
  addEventListener('resize', fitStage, { passive: true });
  addEventListener('orientationchange', fitStage, { passive: true });

  if (Number.isFinite(audio.duration)) durationEl.textContent = formatTime(audio.duration);
  updateUI(); updateProgress();
})();
