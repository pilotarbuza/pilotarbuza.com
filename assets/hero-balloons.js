/* ============================================================
   pilotarbuza.com — 3D Fluid Balloons Simulation (Three.js)
   Styled with Anemos Aircraft Brandbook Palette:
   - Breeze Teal (#4FC7C4 / #0B7A85) luminous glass droplets
   - Titanium Chrome (#E8F4F5) reflective aerospace spheres
   - Deep Petrol (#14232A / #1F3A45) obsidian contrast spheres
   - Garnet Flame (#FF6A4A / #E8492A) radiant accent droplets
   - Mist Ice (#BFE6E4) frosted pearlescent beads
   ============================================================ */

(() => {
  'use strict';

  function initHeroBalloons() {
    const container = document.getElementById('hero');
    const canvas = document.getElementById('hero-balloons-canvas');
    if (!container || !canvas || typeof THREE === 'undefined') return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 18);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // 2. Studio Lighting (Aeronautical High-Key)
    const ambientLight = new THREE.AmbientLight(0x0C1517, 2.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
    keyLight.position.set(6, 11, 12);
    scene.add(keyLight);

    // Cyan/Breeze Rim Light
    const rimLight = new THREE.DirectionalLight(0x4FC7C4, 2.2);
    rimLight.position.set(-8, -4, 6);
    scene.add(rimLight);

    // Warm Garnet/Amber Accent Light from lower right
    const warmLight = new THREE.DirectionalLight(0xE8492A, 1.2);
    warmLight.position.set(9, -6, 4);
    scene.add(warmLight);

    // Center Glow
    const centerGlow = new THREE.PointLight(0x4FC7C4, 2.4, 18);
    centerGlow.position.set(0, 0, 4);
    scene.add(centerGlow);

    // 3. Anemos Aircraft Materials
    // A) Luminous Anemos Breeze Teal
    const breezeMat = new THREE.MeshStandardMaterial({
      color: 0x4FC7C4,
      roughness: 0.08,
      metalness: 0.35,
      emissive: 0x0B7A85,
      emissiveIntensity: 0.55
    });

    // B) Aerospace Titanium / Chrome
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xE8F4F5,
      roughness: 0.1,
      metalness: 0.88,
      envMapIntensity: 1.6
    });

    // C) Anemos Deep Petrol / Night Surface
    const deepMat = new THREE.MeshStandardMaterial({
      color: 0x14232A,
      roughness: 0.18,
      metalness: 0.82
    });

    // D) Anemos Garnet Flame Accent
    const garnetMat = new THREE.MeshStandardMaterial({
      color: 0xFF6A4A,
      roughness: 0.12,
      metalness: 0.35,
      emissive: 0xE8492A,
      emissiveIntensity: 0.65
    });

    // E) Mist / Pearlescent Ice
    const mistMat = new THREE.MeshStandardMaterial({
      color: 0xBFE6E4,
      roughness: 0.2,
      metalness: 0.15,
      emissive: 0x1F3A45,
      emissiveIntensity: 0.35
    });

    // 4. Create Bodies
    const NUM_BALLOONS = width < 768 ? 85 : 130;
    const spheres = [];
    const sphereGeom = new THREE.SphereGeometry(1, 28, 28);

    for (let i = 0; i < NUM_BALLOONS; i++) {
      const rand = Math.random();
      let r;
      if (rand < 0.07) {
        r = 1.15 + Math.random() * 0.95; // Large hero spheres
      } else if (rand < 0.3) {
        r = 0.55 + Math.random() * 0.45; // Medium
      } else {
        r = 0.16 + Math.random() * 0.32; // Small droplets
      }

      // Material assignment based on Anemos brand distribution
      let mat;
      if (rand < 0.36) {
        mat = breezeMat; // Signature Teal
      } else if (rand < 0.62) {
        mat = titaniumMat; // Aerospace Chrome
      } else if (rand < 0.78) {
        mat = deepMat; // Deep Petrol
      } else if (rand < 0.89) {
        mat = garnetMat; // Flame Garnet
      } else {
        mat = mistMat; // Mist Ice
      }

      const mesh = new THREE.Mesh(sphereGeom, mat);
      mesh.scale.setScalar(r);

      // Horizontal cluster spread across center
      const spreadX = (Math.random() - 0.5) * (width < 768 ? 7.5 : 12.5);
      const spreadY = (Math.random() - 0.5) * (width < 768 ? 6 : 4.8);
      const spreadZ = (Math.random() - 0.5) * 3.8;

      mesh.position.set(spreadX, spreadY, spreadZ);
      scene.add(mesh);

      spheres.push({
        mesh,
        radius: r,
        mass: Math.max(0.1, r * r * r * 2.4),
        pos: mesh.position,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.6
        ),
        seed: Math.random() * 200
      });
    }

    // 5. Pointer Interaction
    const mouse = new THREE.Vector2(-9999, -9999);
    const mouse3D = new THREE.Vector3(9999, 9999, 0);
    const prevMouse3D = new THREE.Vector3(9999, 9999, 0);
    const mouseVel3D = new THREE.Vector3(0, 0, 0);
    const raycaster = new THREE.Raycaster();
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    function updatePointer(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(planeZ, mouse3D);

      if (prevMouse3D.x < 5000) {
        mouseVel3D.subVectors(mouse3D, prevMouse3D);
      }
      prevMouse3D.copy(mouse3D);
    }

    window.addEventListener('pointermove', (e) => {
      updatePointer(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      mouse3D.set(9999, 9999, 0);
      prevMouse3D.set(9999, 9999, 0);
      mouseVel3D.set(0, 0, 0);
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // 6. Physics Loop & Visibility Culling
    let isVisible = true;
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    }, { threshold: 0.05 });
    observer.observe(container);

    const clock = new THREE.Clock();
    const tempDelta = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const tempRelVel = new THREE.Vector3();
    const tempPush = new THREE.Vector3();

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible) return;

      const dt = Math.min(clock.getDelta(), 0.04);
      const time = clock.getElapsedTime();

      // Camera parallax
      if (mouse3D.x < 1000) {
        camera.position.x += (mouse.x * 0.7 - camera.position.x) * 0.05;
        camera.position.y += (mouse.y * 0.45 - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);
      }

      const MOUSE_RADIUS = width < 768 ? 3.0 : 4.0;
      const MOUSE_FORCE = 60.0;
      const CENTER_GRAVITY = 1.35;
      const DAMPING = 0.945;

      for (let i = 0; i < spheres.length; i++) {
        const s = spheres[i];

        // A) Pull toward center
        s.vel.x -= s.pos.x * CENTER_GRAVITY * dt;
        s.vel.y -= s.pos.y * CENTER_GRAVITY * 1.25 * dt;
        s.vel.z -= s.pos.z * CENTER_GRAVITY * 2.2 * dt;

        // B) Organic breathing motion
        s.vel.x += Math.sin(time * 0.75 + s.seed) * 0.09 * dt;
        s.vel.y += Math.cos(time * 0.65 + s.seed * 1.4) * 0.09 * dt;
        s.vel.z += Math.sin(time * 0.5 + s.seed * 0.8) * 0.05 * dt;

        // C) Mouse repulsion & drag impulse
        const distToMouse = s.pos.distanceTo(mouse3D);
        if (distToMouse < MOUSE_RADIUS) {
          tempPush.subVectors(s.pos, mouse3D).normalize();
          const factor = (1.0 - distToMouse / MOUSE_RADIUS);
          const pushMag = factor * MOUSE_FORCE;
          s.vel.addScaledVector(tempPush, (pushMag / s.mass) * dt);

          if (mouseVel3D.lengthSq() > 0.001) {
            s.vel.addScaledVector(mouseVel3D, 2.6 * factor);
          }
        }

        // D) Collisions between spheres
        for (let j = i + 1; j < spheres.length; j++) {
          const other = spheres[j];
          tempDelta.subVectors(s.pos, other.pos);
          const distSq = tempDelta.lengthSq();
          const minDist = s.radius + other.radius;

          if (distSq < minDist * minDist && distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            tempNormal.copy(tempDelta).divideScalar(dist);
            const overlap = (minDist - dist) * 0.5;

            s.pos.addScaledVector(tempNormal, overlap * 0.78);
            other.pos.addScaledVector(tempNormal, -overlap * 0.78);

            tempRelVel.subVectors(s.vel, other.vel);
            const velNormal = tempRelVel.dot(tempNormal);

            if (velNormal < 0) {
              const impulse = -1.18 * velNormal / (1 / s.mass + 1 / other.mass);
              s.vel.addScaledVector(tempNormal, impulse / s.mass);
              other.vel.addScaledVector(tempNormal, -impulse / other.mass);
            }
          }
        }

        // E) Integrate velocity & apply drag
        s.pos.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(DAMPING);
      }

      mouseVel3D.multiplyScalar(0.7);

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroBalloons);
  } else {
    initHeroBalloons();
  }
})();
