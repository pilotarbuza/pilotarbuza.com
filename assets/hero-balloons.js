/**
 * pilotarbuza.com — 3D Fluid Particle Nebula & Viscous Ribbon
 * 
 * Recreates the exact dynamic behavior, particle density, depth-of-field bokeh,
 * fluid vortex physics, and interactive impulse explosions from Lusion,
 * shaded in the official Anemos Aircraft brandbook palette:
 *   - Titanium Silk / White: #FFF8F0 / #FFFFFF
 *   - Luminous Breeze Teal:  #4FC7C4 / #0B7A85
 *   - Deep Petrol:           #14232A / #1F3A45
 *   - Garnet Flame Accent:   #FF6A4A / #E8492A
 *   - Pearlescent Ice:       #BFE6E4
 */

(function () {
  'use strict';

  var canvas = document.getElementById('hero-balloons-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // 1. Scene, Camera, Renderer
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 16);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  // 2. Anemos Aircraft Color Palette (RGB Vector3 for Shaders)
  var COLOR_WHITE   = new THREE.Color('#FFF8F0');
  var COLOR_BREEZE  = new THREE.Color('#4FC7C4');
  var COLOR_DEEP    = new THREE.Color('#1F3A45');
  var COLOR_GARNET  = new THREE.Color('#FF6A4A');
  var COLOR_ICE     = new THREE.Color('#BFE6E4');

  // Palette array for particle assignments
  var PALETTE = [
    { color: COLOR_WHITE,  weight: 0.38, glow: 1.0 },
    { color: COLOR_BREEZE, weight: 0.28, glow: 0.8 },
    { color: COLOR_ICE,    weight: 0.18, glow: 0.7 },
    { color: COLOR_DEEP,   weight: 0.10, glow: 0.3 },
    { color: COLOR_GARNET, weight: 0.06, glow: 0.9 }
  ];

  // 3. Particle System Configuration
  var isMobile = window.innerWidth <= 812;
  var PARTICLE_COUNT = isMobile ? 8000 : 16000;

  var positions   = new Float32Array(PARTICLE_COUNT * 3);
  var basePos     = new Float32Array(PARTICLE_COUNT * 3);
  var velocities  = new Float32Array(PARTICLE_COUNT * 3);
  var colors      = new Float32Array(PARTICLE_COUNT * 3);
  var sizes       = new Float32Array(PARTICLE_COUNT);
  var alphas      = new Float32Array(PARTICLE_COUNT);
  var randomSeeds = new Float32Array(PARTICLE_COUNT);

  // Helper random
  function pseudoRandom(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  // Generate particles along an organic diagonal fluid vortex
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var i3 = i * 3;
    var t = i / PARTICLE_COUNT;
    
    // Pick color by weight
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

    // Organic vortex distribution: spiral arm + central cluster
    var angle = t * Math.PI * 14 + (Math.random() - 0.5) * 1.5;
    var radius = Math.pow(Math.random(), 1.6) * 4.8 + 0.2;
    var zDist = (Math.random() - 0.5) * 5.5;

    // Tilt vortex along diagonal axis (matching Lusion splash angle)
    var x = Math.cos(angle) * radius * 1.25;
    var y = Math.sin(angle) * radius * 0.85 + x * 0.3;
    var z = zDist + (x * 0.25 - y * 0.2);

    // Some scattered peripheral spray droplets
    if (Math.random() < 0.12) {
      x *= 1.8 + Math.random() * 0.8;
      y *= 1.8 + Math.random() * 0.8;
      z *= 1.6;
    }

    positions[i3 + 0] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    basePos[i3 + 0] = x;
    basePos[i3 + 1] = y;
    basePos[i3 + 2] = z;

    velocities[i3 + 0] = (Math.random() - 0.5) * 0.02;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.02;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;

    // Varied particle sizes: mostly fine droplets, with some large glowing bokeh orbs
    var rSize = Math.random();
    if (rSize > 0.985) {
      // Rare giant foreground bokeh orbs
      sizes[i] = isMobile ? 32 : 46;
      alphas[i] = 0.55;
    } else if (rSize > 0.92) {
      // Medium glowing bubbles
      sizes[i] = isMobile ? 16 : 24;
      alphas[i] = 0.85;
    } else if (rSize > 0.65) {
      // Standard droplets
      sizes[i] = isMobile ? 7 : 11;
      alphas[i] = 0.95;
    } else {
      // Micro mist particles
      sizes[i] = isMobile ? 3.5 : 5.5;
      alphas[i] = 0.75;
    }

    randomSeeds[i] = Math.random() * 100.0;
  }

  var particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  particleGeometry.setAttribute('seed', new THREE.BufferAttribute(randomSeeds, 1));

  // Custom Point Shader with smooth circular drop, specular highlight, and bokeh blur
  var particleVertexShader = [
    'attribute float size;',
    'attribute float alpha;',
    'attribute vec3 color;',
    'attribute float seed;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vZ;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'void main() {',
    '  vColor = color;',
    '  vAlpha = alpha;',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  vZ = -mvPosition.z;',
    '  // Size attenuation with subtle harmonic pulse',
    '  float pulse = 1.0 + 0.08 * sin(uTime * 1.5 + seed);',
    '  gl_PointSize = size * uPixelRatio * pulse * (16.0 / -mvPosition.z);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '}'
  ].join('\n');

  var particleFragmentShader = [
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vZ;',
    'void main() {',
    '  // Circle coord from center',
    '  vec2 coord = gl_PointCoord - vec2(0.5);',
    '  float dist = length(coord);',
    '  if (dist > 0.5) discard;',
    '',
    '  // Radial smooth falloff (droplet surface)',
    '  float edgeSoft = smoothstep(0.5, 0.35, dist);',
    '',
    '  // Specular top-right highlight (droplet gloss)',
    '  vec2 lightDir = normalize(vec2(0.35, -0.35));',
    '  float spec = smoothstep(0.25, 0.05, length(coord - lightDir * 0.16));',
    '',
    '  // Emissive core glow',
    '  float coreGlow = smoothstep(0.4, 0.0, dist);',
    '',
    '  vec3 finalColor = vColor + vec3(spec * 0.65) + vec3(coreGlow * 0.2);',
    '  float finalAlpha = vAlpha * edgeSoft;',
    '',
    '  gl_FragColor = vec4(finalColor, finalAlpha);',
    '}'
  ].join('\n');

  var particleUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
  };

  var particleMaterial = new THREE.ShaderMaterial({
    uniforms: particleUniforms,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  var particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);

  // 4. Central Viscous Liquid Ribbon
  // A dynamic Catmull-Rom tube that twists diagonally across the vortex core
  var RIBBON_POINTS_COUNT = 14;
  var ribbonCurvePoints = [];
  var ribbonBasePoints = [];

  for (var k = 0; k < RIBBON_POINTS_COUNT; k++) {
    var fraction = (k / (RIBBON_POINTS_COUNT - 1)) * 2.0 - 1.0; // -1 to 1
    var rx = fraction * 4.6;
    var ry = fraction * 2.2 + Math.sin(fraction * Math.PI) * 1.1;
    var rz = Math.cos(fraction * Math.PI * 1.5) * 1.4;

    ribbonBasePoints.push(new THREE.Vector3(rx, ry, rz));
    ribbonCurvePoints.push(new THREE.Vector3(rx, ry, rz));
  }

  var ribbonCurve = new THREE.CatmullRomCurve3(ribbonCurvePoints, false, 'centripetal', 0.5);
  var ribbonGeometry = new THREE.TubeGeometry(ribbonCurve, 72, 0.32, 16, false);

  // Metallic Chrome / Titanium Shading for the Ribbon
  var ribbonMaterial = new THREE.MeshStandardMaterial({
    color: 0x14232A,
    roughness: 0.15,
    metalness: 0.92,
    emissive: 0x0B7A85,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.88,
    wireframe: false
  });

  var ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
  scene.add(ribbonMesh);

  // Lights for the liquid ribbon
  var ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  var pointLight1 = new THREE.PointLight(0x4FC7C4, 3.5, 30);
  pointLight1.position.set(5, 6, 8);
  scene.add(pointLight1);

  var pointLight2 = new THREE.PointLight(0xFF6A4A, 2.0, 25);
  pointLight2.position.set(-6, -4, 6);
  scene.add(pointLight2);

  var pointLight3 = new THREE.PointLight(0xFFF8F0, 2.5, 20);
  pointLight3.position.set(0, 0, 10);
  scene.add(pointLight3);

  // 5. Interactive Physics State
  var mouse = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    isDown: false,
    radius: 3.2
  };

  var raycaster = new THREE.Raycaster();
  var mouse3D = new THREE.Vector3(0, 0, 0);
  var mousePrev3D = new THREE.Vector3(0, 0, 0);
  var mouseVelocity3D = new THREE.Vector3(0, 0, 0);

  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var targetPlaneIntersect = new THREE.Vector3();

  // Mouse move handler
  function onPointerMove(e) {
    var clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    mouse.targetX = (clientX / window.innerWidth) * 2 - 1;
    mouse.targetY = -(clientY / window.innerHeight) * 2 + 1;

    // Raycast to Z=0 plane
    raycaster.setFromCamera(new THREE.Vector2(mouse.targetX, mouse.targetY), camera);
    raycaster.ray.intersectPlane(planeZ, targetPlaneIntersect);
    
    if (targetPlaneIntersect) {
      mouseVelocity3D.copy(targetPlaneIntersect).sub(mouse3D).multiplyScalar(0.4);
      mouse3D.copy(targetPlaneIntersect);
    }
  }

  // Click impulse burst (Lusion e.applyImpulse() recreation)
  function applyImpulse(strength) {
    var forceMagnitude = strength || 0.45;
    var posAttr = particleGeometry.attributes.position;
    var posArray = posAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      var px = posArray[i3 + 0];
      var py = posArray[i3 + 1];
      var pz = posArray[i3 + 2];

      var dist = Math.sqrt(px * px + py * py + pz * pz) + 0.1;
      var burst = (forceMagnitude / dist) * (0.8 + Math.random() * 0.6);

      velocities[i3 + 0] += (px / dist) * burst + (Math.random() - 0.5) * 0.12;
      velocities[i3 + 1] += (py / dist) * burst + (Math.random() - 0.5) * 0.12;
      velocities[i3 + 2] += (pz / dist) * burst + (Math.random() - 0.5) * 0.15;
    }

    // Shockwave pulse on ribbon
    ribbonMaterial.emissiveIntensity = 1.2;
    setTimeout(function () {
      ribbonMaterial.emissiveIntensity = 0.28;
    }, 450);
  }

  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  canvas.addEventListener('click', function () {
    applyImpulse(0.55);
  });
  canvas.addEventListener('touchstart', function () {
    applyImpulse(0.55);
  }, { passive: true });

  // 6. Physics and Animation Loop
  var clock = new THREE.Clock();
  var GRAVITY_FACTOR = 0.038;
  var DAMPING = 0.945;
  var VORTEX_SPEED = 0.45;

  function animate() {
    requestAnimationFrame(animate);

    var delta = Math.min(clock.getDelta(), 0.05);
    var time = clock.getElapsedTime();

    particleUniforms.uTime.value = time;

    // Smooth mouse inertia
    mouse.x += (mouse.targetX - mouse.x) * 0.1;
    mouse.y += (mouse.targetY - mouse.y) * 0.1;

    // Tilt camera subtly with mouse (Lusion parallax)
    camera.position.x = mouse.x * 1.2;
    camera.position.y = mouse.y * 0.8;
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

      // 1. Central Gravity Attractor (pulls towards base vortex coordinates)
      var bx = basePos[i3 + 0];
      var by = basePos[i3 + 1];
      var bz = basePos[i3 + 2];

      var dx = bx - px;
      var dy = by - py;
      var dz = bz - pz;

      vx += dx * GRAVITY_FACTOR;
      vy += dy * GRAVITY_FACTOR;
      vz += dz * GRAVITY_FACTOR;

      // 2. Swirling Vortex Angular Velocity around tilted axis
      var distCenter = Math.sqrt(px * px + py * py) + 0.1;
      var tangentialForce = (VORTEX_SPEED / distCenter) * 0.015;
      vx += -py * tangentialForce;
      vy +=  px * tangentialForce;

      // 3. 3D Mouse Fluid Repulsion Wake
      var mx = mouse3D.x;
      var my = mouse3D.y;
      var mz = mouse3D.z;

      var dmx = px - mx;
      var dmy = py - my;
      var dmz = pz - mz;
      var distMouseSq = dmx * dmx + dmy * dmy + dmz * dmz;

      if (distMouseSq < 16.0) {
        var distMouse = Math.sqrt(distMouseSq) + 0.01;
        var push = (1.0 - distMouse / 4.0) * 0.085;
        vx += (dmx / distMouse) * push + mouseVelocity3D.x * 0.025;
        vy += (dmy / distMouse) * push + mouseVelocity3D.y * 0.025;
        vz += (dmz / distMouse) * push;
      }

      // 4. Viscous Damping & Integration
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

    // Slowly rotate base particles around diagonal for organic fluid drift
    particleSystem.rotation.z = time * 0.035;
    particleSystem.rotation.y = Math.sin(time * 0.05) * 0.12;

    // 7. Update Liquid Ribbon Spline
    for (var k = 0; k < RIBBON_POINTS_COUNT; k++) {
      var base = ribbonBasePoints[k];
      var current = ribbonCurvePoints[k];
      var wave = Math.sin(time * 1.8 + k * 0.6) * 0.28;
      var cosWave = Math.cos(time * 1.5 + k * 0.5) * 0.22;

      // Mouse influence on ribbon
      var distToMouse = Math.sqrt(
        Math.pow(base.x - mouse3D.x, 2) + Math.pow(base.y - mouse3D.y, 2)
      );
      var mousePush = Math.max(0, 1.0 - distToMouse / 5.0) * 0.6;

      current.x = base.x + wave + (base.x - mouse3D.x) * mousePush * 0.15;
      current.y = base.y + cosWave + (base.y - mouse3D.y) * mousePush * 0.15;
      current.z = base.z + Math.sin(time * 1.2 + k) * 0.35;
    }

    // Rebuild ribbon geometry smoothly
    ribbonGeometry.dispose();
    ribbonCurve = new THREE.CatmullRomCurve3(ribbonCurvePoints, false, 'centripetal', 0.5);
    ribbonGeometry = new THREE.TubeGeometry(ribbonCurve, 72, 0.32, 16, false);
    ribbonMesh.geometry = ribbonGeometry;

    renderer.render(scene, camera);
  }

  animate();

  // 8. Responsive Resize
  function onResize() {
    var width = window.innerWidth;
    var height = window.innerHeight;

    camera.aspect = width / height;
    camera.fov = width <= 812 ? 46 : 38;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    particleUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  window.addEventListener('resize', onResize);
  onResize();

})();
