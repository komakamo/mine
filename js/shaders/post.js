'use strict';
// Post-processing: volumetric light, composite (underwater), TAA, bloom, auto exposure, tonemap, FXAA.

MC.SH.volumetricFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_depth;
uniform sampler2DShadow u_shadowCmp;
uniform sampler2D u_shadowWater;
uniform sampler2D u_noise2D;
uniform mat4 u_invViewProj;
uniform mat4 u_shadowMat;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_camPos;
uniform float u_frame;
uniform float u_vlDensity;
uniform float u_underwater;
uniform float u_shadowRange;
uniform float u_time;
in vec2 v_uv;
out vec4 o_col;
float caustics(vec3 wp) {
  vec2 p = wp.xz + wp.y * 0.15;
  float t = u_time;
  float a = texture(u_noise2D, p * 0.045 + vec2(t * 0.018, t * 0.011)).r;
  float b = texture(u_noise2D, p * 0.06 + vec2(-t * 0.014, t * 0.02)).r;
  return pow(saturate(1.0 - abs(a - b) * 1.6), 10.0) * 2.4 + 0.45;
}
void main() {
  float d = texture(u_depth, v_uv).r;
  vec4 w = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 P = w.xyz / w.w;
  float dist = length(P);
  vec3 V = P / dist;
  bool uw = u_underwater > 0.5;
  float maxD = min(dist, uw ? 48.0 : 80.0);
  const int N = 14;
  float stepL = maxD / float(N);
  float jit = fract(ign(gl_FragCoord.xy) + u_frame * 0.61803);
  float mu = dot(V, u_lightDir);
  float phase = mix(phaseHG(mu, 0.65), 1.0 / (4.0 * PI), 0.5) * 4.0 * PI;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) + jit) * stepL;
    vec3 p = V * t;
    vec4 sp = u_shadowMat * vec4(p, 1.0);
    vec3 sc = shadowDistort(sp.xyz) * 0.5 + 0.5;
    float s = length(sp.xy) > 0.985 ? 1.0 : texture(u_shadowCmp, vec3(sc.xy, sc.z - 0.0005));
    vec3 tint = vec3(1.0);
    float wy = p.y + u_camPos.y;
    float dens;
    if (uw) {
      float wz = texture(u_shadowWater, sc.xy).r;
      float dw = max(sc.z - wz, 0.0) * u_shadowRange;
      tint = exp(-dw * vec3(0.30, 0.07, 0.045) - t * vec3(0.19, 0.05, 0.036)) * vec3(0.35, 0.85, 1.0) * caustics(p + u_camPos);
      dens = 0.0055;
    } else {
      dens = u_vlDensity * (0.45 + 0.9 * exp(-max(wy - 62.0, 0.0) / 16.0));
    }
    acc += tint * s * dens * stepL;
  }
  vec3 vl = acc * u_lightColor * phase;
  o_col = vec4(vl, 1.0);
}`;

MC.SH.compositeFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_scene;
uniform sampler2D u_vl;
uniform sampler2D u_depth;
uniform mat4 u_invViewProj;
uniform float u_underwater;
uniform float u_vlOn;
uniform vec3 u_ambUp;
uniform vec3 u_lightColor;
uniform vec3 u_lightDir;
in vec2 v_uv;
out vec4 o_col;
void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  if (u_underwater > 0.5) {
    float d = texture(u_depth, v_uv).r;
    vec4 w = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    float dist = min(length(w.xyz / w.w), 300.0);
    vec3 absorb = exp(-dist * vec3(0.19, 0.05, 0.036));
    vec3 fogc = (u_ambUp + u_lightColor * 0.35 * saturate(u_lightDir.y)) * vec3(0.02, 0.085, 0.095);
    c = c * absorb + fogc * (1.0 - absorb);
  }
  if (u_vlOn > 0.5) c += texture(u_vl, v_uv).rgb;
  o_col = vec4(c, 1.0);
}`;

MC.SH.taaFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_cur;
uniform sampler2D u_hist;
uniform sampler2D u_depth;
uniform mat4 u_invViewProjNJ;
uniform mat4 u_prevViewProj;
uniform vec3 u_camDelta;
uniform vec2 u_res;
uniform float u_histValid;
in vec2 v_uv;
out vec4 o_col;
vec3 rgb2ycocg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 ycocg2rgb(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 compress(vec3 c) { return c / (1.0 + luma(c)); }
vec3 uncompress(vec3 c) { return c / max(1.0 - luma(c), 1e-4); }
vec3 sampleHistory(vec2 uv) {
  // 5-tap Catmull-Rom
  vec2 pos = uv * u_res, tc = floor(pos - 0.5) + 0.5, f = pos - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, tc12 = (tc + w2 / w12) / u_res;
  vec2 tc0 = (tc - 1.0) / u_res, tc3 = (tc + 2.0) / u_res;
  vec3 r = texture(u_hist, vec2(tc12.x, tc0.y)).rgb * (w12.x * w0.y)
         + texture(u_hist, vec2(tc0.x, tc12.y)).rgb * (w0.x * w12.y)
         + texture(u_hist, tc12).rgb * (w12.x * w12.y)
         + texture(u_hist, vec2(tc3.x, tc12.y)).rgb * (w3.x * w12.y)
         + texture(u_hist, vec2(tc12.x, tc3.y)).rgb * (w12.x * w3.y);
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / ws, 0.0);
}
void main() {
  vec2 tx = 1.0 / u_res;
  float d = texture(u_depth, v_uv).r;
  d = min(d, texture(u_depth, v_uv + vec2(tx.x, tx.y)).r);
  d = min(d, texture(u_depth, v_uv + vec2(-tx.x, tx.y)).r);
  d = min(d, texture(u_depth, v_uv + vec2(tx.x, -tx.y)).r);
  d = min(d, texture(u_depth, v_uv - tx).r);
  vec4 w = u_invViewProjNJ * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 P = w.xyz / w.w;
  vec4 pc = u_prevViewProj * vec4(P + u_camDelta, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  bool hand = texture(u_depth, v_uv).r < 0.08;
  if (hand) { puv = v_uv; pc.w = 1.0; }
  vec3 cur = compress(texture(u_cur, v_uv).rgb);
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = rgb2ycocg(compress(texture(u_cur, v_uv + vec2(float(x), float(y)) * tx).rgb));
    m1 += c; m2 += c * c;
  }
  vec3 mean = m1 / 9.0, sigma = sqrt(abs(m2 / 9.0 - mean * mean));
  vec3 bmin = mean - sigma * 1.25, bmax = mean + sigma * 1.25;
  float blend = 0.9;
  if (u_histValid < 0.5 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0 || pc.w <= 0.0) blend = 0.0;
  vec3 res = cur;
  if (blend > 0.0) {
    vec3 h = rgb2ycocg(compress(sampleHistory(puv)));
    // clip towards the mean (variance clipping)
    vec3 center = 0.5 * (bmax + bmin), ext = 0.5 * (bmax - bmin) + 1e-4;
    vec3 v = h - center;
    vec3 a = abs(v / ext);
    float m = max(a.x, max(a.y, a.z));
    if (m > 1.0) h = center + v / m;
    float motion = length((puv - v_uv) * u_res);
    blend = hand ? 0.7 : mix(0.93, 0.8, saturate(motion * 0.1));
    res = ycocg2rgb(mix(rgb2ycocg(cur), h, blend));
  }
  o_col = vec4(uncompress(max(res, 0.0)), 1.0);
}`;

MC.SH.bloomDownFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_src;
uniform vec2 u_srcRes;
uniform float u_karis;
in vec2 v_uv;
out vec4 o_col;
vec3 s(vec2 o) { return texture(u_src, v_uv + o / u_srcRes).rgb; }
float kw(vec3 c) { return 1.0 / (1.0 + luma(c)); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 r;
  if (u_karis > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
    r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o_col = vec4(min(r, vec3(500.0)), 1.0);
}`;

MC.SH.bloomUpFS = MC.SH.header + `
uniform sampler2D u_src;
uniform vec2 u_srcRes;
uniform float u_radius;
in vec2 v_uv;
out vec4 o_col;
void main() {
  vec2 t = u_radius / u_srcRes;
  vec3 r = texture(u_src, v_uv + vec2(-t.x, t.y)).rgb + texture(u_src, v_uv + vec2(0.0, t.y)).rgb * 2.0 + texture(u_src, v_uv + vec2(t.x, t.y)).rgb
         + texture(u_src, v_uv + vec2(-t.x, 0.0)).rgb * 2.0 + texture(u_src, v_uv).rgb * 4.0 + texture(u_src, v_uv + vec2(t.x, 0.0)).rgb * 2.0
         + texture(u_src, v_uv + vec2(-t.x, -t.y)).rgb + texture(u_src, v_uv + vec2(0.0, -t.y)).rgb * 2.0 + texture(u_src, v_uv + vec2(t.x, -t.y)).rgb;
  o_col = vec4(r / 16.0, 1.0);
}`;

MC.SH.exposureFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_small;
uniform sampler2D u_prev;
uniform float u_dt;
uniform float u_minExp;
uniform float u_maxExp;
in vec2 v_uv;
out vec4 o_col;
void main() {
  float s = 0.0, ws = 0.0;
  for (int y = 0; y < 6; y++) for (int x = 0; x < 6; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / 6.0;
    float w = 1.0 - 0.7 * length(uv - 0.5);
    s += log(max(luma(texture(u_small, uv).rgb), 1e-5)) * w;
    ws += w;
  }
  float avg = exp(s / ws);
  float target = clamp(pow(0.16 / avg, 0.7), u_minExp, u_maxExp);
  float prev = texture(u_prev, vec2(0.5)).r;
  if (!(prev > 0.0) || prev > 100.0) prev = target;
  float k = 1.0 - exp(-u_dt * (target < prev ? 2.2 : 1.1));
  o_col = vec4(mix(prev, target, k), 0.0, 0.0, 1.0);
}`;

MC.SH.finalFS = MC.SH.header + MC.SH.common + `
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_exposure;
uniform vec2 u_res;
uniform float u_bloomStrength;
uniform float u_exposureBias;
uniform float u_saturation;
uniform float u_vignette;
uniform float u_sharpen;
uniform float u_time;
uniform float u_underwater;
uniform float u_rain;
uniform sampler2D u_depth;
uniform sampler2D u_rainMap;
uniform vec2 u_rainOrigin;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_rainColor;
in vec2 v_uv;
out vec4 o_col;

// Falling rain streaks on a few cylinders around the camera, hidden under roofs / trees
float rainStreaks(vec3 V, float sceneDist) {
  float lxz = length(V.xz);
  if (lxz < 0.05) return 0.0;
  float ang = atan(V.z, V.x);
  float acc = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float r = 1.6 + fi * 1.2 + fi * fi * 1.5;
    float t = r / lxz;
    if (t > sceneDist) break;
    vec3 p = u_camPos + V * t;
    vec2 muv = (p.xz - u_rainOrigin) / 128.0;
    if (all(greaterThan(muv, vec2(0.0))) && all(lessThan(muv, vec2(1.0))) && p.y < texture(u_rainMap, muv).r) continue;
    float cellH = 0.2 + r * 0.22;
    vec2 st = vec2(ang * (55.0 + fi * 30.0), (p.y + u_time * 12.0) / cellH + fi * 0.37);
    st.x += st.y * 0.05;
    vec2 cell = floor(st), f = fract(st);
    vec3 h = hash33(vec3(cell, fi * 13.1 + 1.7));
    if (h.z > 0.36) continue;
    float x0 = 0.2 + 0.6 * h.x;
    float len = 0.25 + 0.3 * h.y;
    float y0 = (h.z / 0.36) * (1.0 - len);
    float wdt = mix(0.05, 0.02, fi / 3.0);
    float streak = smoothstep(wdt, 0.0, abs(f.x - x0)) * smoothstep(y0, y0 + 0.08, f.y) * smoothstep(y0 + len, y0 + len - 0.15, f.y);
    acc += streak * (1.0 - fi * 0.18);
  }
  return acc;
}

void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  if (u_rain > 0.01 && u_underwater < 0.5) {
    float d = texture(u_depth, v_uv).r;
    vec4 w = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec3 P = w.xyz / w.w;
    float sd = d >= 1.0 ? 1e4 : length(P);
    float rs = rainStreaks(normalize(P), sd);
    c = mix(c, u_rainColor, saturate(rs * 0.22 * u_rain));
  }
  if (u_sharpen > 0.0) {
    vec2 t = 1.0 / u_res;
    vec3 nb = texture(u_scene, v_uv + vec2(t.x, 0.0)).rgb + texture(u_scene, v_uv - vec2(t.x, 0.0)).rgb
            + texture(u_scene, v_uv + vec2(0.0, t.y)).rgb + texture(u_scene, v_uv - vec2(0.0, t.y)).rgb;
    c = max(c + (c - nb * 0.25) * u_sharpen, 0.0);
  }
  vec3 b = texture(u_bloom, v_uv).rgb / 6.0;
  c = mix(c, b, u_bloomStrength);
  float e = texture(u_exposure, vec2(0.5)).r * u_exposureBias;
  c *= e;
  if (u_underwater > 0.5) c *= vec3(0.85, 1.0, 1.05);
  c = acesFitted(c);
  float l = luma(c);
  c = max(mix(vec3(l), c, u_saturation), 0.0);
  vec2 q = v_uv - 0.5;
  c *= mix(1.0, smoothstep(0.95, 0.25, length(q * vec2(1.1, 1.0)) * 1.1), u_vignette);
  c = linearToSrgb(c);
  c += (hash12(gl_FragCoord.xy + fract(u_time * 7.13) * 100.0) - 0.5) / 255.0;
  o_col = vec4(c, 1.0);
}`;

MC.SH.fxaaFS = MC.SH.header + `
uniform sampler2D u_tex;
uniform vec2 u_res;
in vec2 v_uv;
out vec4 o_col;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 r = 1.0 / u_res;
  vec3 nw = texture(u_tex, v_uv + vec2(-1.0, -1.0) * r).rgb, ne = texture(u_tex, v_uv + vec2(1.0, -1.0) * r).rgb;
  vec3 sw = texture(u_tex, v_uv + vec2(-1.0, 1.0) * r).rgb, se = texture(u_tex, v_uv + vec2(1.0, 1.0) * r).rgb;
  vec3 m = texture(u_tex, v_uv).rgb;
  float lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se), lM = lum(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * r;
  vec3 a = 0.5 * (texture(u_tex, v_uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(u_tex, v_uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(u_tex, v_uv - dir * 0.5).rgb + texture(u_tex, v_uv + dir * 0.5).rgb);
  float lB = lum(b);
  o_col = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;

// Simple blit (for render-scale upscaling when no other pass writes to the screen)
MC.SH.blitFS = MC.SH.header + `
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o_col;
void main() { o_col = texture(u_tex, v_uv); }`;
