/**
 * Lusion-Style Transition Overlay & Preloader
 * Exact recreation of lusion.co pixel-art wave preloader and page transitions.
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
      this.canvas = document.getElementById('transition-overlay');
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'transition-overlay';
        (document.body || document.documentElement).appendChild(this.canvas);
      }

      this.ctx = this.canvas.getContext('2d');
      this.active = true;
      this.state = 'show'; // 'show' -> 'wait' -> 'hide' -> 'curtain' -> 'done'
      this.showRatio = 0;
      this.hideRatio = 0;
      this.curtainRatio = 0;
      this.exitRatio = 0;
      this.lastTime = performance.now();
      this.pixelWidth = 10;
      this.waitTimer = 0.22;

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
      }
    }

    update(dt) {
      if (this.state === 'show') {
        this.showRatio += dt * 1.6; // ~0.62s wave in
        if (this.showRatio >= 1) {
          this.showRatio = 1;
          this.state = 'wait';
        }
      } else if (this.state === 'wait') {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0 && this.pageLoaded) {
          this.state = 'hide';
        }
      } else if (this.state === 'hide') {
        this.hideRatio += dt * 1.85; // ~0.54s wave out
        if (this.hideRatio >= 1) {
          this.hideRatio = 1;
          this.state = 'curtain';
        }
      } else if (this.state === 'curtain') {
        this.curtainRatio += dt * 2.4; // ~0.42s smooth curtain fade
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
