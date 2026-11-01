/**
 * pilotarbuza.com — 3D Fluid Sphere Vortex & Aerodynamic Liquid Streak
 * 
 * Exact recreation of Lusion's fluid particle architecture:
 *   - Thousands of tangible 3D shaded spheres with spherical normals, specular highlights,
 *     diffuse lighting, ambient occlusion, and Fresnel rims (Normal Blending with true depth).
 *   - Foreground glowing bokeh orbs with soft bloom.
 *   - Central aerodynamic liquid chrome streak undulating with fluid tension.
 *   - Interactive physics: central attractor, vortex angular momentum, 3D mouse wake,
 *     and click/touch impulse explosion.
 *   - Palette: Anemos Aircraft Brandbook (Milk Ground, Breeze Teal, Deep Petrol, Garnet Flame, Mist Ice).
 */

(function () {
  'use strict';

  var canvas = document.getElementById('hero-balloons-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // 1. Scene, Camera, Renderer
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 15);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  // 2. Anemos Color Palette
  var COLOR_MILK   = new THREE.Color('#FFF8F0'); // 45% porcelain white
  var COLOR_BREEZE = new THREE.Color('#4FC7C4'); // 25% vibrant teal
  var COLOR_ICE    = new THREE.Color('#BFE6E4'); // 15% pearlescent mist
  var COLOR_DEEP   = new THREE.Color('#1F3A45'); // 10% dark petrol
  var COLOR_GARNET = new THREE.Color('#FF6A4A'); // 5% accent flame

  var PALETTE = [
    { color: COLOR_MILK,   weight: 0.45, roughness: 0.25, metallic: 0.3 },
    { color: COLOR_BREEZE, weight: 0.25, roughness: 0.15, metallic: 0.6 },
    { color: COLOR_ICE,    weight: 0.15, roughness: 0.20, metallic: 0.4 },
    { color: COLOR_DEEP,   weight: 0.10, roughness: 0.10, metallic: 0.8 },
    { color: COLOR_GARNET, weight: 0.05, roughness: 0.15, metallic: 0.5 }
  ];

  // 3. Particle Cloud Setup
  var isMobile = window.innerWidth <= 812;
  var PARTICLE_COUNT = isMobile ? 8500 : 15000;

  var positions     = new Float32Array(PARTICLE_COUNT * 3);
  var basePos       = new Float32Array(PARTICLE_COUNT * 3);
  var velocities    = new Float32Array(PARTICLE_COUNT * 3);
  var colors        = new Float32Array(PARTICLE_COUNT * 3);
  var sizes         = new Float32Array(PARTICLE_COUNT);
  var glowFlags     = new Float32Array(PARTICLE_COUNT);
  var randomSeeds   = new Float32Array(PARTICLE_COUNT);

  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var i3 = i * 3;
    var t = i / PARTICLE_COUNT;

    // Pick palette
    var rPick = Math.random();
    var acc = 0;
    var chosen = PALETTE[0];
    for (var p = 0; p < PALETTE.length; p++) {
      acc += PALETTE[p].weight;
      if (rPick <= acc) {
        chosen = PALETTE[p];
        break;
      }
    }

    colors[i3 + 0] = chosen.color.r;
    colors[i3 + 1] = chosen.color.g;
    colors[i3 + 2] = chosen.color.b;

    // Organic vortex distribution with diagonal tilt
    // Spiral swirl around inclined diagonal axis
    var angle = t * Math.PI * 18 + (Math.random() - 0.5) * 1.8;
    var radius = Math.pow(Math.random(), 1.5) * 4.6 + 0.15;
    var zDist = (Math.random() - 0.5) * 4.8;

    var x = Math.cos(angle) * radius * 1.35;
    var y = Math.sin(angle) * radius * 0.95 + x * 0.28;
    var z = zDist + (x * 0.2 - y * 0.15);

    // Peripheral droplets
    if (Math.random() < 0.14) {
      x *= 1.6 + Math.random() * 0.6;
      y *= 1.6 + Math.random() * 0.6;
      z *= 1.5;
    }

    positions[i3 + 0] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    basePos[i3 + 0] = x;
    basePos[i3 + 1] = y;
    basePos[i3 + 2] = z;

    velocities[i3 + 0] = (Math.random() - 0.5) * 0.015;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.015;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.015;

    // Sizes: variable radii from fine mist to foreground bokeh orbs
    var rSize = Math.random();
    if (rSize > 0.988) {
      // Large glowing foreground bokeh orbs
      sizes[i] = isMobile ? 38 : 52;
      glowFlags[i] = 1.0;
    } else if (rSize > 0.92) {
      // Medium shiny spheres
      sizes[i] = isMobile ? 18 : 26;
      glowFlags[i] = 0.5;
    } else if (rSize > 0.60) {
      // Standard droplets
      sizes[i] = isMobile ? 8 : 12;
      glowFlags[i] = 0.0;
    } else {
      // Fine spray
      sizes[i] = isMobile ? 4 : 6;
      glowFlags[i] = 0.0;
    }

    randomSeeds[i] = Math.random() * 100.0;
  }

  var particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  particleGeometry.setAttribute('isGlow', new THREE.BufferAttribute(glowFlags, 1));
  particleGeometry.setAttribute('seed', new THREE.BufferAttribute(randomSeeds, 1));

  // True 3D Sphere Point Shader (Calculates exact sphere normals on GPU)
  var particleVertexShader = [
    'attribute float size;',
    'attribute vec3 color;',
    'attribute float isGlow;',
    'attribute float seed;',
    'varying vec3 vColor;',
    'varying float vGlow;',
    'varying float vDepth;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'void main() {',
    '  vColor = color;',
    '  vGlow = isGlow;',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  vDepth = -mvPosition.z;',
    '  float pulse = 1.0 + 0.06 * sin(uTime * 1.6 + seed);',
    '  gl_PointSize = size * uPixelRatio * pulse * (15.0 / -mvPosition.z);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '}'
  ].join('\n');

  var particleFragmentShader = [
    'varying vec3 vColor;',
    'varying float vGlow;',
    'varying float vDepth;',
    'uniform vec3 uLightPos;',
    'void main() {',
    '  vec2 coord = gl_PointCoord - vec2(0.5);',
    '  float r2 = dot(coord, coord);',
    '  if (r2 > 0.25) discard;',
    '',
    '  // Calculate exact 3D sphere normal from 2D disc',
    '  float z = sqrt(max(0.0, 0.25 - r2));',
    '  vec3 normal = normalize(vec3(coord.x * 2.0, -coord.y * 2.0, z * 2.0));',
    '',
    '  // Light direction (key light from top-right-front)',
    '  vec3 lightDir = normalize(vec3(0.5, 0.6, 0.8));',
    '  vec3 viewDir = vec3(0.0, 0.0, 1.0);',
    '',
    '  // Diffuse shading with soft ambient wrap',
    '  float diff = max(0.0, dot(normal, lightDir));',
    '  float ambient = 0.22 + 0.15 * normal.y;',
    '',
    '  // Specular gloss reflection',
    '  vec3 halfVec = normalize(lightDir + viewDir);',
    '  float spec = pow(max(0.0, dot(normal, halfVec)), 28.0) * 0.85;',
    '',
    '  // Fresnel rim glow',
    '  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.8) * 0.45;',
    '',
    '  // Ambient occlusion towards droplet edge',
    '  float ao = smoothstep(0.5, 0.25, length(coord));',
    '',
    '  vec3 litColor = vColor * (diff * 0.75 + ambient) + vec3(spec) + vColor * fresnel;',
    '  litColor *= (ao * 0.4 + 0.6);',
    '',
    '  // Extra soft glow for bokeh orbs',
    '  if (vGlow > 0.0) {',
    '    litColor += vColor * (vGlow * 0.35);',
    '  }',
    '',
    '  // Smooth anti-aliased edge',
    '  float alpha = smoothstep(0.5, 0.46, length(coord));',
    '',
    '  gl_FragColor = vec4(litColor, alpha);',
    '}'
  ].join('\n');

  var particleUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uLightPos: { value: new THREE.Vector3(5, 8, 10) }
  };

  var particleMaterial = new THREE.ShaderMaterial({
    uniforms: particleUniforms,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NormalBlending
  });

  var particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);

  // 4. Central Aerodynamic Liquid Chrome Streak
  // Smooth organic ribbon cutting diagonally across the cluster (like Lusion)
  var STREAK_POINTS = 16;
  var streakCurvePoints = [];
  var streakBasePoints = [];

  for (var k = 0; k < STREAK_POINTS; k++) {
    var frac = (k / (STREAK_POINTS - 1)) * 2.0 - 1.0; // -1 to 1
    // Smooth aerodynamic S-curve / liquid stream
    var sx = frac * 5.2;
    var sy = frac * 1.8 + Math.sin(frac * Math.PI) * 0.8;
    var sz = Math.cos(frac * Math.PI * 1.2) * 1.1;

    streakBasePoints.push(new THREE.Vector3(sx, sy, sz));
    streakCurvePoints.push(new THREE.Vector3(sx, sy, sz));
  }

  var streakCurve = new THREE.CatmullRomCurve3(streakCurvePoints, false, 'centripetal', 0.5);
  // Variable thickness tube geometry for tapered aerodynamic stream
  var streakGeometry = new THREE.TubeGeometry(streakCurve, 80, 0.24, 20, false);

  var streakMaterial = new THREE.MeshStandardMaterial({
    color: 0x1F3A45,
    roughness: 0.12,
    metalness: 0.94,
    emissive: 0x0B7A85,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.92
  });

  var streakMesh = new THREE.Mesh(streakGeometry, streakMaterial);
  scene.add(streakMesh);

  // Directional lighting for the streak
  var dirLight = new THREE.DirectionalLight(0xFFF8F0, 2.2);
  dirLight.position.set(5, 8, 10);
  scene.add(dirLight);

  var tealLight = new THREE.PointLight(0x4FC7C4, 2.5, 20);
  tealLight.position.set(-4, -3, 5);
  scene.add(tealLight);

  var flameLight = new THREE.PointLight(0xFF6A4A, 1.8, 18);
  flameLight.position.set(4, -2, 6);
  scene.add(flameLight);

  // 5. Interactive Physics State
  var mouse = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };

  var raycaster = new THREE.Raycaster();
  var mouse3D = new THREE.Vector3(0, 0, 0);
  var mousePrev3D = new THREE.Vector3(0, 0, 0);
  var mouseVelocity3D = new THREE.Vector3(0, 0, 0);
  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var planeIntersect = new THREE.Vector3();

  function onPointerMove(e) {
    var cx = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var cy = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    mouse.targetX = (cx / window.innerWidth) * 2 - 1;
    mouse.targetY = -(cy / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(mouse.targetX, mouse.targetY), camera);
    raycaster.ray.intersectPlane(planeZ, planeIntersect);

    if (planeIntersect) {
      mouseVelocity3D.copy(planeIntersect).sub(mouse3D).multiplyScalar(0.45);
      mouse3D.copy(planeIntersect);
    }
  }

  // Click / touch impulse explosion (Lusion applyImpulse)
  function applyImpulse(strength) {
    var force = strength || 0.55;
    var posAttr = particleGeometry.attributes.position;
    var posArray = posAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      var px = posArray[i3 + 0];
      var py = posArray[i3 + 1];
      var pz = posArray[i3 + 2];

      var dist = Math.sqrt(px * px + py * py + pz * pz) + 0.15;
      var burst = (force / dist) * (0.8 + Math.random() * 0.7);

      velocities[i3 + 0] += (px / dist) * burst + (Math.random() - 0.5) * 0.14;
      velocities[i3 + 1] += (py / dist) * burst + (Math.random() - 0.5) * 0.14;
      velocities[i3 + 2] += (pz / dist) * burst + (Math.random() - 0.5) * 0.18;
    }

    streakMaterial.emissiveIntensity = 1.4;
    setTimeout(function () {
      streakMaterial.emissiveIntensity = 0.35;
    }, 450);
  }

  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  canvas.addEventListener('click', function () {
    applyImpulse(0.65);
  });
  canvas.addEventListener('touchstart', function () {
    applyImpulse(0.65);
  }, { passive: true });

  // 6. Physics Animation Loop
  var clock = new THREE.Clock();
  var GRAVITY_FACTOR = 0.042;
  var DAMPING = 0.942;
  var VORTEX_SPEED = 0.40;

  function animate() {
    requestAnimationFrame(animate);

    var delta = Math.min(clock.getDelta(), 0.05);
    var time = clock.getElapsedTime();

    particleUniforms.uTime.value = time;

    // Smooth mouse inertia
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;

    // Camera look parallax
    camera.position.x = mouse.x * 1.1;
    camera.position.y = mouse.y * 0.75;
    camera.lookAt(0, 0, 0);

    // Update particles physics
    var posAttr = particleGeometry.attributes.position;
    var posArray = posAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      var px = posArray[i3 + 0];
      var py = posArray[i3 + 1];
      var pz = posArray[i3 + 2];

      var vx = velocities[i3 + 0];
      var vy = velocities[i3 + 1];
      var vz = velocities[i3 + 2];

      // 1. Central Attractor to base vortex coordinates
      var bx = basePos[i3 + 0];
      var by = basePos[i3 + 1];
      var bz = basePos[i3 + 2];

      var dx = bx - px;
      var dy = by - py;
      var dz = bz - pz;

      vx += dx * GRAVITY_FACTOR;
      vy += dy * GRAVITY_FACTOR;
      vz += dz * GRAVITY_FACTOR;

      // 2. Swirling Vortex Angular Velocity around diagonal axis
      var distCenter = Math.sqrt(px * px + py * py) + 0.1;
      var tangential = (VORTEX_SPEED / distCenter) * 0.016;
      vx += -py * tangential;
      vy +=  px * tangential;

      // 3. 3D Mouse Fluid Repulsion Wake
      var dmx = px - mouse3D.x;
      var dmy = py - mouse3D.y;
      var dmz = pz - mouse3D.z;
      var distMouseSq = dmx * dmx + dmy * dmy + dmz * dmz;

      if (distMouseSq < 15.0) {
        var distMouse = Math.sqrt(distMouseSq) + 0.01;
        var push = (1.0 - distMouse / 3.87) * 0.095;
        vx += (dmx / distMouse) * push + mouseVelocity3D.x * 0.03;
        vy += (dmy / distMouse) * push + mouseVelocity3D.y * 0.03;
        vz += (dmz / distMouse) * push;
      }

      // 4. Damping & Integration
      vx *= DAMPING;
      vy *= DAMPING;
      vz *= DAMPING;

      posArray[i3 + 0] += vx;
      posArray[i3 + 1] += vy;
      posArray[i3 + 2] += vz;

      velocities[i3 + 0] = vx;
      velocities[i3 + 1] = vy;
      velocities[i3 + 2] = vz;
    }

    posAttr.needsUpdate = true;

    // Organic drift rotation
    particleSystem.rotation.z = time * 0.028;
    particleSystem.rotation.y = Math.sin(time * 0.04) * 0.10;

    // 7. Update Liquid Streak Mesh
    for (var k = 0; k < STREAK_POINTS; k++) {
      var base = streakBasePoints[k];
      var current = streakCurvePoints[k];
      var wave = Math.sin(time * 1.6 + k * 0.5) * 0.24;
      var cosWave = Math.cos(time * 1.3 + k * 0.4) * 0.18;

      var distM = Math.sqrt(
        Math.pow(base.x - mouse3D.x, 2) + Math.pow(base.y - mouse3D.y, 2)
      );
      var pushM = Math.max(0, 1.0 - distM / 4.5) * 0.5;

      current.x = base.x + wave + (base.x - mouse3D.x) * pushM * 0.12;
      current.y = base.y + cosWave + (base.y - mouse3D.y) * pushM * 0.12;
      current.z = base.z + Math.sin(time * 1.1 + k) * 0.28;
    }

    streakGeometry.dispose();
    streakCurve = new THREE.CatmullRomCurve3(streakCurvePoints, false, 'centripetal', 0.5);
    streakGeometry = new THREE.TubeGeometry(streakCurve, 80, 0.24, 20, false);
    streakMesh.geometry = streakGeometry;

    renderer.render(scene, camera);
  }

  animate();

  // 8. Responsive Resize
  function onResize() {
    var width = window.innerWidth;
    var height = window.innerHeight;

    camera.aspect = width / height;
    camera.fov = width <= 812 ? 48 : 36;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    particleUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  window.addEventListener('resize', onResize);
  onResize();

})();
