/**
 * Lusion-Style Transition Overlay & Preloader with Minecraft Percentage Counter
 * Exact recreation of lusion.co pixel-art wave preloader and page transitions.
 * Features giant Minecraft-font bottom-left odometer percentage counter (000 -> 100).
 * pilotarbuza.com
 */
(() => {
  'use strict';

  // Exact Lusion LOADING_RECTS matrix
  const LOADING_RECTS = [
    1,1,1,3, 2,4,2,1,                   // L
    6,2,1,2, 7,1,1,1, 7,4,1,1, 8,2,1,2, // O
    11,2,1,3, 13,2,1,3, 12,1,1,1,       // A
    16,1,2,1, 18,2,1,2, 16,4,2,1,       // D
    22,1,1,4,                           // I
    26,1,1,4, 27,1,1,1, 28,2,1,3,       // N
    32,1,1,1, 33,3,1,1, 31,1,1,3, 32,4,2,1 // G
  ];

  function cUnMix(min, max, val) {
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }

  function expoIn(e) {
    return e === 0 ? 0 : Math.pow(1024, e - 1);
  }

  function expoOut(e) {
    return e === 1 ? 1 : 1 - Math.pow(2, -10 * e);
  }

  function expoInOut(e) {
    if (e === 0) return 0;
    if (e === 1) return 1;
    return (e *= 2) < 1
      ? 0.5 * Math.pow(1024, e - 1)
      : 0.5 * (-Math.pow(2, -10 * (e - 1)) + 2);
  }

  function fit(val, inMin, inMax, outMin, outMax, easeFn) {
    let norm = cUnMix(inMin, inMax, val);
    if (easeFn) norm = easeFn(norm);
    return outMin + norm * (outMax - outMin);
  }

  class LusionLoader {
    constructor() {
      // 1. Inject @font-face and styles if needed
      this.injectStyles();

      // 2. Setup Canvas
      this.canvas = document.getElementById('transition-overlay');
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'transition-overlay';
        (document.body || document.documentElement).appendChild(this.canvas);
      }
      this.ctx = this.canvas.getContext('2d');

      // 3. Setup Preloader DOM (Minecraft bottom-left counter)
      this.domContainer = document.getElementById('preloader');
      if (!this.domContainer) {
        this.domContainer = document.createElement('div');
        this.domContainer.id = 'preloader';
        this.domContainer.innerHTML = `
          <div id="preloader-percent-digits" aria-hidden="true">
            <div class="preloader-percent-digit">
              <div class="preloader-percent-digit-num">0</div>
              <div class="preloader-percent-digit-num">0</div>
            </div>
            <div class="preloader-percent-digit">
              <div class="preloader-percent-digit-num">0</div>
              <div class="preloader-percent-digit-num">0</div>
            </div>
            <div class="preloader-percent-digit">
              <div class="preloader-percent-digit-num">0</div>
              <div class="preloader-percent-digit-num">0</div>
            </div>
          </div>
        `;
        (document.body || document.documentElement).appendChild(this.domContainer);
      }

      this.domDigitsContainer = document.getElementById('preloader-percent-digits');
      this.domDigits = Array.from(this.domContainer.querySelectorAll('.preloader-percent-digit'));
      this.domDigits.forEach(col => {
        col._domNums = col.querySelectorAll('.preloader-percent-digit-num');
        col._easedVal = 0;
      });

      this.active = true;
      this.state = 'show'; // 'show' -> 'wait' -> 'hide' -> 'curtain' -> 'done'
      this.showRatio = 0;
      this.hideRatio = 0;
      this.curtainRatio = 0;
      this.exitRatio = 0;
      this.lastTime = performance.now();
      this.pixelWidth = 10;
      this.waitTimer = 0.25;

      // Percentage counter states
      this.percent = 0;
      this.percentTarget = 0;

      // Unblock on DOM ready, do not stall on external third-party requests
      this.pageLoaded = (document.readyState === 'interactive' || document.readyState === 'complete');
      if (!this.pageLoaded) {
        document.addEventListener('DOMContentLoaded', () => {
          this.pageLoaded = true;
        }, { once: true });
        window.addEventListener('load', () => {
          this.pageLoaded = true;
        }, { once: true });
      }

      this.resize = this.resize.bind(this);
      this.loop = this.loop.bind(this);

      window.addEventListener('resize', this.resize, { passive: true });
      this.resize();
      requestAnimationFrame(this.loop);

      // Handle bfcache (back/forward navigation)
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
          this.finish();
        }
      });

      // Safety fallback: auto-finish after 2.8s
      setTimeout(() => {
        if (this.active && this.state !== 'exit') {
          this.finish();
        }
      }, 2800);

      this.setupLinkTransitions();
    }

    injectStyles() {
      if (document.getElementById('lusion-mc-styles')) return;
      const st = document.createElement('style');
      st.id = 'lusion-mc-styles';
      st.textContent = `
        @font-face {
          font-family: 'Minecraft';
          src: url('/assets/fonts/minecraft.woff2') format('woff2');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
        #preloader {
          position: fixed;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          z-index: 10000000;
          background-color: transparent;
          pointer-events: none;
        }
        #preloader-percent-digits {
          position: absolute;
          bottom: env(safe-area-inset-bottom, 0px);
          left: env(safe-area-inset-left, 0px);
          font-family: 'Minecraft', monospace;
          font-size: clamp(3.25rem, 6.5vw, 8rem);
          height: 1.0em;
          line-height: 1.0em;
          color: #ffffff;
          overflow: hidden;
          display: flex;
          user-select: none;
          pointer-events: none;
          letter-spacing: -0.02em;
        }
        .preloader-percent-digit {
          position: relative;
          width: 1ch;
          text-align: center;
          will-change: transform;
        }
        .preloader-percent-digit-num {
          height: 1.0em;
          line-height: 1.0em;
          text-align: center;
        }
      `;
      (document.head || document.documentElement).appendChild(st);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      // Width of LOADING is 35 units; center at x=18, y=3
      // Responsive pixel width matching lusion.co mobile and desktop
      this.pixelWidth = Math.min(18, Math.max(7, Math.round(w / 46)));
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (this.active) {
        this.update(dt);
        this.render();
        requestAnimationFrame(this.loop);
      } else {
        this.canvas.style.display = 'none';
        this.canvas.style.pointerEvents = 'none';
        if (this.domContainer) {
          this.domContainer.style.display = 'none';
        }
      }
    }

    update(dt) {
      if (this.state === 'show') {
        this.showRatio += dt * 1.5; // ~0.66s wave in
        // Progress counts up fluidly towards ~85-92%
        const targetShow = fit(this.showRatio, 0, 1, 0, 0.88, expoOut);
        this.percentTarget = Math.max(this.percentTarget, targetShow);

        if (this.showRatio >= 1) {
          this.showRatio = 1;
          this.state = 'wait';
        }
      } else if (this.state === 'wait') {
        if (!this.pageLoaded) {
          // Creep forward slowly towards 95% if still waiting for DOM
          this.percentTarget = Math.min(0.95, this.percentTarget + dt * 0.15);
        } else {
          this.waitTimer -= dt;
          this.percentTarget = 1.0;
          if (this.waitTimer <= 0 && this.percent >= 0.99) {
            this.state = 'hide';
          }
        }
      } else if (this.state === 'hide') {
        this.percentTarget = 1.0;
        this.hideRatio += dt * 1.85; // ~0.54s wave out
        if (this.hideRatio >= 1) {
          this.hideRatio = 1;
          this.state = 'curtain';
        }
      } else if (this.state === 'curtain') {
        this.percentTarget = 1.0;
        this.curtainRatio += dt * 2.2; // ~0.45s smooth curtain fade & digits lift
        if (this.curtainRatio >= 1) {
          this.curtainRatio = 1;
          this.state = 'done';
          this.active = false;
        }
      } else if (this.state === 'exit') {
        this.exitRatio += dt * 3.8; // ~0.26s exit cover
        if (this.exitRatio >= 1) {
          this.exitRatio = 1;
        }
      }

      // Smooth percentage easing towards target
      if (this.state !== 'exit') {
        const easeRate = this.percentTarget >= 1.0 ? 14 : 10;
        this.percent += (this.percentTarget - this.percent) * (1 - Math.exp(-easeRate * dt));
        if (Math.abs(this.percentTarget - this.percent) < 0.003) {
          this.percent = this.percentTarget;
        }
        this.updateDigits(dt);
      }
    }

    updateDigits(dt) {
      if (!this.domDigits || !this.domDigits.length) return;
      const t = this.percent;
      const n = (this.state === 'curtain') ? expoInOut(this.curtainRatio) : 0;

      for (let a = 0; a < this.domDigits.length; a++) {
        const col = this.domDigits[a];
        // Exact Lusion digit slot target
        const c = Math.floor(t * 100 / Math.pow(10, this.domDigits.length - a - 1));

        // Smooth mechanical roll
        col._easedVal = (col._easedVal || 0) + (c - (col._easedVal || 0)) * (1 - Math.exp(-12 * dt));
        if (c - col._easedVal < 0.01) col._easedVal = c;

        const u = col._easedVal % 10;
        const f = Math.floor(u);
        const p = (f + 1) % 10;
        const g = u - f;

        if (col._domNums && col._domNums.length >= 2) {
          col._domNums[0].textContent = f;
          col._domNums[1].textContent = p;
        }

        // Staggered curtain lift off when transitioning out
        const curtainLift = (n > 0)
          ? expoInOut(Math.min(1, Math.max(0, n * 1.2 - 0.2 * a / (this.domDigits.length - 1))))
          : 0;

        col.style.transform = `translateY(${-(g - curtainLift) * 50}%)`;
      }

      if (this.domDigitsContainer) {
        if (this.state === 'curtain') {
          this.domDigitsContainer.style.opacity = (1 - expoInOut(this.curtainRatio));
        } else {
          this.domDigitsContainer.style.opacity = '1';
        }
      }
    }

    render() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ctx = this.ctx;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      if (this.state === 'exit') {
        const alpha = expoInOut(this.exitRatio);
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = alpha;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        return;
      }

      // Curtain opacity & subtle upward lift
      let curtainAlpha = 1;
      let curtainSlide = 0;
      if (this.state === 'curtain') {
        const f = expoInOut(this.curtainRatio);
        curtainAlpha = 1 - f;
        curtainSlide = -f * 36;
      }

      ctx.globalAlpha = curtainAlpha;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Render pixel font LOADING
      if (curtainAlpha > 0.01 && (this.showRatio > 0 && this.hideRatio < 1)) {
        const pw = this.pixelWidth;
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5 + curtainSlide);
        ctx.translate(-18 * pw, -3 * pw);

        const S = LOADING_RECTS.length / 4;
        const g = this.showRatio;
        const v = this.hideRatio;

        ctx.beginPath();
        for (let M = 0, b = 0; M < S; M++, b += 4) {
          const C = LOADING_RECTS[b + 0];
          const ry = LOADING_RECTS[b + 1];
          const R = LOADING_RECTS[b + 2];
          const E = LOADING_RECTS[b + 3];

          const I = M / (S - 1);
          let F = fit(g, I * 0.5, 0.5 + I * 0.5, 0, 1, expoIn) *
                  fit(v, I * 0.5, 0.5 + I * 0.5, 1, 0, expoOut);

          // Edge pins matching Lusion
          if (g < 1 && M < 2) F = fit(g, 0, 0.5, 0, 1, expoIn);

          if (F > 0.001) {
            ctx.rect(
              (C + (1 - F) * R * 0.5) * pw,
              (ry + (1 - F) * E * 0.5) * pw,
              R * F * pw,
              E * F * pw
            );
          }
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    finish() {
      this.state = 'done';
      this.active = false;
      this.canvas.style.display = 'none';
      this.canvas.style.pointerEvents = 'none';
      if (this.domContainer) {
        this.domContainer.style.display = 'none';
      }
    }

    setupLinkTransitions() {
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          return;
        }

        if (link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
          return;
        }

        try {
          const url = new URL(link.href, window.location.href);
          if (url.origin !== window.location.origin) {
            return;
          }
          if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
            return;
          }

          e.preventDefault();
          this.active = true;
          this.state = 'exit';
          this.exitRatio = 0;
          this.canvas.style.display = 'block';
          this.canvas.style.pointerEvents = 'all';
          if (this.domContainer) {
            this.domContainer.style.display = 'none';
          }

          setTimeout(() => {
            window.location.href = url.href;
          }, 240);
        } catch (err) {}
      });
    }
  }

  // Initialize
  function initLoader() {
    if (!window.__lusionLoader) {
      window.__lusionLoader = new LusionLoader();
    }
  }

  if (document.readyState === 'loading') {
    if (document.body) {
      initLoader();
    } else {
      document.addEventListener('DOMContentLoaded', initLoader);
    }
  } else {
    initLoader();
  }
})();
