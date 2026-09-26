'use strict';
// Terrain shaders: shadow map pass and the deferred G-buffer pass (with normal / parallax mapping).

MC.SH.terrainAttribs = `
layout(location = 0) in uvec4 a_pos;    // x*16, y*16, z*16, tile
layout(location = 1) in uvec4 a_attr;   // u, v, normal | ao<<3, material
layout(location = 2) in uvec4 a_light;  // sky, block, climate, tint
uniform vec3 u_chunkOffset;
uniform vec3 u_camPos;
uniform float u_time;
`;

MC.SH.shadowVS = MC.SH.header + MC.SH.common + MC.SH.wind + MC.SH.terrainAttribs + `
uniform mat4 u_shadowMat;
out vec2 v_uv;
flat out int v_tile;
flat out int v_mat;
void main() {
  vec3 p = vec3(a_pos.xyz) * (1.0 / 64.0) + u_chunkOffset;
  int mat = int(a_attr.w);
  p += windOffset(p + u_camPos, mat, a_attr.y == 0u ? 1.0 : 0.0, float(a_light.x) / 255.0, u_time);
  vec4 c = u_shadowMat * vec4(p, 1.0);
  c.xyz = shadowDistort(c.xyz);
  gl_Position = c;
  v_uv = vec2(a_attr.xy) * (1.0 / 16.0);
  v_tile = int(a_pos.w);
  v_mat = mat;
}`;

MC.SH.shadowFS = MC.SH.header + `
uniform sampler2DArray u_texAlbedo;
in vec2 v_uv;
flat in int v_tile;
flat in int v_mat;
out vec4 o_col;
void main() {
  if (v_mat == 1 || v_mat == 2 || v_mat == 6 || v_mat == 8) {
    if (texture(u_texAlbedo, vec3(v_uv, float(v_tile))).a < 0.5) discard;
  }
  o_col = vec4(gl_FragCoord.z);
}`;

MC.SH.gbufferVSBody = MC.SH.common + MC.SH.wind + MC.SH.terrainAttribs + `
uniform mat4 u_viewProj;
#ifdef HAND
uniform mat4 u_model;
#endif
out vec3 v_pos;
out vec2 v_uv;
out vec2 v_light;
out float v_ao;
out float v_clim;
flat out int v_tile;
flat out int v_nrm;
flat out int v_mat;
flat out int v_tint;
void main() {
  int mat = int(a_attr.w);
  float sky = float(a_light.x) / 255.0;
#ifdef HAND
  vec3 p = (u_model * vec4(vec3(a_pos.xyz) * (1.0 / 64.0), 1.0)).xyz;
#else
  vec3 p = vec3(a_pos.xyz) * (1.0 / 64.0) + u_chunkOffset;
  p += windOffset(p + u_camPos, mat, a_attr.y == 0u ? 1.0 : 0.0, sky, u_time);
#endif
  v_pos = p;
#ifdef HAND
  v_uv = vec2(a_attr.xy) * (1.0 / 240.0);
#else
  v_uv = vec2(a_attr.xy) * (1.0 / 16.0);
#endif
  v_light = vec2(sky, float(a_light.y) / 255.0);
  v_ao = float(a_attr.z >> 3u) / 3.0;
  v_clim = float(a_light.z) / 255.0;
  v_tile = int(a_pos.w);
  v_nrm = int(a_attr.z & 7u);
  v_mat = mat;
  v_tint = int(a_light.w);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
MC.SH.gbufferVS = MC.SH.header + MC.SH.gbufferVSBody;
MC.SH.handVS = MC.SH.header + '#define HAND' + String.fromCharCode(10) + MC.SH.gbufferVSBody;

MC.SH.tint = `
vec3 tintColor(int mode, float clim) {
  vec3 c = vec3(1.0);
  if (mode == 1 || mode == 3) {
    vec3 cold = vec3(0.46, 0.66, 0.53), mid = vec3(0.50, 0.74, 0.31), hot = vec3(0.76, 0.72, 0.35);
    c = clim < 0.5 ? mix(cold, mid, clim * 2.0) : mix(mid, hot, clim * 2.0 - 1.0);
  } else if (mode == 2) {
    vec3 cold = vec3(0.36, 0.60, 0.44), mid = vec3(0.36, 0.66, 0.20), hot = vec3(0.62, 0.66, 0.24);
    c = clim < 0.5 ? mix(cold, mid, clim * 2.0) : mix(mid, hot, clim * 2.0 - 1.0);
  } else if (mode == 4) c = vec3(0.50, 0.67, 0.33);
  else if (mode == 5) c = vec3(0.35, 0.53, 0.37);
  return pow(c, vec3(2.2));
}
`;

MC.SH.gbufferFSBody = MC.SH.common + MC.SH.tint + `
#ifdef HAND
uniform mat3 u_normalMat;
#endif
uniform sampler2DArray u_texAlbedo;
uniform sampler2DArray u_texNormal;
uniform sampler2DArray u_texSpec;
uniform float u_time;
uniform float u_pomDepth;   // 0 disables parallax
in vec3 v_pos;
in vec2 v_uv;
in vec2 v_light;
in float v_ao;
in float v_clim;
flat in int v_tile;
flat in int v_nrm;
flat in int v_mat;
flat in int v_tint;
layout(location = 0) out vec4 o_albedo;
layout(location = 1) out vec4 o_normal;
layout(location = 2) out vec4 o_mat;

vec2 parallax(vec2 uv, vec3 vTS, float layer, vec2 dx, vec2 dy, float fade) {
  const int STEPS = 20;
  // limit the offset at grazing angles (avoids smeared texels)
  vec2 delta = -vTS.xy / max(vTS.z, 0.55) * (u_pomDepth * fade * smoothstep(0.08, 0.45, vTS.z)) / float(STEPS);
  float stp = 1.0 / float(STEPS);
  float d = 0.0;
  vec2 cur = uv;
  float h = 1.0 - textureGrad(u_texNormal, vec3(clamp(cur, 0.001, 0.999), layer), dx, dy).a;
  for (int i = 0; i < STEPS; i++) {
    if (d >= h) break;
    cur += delta; d += stp;
    h = 1.0 - textureGrad(u_texNormal, vec3(clamp(cur, 0.001, 0.999), layer), dx, dy).a;
  }
  return cur;
}

void main() {
  float layer = float(v_tile);
  vec2 uv = v_uv;
  vec2 dx = dFdx(v_uv), dy = dFdy(v_uv);
  vec3 N = FACE_N[v_nrm], T = FACE_T[v_nrm], B = FACE_B[v_nrm];
#ifdef HAND
  N = u_normalMat * N; T = u_normalMat * T; B = u_normalMat * B;
#endif
  bool cutout = v_mat == 1 || v_mat == 2 || v_mat == 6 || v_mat == 8;
  float dist = length(v_pos);
  if (v_mat == 7) {
    uv += vec2(sin(u_time * 0.35 + v_uv.y * 6.2831), cos(u_time * 0.3 + v_uv.x * 6.2831)) * 0.06;
  }
  if (u_pomDepth > 0.0 && !cutout && v_mat != 7 && dist < 22.0) {
    vec3 V = normalize(-v_pos);
    vec3 vTS = vec3(dot(V, T), dot(V, B), dot(V, N));
    uv = parallax(uv, vTS, layer, dx, dy, smoothstep(22.0, 12.0, dist));
    uv = clamp(uv, vec2(0.5 / 16.0), vec2(1.0 - 0.5 / 16.0));
  }
  uv = pixelUV(uv, dx, dy);
  vec4 alb = textureGrad(u_texAlbedo, vec3(uv, layer), dx, dy);
  if (cutout && alb.a < 0.4) discard;
  if (v_tint != 0) {
    float m = v_tint == 3 ? alb.a : 1.0;
    alb.rgb *= mix(vec3(1.0), tintColor(v_tint, v_clim), m);
  }
  vec4 spec = textureGrad(u_texSpec, vec3(uv, layer), dx, dy);
  vec3 n = N;
  if (v_nrm < 6) {
    vec3 nt = textureGrad(u_texNormal, vec3(uv, layer), dx, dy).xyz * 2.0 - 1.0;
    nt.xy *= smoothstep(96.0, 24.0, dist);
    n = normalize(T * nt.x + B * nt.y + N * max(nt.z, 0.05));
  }
  float emit = spec.a;
  if (v_mat == 7) emit = 1.0;
  o_albedo = vec4(alb.rgb, emit);
  o_normal = vec4(octEncode(n), spec.r, spec.g);
#ifdef HAND
  int packNrm = 6;
#else
  int packNrm = v_nrm;
#endif
  o_mat = vec4(v_light.x, v_light.y, v_ao, float(packNrm + v_mat * 8) / 255.0);
}`;
MC.SH.gbufferFS = MC.SH.header + MC.SH.gbufferFSBody;
MC.SH.handFS = MC.SH.header + '#define HAND' + String.fromCharCode(10) + MC.SH.gbufferFSBody;
