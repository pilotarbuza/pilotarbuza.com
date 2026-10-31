/* ============================================================
   pilotarbuza.com — Interactive Granular Particle Sea
   Styled with Anemos Aircraft Brandbook Palette:
   - Deep Teal Sea Background (#0B7A85 to #1F3A45)
   - Milk Silk (#FFF8F0), Ice Mist (#BFE6E4) and Garnet (#FF6A4A) shapes
   - Delta Aircraft Wings, Navigation Crosses, Instrument Circles & Squares
   ============================================================ */

(() => {
  'use strict';

  function initEndShapes() {
    const section = document.getElementById('end-section');
    const canvas = document.getElementById('end-shapes-canvas');
    if (!section || !canvas) return;

    const ctx = canvas.getContext('2d');
    let width = section.clientWidth;
    let height = section.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      width = section.clientWidth;
      height = section.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    resize();

    // Shape Types: 0 = Cross (+), 1 = Square (■), 2 = Circle (●), 3 = Delta Wing (▲)
    const SHAPE_COUNT = width < 768 ? 900 : 1800;
    const particles = [];

    const COLORS = [
      '#FFF8F0', // 70% Milk silk
      '#FFF8F0',
      '#FFF8F0',
      '#BFE6E4', // 20% Mist / Ice
      '#BFE6E4',
      '#FF6A4A'  // 10% Garnet flame
    ];

    for (let i = 0; i < SHAPE_COUNT; i++) {
      const x = Math.random() * width;
      const depth = Math.pow(Math.random(), 0.72);
      const baseY = height * 0.44 + depth * (height * 0.56);

      particles.push({
        x,
        y: baseY,
        baseY,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.05,
        type: Math.floor(Math.random() * 4),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: width < 768 ? (4.5 + Math.random() * 4.5) : (5.5 + Math.random() * 6),
        waveOffset: Math.random() * Math.PI * 2,
        waveSpeed: 0.7 + Math.random() * 1.1,
        opacity: 0.8 + Math.random() * 0.2
      });
    }

    // Pointer tracking
    const mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, vx: 0, vy: 0 };
    function updatePointer(cx, cy) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = cx - rect.left;
      mouse.y = cy - rect.top;
      if (mouse.prevX > -1000) {
        mouse.vx = mouse.x - mouse.prevX;
        mouse.vy = mouse.y - mouse.prevY;
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }

    window.addEventListener('pointermove', (e) => {
      updatePointer(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // Draw individual shape
    function drawShape(type, size) {
      const half = size * 0.5;
      if (type === 0) {
        // Cross (+)
        const bar = size * 0.28;
        ctx.beginPath();
        ctx.rect(-half, -bar * 0.5, size, bar);
        ctx.rect(-bar * 0.5, -half, bar, size);
        ctx.fill();
      } else if (type === 1) {
        // Square (■)
        ctx.fillRect(-half, -half, size, size);
      } else if (type === 2) {
        // Circle (●)
        ctx.beginPath();
        ctx.arc(0, 0, half, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Delta Aircraft Chevron (▲)
        ctx.beginPath();
        ctx.moveTo(0, -half * 1.25);
        ctx.lineTo(half * 0.95, half * 0.9);
        ctx.lineTo(0, half * 0.4);
        ctx.lineTo(-half * 0.95, half * 0.9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Performance Visibility Culling
    let isVisible = false;
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    }, { threshold: 0.05 });
    observer.observe(section);

    let time = 0;
    function loop() {
      requestAnimationFrame(loop);
      if (!isVisible) return;

      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      const MOUSE_RADIUS = width < 768 ? 95 : 140;
      const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Organic wave height
        const wave = Math.sin(p.x * 0.005 + time * p.waveSpeed + p.waveOffset) * 16
                   + Math.cos(p.x * 0.011 - time * 0.6) * 7;
        const targetY = p.baseY + wave;

        // 2. Pointer repulsion & splash
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < MOUSE_RADIUS_SQ) {
          const dist = Math.sqrt(distSq);
          const factor = 1 - dist / MOUSE_RADIUS;
          const pushX = (dx / (dist || 1)) * factor * 16;
          const pushY = (dy / (dist || 1)) * factor * 16;

          p.vx += pushX + mouse.vx * 0.18;
          p.vy += pushY - factor * 9 + mouse.vy * 0.18;
          p.vRot += (Math.random() - 0.5) * 0.3;
        }

        // 3. Gravity and bed restoring spring
        if (p.y < targetY) {
          p.vy += 0.48; // Gravity
        } else {
          const depth = p.y - targetY;
          p.vy -= depth * 0.085;
          p.vy *= 0.8;
        }

        // Velocity decay
        p.vx *= 0.92;
        p.vy *= 0.94;
        p.vRot *= 0.93;

        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;

        // Screen wrapping
        if (p.x < -15) p.x = width + 15;
        if (p.x > width + 15) p.x = -15;

        // 4. Render
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        drawShape(p.type, p.size);
        ctx.restore();
      }

      // Decay mouse velocity
      mouse.vx *= 0.6;
      mouse.vy *= 0.6;
    }

    loop();

    window.addEventListener('resize', () => {
      resize();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEndShapes);
  } else {
    initEndShapes();
  }
})();
