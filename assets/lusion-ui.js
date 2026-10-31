/* ============================================================
   Lusion UI & Header Controller
   - Menu open/close with capsule morphing (MENU •• <-> CLOSE :)
   - 3-card stack interactions
   - Web Audio ambient sound toggle
   - Newsletter submit feedback
   ============================================================ */

(() => {
  'use strict';

  function initLusionUI() {
    const menuBtn = document.getElementById('lusion-menu-btn');
    const menu = document.getElementById('lusion-menu');
    const backdrop = document.getElementById('lusion-backdrop');
    const menuBtnText = document.getElementById('lusion-menu-btn-text');
    const soundBtn = document.getElementById('lusion-sound-btn');

    // 1. Menu Toggle
    if (menuBtn && menu) {
      const setMenuOpen = (open) => {
        menu.classList.toggle('open', open);
        menu.classList.toggle('menu--open', open);
        if (backdrop) {
          backdrop.classList.toggle('open', open);
          backdrop.classList.toggle('menu--open', open);
        }
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        
        if (menuBtnText) {
          menuBtnText.textContent = open ? 'CLOSE' : 'MENU';
        }
        document.body.style.overflow = open ? 'hidden' : '';
      };

      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMenuOpen(!menu.classList.contains('open'));
      });

      if (backdrop) {
        backdrop.addEventListener('click', () => setMenuOpen(false));
      }

      menu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setMenuOpen(false));
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('open')) {
          setMenuOpen(false);
        }
      });
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

    // 3. Newsletter Feedback
    const newsForm = document.getElementById('lusion-newsletter-form');
    if (newsForm) {
      newsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('lusion-newsletter-input');
        if (input && input.value.trim()) {
          input.value = 'Thanks for subscribing!';
          input.disabled = true;
          setTimeout(() => {
            input.value = '';
            input.disabled = false;
          }, 3500);
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
