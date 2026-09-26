'use strict';
// Sky LUT (physically based single scattering), volumetric clouds and the deferred lighting pass.

MC.SH.skyLutFS = MC.SH.header + MC.SH.common + `
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
in vec2 v_uv;
out vec4 o_col;
const float RP = 6371e3, RA = 6471e3;
const vec3 K_RLH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const float K_MIE = 13e-6, SH_RLH = 8e3, SH_MIE = 1.2e3, G = 0.76;
const vec3 K_OZO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
float ozone(float h) { return max(0.0, 1.0 - abs(h - 25000.0) / 15000.0); }
vec2 rsi(vec3 o, vec3 d, float r) {
  float a = dot(d, d), b = 2.0 * dot(d, o), c = dot(o, o) - r * r;
  float disc = b * b - 4.0 * a * c;
  if (disc < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s) / (2.0 * a);
}
vec3 atmosphere(vec3 dir, vec3 L, float I) {
  vec3 r0 = vec3(0.0, RP + 400.0, 0.0);
  vec2 p = rsi(r0, dir, RA);
  if (p.x > p.y) return vec3(0.0);
  vec2 pl = rsi(r0, dir, RP);
  float t1 = p.y;
  if (pl.x < pl.y && pl.x > 0.0) t1 = min(t1, pl.x);
  float t0 = max(p.x, 0.0);
  const int IS = 20, JS = 8;
  float mu = dot(dir, L), gg = G * G;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float pM = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mu * mu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * G, 1.5) * (2.0 + gg));
  vec3 tR = vec3(0.0), tM = vec3(0.0);
  float odR = 0.0, odM = 0.0, odO = 0.0;
  for (int i = 0; i < IS; i++) {
    // quadratic step distribution: dense near the observer (long horizon rays stay accurate)
    float a = float(i) / float(IS), b = float(i + 1) / float(IS);
    float ta = t0 + (t1 - t0) * a * a, tb = t0 + (t1 - t0) * b * b;
    float ds = tb - ta;
    vec3 pos = r0 + dir * (0.5 * (ta + tb));
    float h = length(pos) - RP;
    float sR = exp(-h / SH_RLH) * ds, sM = exp(-h / SH_MIE) * ds;
    odR += sR; odM += sM; odO += ozone(h) * ds;
    float js = rsi(pos, L, RA).y / float(JS);
    float jR = 0.0, jM = 0.0, jO = 0.0;
    for (int j = 0; j < JS; j++) {
      float hj = length(pos + L * (js * (float(j) + 0.5))) - RP;
      jR += exp(-hj / SH_RLH) * js; jM += exp(-hj / SH_MIE) * js; jO += ozone(hj) * js;
    }
    vec3 att = exp(-(K_MIE * 1.1 * (odM + jM) + K_RLH * (odR + jR) + K_OZO * (odO + jO)));
    tR += sR * att; tM += sM * att;
  }
  return I * (pR * K_RLH * tR + pM * K_MIE * tM);
}
void main() {
  vec3 d = skyDirFromUV(v_uv);
  d.y = max(d.y, 0.0);
  d = normalize(d);
  vec3 c = atmosphere(d, u_sunDir, 20.0);
  c += atmosphere(d, u_moonDir, 0.1) * vec3(0.62, 0.78, 1.0);
  c += vec3(0.0028, 0.0042, 0.0085);
  o_col = vec4(c, 1.0);
}`;

// Sky helpers shared by deferred lighting and the water shader
MC.SH.skyFns = `
uniform sampler2D u_skyLUT;
uniform sampler2D u_noise2D;
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
uniform vec3 u_sunTrans;
uniform vec3 u_moonTrans;
uniform float u_starF;
uniform float u_sunAngle;
uniform float u_fogDensity;
uniform float u_mist;
uniform float u_renderDist;
uniform vec3 u_camPos;
uniform float u_time;
uniform float u_rain;
uniform vec3 u_seaColor;

vec3 skyLUTColor(vec3 V) {
  vec3 c = texture(u_skyLUT, skyUV(V)).rgb;
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(c, vec3(l) * vec3(0.6, 0.64, 0.7), u_rain * 0.85);
}
// Sky above the horizon; below it a distant hazy sea-level surface (the world beyond render distance)
vec3 skyBase(vec3 V) {
  if (V.y >= 0.0) return skyLUTColor(V);
  float c = -V.y;
  vec2 hxz = length(V.xz) > 1e-4 ? normalize(V.xz) : vec2(1.0, 0.0);
  vec3 hz = skyLUTColor(vec3(hxz.x, 0.0, hxz.y));
  vec3 refl = skyLUTColor(normalize(vec3(V.x, c + 0.07, V.z)));
  float fres = 0.02 + 0.98 * pow(1.0 - c, 5.0);
  vec3 sea = mix(u_seaColor, refl, fres);
  float t = max(u_camPos.y - 63.9, 2.0) / max(c, 1e-4);
  return mix(sea, hz, 1.0 - exp(-t * 0.0035));
}
vec3 rotateAxis(vec3 v, vec3 a, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
vec3 starField(vec3 V) {
  vec3 d = rotateAxis(V, vec3(0.0, -0.4078, 0.9131), -u_sunAngle);
  vec3 p = d * 230.0;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x < 0.985) return vec3(0.0);
  vec3 sp = normalize(cell + 0.2 + 0.6 * hash33(cell + 7.31));
  float sd = 1.0 - dot(d, sp);
  float b = smoothstep(1.4e-6, 0.0, sd);
  float tw = 0.75 + 0.25 * sin(u_time * (2.0 + h.z * 5.0) + h.y * 40.0);
  vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h.y);
  return col * b * (0.04 + pow(h.z, 6.0) * 0.5) * tw;
}
vec3 skyFull(vec3 V) {
  vec3 c = skyBase(V);
  float hf = smoothstep(-0.03, 0.02, V.y);
  float cs = dot(V, u_sunDir);
  float clear = 1.0 - u_rain;
  c += u_sunTrans * smoothstep(0.99985, 0.99993, cs) * 90.0 * hf * clear;
  float cm = dot(V, u_moonDir);
  if (cm > 0.9985) {
    float disc = smoothstep(0.99935, 0.99945, cm);
    vec3 up = abs(u_moonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 mx = normalize(cross(up, u_moonDir)), my = cross(u_moonDir, mx);
    vec2 q = vec2(dot(V, mx), dot(V, my)) / 0.034;
    float cr = texture(u_noise2D, q * 0.22 + 0.37).g * 0.6 + texture(u_noise2D, q * 0.6 + 0.11).b * 0.4;
    float limb = sqrt(saturate(1.0 - dot(q, q)));
    c += vec3(0.85, 0.9, 1.0) * (0.45 + 0.55 * cr) * (0.6 + 0.4 * limb) * disc * 1.4 * hf * (0.3 + 0.7 * u_starF) * clear;
  }
  c += vec3(0.55, 0.65, 1.0) * pow(saturate(cm), 600.0) * 0.05 * u_starF * hf;
  if (u_starF > 0.001) c += starField(V) * u_starF * hf * clear;
  return c;
}
vec3 applyFog(vec3 col, vec3 P, float dist, float skyL) {
  vec3 V = P / max(dist, 1e-3);
  vec3 hazeCol = skyBase(normalize(vec3(V.x, max(V.y, 0.03), V.z)));
  float hMid = u_camPos.y + P.y * 0.5 - 64.0;
  float dens = u_fogDensity * (1.0 + u_mist * 4.0 * exp(-max(hMid, 0.0) / 14.0));
  float fog = 1.0 - exp(-dist * dens);
  float border = smoothstep(u_renderDist * 0.72, u_renderDist * 0.97, length(P.xz));
  col = mix(col, hazeCol * mix(0.12, 1.0, skyL), fog);
  return mix(col, skyBase(V), border);
}
`;

MC.SH.cloudsFS = MC.SH.header + MC.SH.common + MC.SH.clouds + `
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform float u_frame;
in vec2 v_uv;
out vec4 o_col;
void main() {
  vec4 w = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 V = normalize(w.xyz / w.w);
  vec4 res = vec4(0.0, 0.0, 0.0, 1.0);
  if (V.y > 0.01 && u_camPos.y < CLOUD_BOT) {
    float t0 = (CLOUD_BOT - u_camPos.y) / V.y;
    float t1 = min((CLOUD_TOP - u_camPos.y) / V.y, t0 + 1800.0);
    if (t0 < 20000.0) {
      const int N = 22;
      float dt = (t1 - t0) / float(N);
      float t = t0 + dt * fract(ign(gl_FragCoord.xy) + u_frame * 0.61803);
      float mu = dot(V, u_lightDir);
      float phase = mix(phaseHG(mu, 0.65), phaseHG(mu, -0.15), 0.35) * 4.0 * PI;
      vec3 scat = vec3(0.0);
      float trans = 1.0;
      for (int i = 0; i < N; i++) {
        vec3 p = u_camPos + V * t;
        float d = cloudDensity(p, true);
        if (d > 0.002) {
          float od = 0.0;
          for (int j = 1; j <= 4; j++) {
            float fj = float(j);
            od += cloudDensity(p + u_lightDir * (fj * fj * 9.0), false) * (2.0 * fj - 1.0) * 9.0;
          }
          float h = saturate((p.y - CLOUD_BOT) / (CLOUD_TOP - CLOUD_BOT));
          float lightT = exp(-od * 0.05) + 0.25 * exp(-od * 0.012);
          float powder = 1.0 - exp(-d * 3.0);
          vec3 S = u_lightColor * lightT * phase * mix(0.6, 1.0, powder) * 0.55 + u_ambUp * (0.55 + 0.6 * h);
          float Ti = exp(-d * 0.05 * dt);
          scat += trans * S * (1.0 - Ti);
          trans *= Ti;
          if (trans < 0.02) break;
        }
        t += dt;
      }
      float fade = smoothstep(0.01, 0.12, V.y) * exp(-t0 * 0.00004);
      res = vec4(scat * fade, mix(1.0, trans, fade));
    }
  }
  o_col = res;
}`;

MC.SH.deferredFS = MC.SH.header + MC.SH.common + MC.SH.clouds + MC.SH.skyFns + `
uniform sampler2D u_albedo;
uniform sampler2D u_normal;
uniform sampler2D u_mat;
uniform sampler2D u_depth;
uniform sampler2D u_clouds;
uniform sampler2D u_shadowDepth;
uniform sampler2DShadow u_shadowCmp;
uniform sampler2D u_shadowWater;
uniform mat4 u_invViewProj;
uniform mat4 u_shadowMat;
uniform float u_shadowHalf;
uniform float u_shadowRes;
uniform float u_shadowRange;
uniform int u_shadowQuality;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform vec3 u_ambSide;
uniform vec3 u_ambDown;
uniform float u_frame;
uniform float u_handLight;
uniform float u_cloudsOn;
uniform float u_wet;
in vec2 v_uv;
out vec4 o_col;

float caustics(vec3 wp) {
  vec2 p = wp.xz + wp.y * 0.15;
  float t = u_time;
  float a = texture(u_noise2D, p * 0.045 + vec2(t * 0.018, t * 0.011)).r;
  float b = texture(u_noise2D, p * 0.06 + vec2(-t * 0.014, t * 0.02)).r;
  float c = 1.0 - abs(a - b) * 1.6;
  return pow(saturate(c), 10.0) * 2.4 + 0.45;
}

float getShadow(vec3 P, vec3 geoN, float jitter, float skyL, out vec3 tint, out bool submerged) {
  tint = vec3(1.0);
  submerged = false;
  vec4 sp = u_shadowMat * vec4(P, 1.0);
  float r = length(sp.xy);
  if (r > 0.985 || abs(sp.z) > 0.99) {
    // beyond the shadow map: assume sea-level water above submerged surfaces
    float wy = P.y + u_camPos.y;
    if (wy < 63.5 && skyL < 0.97) {
      float dW = (63.875 - wy) / max(u_lightDir.y, 0.15);
      tint = exp(-dW * vec3(0.32, 0.075, 0.05)) * caustics(P + u_camPos);
      submerged = true;
    }
    return 1.0;
  }
  float f = r * (1.0 - SHADOW_DISTORT) + SHADOW_DISTORT;
  float uvPerWorld = 0.5 * SHADOW_DISTORT / (f * f) / u_shadowHalf;
  float texelWorld = (1.0 / u_shadowRes) / uvPerWorld;
  vec3 offP = P + geoN * (texelWorld * 1.1 + 0.015);
  sp = u_shadowMat * vec4(offP, 1.0);
  vec3 sc = shadowDistort(sp.xyz) * 0.5 + 0.5;
  float bias = 0.03 / u_shadowRange;
  float z = sc.z - bias;
  float ang = jitter * 6.2831853;
  float texel = 1.0 / u_shadowRes;
  float s = 0.0;
  if (u_shadowQuality == 0) {
    s = texture(u_shadowCmp, vec3(sc.xy, z));
  } else {
    // PCSS: blocker search then variable-size PCF
    float searchR = max(0.9 * uvPerWorld, 2.0 * texel);
    float blk = 0.0, nb = 0.0;
    for (int i = 0; i < 8; i++) {
      float d = texture(u_shadowDepth, sc.xy + vogel(i, 8, ang) * searchR).r;
      if (d < z) { blk += d; nb += 1.0; }
    }
    if (nb < 0.5) s = 1.0;
    else {
      blk /= nb;
      float pen = (z - blk) * u_shadowRange * 0.028 + 0.02;
      float rad = clamp(pen * uvPerWorld, 0.8 * texel, 14.0 * texel);
      const int NS = 12;
      for (int i = 0; i < NS; i++) s += texture(u_shadowCmp, vec3(sc.xy + vogel(i, NS, ang) * rad, z));
      s /= float(NS);
    }
  }
  // light passing through water: absorption + caustics
  float wz = texture(u_shadowWater, sc.xy).r;
  if (wz < z) {
    float depthW = (z - wz) * u_shadowRange;
    tint = exp(-depthW * vec3(0.32, 0.075, 0.05)) * caustics(P + u_camPos);
    submerged = true;
  }
  return s;
}

float cloudShadow(vec3 wp) {
  if (u_cloudsOn < 0.5 || u_lightDir.y < 0.03) return 1.0;
  float t = (CLOUD_BOT + 35.0 - wp.y) / u_lightDir.y;
  vec3 p = wp + u_lightDir * t;
  float d = cloudDensity(p, false) + cloudDensity(p + u_lightDir * 30.0, false);
  return mix(1.0, 0.18, saturate(d * 1.1));
}

vec3 ambientLight(vec3 N) {
  return N.y >= 0.0 ? mix(u_ambSide, u_ambUp, N.y) : mix(u_ambSide, u_ambDown, -N.y);
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
  return min(D * Gv * F / (4.0 * NdotV), vec3(60.0));
}

void main() {
  float depth = texture(u_depth, v_uv).r;
  vec4 wp4 = u_invViewProj * vec4(v_uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 P = wp4.xyz / wp4.w;
  float dist = length(P);
  vec3 V = P / max(dist, 1e-4);
  if (depth >= 1.0) {
    vec3 sky = skyFull(V);
    if (u_cloudsOn > 0.5) {
      vec4 cl = texture(u_clouds, v_uv);
      sky = sky * cl.a + cl.rgb;
    }
    o_col = vec4(sky, 1.0);
    return;
  }
  vec4 A = texture(u_albedo, v_uv);
  vec4 NS = texture(u_normal, v_uv);
  vec4 M = texture(u_mat, v_uv);
  vec3 albedo = A.rgb;
  vec3 N = octDecode(NS.xy);
  float smoothness = NS.z, f0v = NS.w;
  float skyL = M.r, blockL = M.g, ao = M.b;
  int packed = int(M.a * 255.0 + 0.5);
  int nrmIdx = packed & 7, mat = packed >> 3;
  vec3 geoN = FACE_N[nrmIdx];
  bool sss = mat == 1 || mat == 2;

  // --- rain: wet, darker, glossier surfaces and rippling puddles on exposed ground
  if (u_wet > 0.001 && depth >= 0.08) {
    float w = u_wet * smoothstep(0.8, 0.97, skyL);
    if (w > 0.001) {
      vec3 wp = P + u_camPos;
      float puddle = 0.0;
      if (geoN.y > 0.5 && !sss) {
        float n = texture(u_noise2D, wp.xz * 0.031).r * 0.65 + texture(u_noise2D, wp.xz * 0.093).g * 0.35;
        puddle = smoothstep(0.5, 0.57, n) * smoothstep(0.35, 0.9, w);
      }
      float ww = w * mix(0.5, 1.0, saturate(geoN.y));
      albedo *= mix(1.0, 0.58, ww * (sss ? 0.4 : 1.0));
      smoothness = mix(smoothness, max(smoothness, 0.8), ww);
      if (puddle > 0.0) {
        vec3 pn = vec3(0.0, 1.0, 0.0);
        if (u_rain > 0.01) {
          float r1 = texture(u_noise2D, wp.xz * 0.34 + vec2(u_time * 0.61, u_time * 0.37)).b;
          float r2 = texture(u_noise2D, wp.xz * 0.43 - vec2(u_time * 0.53, -u_time * 0.44)).a;
          pn = normalize(vec3((r1 - 0.5) * 0.3 * u_rain, 1.0, (r2 - 0.5) * 0.3 * u_rain));
        }
        N = normalize(mix(N, pn, puddle));
        smoothness = mix(smoothness, 0.97, puddle);
        albedo *= mix(1.0, 0.75, puddle);
        if (f0v < 0.9) f0v = mix(f0v, 0.02, puddle);
      }
    }
  }
  float jitter = fract(ign(gl_FragCoord.xy) + u_frame * 0.61803);
  vec3 L = u_lightDir;
  float NdotL = dot(N, L);

  // --- direct light (sun or moon)
  vec3 direct = vec3(0.0);
  float lightI = max(u_lightColor.r, max(u_lightColor.g, u_lightColor.b));
  if (lightI > 1e-4) {
    vec3 stint = vec3(1.0);
    float sh = 0.0;
    bool submerged = false;
    bool facing = sss || dot(geoN, L) > 0.0;
    if (facing) sh = getShadow(P, mat == 2 ? vec3(0.0, 1.0, 0.0) : geoN, jitter, skyL, stint, submerged);
    sh *= cloudShadow(P + u_camPos);
    if (!submerged) sh *= smoothstep(0.02, 0.35, skyL);
    vec3 light = u_lightColor * stint * sh;
    float metal = f0v > 0.9 ? 0.85 : 0.0;
    float diff;
    if (mat == 2) diff = 0.55 + 0.25 * saturate(L.y);
    else if (mat == 1) diff = saturate(NdotL * 0.6 + 0.4);
    else diff = saturate(NdotL);
    direct = light * albedo * diff * (1.0 - metal);
    if (sss) {
      float back = saturate(dot(V, L));
      direct += light * albedo * (pow(back, 8.0) * 2.2 + 0.35) * 0.7;
    }
    if (!sss && smoothness > 0.05 && NdotL > 0.0) {
      vec3 F0 = f0v > 0.9 ? albedo : vec3(f0v);
      direct += light * specGGX(N, -V, L, 1.0 - smoothness, F0) * saturate(NdotL);
    }
  }

  // --- ambient + block light
  float aoF = 0.3 + 0.7 * ao * ao;
  vec3 amb = ambientLight(sss ? vec3(0.0, 1.0, 0.0) : N) * (skyL * skyL) * aoF;
  float wyW = P.y + u_camPos.y;
  if (wyW < 63.5 && skyL < 0.97 && skyL > 0.0) amb *= exp(-(63.875 - wyW) * vec3(0.30, 0.07, 0.045)) * 1.3;
  float flick = 1.0 + 0.035 * sin(u_time * 11.0) + 0.025 * sin(u_time * 17.3 + 1.3);
  vec3 bl = vec3(1.0, 0.6, 0.32) * (pow(blockL, 4.0) * 1.45 + blockL * 0.025) * flick * mix(0.55, 1.0, aoF);
  float hand = u_handLight * pow(saturate(1.0 - dist / 13.0), 2.2) * (0.5 + 0.5 * saturate(dot(N, -V)));
  bl += vec3(1.0, 0.6, 0.3) * hand * 2.2;
  vec3 minL = vec3(0.0035, 0.004, 0.0055) * aoF;
  if (depth < 0.08) {
    // held item: soft fill light so it stays readable when facing away from the sun
    minL += (u_ambUp * 1.4 + u_lightColor * 0.28) * max(skyL, 0.12) * (0.45 + 0.55 * saturate(dot(N, normalize(-V + vec3(0.0, 0.6, 0.0))))) + vec3(0.03);
  }
  float metal = f0v > 0.9 ? 0.85 : 0.0;
  vec3 color = albedo * (amb + bl + minL) * (1.0 - metal) + direct;

  // --- sky reflections on smooth surfaces
  if (smoothness > 0.3 && !sss) {
    vec3 R = reflect(V, N);
    vec3 F0 = f0v > 0.9 ? albedo : vec3(max(f0v, 0.02));
    float NdV = saturate(dot(N, -V));
    vec3 F = F0 + (max(vec3(smoothness), F0) - F0) * pow(1.0 - NdV, 5.0);
    vec3 env = skyBase(R) * skyL * skyL * aoF;
    color += env * F * smoothness * smoothness;
  }
  color += albedo * A.a * 5.0;
  color = applyFog(color, P, dist, skyL);
  o_col = vec4(color, 1.0);
}`;
