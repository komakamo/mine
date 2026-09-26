'use strict';
// Shared GLSL snippets
MC.SH = {};

MC.SH.header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler3D;
precision highp sampler2DShadow;
`;

// Full-screen triangle
MC.SH.fsqVS = MC.SH.header + `
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

MC.SH.common = `
#define PI 3.14159265359
#define SHADOW_DISTORT 0.1
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec2 vogel(int i, int n, float phi) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float th = float(i) * 2.39996323 + phi;
  return r * vec2(cos(th), sin(th));
}
vec2 octWrap(vec2 v) { return (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); }
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  n.xy = n.z >= 0.0 ? n.xy : octWrap(n.xy);
  return n.xy * 0.5 + 0.5;
}
vec3 octDecode(vec2 f) {
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = saturate(-n.z);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
// Crisp pixel-art sampling with anti-aliased texel edges (hardware may force linear magnification)
vec2 pixelUV(vec2 uv, vec2 dx, vec2 dy) {
  vec2 pix = uv * 16.0;
  vec2 dudv = (abs(dx) + abs(dy)) * 16.0;
  if (max(dudv.x, dudv.y) >= 1.0) return uv;
  vec2 seam = floor(pix + 0.5);
  pix = seam + clamp((pix - seam) / max(dudv, vec2(1e-4)), -0.5, 0.5);
  return pix / 16.0;
}
const vec3 FACE_N[7] = vec3[7](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,1,0));
const vec3 FACE_T[7] = vec3[7](vec3(0,0,-1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(1,0,0), vec3(-1,0,0), vec3(1,0,0));
const vec3 FACE_B[7] = vec3[7](vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1));

// Minecraft shader-pack style shadow distortion: more resolution near the player
vec3 shadowDistort(vec3 p) {
  float f = length(p.xy) * (1.0 - SHADOW_DISTORT) + SHADOW_DISTORT;
  return vec3(p.xy / f, p.z);
}

// Sky LUT parameterisation (non-linear elevation for horizon detail)
vec2 skyUV(vec3 d) {
  float az = atan(d.z, d.x);
  float el = asin(clamp(d.y, -1.0, 1.0));
  return vec2(az / (2.0 * PI) + 0.5, 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (PI * 0.5)));
}
vec3 skyDirFromUV(vec2 uv) {
  float az = (uv.x - 0.5) * 2.0 * PI;
  float t = uv.y * 2.0 - 1.0;
  float el = sign(t) * t * t * PI * 0.5;
  return vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
}

float phaseHG(float c, float g) {
  float gg = g * g;
  return (1.0 - gg) / (4.0 * PI * pow(max(1.0 + gg - 2.0 * g * c, 1e-4), 1.5));
}

// ACES filmic (Hill fit)
vec3 acesFitted(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = inM * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return saturate(outM * (a / b));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

// Wind animation shared by the shadow and G-buffer vertex shaders
MC.SH.wind = `
vec3 windOffset(vec3 wp, int mat, float isTop, float skyL, float t) {
  if (mat == 1) {
    float ph = wp.x * 0.71 + wp.z * 0.53 + wp.y * 0.37;
    vec3 o = vec3(sin(t * 1.9 + ph), sin(t * 1.3 + ph * 1.7) * 0.5, sin(t * 1.6 + ph * 1.3 + 0.7));
    o += vec3(sin(t * 4.3 + ph * 3.1), 0.0, sin(t * 3.7 + ph * 2.7)) * 0.3;
    return o * 0.035 * skyL;
  }
  if (mat == 2 && isTop > 0.5) {
    float ph = wp.x * 0.9 + wp.z * 0.8;
    vec2 o = vec2(sin(t * 2.1 + ph) + 0.35 * sin(t * 5.1 + ph * 2.3), sin(t * 1.7 + ph * 1.3 + 1.0));
    return vec3(o.x, 0.0, o.y) * 0.075 * skyL;
  }
  return vec3(0.0);
}
`;

// Volumetric cloud density (shared by the cloud pass, cloud shadows and water reflections)
MC.SH.clouds = `
uniform sampler3D u_noise3D;
uniform vec3 u_cloudWind;
uniform float u_cloudCover;
const float CLOUD_BOT = 230.0;
const float CLOUD_TOP = 330.0;
float cloudDensity(vec3 p, bool detail) {
  float h = (p.y - CLOUD_BOT) / (CLOUD_TOP - CLOUD_BOT);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p * 0.0011 + u_cloudWind;
  vec4 lo = texture(u_noise3D, q * vec3(1.0, 1.4, 1.0));
  float cov = texture(u_noise3D, vec3(q.xz * 0.23, 0.5)).a;
  float shape = lo.r;
  float grad = smoothstep(0.0, 0.14, h) * smoothstep(1.0, 0.45 + cov * 0.35, h);
  float c = saturate(u_cloudCover + (cov - 0.5) * 0.9);
  float d = shape * grad - (1.0 - c);
  if (d <= 0.0) return 0.0;
  if (detail) {
    float dn = texture(u_noise3D, q * 3.7 + vec3(0.0, u_cloudWind.x * 0.5, 0.0)).g;
    d -= (1.0 - dn) * 0.22 * (1.0 - h * 0.5);
  }
  return max(d, 0.0) * 2.4;
}
`;
