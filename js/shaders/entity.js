'use strict';
// Entity / particle batch shaders. Geometry is transformed on the CPU into camera-relative floats and
// written to the same G-buffer as the terrain, so mobs get the full deferred lighting, shadows and fog.
// Vertex: pos(3) uvt(3: u, v, tile) nrm(3) tan(3) light(2) tint(4: rgb multiplier, emission) mat(1)

MC.SH.entityAttribs = `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_uvt;
layout(location = 2) in vec3 a_nrm;
layout(location = 3) in vec3 a_tan;
layout(location = 4) in vec2 a_light;
layout(location = 5) in vec4 a_tint;
layout(location = 6) in float a_mat;
`;

MC.SH.entityVS = MC.SH.header + MC.SH.entityAttribs + `
uniform mat4 u_viewProj;
out vec3 v_pos;
out vec2 v_uv;
flat out float v_tile;
out vec3 v_N;
out vec3 v_T;
out vec2 v_light;
out vec4 v_tint;
flat out int v_mat;
void main() {
  v_pos = a_pos;
  v_uv = a_uvt.xy;
  v_tile = a_uvt.z;
  v_N = a_nrm;
  v_T = a_tan;
  v_light = a_light;
  v_tint = a_tint;
  v_mat = int(a_mat + 0.5);
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}`;

MC.SH.entityFS = MC.SH.header + MC.SH.common + `
uniform sampler2DArray u_texAlbedo;
uniform sampler2DArray u_texNormal;
uniform sampler2DArray u_texSpec;
in vec3 v_pos;
in vec2 v_uv;
flat in float v_tile;
in vec3 v_N;
in vec3 v_T;
in vec2 v_light;
in vec4 v_tint;
flat in int v_mat;
layout(location = 0) out vec4 o_albedo;
layout(location = 1) out vec4 o_normal;
layout(location = 2) out vec4 o_mat;
void main() {
  vec2 dx = dFdx(v_uv * 16.0) / 16.0, dy = dFdy(v_uv * 16.0) / 16.0;
  vec2 uv = pixelUV(v_uv, dx, dy);
  vec4 alb = textureGrad(u_texAlbedo, vec3(uv, v_tile), dx, dy);
  if (alb.a < 0.4) discard;
  alb.rgb *= v_tint.rgb;
  vec4 spec = textureGrad(u_texSpec, vec3(uv, v_tile), dx, dy);
  vec3 N = normalize(v_N);
  vec3 T = v_T - N * dot(v_T, N);
  T = length(T) > 1e-4 ? normalize(T) : vec3(1.0, 0.0, 0.0);
  vec3 B = cross(T, N);
  vec3 nt = textureGrad(u_texNormal, vec3(uv, v_tile), dx, dy).xyz * 2.0 - 1.0;
  nt.xy *= 0.7 * smoothstep(64.0, 16.0, length(v_pos));
  vec3 n = normalize(T * nt.x + B * nt.y + N * max(nt.z, 0.05));
  if (!gl_FrontFacing) n = -n;
  float emit = max(spec.a, v_tint.a);
  o_albedo = vec4(alb.rgb, emit);
  o_normal = vec4(octEncode(n), spec.r, spec.g);
  vec3 an = abs(N);
  int ni = (an.x > an.y && an.x > an.z) ? (N.x > 0.0 ? 0 : 1) : (an.y > an.z ? (N.y > 0.0 ? 2 : 3) : (N.z > 0.0 ? 4 : 5));
  o_mat = vec4(v_light.x, v_light.y, 1.0, float(ni + v_mat * 8) / 255.0);
}`;

MC.SH.shadowEntityVS = MC.SH.header + MC.SH.common + MC.SH.entityAttribs + `
uniform mat4 u_shadowMat;
out vec2 v_uv;
flat out float v_tile;
void main() {
  vec4 c = u_shadowMat * vec4(a_pos, 1.0);
  c.xyz = shadowDistort(c.xyz);
  gl_Position = c;
  v_uv = a_uvt.xy;
  v_tile = a_uvt.z;
}`;

MC.SH.shadowEntityFS = MC.SH.header + `
uniform sampler2DArray u_texAlbedo;
in vec2 v_uv;
flat in float v_tile;
out vec4 o_col;
void main() {
  if (texture(u_texAlbedo, vec3(v_uv, v_tile)).a < 0.5) discard;
  o_col = vec4(gl_FragCoord.z);
}`;

// block breaking cracks: multiplicative decal drawn after lighting
MC.SH.crackVS = MC.SH.header + `
layout(location = 0) in vec3 a_p;
layout(location = 1) in vec2 a_uv;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform vec3 u_size;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec3 c = vec3(0.5) * u_size;
  vec3 p = (a_p - 0.5) * (u_size + 0.004) + c;
  gl_Position = u_viewProj * vec4(p + u_offset, 1.0);
}`;
MC.SH.crackFS = MC.SH.header + `
precision highp sampler2DArray;
uniform sampler2DArray u_texAlbedo;
uniform float u_tile;
uniform float u_stage;
in vec2 v_uv;
out vec4 o_col;
void main() {
  ivec2 t = clamp(ivec2(floor(v_uv * 16.0)), ivec2(0), ivec2(15));
  float a = texelFetch(u_texAlbedo, ivec3(t, int(u_tile)), 0).a;
  if (a <= 0.01 || a > u_stage) discard;
  o_col = vec4(vec3(0.28), 1.0);
}`;
