'use strict';
// Translucent pass: water (refraction, absorption, SSR reflections, sun glints) and glass / ice.

MC.SH.waterVS = MC.SH.header + MC.SH.terrainAttribs + `
uniform mat4 u_viewProj;
out vec3 v_pos;
out vec2 v_uv;
out vec2 v_light;
flat out int v_tile;
flat out int v_nrm;
flat out int v_mat;
void main() {
  vec3 p = vec3(a_pos.xyz) * (1.0 / 64.0) + u_chunkOffset;
  v_pos = p;
  v_uv = vec2(a_attr.xy) * (1.0 / 16.0);
  v_light = vec2(float(a_light.x), float(a_light.y)) / 255.0;
  v_tile = int(a_pos.w);
  v_nrm = int(a_attr.z & 7u);
  v_mat = int(a_attr.w);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

MC.SH.waterFS = MC.SH.header + MC.SH.common + MC.SH.clouds + MC.SH.skyFns + `
uniform sampler2D u_sceneCopy;
uniform sampler2D u_depthCopy;
uniform sampler2DArray u_texAlbedo;
uniform sampler2DShadow u_shadowCmp;
uniform mat4 u_viewProj;
uniform mat4 u_shadowMat;
uniform float u_shadowHalf;
uniform float u_shadowRes;
uniform float u_shadowRange;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform vec3 u_ambSide;
uniform vec3 u_ambDown;
uniform vec2 u_resolution;
uniform float u_near;
uniform float u_far;
uniform float u_frame;
uniform int u_ssr;
uniform float u_cloudsOn;
in vec3 v_pos;
in vec2 v_uv;
in vec2 v_light;
flat in int v_tile;
flat in int v_nrm;
flat in int v_mat;
out vec4 o_col;

float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near));
}
float waveHeight(vec2 p) {
  float t = u_time;
  float h = texture(u_noise2D, p * 0.021 + vec2(t * 0.010, t * 0.006)).r * 0.52;
  h += texture(u_noise2D, p * 0.047 + vec2(-t * 0.015, t * 0.011)).g * 0.27;
  h += texture(u_noise2D, p * 0.103 + vec2(t * 0.020, -t * 0.018)).b * 0.14;
  h += texture(u_noise2D, p * 0.23 + vec2(-t * 0.028, -t * 0.024)).a * 0.07;
  return h;
}
vec3 waterNormal(vec2 p, float strength) {
  const float e = 0.06;
  float h0 = waveHeight(p);
  float hx = waveHeight(p + vec2(e, 0.0)), hz = waveHeight(p + vec2(0.0, e));
  return normalize(vec3(-(hx - h0) / e * strength, 1.0, -(hz - h0) / e * strength));
}
vec3 ambientLight(vec3 N) {
  return N.y >= 0.0 ? mix(u_ambSide, u_ambUp, N.y) : mix(u_ambSide, u_ambDown, -N.y);
}
float simpleShadow(vec3 P, vec3 N) {
  vec4 sp = u_shadowMat * vec4(P + N * 0.05, 1.0);
  float r = length(sp.xy);
  if (r > 0.985) return 1.0;
  float f = r * (1.0 - SHADOW_DISTORT) + SHADOW_DISTORT;
  vec3 sc = shadowDistort(sp.xyz) * 0.5 + 0.5;
  float z = sc.z - 0.04 / u_shadowRange;
  float tx = 1.0 / u_shadowRes;
  float s = 0.0;
  for (int i = 0; i < 4; i++) s += texture(u_shadowCmp, vec3(sc.xy + vogel(i, 4, 1.3) * tx * 1.5, z));
  return s * 0.25;
}
vec3 skyReflection(vec3 R, vec3 wp) {
  vec3 c = skyBase(R);
  if (u_cloudsOn > 0.5 && R.y > 0.02) {
    float t = (CLOUD_BOT + 40.0 - wp.y) / R.y;
    vec3 p = wp + R * t;
    float d = cloudDensity(p, false);
    float a = saturate(d * 1.4) * smoothstep(0.02, 0.15, R.y) * exp(-t * 0.00005);
    vec3 cc = u_ambUp * 1.3 + u_lightColor * 0.35;
    c = mix(c, cc, a);
  }
  return c;
}
vec4 traceSSR(vec3 P, vec3 R, float jitter) {
  float stepLen = 0.35 + length(P) * 0.012;
  vec3 pos = P + R * stepLen * jitter;
  for (int i = 0; i < 30; i++) {
    vec3 prev = pos;
    pos += R * stepLen;
    stepLen *= 1.16;
    vec4 c = u_viewProj * vec4(pos, 1.0);
    if (c.w <= 0.05) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float sd = texture(u_depthCopy, uv).r;
    if (sd >= 1.0) continue;
    float sceneLin = linDepth(sd);
    if (c.w > sceneLin) {
      if (c.w - sceneLin > stepLen * 1.5 + 0.6) break;
      vec3 a = prev, b = pos;
      for (int k = 0; k < 6; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = u_viewProj * vec4(m, 1.0);
        vec2 um = cm.xy / cm.w * 0.5 + 0.5;
        if (cm.w > linDepth(texture(u_depthCopy, um).r)) b = m; else a = m;
      }
      vec4 cb = u_viewProj * vec4(b, 1.0);
      uv = cb.xy / cb.w * 0.5 + 0.5;
      vec2 edge = smoothstep(0.0, 0.07, uv) * smoothstep(1.0, 0.93, uv);
      return vec4(texture(u_sceneCopy, uv).rgb, edge.x * edge.y);
    }
  }
  return vec4(0.0);
}
vec3 specGGX(vec3 N, vec3 Vv, vec3 L, float pr, vec3 F0) {
  vec3 H = normalize(L + Vv);
  float NdotH = saturate(dot(N, H)), NdotL = saturate(dot(N, L)), NdotV = max(dot(N, Vv), 1e-3), VdotH = saturate(dot(Vv, H));
  float a = max(pr * pr, 0.002), a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float k = a * 0.5;
  float Gv = NdotL / (NdotL * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
  return min(D * Gv * F / (4.0 * NdotV) * NdotL, vec3(80.0));
}

void main() {
  vec2 suv = gl_FragCoord.xy / u_resolution;
  vec3 P = v_pos;
  float dist = length(P);
  vec3 V = P / dist;
  vec3 Nf = FACE_N[v_nrm];
  float skyL = v_light.x;
  vec3 wp = P + u_camPos;
  float jitter = fract(ign(gl_FragCoord.xy) + u_frame * 0.61803);
  float lightI = max(u_lightColor.r, max(u_lightColor.g, u_lightColor.b));

  if (v_mat == 3) {
    vec3 N = Nf;
    float str = 0.6 / (1.0 + dist * 0.012);
    if (v_nrm == 2) N = waterNormal(wp.xz, str);
    else N = normalize(Nf + waterNormal(wp.xz + wp.y, str * 0.5) * 0.3 - vec3(0.0, 0.3, 0.0));
    bool under = dot(V, Nf) > 0.0;
    if (under) N = -N;
    float NdV = saturate(dot(N, -V));
    float waterLin = linDepth(gl_FragCoord.z);
    float sceneD = texture(u_depthCopy, suv).r;
    float sceneLin = sceneD >= 1.0 ? 1e4 : linDepth(sceneD);
    vec2 off = (N.xz - Nf.xz * dot(N, Nf)) * 0.08 * saturate((sceneLin - waterLin) * 0.3) / (1.0 + waterLin * 0.04);
    vec2 ruv = suv + off;
    float rD = texture(u_depthCopy, ruv).r;
    float rLin = rD >= 1.0 ? 1e4 : linDepth(rD);
    if (rLin < waterLin) { ruv = suv; rLin = sceneLin; }
    vec3 refr = texture(u_sceneCopy, ruv).rgb;
    float sh = lightI > 1e-4 ? simpleShadow(P, Nf) : 0.0;
    vec3 L = u_lightDir;
    vec3 col;
    if (!under) {
      float thick = min((rLin - waterLin) * dist / max(waterLin, 1e-3), 400.0);
      vec3 absorb = exp(-thick * vec3(0.26, 0.060, 0.040));
      vec3 scatterLight = u_ambUp * skyL * skyL + u_lightColor * sh * saturate(L.y) * 0.4;
      vec3 inscatter = scatterLight * vec3(0.012, 0.062, 0.105);
      vec3 refracted = refr * absorb + inscatter * (1.0 - absorb.g);
      vec3 R = reflect(V, N);
      R.y = abs(R.y);
      vec3 refl = skyReflection(R, wp) * (skyL * skyL * 0.95 + 0.05);
      if (u_ssr == 1) {
        vec4 s = traceSSR(P, R, jitter);
        refl = mix(refl, s.rgb, s.a);
      }
      float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
      col = mix(refracted, refl, F);
      col += u_lightColor * sh * specGGX(N, -V, L, 0.07, vec3(0.02)) * 1.5;
      col = applyFog(col, P, dist, skyL);
    } else {
      // looking up at the surface from below: Snell's window + total internal reflection
      float cosT = NdV;
      float sin2 = (1.0 - cosT * cosT) * 1.77;
      vec3 deep = (u_ambUp * skyL + u_lightColor * 0.2) * vec3(0.02, 0.08, 0.09);
      if (sin2 >= 1.0) col = deep;
      else {
        float F = 0.02 + 0.98 * pow(1.0 - sqrt(1.0 - sin2), 5.0);
        col = mix(refr * vec3(0.8, 0.95, 1.0), deep, F);
      }
    }
    o_col = vec4(col, 1.0);
    return;
  }

  // glass / ice
  vec2 gdx = dFdx(v_uv), gdy = dFdy(v_uv);
  vec4 t = textureGrad(u_texAlbedo, vec3(pixelUV(v_uv, gdx, gdy), float(v_tile)), gdx, gdy);
  vec3 N = Nf;
  if (dot(N, V) > 0.0) N = -N;
  float NdV = saturate(dot(N, -V));
  float sh = lightI > 1e-4 ? simpleShadow(P, Nf) : 0.0;
  vec3 bl = vec3(1.0, 0.6, 0.32) * pow(v_light.y, 4.0) * 1.45;
  vec3 lit = t.rgb * (ambientLight(N) * skyL * skyL + bl + u_lightColor * sh * saturate(dot(N, u_lightDir)));
  float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  vec3 refl = skyBase(reflect(V, N)) * skyL * skyL;
  float a = t.a;
  vec3 col = lit * a + refl * F + u_lightColor * sh * specGGX(N, -V, u_lightDir, 0.05, vec3(0.04));
  float alpha = saturate(a + F * 0.6);
  col = applyFog(col / max(alpha, 1e-3), P, dist, skyL) * alpha;
  o_col = vec4(col, alpha);
}`;

MC.SH.outlineVS = MC.SH.header + `
layout(location = 0) in vec3 a_p;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform vec3 u_size;
void main() { gl_Position = u_viewProj * vec4(a_p * u_size + u_offset, 1.0); }`;
MC.SH.outlineFS = MC.SH.header + `
out vec4 o_col;
void main() { o_col = vec4(0.0, 0.0, 0.0, 0.6); }`;
