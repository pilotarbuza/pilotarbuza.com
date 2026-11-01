/**
 * pilotarbuza.com — 3D Hydrodynamic Fluid Splash & Molten Obsidian Ribbon
 * 
 * Exact recreation of Lusion's fluid architecture:
 *   1. Molten Obsidian Liquid Wave (Hero Centerpiece):
 *      Wide, undulating, viscous fluid body stretching across center-screen.
 *      Reflective liquid chrome & obsidian PBR shading with intense overhead
 *      studio softbox highlights, organic fluid ripples, and iridescent Fresnel glints.
 *   2. Cohesive Micro-Foam & Spray Filaments (Streamlines & Billowing Lobes):
 *      Dense, frothy clusters of 18,000 micro-droplets clumping into fluid tendrils,
 *      large glowing white bokeh orbs, and fine peripheral splash spray.
 *   3. Monochromatic Film-Grade Palette (Anemos):
 *      Deep obsidian/petrol core (#0A1114 / #14232A), porcelain milk silk (#FFF8F0),
 *      and subtle Ice Mist (#D8EFF0) with delicate Breeze Teal (#4FC7C4) rim reflections.
 *   4. Clean Spatial Separation:
 *      Fluid mass hovers majestically above Y = +0.5, keeping the monumental
 *      "PILOTARBUZA" title crisp, bold, and 100% legible across all screens.
 */

(function () {
  'use strict';

  var canvas = document.getElementById('hero-balloons-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var isMobile = window.innerWidth <= 812;

  // ==========================================
  // 1. SCENE, CAMERA, RENDERER
  // ==========================================
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(isMobile ? 44 : 34, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.4, 13.5);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  // ==========================================
  // 2. MOLTEN OBSIDIAN LIQUID WAVE (The Hero Ribbon)
  // ==========================================
  // Continuous fluid ribbon slicing through the center
  var RIBBON_RES_X = 160;
  var RIBBON_RES_Y = 50;
  var ribbonGeo = new THREE.PlaneGeometry(13.8, 3.8, RIBBON_RES_X, RIBBON_RES_Y);

  var ribbonVertexShader = [
    'uniform float uTime;',
    'uniform vec3 uMouse;',
    'uniform float uImpulse;',
    'varying vec2 vUv;',
    'varying vec3 vNormalVec;',
    'varying vec3 vViewPosition;',
    'varying float vEdgeMask;',
    'varying float vCrestHighlight;',
    '',
    '// Fast procedural noise',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),',
    '             mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);',
    '}',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec3 pos = position;',
    '',
    '  // Center fluid around Y = +1.20',
    '  pos.y += 1.20;',
    '  pos.z += 0.35; // Position in front of the core foam cloud',
    '',
    '  // Organic fluid silhouette envelope',
    '  float normX = (pos.x + 6.9) / 13.8; // 0 to 1',
    '  float env = sin(normX * 3.14159) * 1.45;',
    '  env += 0.35 * sin(normX * 6.28 + 0.8);',
    '  env = clamp(env, 0.15, 1.6);',
    '',
    '  float distY = abs(uv.y - 0.5) * 2.0;',
    '  vEdgeMask = smoothstep(1.0, 0.42, distY / env);',
    '',
    '  // Dynamic fluid ripples & twisting waves',
    '  float waveA = sin(pos.x * 0.85 + uTime * 2.2) * 0.42;',
    '  float waveB = cos(pos.x * 1.9 - uTime * 1.6 + pos.y * 1.4) * 0.24;',
    '  float micro = noise(vec2(pos.x * 2.8 + uTime * 0.9, pos.y * 3.2)) * 0.30;',
    '',
    '  // Interactive wake',
    '  float distMouse = length(pos.xy - uMouse.xy);',
    '  float mouseWake = smoothstep(3.5, 0.0, distMouse) * 0.75;',
    '  float impulse = sin(distMouse * 4.5 - uTime * 7.0) * uImpulse * 0.5;',
    '',
    '  pos.z += waveA + waveB + micro + mouseWake + impulse;',
    '  pos.y += sin(pos.x * 0.55 + uTime * 1.3) * 0.35;',
    '',
    '  // Crest highlight along top ridge',
    '  vCrestHighlight = smoothstep(0.2, 0.7, uv.y) * smoothstep(0.95, 0.65, uv.y);',
    '',
    '  // Analytic normal calculation',
    '  float dzdx = 0.85 * cos(pos.x * 0.85 + uTime * 2.2) * 0.42 - 1.9 * sin(pos.x * 1.9 - uTime * 1.6) * 0.24;',
    '  float dzdy = 1.4 * sin(pos.y * 1.4) * 0.24;',
    '  vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));',
    '  vNormalVec = normalMatrix * normal;',
    '',
    '  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);',
    '  vViewPosition = -mvPosition.xyz;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '}'
  ].join('\n');

  var ribbonFragmentShader = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying vec3 vNormalVec;',
    'varying vec3 vViewPosition;',
    'varying float vEdgeMask;',
    'varying float vCrestHighlight;',
    '',
    'void main() {',
    '  if (vEdgeMask < 0.06) discard;',
    '',
    '  vec3 normal = normalize(vNormalVec);',
    '  vec3 viewDir = normalize(vViewPosition);',
    '',
    '  // Studio lights: intense top-front softbox + cool bounce',
    '  vec3 keyLight = normalize(vec3(0.45, 0.85, 0.75));',
    '  vec3 fillLight = normalize(vec3(-0.6, -0.4, 0.4));',
    '',
    '  float diff = max(0.0, dot(normal, keyLight));',
    '  float ambient = 0.12 + 0.08 * normal.y;',
    '',
    '  // Chrome / liquid mercury specular reflections',
    '  vec3 halfVec = normalize(keyLight + viewDir);',
    '  float spec = pow(max(0.0, dot(normal, halfVec)), 42.0) * 2.4;',
    '  float glint = pow(max(0.0, dot(normal, halfVec)), 120.0) * 3.5;',
    '',
    '  // Dramatic overhead light reflection strip along fluid crest',
    '  float overheadReflection = pow(max(0.0, normal.y), 3.0) * 0.85;',
    '',
    '  // Iridescent Fresnel rim',
    '  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);',
    '  vec3 rimTint = mix(vec3(0.95, 0.98, 1.0), vec3(0.31, 0.78, 0.77), 0.38);',
    '',
    '  // Base obsidian / petrol fluid body',
    '  vec3 baseObsidian = mix(vec3(0.03, 0.05, 0.06), vec3(0.07, 0.12, 0.15), normal.y * 0.5 + 0.5);',
    '',
    '  vec3 color = baseObsidian * (diff * 0.65 + ambient);',
    '  color += vec3(spec + glint + overheadReflection) * 0.95;',
    '  color += fresnel * rimTint * 0.85;',
    '  color += vCrestHighlight * vec3(0.92, 0.96, 1.0) * 0.35;',
    '',
    '  float alpha = smoothstep(0.06, 0.32, vEdgeMask) * 0.96;',
    '  gl_FragColor = vec4(color, alpha);',
    '}'
  ].join('\n');

  var ribbonUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(0, 1.20, 0) },
    uImpulse: { value: 0.0 }
  };

  var ribbonMat = new THREE.ShaderMaterial({
    uniforms: ribbonUniforms,
    vertexShader: ribbonVertexShader,
    fragmentShader: ribbonFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  var ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  scene.add(ribbonMesh);

  // ==========================================
  // 3. COHESIVE FLUID FOAM & SPRAY (Streamlines & Droplets)
  // ==========================================
  var PARTICLE_COUNT = isMobile ? 9500 : 17000;

  var pPositions   = new Float32Array(PARTICLE_COUNT * 3);
  var pVelocities  = new Float32Array(PARTICLE_COUNT * 3);
  var pBaseCoords  = new Float32Array(PARTICLE_COUNT * 3);
  var pColors      = new Float32Array(PARTICLE_COUNT * 3);
  var pSizes       = new Float32Array(PARTICLE_COUNT);
  var pGlowFlags   = new Float32Array(PARTICLE_COUNT);
  var pStreamIds   = new Float32Array(PARTICLE_COUNT);
  var pSeeds       = new Float32Array(PARTICLE_COUNT);

  var STREAM_COUNT = 14;

  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var i3 = i * 3;
    var sId = i % STREAM_COUNT;

    // Parameter u along fluid stream: -1.0 to 1.0
    var u = (Math.random() - 0.5) * 2.0;

    // Streamline base positions (curving gently through upper-mid screen)
    var sx = u * 5.8;
    var sy = 1.22 + Math.sin(u * 2.0 + sId * 0.45) * 0.88 + (sId - 7) * 0.14;
    var sz = Math.cos(u * 2.3 + sId * 0.8) * 1.15 + (Math.random() - 0.5) * 0.35;

    // Organic filament clustering: tight Gaussian cluster forming dense foam
    var swirl = u * Math.PI * 4.5 + sId * 1.3;
    var filamentR = Math.pow(Math.random(), 2.4) * 0.72 + 0.04;

    // Sparse outer spray droplets
    if (Math.random() < 0.14) {
      filamentR *= 3.0 + Math.random() * 1.8;
    }

    var px = sx + Math.cos(swirl) * filamentR;
    var py = sy + Math.sin(swirl) * filamentR * 0.82;
    var pz = sz + (Math.random() - 0.5) * filamentR;

    pPositions[i3 + 0] = px;
    pPositions[i3 + 1] = py;
    pPositions[i3 + 2] = pz;

    pBaseCoords[i3 + 0] = px;
    pBaseCoords[i3 + 1] = py;
    pBaseCoords[i3 + 2] = pz;

    pVelocities[i3 + 0] = (Math.random() - 0.5) * 0.008;
    pVelocities[i3 + 1] = (Math.random() - 0.5) * 0.008;
    pVelocities[i3 + 2] = (Math.random() - 0.5) * 0.008;

    // Particle hierarchy:
    // 92% fine micro-droplets (2.5px - 5.5px) — forms continuous frothy fluid
    // 6% crisp splashing droplets (8px - 14px)
    // 2% large glowing bokeh orbs (32px - 50px)
    var rType = Math.random();
    if (rType > 0.980) {
      // Large glowing white porcelain bokeh pearls
      pSizes[i] = isMobile ? 28 : 44;
      pGlowFlags[i] = 1.0;
      pColors[i3 + 0] = 1.0;
      pColors[i3 + 1] = 0.99;
      pColors[i3 + 2] = 0.98;
    } else if (rType > 0.92) {
      // Medium crisp silver droplets
      pSizes[i] = isMobile ? 9 : 14;
      pGlowFlags[i] = 0.2;
      pColors[i3 + 0] = 0.96;
      pColors[i3 + 1] = 0.97;
      pColors[i3 + 2] = 0.98;
    } else {
      // Fine micro-foam spray (98% porcelain white/silver)
      pSizes[i] = isMobile ? 3.0 : 4.5;
      pGlowFlags[i] = 0.0;
      pColors[i3 + 0] = 0.98;
      pColors[i3 + 1] = 0.98;
      pColors[i3 + 2] = 0.98;
    }

    pStreamIds[i] = sId;
    pSeeds[i] = Math.random() * 100.0;
  }

  var pGeometry = new THREE.BufferGeometry();
  pGeometry.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  pGeometry.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  pGeometry.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));
  pGeometry.setAttribute('isGlow', new THREE.BufferAttribute(pGlowFlags, 1));
  pGeometry.setAttribute('seed', new THREE.BufferAttribute(pSeeds, 1));

  // High-end 3D Liquid Sphere Shader with subtle Anemos rim sheen
  var pVertexShader = [
    'attribute float size;',
    'attribute vec3 color;',
    'attribute float isGlow;',
    'attribute float seed;',
    'varying vec3 vColor;',
    'varying float vGlow;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    '',
    'void main() {',
    '  vColor = color;',
    '  vGlow = isGlow;',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  float pulse = 1.0 + 0.04 * sin(uTime * 2.2 + seed);',
    '  gl_PointSize = size * uPixelRatio * pulse * (13.5 / -mvPosition.z);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '}'
  ].join('\n');

  var pFragmentShader = [
    'varying vec3 vColor;',
    'varying float vGlow;',
    '',
    'void main() {',
    '  vec2 coord = gl_PointCoord - vec2(0.5);',
    '  float r2 = dot(coord, coord);',
    '  if (r2 > 0.25) discard;',
    '',
    '  float z = sqrt(max(0.0, 0.25 - r2));',
    '  vec3 normal = normalize(vec3(coord.x * 2.0, -coord.y * 2.0, z * 2.0));',
    '',
    '  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.8));',
    '  vec3 viewDir = vec3(0.0, 0.0, 1.0);',
    '',
    '  float diff = max(0.0, dot(normal, lightDir));',
    '  float ambient = 0.22 + 0.12 * normal.y;',
    '',
    '  vec3 halfVec = normalize(lightDir + viewDir);',
    '  float spec = pow(max(0.0, dot(normal, halfVec)), 32.0) * 1.25;',
    '',
    '  // Subtle Anemos ice rim sheen',
    '  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.8) * 0.48;',
    '  vec3 rimColor = mix(vec3(1.0), vec3(0.31, 0.78, 0.77), 0.32);',
    '',
    '  float edgeAo = smoothstep(0.5, 0.26, length(coord));',
    '',
    '  vec3 litColor = vColor * (diff * 0.75 + ambient) + vec3(spec) + rimColor * fresnel;',
    '  litColor *= (edgeAo * 0.32 + 0.68);',
    '',
    '  if (vGlow > 0.0) {',
    '    litColor += vec3(1.0, 0.98, 0.95) * (vGlow * 0.7);',
    '  }',
    '',
    '  float alpha = smoothstep(0.5, 0.44, length(coord));',
    '  gl_FragColor = vec4(litColor, alpha);',
    '}'
  ].join('\n');

  var pUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
  };

  var pMaterial = new THREE.ShaderMaterial({
    uniforms: pUniforms,
    vertexShader: pVertexShader,
    fragmentShader: pFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending
  });

  var particleSystem = new THREE.Points(pGeometry, pMaterial);
  scene.add(particleSystem);

  // ==========================================
  // 4. INTERACTIVITY & MOUSE WAKE
  // ==========================================
  var mouse = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };

  var raycaster = new THREE.Raycaster();
  var mouse3D = new THREE.Vector3(0, 1.20, 0);
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
      mouse3D.copy(planeIntersect);
    }
  }

  var impulseStrength = 0;
  function triggerImpulse(strength) {
    impulseStrength = strength || 0.65;
    ribbonUniforms.uImpulse.value = impulseStrength;

    var posAttr = pGeometry.attributes.position;
    var posArr = posAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      var px = posArr[i3 + 0];
      var py = posArr[i3 + 1];
      var pz = posArr[i3 + 2];

      var dx = px - mouse3D.x;
      var dy = py - mouse3D.y;
      var dz = pz - mouse3D.z;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;

      var force = (impulseStrength / dist) * (0.6 + Math.random() * 0.6);
      pVelocities[i3 + 0] += (dx / dist) * force;
      pVelocities[i3 + 1] += (dy / dist) * force;
      pVelocities[i3 + 2] += (dz / dist) * force;
    }
  }

  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  canvas.addEventListener('click', function () {
    triggerImpulse(0.7);
  });
  canvas.addEventListener('touchstart', function () {
    triggerImpulse(0.7);
  }, { passive: true });

  // ==========================================
  // 5. ANIMATION LOOP
  // ==========================================
  var clock = new THREE.Clock();
  var SPRING = 0.046;
  var DAMPING = 0.938;
  var VORTEX_SPEED = 0.26;

  function animate() {
    requestAnimationFrame(animate);

    var delta = Math.min(clock.getDelta(), 0.05);
    var time = clock.getElapsedTime();

    pUniforms.uTime.value = time;
    ribbonUniforms.uTime.value = time;
    ribbonUniforms.uMouse.value.copy(mouse3D);

    if (impulseStrength > 0.01) {
      impulseStrength *= 0.94;
      ribbonUniforms.uImpulse.value = impulseStrength;
    }

    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;
    camera.position.x = mouse.x * 0.85;
    camera.position.y = 0.4 + mouse.y * 0.55;
    camera.lookAt(0, 1.20, 0);

    var posAttr = pGeometry.attributes.position;
    var posArr = posAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      var px = posArr[i3 + 0];
      var py = posArr[i3 + 1];
      var pz = posArr[i3 + 2];

      var vx = pVelocities[i3 + 0];
      var vy = pVelocities[i3 + 1];
      var vz = pVelocities[i3 + 2];

      var bx = pBaseCoords[i3 + 0];
      var by = pBaseCoords[i3 + 1];
      var bz = pBaseCoords[i3 + 2];

      var waveX = Math.sin(time * 1.4 + pSeeds[i]) * 0.10;
      var waveY = Math.cos(time * 1.1 + pSeeds[i] * 0.8) * 0.08;

      vx += (bx + waveX - px) * SPRING;
      vy += (by + waveY - py) * SPRING;
      vz += (bz - pz) * SPRING;

      var dyCenter = py - 1.22;
      var distCenter = Math.sqrt(px * px + dyCenter * dyCenter) + 0.15;
      var swirl = (VORTEX_SPEED / distCenter) * 0.012;
      vx += -dyCenter * swirl;
      vy +=  px * swirl;

      var dmx = px - mouse3D.x;
      var dmy = py - mouse3D.y;
      var dmz = pz - mouse3D.z;
      var distMSq = dmx * dmx + dmy * dmy + dmz * dmz;

      if (distMSq < 8.0) {
        var distM = Math.sqrt(distMSq) + 0.01;
        var push = (1.0 - distM / 2.82) * 0.075;
        vx += (dmx / distM) * push;
        vy += (dmy / distM) * push;
        vz += (dmz / distM) * push;
      }

      vx *= DAMPING;
      vy *= DAMPING;
      vz *= DAMPING;

      posArr[i3 + 0] += vx;
      posArr[i3 + 1] += vy;
      posArr[i3 + 2] += vz;

      pVelocities[i3 + 0] = vx;
      pVelocities[i3 + 1] = vy;
      pVelocities[i3 + 2] = vz;
    }

    posAttr.needsUpdate = true;

    particleSystem.rotation.z = Math.sin(time * 0.03) * 0.03;
    ribbonMesh.rotation.z = Math.sin(time * 0.02) * 0.02;

    renderer.render(scene, camera);
  }

  animate();

  // ==========================================
  // 6. RESPONSIVE RESIZE
  // ==========================================
  function onResize() {
    var width = window.innerWidth;
    var height = window.innerHeight;

    camera.aspect = width / height;
    camera.fov = width <= 812 ? 46 : 34;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    pUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  window.addEventListener('resize', onResize);
  onResize();

})();
