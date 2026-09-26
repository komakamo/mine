'use strict';
// CPU side of the sky: sun/moon positions and a JS port of the atmosphere model (identical constants
// to the GLSL sky LUT) used to derive sun colour and ambient sky light for the lighting shaders.
MC.Sky = {
  R_PLANET: 6371e3, R_ATMOS: 6471e3, OBS_H: 400,
  K_RLH: [5.5e-6, 13.0e-6, 22.4e-6], K_MIE: 13e-6, SH_RLH: 8e3, SH_MIE: 1.2e3, G_MIE: 0.76,
  K_OZO: [0.650e-6, 1.881e-6, 0.085e-6],
  ozone(h) { return Math.max(0, 1 - Math.abs(h - 25000) / 15000); },
  SUN_I: 20.0, MOON_I: 0.1, SUN_DIRECT: 3.0, MOON_DIRECT: 0.075,
  TILT: 0.42,

  _rsi(o, d, r) { // ray-sphere intersection (sphere at origin)
    const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const b = 2 * (d[0] * o[0] + d[1] * o[1] + d[2] * o[2]);
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
  },

  // radiance of the sky in direction dir for a light source in direction L with intensity I
  atmosphere(dir, L, I, iSteps = 14, jSteps = 6) {
    const Rp = this.R_PLANET, Ra = this.R_ATMOS;
    const r0 = [0, Rp + this.OBS_H, 0];
    const p = this._rsi(r0, dir, Ra);
    if (!p) return [0, 0, 0];
    let t1 = p[1];
    const pl = this._rsi(r0, dir, Rp);
    if (pl && pl[0] > 0) t1 = Math.min(t1, pl[0]);
    const t0 = Math.max(p[0], 0);
    const mu = dir[0] * L[0] + dir[1] * L[1] + dir[2] * L[2];
    const g = this.G_MIE, gg = g * g;
    const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const pM = 3 / (8 * Math.PI) * ((1 - gg) * (mu * mu + 1)) / (Math.pow(1 + gg - 2 * mu * g, 1.5) * (2 + gg));
    const tR = [0, 0, 0], tM = [0, 0, 0];
    let odR = 0, odM = 0, odO = 0;
    const K = this.K_RLH, KM = this.K_MIE, KO = this.K_OZO;
    for (let i = 0; i < iSteps; i++) {
      const a = i / iSteps, b = (i + 1) / iSteps;
      const ta = t0 + (t1 - t0) * a * a, tb = t0 + (t1 - t0) * b * b;
      const ds = tb - ta, t = 0.5 * (ta + tb);
      const pos = [r0[0] + dir[0] * t, r0[1] + dir[1] * t, r0[2] + dir[2] * t];
      const hgt = Math.hypot(pos[0], pos[1], pos[2]) - Rp;
      const sR = Math.exp(-hgt / this.SH_RLH) * ds, sM = Math.exp(-hgt / this.SH_MIE) * ds;
      odR += sR; odM += sM; odO += this.ozone(hgt) * ds;
      const lj = this._rsi(pos, L, Ra);
      const js = lj ? lj[1] / jSteps : 0;
      let jR = 0, jM = 0, jO = 0;
      for (let j = 0; j < jSteps; j++) {
        const tj = js * (j + 0.5);
        const hj = Math.hypot(pos[0] + L[0] * tj, pos[1] + L[1] * tj, pos[2] + L[2] * tj) - Rp;
        jR += Math.exp(-hj / this.SH_RLH) * js; jM += Math.exp(-hj / this.SH_MIE) * js; jO += this.ozone(hj) * js;
      }
      for (let c = 0; c < 3; c++) {
        const att = Math.exp(-(KM * 1.1 * (odM + jM) + K[c] * (odR + jR) + KO[c] * (odO + jO)));
        tR[c] += sR * att; tM[c] += sM * att;
      }
    }
    return [0, 1, 2].map((c) => I * (pR * K[c] * tR[c] + pM * KM * tM[c]));
  },

  transmittance(L) {
    const Rp = this.R_PLANET, r0 = [0, Rp + this.OBS_H, 0];
    const p = this._rsi(r0, L, this.R_ATMOS);
    const pl = this._rsi(r0, L, Rp);
    if (!p || (pl && pl[0] > 0)) return [0, 0, 0];
    const n = 16, ds = p[1] / n;
    let odR = 0, odM = 0, odO = 0;
    for (let i = 0; i < n; i++) {
      const t = ds * (i + 0.5);
      const h = Math.hypot(L[0] * t, r0[1] + L[1] * t, L[2] * t) - Rp;
      odR += Math.exp(-h / this.SH_RLH) * ds; odM += Math.exp(-h / this.SH_MIE) * ds; odO += this.ozone(h) * ds;
    }
    return [0, 1, 2].map((c) => Math.exp(-(this.K_MIE * 1.1 * odM + this.K_RLH[c] * odR + this.K_OZO[c] * odO)));
  },

  sunDirection(hours) {
    const th = (hours - 6) / 24 * Math.PI * 2;
    const x = Math.cos(th), y = Math.sin(th) * Math.cos(this.TILT), z = Math.sin(th) * Math.sin(this.TILT);
    return [x, y, z];
  },

  update(hours) {
    const sun = this.sunDirection(hours);
    const moon = [-sun[0], -sun[1], -sun[2]];
    const sunT = this.transmittance(sun), moonT = this.transmittance(moon);
    const avg = (L, I) => {
      const acc = [0, 0, 0];
      const dirs = [[0, 1, 0, 2]];
      for (let a = 0; a < 6; a++) {
        const ang = a / 6 * Math.PI * 2;
        dirs.push([Math.cos(ang) * 0.7071, 0.7071, Math.sin(ang) * 0.7071, 1]);
      }
      let w = 0;
      for (const d of dirs) { const c = this.atmosphere(d, L, I); for (let k = 0; k < 3; k++) acc[k] += c[k] * d[3]; w += d[3]; }
      return acc.map((v) => v / w);
    };
    const horiz = (L, I) => {
      const acc = [0, 0, 0];
      for (let a = 0; a < 6; a++) {
        const ang = a / 6 * Math.PI * 2;
        const c = this.atmosphere([Math.cos(ang) * 0.94, 0.34, Math.sin(ang) * 0.94], L, I);
        for (let k = 0; k < 3; k++) acc[k] += c[k] / 6;
      }
      return acc;
    };
    const sunUp = avg(sun, this.SUN_I), moonUp = avg(moon, this.MOON_I);
    const sunH = horiz(sun, this.SUN_I), moonH = horiz(moon, this.MOON_I);
    const moonTint = [0.62, 0.78, 1.0];
    const night = [0.0028, 0.0042, 0.0085];
    const up = [0, 1, 2].map((k) => sunUp[k] + moonUp[k] * moonTint[k] + night[k]);
    const side = [0, 1, 2].map((k) => sunH[k] + moonH[k] * moonTint[k] + night[k]);
    const sunDirect = sunT.map((v) => v * this.SUN_DIRECT * MC.smoothstep(-0.02, 0.06, sun[1]));
    const moonDirect = moonT.map((v, k) => v * this.MOON_DIRECT * moonTint[k] * MC.smoothstep(-0.02, 0.06, moon[1]));
    const useSun = sun[1] > -0.03;
    const lightDir = useSun ? sun : moon;
    const lightColor = useSun ? sunDirect : moonDirect;
    // simple ground bounce
    const bounce = [0, 1, 2].map((k) => (lightColor[k] * Math.max(lightDir[1], 0) + up[k]) * 0.18);
    const down = bounce;
    const sideMix = [0, 1, 2].map((k) => side[k] * 0.8 + bounce[k] * 0.4);
    const dayF = MC.smoothstep(-0.1, 0.25, sun[1]);
    const duskF = Math.exp(-Math.pow((sun[1] - 0.04) / 0.14, 2));
    return {
      hours, sunDir: sun, moonDir: moon, lightDir, lightColor, sunTrans: sunT, moonTrans: moonT,
      ambUp: up, ambSide: sideMix, ambDown: down,
      dayF, duskF,
      starF: MC.smoothstep(0.08, -0.18, sun[1]),
      fogDensity: 0.0013 + duskF * 0.0014 + (1 - dayF) * 0.0008,
      mist: duskF * 0.5 + (1 - dayF) * 0.25,
    };
  },
};
