'use strict';
// Thin WebGL2 helpers: programs with cached uniform locations, textures, framebuffers.
MC.GL = {
  init(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 がサポートされていません。最新の Chrome / Edge / Firefox をご利用ください。');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float が利用できません（浮動小数点レンダーターゲットが必要です）。');
    gl.getExtension('OES_texture_float_linear');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.gl = gl;
    return gl;
  },

  showError(msg) {
    let el = document.getElementById('err');
    if (!el) { el = document.createElement('div'); el.id = 'err'; document.body.appendChild(el); }
    el.textContent = msg;
    console.error(msg);
  },

  compile(type, src, name) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n');
      const m = /ERROR: \d+:(\d+)/.exec(log);
      let ctx = '';
      if (m) { const ln = +m[1]; for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 2); i++) ctx += (i + 1) + ': ' + lines[i] + '\n'; }
      throw new Error(`シェーダーのコンパイルに失敗 (${name}, ${type === gl.VERTEX_SHADER ? 'VS' : 'FS'}):\n${log}\n${ctx}`);
    }
    return s;
  },

  program(vs, fs, name) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs, name));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`リンク失敗 (${name}): ${gl.getProgramInfoLog(p)}`);
    return new MC.Program(gl, p, name);
  },

  texture(o) {
    const gl = this.gl;
    const target = o.target || gl.TEXTURE_2D;
    const t = gl.createTexture();
    gl.bindTexture(target, t);
    const filter = o.filter || gl.LINEAR, wrap = o.wrap || gl.CLAMP_TO_EDGE;
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, o.minFilter || filter);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);
    if (target === gl.TEXTURE_3D || target === gl.TEXTURE_2D_ARRAY) gl.texParameteri(target, gl.TEXTURE_WRAP_R, wrap);
    if (target === gl.TEXTURE_2D) {
      gl.texImage2D(target, 0, o.internal, o.w, o.h, 0, o.format, o.type, o.data || null);
    } else {
      gl.texImage3D(target, 0, o.internal, o.w, o.h, o.d, 0, o.format, o.type, o.data || null);
    }
    if (o.mips) gl.generateMipmap(target);
    if (o.aniso && this.aniso) gl.texParameterf(target, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    t.w = o.w; t.h = o.h; t.target = target;
    return t;
  },

  // Colour render target helpers
  rt(w, h, fmt = 'rgba16f', filter) {
    const gl = this.gl;
    const F = {
      rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
      rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
      srgba8: [gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE],
      r32f: [gl.R32F, gl.RED, gl.FLOAT],
      r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT],
      depth: [gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT],
      depth24: [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT],
    }[fmt];
    const nearest = fmt.startsWith('depth') || fmt === 'r32f';
    return this.texture({ w, h, internal: F[0], format: F[1], type: F[2], filter: filter || (nearest ? gl.NEAREST : gl.LINEAR) });
  },

  fbo(colors, depth) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    const bufs = [];
    colors.forEach((t, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      bufs.push(gl.COLOR_ATTACHMENT0 + i);
    });
    if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers(bufs.length ? bufs : [gl.NONE]);
    if (!bufs.length) gl.readBuffer(gl.NONE);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: 0x' + st.toString(16));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    f.w = (colors[0] || depth).w; f.h = (colors[0] || depth).h;
    return f;
  },
};

MC.Program = class {
  constructor(gl, p, name) {
    this.gl = gl; this.p = p; this.name = name;
    this.u = {}; this.units = {}; this.nextUnit = 0;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      this.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.p); return this; }
  f1(n, v) { const l = this.u[n]; if (l) this.gl.uniform1f(l, v); return this; }
  f2(n, a, b) { const l = this.u[n]; if (l) this.gl.uniform2f(l, a, b); return this; }
  f3(n, a, b, c) { const l = this.u[n]; if (l) this.gl.uniform3f(l, a, b, c); return this; }
  v3(n, v) { const l = this.u[n]; if (l) this.gl.uniform3f(l, v[0], v[1], v[2]); return this; }
  f4(n, a, b, c, d) { const l = this.u[n]; if (l) this.gl.uniform4f(l, a, b, c, d); return this; }
  i1(n, v) { const l = this.u[n]; if (l) this.gl.uniform1i(l, v); return this; }
  m4(n, m) { const l = this.u[n]; if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  m3(n, m) { const l = this.u[n]; if (l) this.gl.uniformMatrix3fv(l, false, m); return this; }
  tex(n, t, sampler = null) {
    const gl = this.gl, l = this.u[n];
    if (!l) return this;
    let unit = this.units[n];
    if (unit === undefined) { unit = this.units[n] = this.nextUnit++; gl.uniform1i(l, unit); }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(t.target || gl.TEXTURE_2D, t);
    gl.bindSampler(unit, sampler);
    return this;
  }
};
