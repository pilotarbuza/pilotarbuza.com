/* ============================================================
   Lusion-style 3D Fluid Balloons Simulation (Three.js)
   Features:
   - Dynamic fluid particle physics with sphere collision
   - Viscous drag & center spring attractor
   - High-end monochrome studio lighting with specular highlights
   - Interactive pointer repulsion field & swipe velocity
   - Viewport visibility optimization via IntersectionObserver
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
    renderer.toneMappingExposure = 1.15;

    // 2. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0x222228, 2.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(6, 10, 12);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xaaccff, 1.8);
    rimLight.position.set(-8, -4, 6);
    scene.add(rimLight);

    const centerGlow = new THREE.PointLight(0xffffff, 2.0, 16);
    centerGlow.position.set(0, 0, 3.5);
    scene.add(centerGlow);

    // 3. Materials
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.1,
      metalness: 0.7,
      envMapIntensity: 1.5
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.1,
      emissive: 0x223344,
      emissiveIntensity: 0.4
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.18,
      metalness: 0.85
    });

    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.05,
      emissive: 0x444444,
      emissiveIntensity: 0.5
    });

    // 4. Create Bodies
    const NUM_BALLOONS = width < 768 ? 75 : 120;
    const spheres = [];
    const sphereGeom = new THREE.SphereGeometry(1, 28, 28);

    for (let i = 0; i < NUM_BALLOONS; i++) {
      const rand = Math.random();
      let r;
      if (rand < 0.06) {
        r = 1.1 + Math.random() * 0.9; // Large hero spheres
      } else if (rand < 0.28) {
        r = 0.55 + Math.random() * 0.45; // Medium
      } else {
        r = 0.16 + Math.random() * 0.32; // Droplets
      }

      let mat;
      if (rand < 0.32) mat = glowMat;
      else if (rand < 0.65) mat = chromeMat;
      else if (rand < 0.88) mat = darkMat;
      else mat = pearlMat;

      const mesh = new THREE.Mesh(sphereGeom, mat);
      mesh.scale.setScalar(r);

      // Elongated horizontal distribution across center
      const spreadX = (Math.random() - 0.5) * (width < 768 ? 7 : 11.5);
      const spreadY = (Math.random() - 0.5) * (width < 768 ? 6 : 4.5);
      const spreadZ = (Math.random() - 0.5) * 3.5;

      mesh.position.set(spreadX, spreadY, spreadZ);
      scene.add(mesh);

      spheres.push({
        mesh,
        radius: r,
        mass: Math.max(0.1, r * r * r * 2.5),
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
        camera.position.x += (mouse.x * 0.8 - camera.position.x) * 0.05;
        camera.position.y += (mouse.y * 0.5 - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);
      }

      const MOUSE_RADIUS = width < 768 ? 2.8 : 3.8;
      const MOUSE_FORCE = 55.0;
      const CENTER_GRAVITY = 1.35;
      const DAMPING = 0.945;

      for (let i = 0; i < spheres.length; i++) {
        const s = spheres[i];

        // A) Pull toward center
        s.vel.x -= s.pos.x * CENTER_GRAVITY * dt;
        s.vel.y -= s.pos.y * CENTER_GRAVITY * 1.25 * dt; // slightly stronger Y pulls into horizontal strip
        s.vel.z -= s.pos.z * CENTER_GRAVITY * 2.2 * dt;  // keep flat in Z

        // B) Organic breathing motion
        s.vel.x += Math.sin(time * 0.7 + s.seed) * 0.08 * dt;
        s.vel.y += Math.cos(time * 0.6 + s.seed * 1.4) * 0.08 * dt;
        s.vel.z += Math.sin(time * 0.5 + s.seed * 0.8) * 0.05 * dt;

        // C) Mouse repulsion & drag impulse
        const distToMouse = s.pos.distanceTo(mouse3D);
        if (distToMouse < MOUSE_RADIUS) {
          tempPush.subVectors(s.pos, mouse3D).normalize();
          const factor = (1.0 - distToMouse / MOUSE_RADIUS);
          const pushMag = factor * MOUSE_FORCE;
          s.vel.addScaledVector(tempPush, (pushMag / s.mass) * dt);

          // Add mouse sweep fling
          if (mouseVel3D.lengthSq() > 0.001) {
            s.vel.addScaledVector(mouseVel3D, 2.5 * factor);
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

            // Separate
            s.pos.addScaledVector(tempNormal, overlap * 0.75);
            other.pos.addScaledVector(tempNormal, -overlap * 0.75);

            // Elastic bounce
            tempRelVel.subVectors(s.vel, other.vel);
            const velNormal = tempRelVel.dot(tempNormal);

            if (velNormal < 0) {
              const impulse = -1.15 * velNormal / (1 / s.mass + 1 / other.mass);
              s.vel.addScaledVector(tempNormal, impulse / s.mass);
              other.vel.addScaledVector(tempNormal, -impulse / other.mass);
            }
          }
        }

        // E) Integrate velocity & apply drag
        s.pos.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(DAMPING);
      }

      // Decay mouse velocity
      mouseVel3D.multiplyScalar(0.7);

      renderer.render(scene, camera);
    }

    animate();

    // Resize handler
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
