// GLSL for the 3D city. Scene units: x/y mercator metres, z real metres (see geo.ts).
const COMMON = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
uniform vec3 uSkyAmb; uniform vec3 uGroundAmb;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uCam; uniform float uScale; uniform float uNight; uniform float uTime;
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 applyFog(vec3 c, vec3 p) {
  vec3 d = p - uCam; d.z *= uScale;
  float f = smoothstep(uFogNear, uFogFar, length(d) / uScale);
  return mix(c, uFogColor, f * 0.7);
}
vec3 light(vec3 n) {
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundAmb, uSkyAmb, n.z * 0.5 + 0.5);
  return hemi * 0.9 + uSunColor * diff * uSunI * 0.42;
}`;

export const buildingVS = /* glsl */ `
attribute vec4 aNormal; attribute vec4 aColor; attribute vec4 aExt;
uniform float uExag;
varying vec3 vP; varying vec3 vN; varying vec3 vCol; varying vec4 vExt; varying float vH; varying float vLm;
void main() {
  vec3 p = vec3(position.xy, position.z + aExt.y * uExag);
  vP = p; vN = aNormal.xyz; vCol = aColor.rgb; vExt = aExt; vH = position.z; vLm = aColor.a * 255.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const buildingFS = /* glsl */ `
${COMMON}
uniform float uHL;
varying vec3 vP; varying vec3 vN; varying vec3 vCol; varying vec4 vExt; varying float vH; varying float vLm;
void main() {
  float kind = vExt.w;
  float glass = step(3.5, kind);
  float k = kind - glass * 4.0;
  vec3 n = normalize(vN);
  vec3 base = vCol;
  float isRoof = step(0.5, k) * step(k, 1.5);
  float windows = step(k, 0.5);
  vec3 lit = light(n);
  // ambient occlusion: darker near the ground, gentle gradient up the facade
  float ao = mix(1.0, mix(0.62, 1.0, smoothstep(0.0, 6.0, vH)) * mix(0.9, 1.0, smoothstep(0.0, 30.0, vH)), 1.0 - isRoof);
  vec3 col = base * lit * ao;
  vec3 emissive = vec3(0.0);
  if (windows > 0.5) {
    float fh = mix(3.4, 3.8, glass), cw = mix(3.2, 2.0, glass);
    vec2 g = vec2(vExt.x / cw, vH / fh);
    vec2 f = fract(g), c = floor(g);
    vec2 fw = fwidth(g);
    float x0 = mix(0.2, 0.06, glass), x1 = 1.0 - x0, y0 = mix(0.3, 0.12, glass), y1 = mix(0.86, 0.95, glass);
    float wx = smoothstep(x0 - fw.x, x0 + fw.x, f.x) * (1.0 - smoothstep(x1 - fw.x, x1 + fw.x, f.x));
    float wy = smoothstep(y0 - fw.y, y0 + fw.y, f.y) * (1.0 - smoothstep(y1 - fw.y, y1 + fw.y, f.y));
    float detail = clamp(1.6 - max(fw.x, fw.y) * 2.2, 0.0, 1.0); // fade pattern to its average when tiny
    float avg = (x1 - x0) * (y1 - y0);
    float w = mix(avg, wx * wy, detail) * step(3.0, vH);
    vec3 sky = mix(vec3(0.62, 0.74, 0.84), uSkyAmb, 0.4);
    vec3 winDay = mix(base * 0.66, sky * (0.55 + 0.45 * lit), 0.45 + glass * 0.3);
    col = mix(col, winDay * ao, w * (0.55 + glass * 0.25) * (1.0 - uNight * 0.85));
    float on = step(hash13(vec3(c, vExt.z)), 0.36 + glass * 0.06);
    float onAvg = 0.36 + glass * 0.06;
    float lamp = mix(onAvg, on, detail);
    vec3 warm = mix(vec3(1.0, 0.74, 0.42), vec3(0.86, 0.92, 1.0), hash13(vec3(c.y, vExt.z, 3.0)) * 0.6 + glass * 0.3);
    emissive = warm * w * lamp * uNight * mix(1.2, 0.85, glass);
    // ground-floor shopfronts glow at night
    emissive += vec3(1.0, 0.8, 0.5) * (1.0 - step(3.0, vH)) * step(0.7, fract(vExt.x / 5.0)) * uNight * 0.6;
  }
  col *= mix(1.0, 0.45, uNight);
  // landmarks are flood-lit at night
  if (vLm > -0.5) emissive += vec3(0.75, 0.8, 0.95) * uNight * 0.28 * (0.6 + 0.4 * smoothstep(0.0, 200.0, vH));
  if (uHL > -0.5 && abs(vLm - uHL) < 0.5) col = mix(col, vec3(1.0, 0.82, 0.38), 0.28 + 0.12 * sin(uTime * 4.0));
  col += emissive;
  gl_FragColor = vec4(applyFog(col, vP), 1.0);
}`;

export const litVS = /* glsl */ `
attribute float aPart;
uniform float uSway; uniform float uTime;
varying vec3 vP; varying vec3 vN; varying vec3 vCol; varying float vAo;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  vec3 c = color;
#ifdef USE_INSTANCING
  // gentle wind sway on canopies
  float sw = aPart * uSway * position.z * 0.025;
  vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  p.x += sin(uTime * 1.4 + wp.x * 0.07 + wp.y * 0.05) * sw;
  p.y += cos(uTime * 1.1 + wp.y * 0.06) * sw * 0.6;
  p = instanceMatrix * p;
  n = normalize(mat3(instanceMatrix) * n);
#endif
#ifdef USE_INSTANCING_COLOR
  c = mix(color, instanceColor, aPart);
#endif
  vP = p.xyz; vN = n; vCol = c;
  vAo = mix(0.55, 1.0, smoothstep(0.0, 2.5, position.z)) ;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

export const litFS = /* glsl */ `
${COMMON}
uniform float uEmissive;
varying vec3 vP; varying vec3 vN; varying vec3 vCol; varying float vAo;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = vCol * light(n) * vAo;
  col *= mix(1.0, 0.42, uNight);
  col += vCol * uEmissive * uNight;
  gl_FragColor = vec4(applyFog(col, vP), 1.0);
}`;

export const shadowVS = /* glsl */ `
attribute vec2 aSh;
uniform vec2 uShadowVec; uniform float uExag;
varying vec3 vP;
void main() {
  vec3 p = position;
  p.xy += aSh.y * uShadowVec * aSh.x;
  p.z = p.z * uExag + 0.6;
  vP = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const shadowFS = /* glsl */ `
uniform vec3 uShadowColor; uniform float uShadowA;
uniform vec3 uCam; uniform float uScale; uniform float uFogFar;
varying vec3 vP;
void main() {
  vec3 d = vP - uCam; d.z *= uScale;
  float fade = 1.0 - smoothstep(uFogFar * 0.4, uFogFar, length(d) / uScale);
  gl_FragColor = vec4(uShadowColor, uShadowA * fade);
}`;
