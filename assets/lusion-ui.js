/* ============================================================
   Lusion UI & Header Controller
   - Menu open/close with capsule morphing (MENU •• <-> CLOSE :)
   - 3-card stack interactions
   - Web Audio ambient sound toggle
   ============================================================ */

(() => {
  'use strict';

  function initLusionUI() {
    const menuBtn = document.getElementById('burger') || document.getElementById('lusion-menu-btn') || document.querySelector('.lusion-menu-btn');
    const menu = document.getElementById('menu') || document.getElementById('lusion-menu') || document.querySelector('.lusion-menu');
    const backdrop = document.getElementById('menu-backdrop') || document.getElementById('lusion-backdrop') || document.querySelector('.lusion-backdrop');
    const menuBtnText = document.getElementById('lusion-menu-btn-text');
    const soundBtn = document.getElementById('lusion-sound-btn');

    // 1. Меню: карточки выезжают по очереди, закрываются в обратном порядке
    if (menuBtn && menu) {
      const cards = Array.from(menu.querySelectorAll('.lusion-card'));
      const n = cards.length;
      cards.forEach((c, i) => {
        c.style.setProperty('--open-delay', (i / 50 + 0.02) + 's');
        c.style.setProperty('--close-delay', (Math.abs(i - n + 1) / 50) + 's');
      });
      const isOpen = () => menu.classList.contains('open');
      const setMenuOpen = (open) => {
        menu.classList.toggle('open', open);
        if (backdrop) backdrop.classList.toggle('open', open);
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (menuBtnText && !menuBtnText.querySelector('.mbt__a')) menuBtnText.textContent = open ? 'CLOSE' : 'MENU';
      };

      menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenuOpen(!isOpen()); });
      // клик мимо карточек закрывает меню
      document.addEventListener('click', (e) => { if (isOpen() && !menu.contains(e.target)) setMenuOpen(false); });
      menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { setMenuOpen(false); menuBtn.focus(); } });
      // заметная прокрутка страницы тоже закрывает меню
      let y0 = 0;
      menuBtn.addEventListener('click', () => { y0 = window.scrollY; });
      window.addEventListener('scroll', () => { if (isOpen() && Math.abs(window.scrollY - y0) > 120) setMenuOpen(false); }, { passive: true });
    }

    // 2. Sound Toggle (Native Web Audio API Synth)
    let audioCtx = null;
    let masterGain = null;
    let isPlaying = false;

    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        if (!audioCtx) {
          try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();

            masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(0.01, audioCtx.currentTime);
            masterGain.connect(audioCtx.destination);

            // Create relaxing warm drone chords (C minor / Ambient)
            const freqs = [130.81, 196.00, 261.63, 311.13, 392.00];
            freqs.forEach(f => {
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(f, audioCtx.currentTime);
              gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
              osc.connect(gain);
              gain.connect(masterGain);
              osc.start();
            });
          } catch (e) {
            console.warn('Web Audio not supported:', e);
          }
        }

        if (audioCtx) {
          if (audioCtx.state === 'suspended') {
            audioCtx.resume();
          }

          isPlaying = !isPlaying;
          soundBtn.classList.toggle('playing', isPlaying);
          soundBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');

          if (masterGain) {
            const now = audioCtx.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            if (isPlaying) {
              masterGain.gain.linearRampToValueAtTime(0.08, now + 0.6);
            } else {
              masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
            }
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLusionUI);
  } else {
    initLusionUI();
  }
})();
