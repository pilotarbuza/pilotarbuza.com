/**
 * Particle flow for the hero. Camera and shading are owned by the caller.
 * The emitter is centred at the origin; noise and particle age use separate clocks.
 */
/* Simplex noise adapted from https://github.com/ashima/webgl-noise
 * Copyright (C) 2011 by Ashima Arts (Simplex noise)
 * Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function () {
  'use strict';

  // Deliberately retain the source kernel, offsets and component ordering.
  // Changing these into a different curl field changes the shape of the cloud.
  const fragmentShader = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D u_simPrevPosLifeTexture;
uniform sampler2D u_simDefaultPosLifeTexture;
uniform float u_introDeltaTime;
uniform float u_noiseTime;
uniform float u_noiseScale;
uniform float u_noiseStableFactor;
uniform vec3 u_lightPosition;
varying vec2 v_uv;

#define PI2 6.283185307179586
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;
}float mod289(float x){return x-floor(x*(1.0/289.0))*289.0;
}vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);
}float permute(float x){return mod289(((x*34.0)+1.0)*x);
}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;
}float taylorInvSqrt(float r){return 1.79284291400159-0.85373472095314*r;
}vec4 grad4(float j,vec4 ip){const vec4 ones=vec4(1.0,1.0,1.0,-1.0);
vec4 p,s;
p.xyz=floor(fract(vec3(j)*ip.xyz)*7.0)*ip.z-1.0;
p.w=1.5-dot(abs(p.xyz),ones.xyz);
s=vec4(lessThan(p,vec4(0.0)));
p.xyz=p.xyz+(s.xyz*2.0-1.0)*s.www;
return p;
}
#define F4 0.309016994374947451
vec4 simplexNoiseDerivatives(vec4 v){const vec4 C=vec4(0.138196601125011,0.276393202250021,0.414589803375032,-0.447213595499958);
vec4 i=floor(v+dot(v,vec4(F4)));
vec4 x0=v-i+dot(i,C.xxxx);
vec4 i0;
vec3 isX=step(x0.yzw,x0.xxx);
vec3 isYZ=step(x0.zww,x0.yyz);
i0.x=isX.x+isX.y+isX.z;
i0.yzw=1.0-isX;
i0.y+=isYZ.x+isYZ.y;
i0.zw+=1.0-isYZ.xy;
i0.z+=isYZ.z;
i0.w+=1.0-isYZ.z;
vec4 i3=clamp(i0,0.0,1.0);
vec4 i2=clamp(i0-1.0,0.0,1.0);
vec4 i1=clamp(i0-2.0,0.0,1.0);
vec4 x1=x0-i1+C.xxxx;
vec4 x2=x0-i2+C.yyyy;
vec4 x3=x0-i3+C.zzzz;
vec4 x4=x0+C.wwww;
i=mod289(i);
float j0=permute(permute(permute(permute(i.w)+i.z)+i.y)+i.x);
vec4 j1=permute(permute(permute(permute(i.w+vec4(i1.w,i2.w,i3.w,1.0))+i.z+vec4(i1.z,i2.z,i3.z,1.0))+i.y+vec4(i1.y,i2.y,i3.y,1.0))+i.x+vec4(i1.x,i2.x,i3.x,1.0));
vec4 ip=vec4(1.0/294.0,1.0/49.0,1.0/7.0,0.0);
vec4 p0=grad4(j0,ip);
vec4 p1=grad4(j1.x,ip);
vec4 p2=grad4(j1.y,ip);
vec4 p3=grad4(j1.z,ip);
vec4 p4=grad4(j1.w,ip);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
p0*=norm.x;
p1*=norm.y;
p2*=norm.z;
p3*=norm.w;
p4*=taylorInvSqrt(dot(p4,p4));
vec3 values0=vec3(dot(p0,x0),dot(p1,x1),dot(p2,x2));
vec2 values1=vec2(dot(p3,x3),dot(p4,x4));
vec3 m0=max(0.5-vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2)),0.0);
vec2 m1=max(0.5-vec2(dot(x3,x3),dot(x4,x4)),0.0);
vec3 temp0=-6.0*m0*m0*values0;
vec2 temp1=-6.0*m1*m1*values1;
vec3 mmm0=m0*m0*m0;
vec2 mmm1=m1*m1*m1;
float dx=temp0[0]*x0.x+temp0[1]*x1.x+temp0[2]*x2.x+temp1[0]*x3.x+temp1[1]*x4.x+mmm0[0]*p0.x+mmm0[1]*p1.x+mmm0[2]*p2.x+mmm1[0]*p3.x+mmm1[1]*p4.x;
float dy=temp0[0]*x0.y+temp0[1]*x1.y+temp0[2]*x2.y+temp1[0]*x3.y+temp1[1]*x4.y+mmm0[0]*p0.y+mmm0[1]*p1.y+mmm0[2]*p2.y+mmm1[0]*p3.y+mmm1[1]*p4.y;
float dz=temp0[0]*x0.z+temp0[1]*x1.z+temp0[2]*x2.z+temp1[0]*x3.z+temp1[1]*x4.z+mmm0[0]*p0.z+mmm0[1]*p1.z+mmm0[2]*p2.z+mmm1[0]*p3.z+mmm1[1]*p4.z;
float dw=temp0[0]*x0.w+temp0[1]*x1.w+temp0[2]*x2.w+temp1[0]*x3.w+temp1[1]*x4.w+mmm0[0]*p0.w+mmm0[1]*p1.w+mmm0[2]*p2.w+mmm1[0]*p3.w+mmm1[1]*p4.w;
return vec4(dx,dy,dz,dw)*49.0;
}vec3 curl(in vec3 p,in float noiseTime,in float persistence){vec4 xNoisePotentialDerivatives=vec4(0.0);
vec4 yNoisePotentialDerivatives=vec4(0.0);
vec4 zNoisePotentialDerivatives=vec4(0.0);
for(int i=0;
i<2;
++i){float twoPowI=pow(2.0,float(i));
float scale=0.5*twoPowI*pow(persistence,float(i));
xNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4(p*twoPowI,noiseTime))*scale;
yNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4((p+vec3(123.4,129845.6,-1239.1))*twoPowI,noiseTime))*scale;
zNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4((p+vec3(-9519.0,9051.0,-123.0))*twoPowI,noiseTime))*scale;
}return vec3(xNoisePotentialDerivatives[3]-zNoisePotentialDerivatives[1],zNoisePotentialDerivatives[2]-yNoisePotentialDerivatives[3],yNoisePotentialDerivatives[1]-xNoisePotentialDerivatives[2]);
}void main(){vec4 posLife=texture2D(u_simPrevPosLifeTexture,v_uv);
vec3 posLifeOrigin=posLife.xyz-u_lightPosition;
posLife.w-=(0.5+u_noiseStableFactor)*u_introDeltaTime;
if(posLife.w<0.0){vec3 defPosOrigin=texture2D(u_simDefaultPosLifeTexture,v_uv).xyz;
vec3 defPos=defPosOrigin*(1.25+sin(u_noiseTime*2.5+v_uv.x*21.)*0.25)+u_lightPosition;
posLife.w+=1.;
posLife.xyz=defPos;
}vec3 toLight=posLife.xyz-u_lightPosition;
vec3 axis=vec3(sin(u_noiseTime),cos(u_noiseTime*2.+v_uv.y*6.283185),0.0);
vec3 spinDir=cross(axis,toLight);
float dist=length(toLight);
if(dist>0.01){float spinStrength=u_introDeltaTime*(0.1+smoothstep(0.5,2.0,dist-v_uv.x*0.5)*(v_uv.y<0.5 ? 1. :-1.)*mix(2.,4.,v_uv.x))*mix(0.75,1.5,u_noiseStableFactor);
posLife.xyz+=spinDir*spinStrength;
}posLife.xyz+=(1.25+0.5*u_noiseScale)*curl((posLife.xyz-u_lightPosition)*(0.4+0.3*u_noiseStableFactor),u_noiseTime,0.2)*u_introDeltaTime*mix(0.4,1.5,posLife.w*posLife.w)*mix(0.75,1.25,v_uv.x);
gl_FragColor=posLife;
}
`;
  const vertexShader = 'varying vec2 v_uv; void main(){v_uv=uv;gl_Position=vec4(position.xy,0.,1.);}';

  function createBreathingNoise() {
    // Same signed amplitude and unnormalised three-octave FBM as the source.
    const values = new Array(512);
    for (let i = 0; i < values.length; i++) values[i] = Math.random() - .5;
    function sample(x) {
      const cell = Math.floor(x), f = x - cell, blend = f * f * (3 - 2 * f);
      const left = values[cell & 511], right = values[(cell + 1) & 511];
      return left + (right - left) * blend;
    }
    return x => sample(x) * .5 + sample(x * 2) * .25 + sample(x * 4) * .125;
  }

  /**
   * current/previous are live WebGLRenderTarget getters; defaults is a DataTexture.
   * Call step(realDt, simDt) once per frame with dt in seconds, capped at .05.
   * realDt advances the field; simDt advances particles and their two-second lives.
   * The caller implements hold/pause/visibility and owns disposal through track().
   */
  window.createHeroFlow = function createHeroFlow({ THREE: T, renderer, small = false, lite = false, track = resource => resource }) {
    const keep = resource => { track(resource); return resource; };
    const width = 128, height = lite ? 40 : small ? 128 : 192, count = width * height;
    const initial = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const longitude = Math.random() * Math.PI * 2;
      const latitude = Math.acos(Math.random() * 2 - 1);
      const radius = .25 + Math.cbrt(Math.random()) * .5;
      initial[i * 4] = radius * Math.sin(latitude) * Math.cos(longitude);
      initial[i * 4 + 1] = radius * Math.sin(latitude) * Math.sin(longitude);
      initial[i * 4 + 2] = radius * Math.cos(latitude);
      // The index ties age to texture Y and therefore to the two spin directions.
      initial[i * 4 + 3] = i / count - 1;
    }
    const defaults = keep(new T.DataTexture(initial, width, height, T.RGBAFormat, T.FloatType));
    defaults.minFilter = defaults.magFilter = T.NearestFilter;
    defaults.wrapS = defaults.wrapT = T.ClampToEdgeWrapping;
    defaults.generateMipmaps = false;
    defaults.needsUpdate = true;
    const options = {
      type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter,
      depthBuffer: false, stencilBuffer: false
    };
    let current = keep(new T.WebGLRenderTarget(width, height, options));
    let previous = keep(current.clone());
    const uniforms = {
      u_simPrevPosLifeTexture: { value: current.texture },
      u_simDefaultPosLifeTexture: { value: defaults },
      u_introDeltaTime: { value: 0 },
      u_noiseTime: { value: 0 },
      u_noiseScale: { value: 0 },
      // This is zero on the unscrolled original hero, not an elapsed-time phase.
      u_noiseStableFactor: { value: 0 },
      u_lightPosition: { value: new T.Vector3(0, 0, 0) }
    };
    const material = keep(new T.ShaderMaterial({
      vertexShader, fragmentShader, uniforms,
      depthTest: false, depthWrite: false, blending: T.NoBlending
    }));
    const geometry = keep(new T.PlaneGeometry(2, 2));
    const camera = new T.Camera(), scene = new T.Scene();
    const copyMaterial = new T.ShaderMaterial({
      vertexShader,
      fragmentShader: 'varying vec2 v_uv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,v_uv);}',
      uniforms: { source: { value: defaults } },
      depthTest: false, depthWrite: false, blending: T.NoBlending
    });
    const quad = new T.Mesh(geometry, copyMaterial);
    quad.frustumCulled = false;
    scene.add(quad);
    const savedTarget = renderer.getRenderTarget();
    const gl = renderer.getContext();
    try {
      // Seed BOTH targets. Reading an uninitialised target synchronises every birth.
      for (const target of [current, previous]) {
        renderer.setRenderTarget(target);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('Incomplete particle simulation target');
        }
        renderer.render(scene, camera);
      }
    } finally {
      renderer.setRenderTarget(savedTarget);
      quad.material = material;
      copyMaterial.dispose();
    }

    const breathingNoise = createBreathingNoise();
    let noiseScaleTime = Math.random();
    let realTime = 0, simulationTime = 0;

    return {
      width, height, count, defaults, initial, uniforms,
      get current() { return current; },
      get previous() { return previous; },
      get currentTexture() { return current.texture; },
      get previousTexture() { return previous.texture; },
      get realTime() { return realTime; },
      get simulationTime() { return simulationTime; },
      step(realDt, simDt) {
        if (!Number.isFinite(realDt) || !Number.isFinite(simDt) || realDt < 0 || simDt < 0) {
          throw new Error('Particle time steps must be finite, nonnegative seconds');
        }
        realTime += realDt;
        simulationTime += simDt;
        uniforms.u_noiseTime.value += realDt * .4;
        noiseScaleTime += realDt;
        uniforms.u_noiseScale.value = 10 * Math.abs(breathingNoise(noiseScaleTime));
        uniforms.u_introDeltaTime.value = simDt;
        uniforms.u_simPrevPosLifeTexture.value = current.texture;
        const saved = renderer.getRenderTarget();
        try {
          renderer.setRenderTarget(previous);
          renderer.render(scene, camera);
        } finally {
          renderer.setRenderTarget(saved);
        }
        const swap = current; current = previous; previous = swap;
      }
    };
  };
})();
