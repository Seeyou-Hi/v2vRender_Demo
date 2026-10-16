var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// solver-build/node_modules/.pnpm/linear-solve@1.2.1/node_modules/linear-solve/gauss-jordan.js
var require_gauss_jordan = __commonJS({
  "solver-build/node_modules/.pnpm/linear-solve@1.2.1/node_modules/linear-solve/gauss-jordan.js"(exports, module) {
    var linear = (function() {
      function Mat(data, mirror) {
        this.data = new Array(data.length);
        for (var i = 0, cols = data[0].length; i < data.length; i++) {
          this.data[i] = new Array(cols);
          for (var j = 0; j < cols; j++) {
            this.data[i][j] = data[i][j];
          }
        }
        if (mirror) {
          if (typeof mirror[0] !== "object") {
            for (var i = 0; i < mirror.length; i++) {
              mirror[i] = [mirror[i]];
            }
          }
          this.mirror = new Mat(mirror);
        }
      }
      Mat.prototype.swap = function(i, j) {
        if (this.mirror) this.mirror.swap(i, j);
        var tmp = this.data[i];
        this.data[i] = this.data[j];
        this.data[j] = tmp;
      };
      Mat.prototype.multline = function(i, l) {
        if (this.mirror) this.mirror.multline(i, l);
        var line = this.data[i];
        for (var k = line.length - 1; k >= 0; k--) {
          line[k] *= l;
        }
      };
      Mat.prototype.addmul = function(i, j, l) {
        if (this.mirror) this.mirror.addmul(i, j, l);
        var lineI = this.data[i], lineJ = this.data[j];
        for (var k = lineI.length - 1; k >= 0; k--) {
          lineI[k] = lineI[k] + l * lineJ[k];
        }
      };
      Mat.prototype.hasNullLine = function(i) {
        for (var j = 0; j < this.data[i].length; j++) {
          if (this.data[i][j] !== 0) {
            return false;
          }
        }
        return true;
      };
      Mat.prototype.gauss = function() {
        var pivot = 0, lines = this.data.length, columns = this.data[0].length, nullLines = [];
        for (var j = 0; j < columns; j++) {
          var maxValue = 0, maxLine = 0;
          for (var k = pivot; k < lines; k++) {
            var val = this.data[k][j];
            if (Math.abs(val) > Math.abs(maxValue)) {
              maxLine = k;
              maxValue = val;
            }
          }
          if (maxValue === 0) {
            nullLines.push(pivot);
          } else {
            this.multline(maxLine, 1 / maxValue);
            this.swap(maxLine, pivot);
            for (var i = 0; i < lines; i++) {
              if (i !== pivot) {
                this.addmul(i, pivot, -this.data[i][j]);
              }
            }
          }
          pivot++;
        }
        for (var i = 0; i < nullLines.length; i++) {
          if (!this.mirror.hasNullLine(nullLines[i])) {
            throw new Error("singular matrix");
          }
        }
        return this.mirror.data;
      };
      exports.solve = function solve2(A, b) {
        var result = new Mat(A, b).gauss();
        if (result.length > 0 && result[0].length === 1) {
          for (var i = 0; i < result.length; i++) result[i] = result[i][0];
        }
        return result;
      };
      function identity4(n) {
        var id = new Array(n);
        for (var i = 0; i < n; i++) {
          id[i] = new Array(n);
          for (var j = 0; j < n; j++) {
            id[i][j] = i === j ? 1 : 0;
          }
        }
        return id;
      }
      exports.invert = function invert4(A) {
        return new Mat(A, identity4(A.length)).gauss();
      };
      return exports;
    })();
    if (typeof module.exports === "object") module.exports = linear;
  }
});

// solver-build/node_modules/.pnpm/svd-js@1.1.1/node_modules/svd-js/build-umd/svd-js.min.js
var require_svd_js_min = __commonJS({
  "solver-build/node_modules/.pnpm/svd-js@1.1.1/node_modules/svd-js/build-umd/svd-js.min.js"(exports, module) {
    !(function(r, f) {
      "object" == typeof exports && "undefined" != typeof module ? f(exports) : "function" == typeof define && define.amd ? define(["exports"], f) : f((r = "undefined" != typeof globalThis ? globalThis : r || self).SVDJS = {});
    })(exports, function(r) {
      "use strict";
      r.SVD = function(r2, f, o, e, t) {
        if (f = void 0 === f || f, o = void 0 === o || o, t = 1e-64 / (e = e || Math.pow(2, -52)), !r2) throw new TypeError("Matrix a is not defined");
        var i, a, n, s, h, l, M, d, p, b, u, w, y = r2[0].length, q = r2.length;
        if (q < y) throw new TypeError("Invalid matrix: m < n");
        for (var v = [], c = [], x = [], g = "f" === f ? q : y, m = b = M = 0; m < q; m++) c[m] = new Array(g).fill(0);
        for (m = 0; m < y; m++) x[m] = new Array(y).fill(0);
        var S, T = new Array(y).fill(0);
        for (m = 0; m < q; m++) for (i = 0; i < y; i++) c[m][i] = r2[m][i];
        for (m = 0; m < y; m++) {
          for (v[m] = M, p = 0, n = m + 1, i = m; i < q; i++) p += Math.pow(c[i][m], 2);
          if (p < t) M = 0;
          else for (d = (l = c[m][m]) * (M = l < 0 ? Math.sqrt(p) : -Math.sqrt(p)) - p, c[m][m] = l - M, i = n; i < y; i++) {
            for (p = 0, a = m; a < q; a++) p += c[a][m] * c[a][i];
            for (l = p / d, a = m; a < q; a++) c[a][i] = c[a][i] + l * c[a][m];
          }
          for (T[m] = M, p = 0, i = n; i < y; i++) p += Math.pow(c[m][i], 2);
          if (p < t) M = 0;
          else {
            for (d = (l = c[m][m + 1]) * (M = l < 0 ? Math.sqrt(p) : -Math.sqrt(p)) - p, c[m][m + 1] = l - M, i = n; i < y; i++) v[i] = c[m][i] / d;
            for (i = n; i < q; i++) {
              for (p = 0, a = n; a < y; a++) p += c[i][a] * c[m][a];
              for (a = n; a < y; a++) c[i][a] = c[i][a] + p * v[a];
            }
          }
          b < (u = Math.abs(T[m]) + Math.abs(v[m])) && (b = u);
        }
        if (o) for (m = y - 1; 0 <= m; m--) {
          if (0 !== M) {
            for (d = c[m][m + 1] * M, i = n; i < y; i++) x[i][m] = c[m][i] / d;
            for (i = n; i < y; i++) {
              for (p = 0, a = n; a < y; a++) p += c[m][a] * x[a][i];
              for (a = n; a < y; a++) x[a][i] = x[a][i] + p * x[a][m];
            }
          }
          for (i = n; i < y; i++) x[m][i] = 0, x[i][m] = 0;
          x[m][m] = 1, M = v[m], n = m;
        }
        if (f) {
          if ("f" === f) for (m = y; m < q; m++) {
            for (i = y; i < q; i++) c[m][i] = 0;
            c[m][m] = 1;
          }
          for (m = y - 1; 0 <= m; m--) {
            for (n = m + 1, M = T[m], i = n; i < g; i++) c[m][i] = 0;
            if (0 !== M) {
              for (d = c[m][m] * M, i = n; i < g; i++) {
                for (p = 0, a = n; a < q; a++) p += c[a][m] * c[a][i];
                for (l = p / d, a = m; a < q; a++) c[a][i] = c[a][i] + l * c[a][m];
              }
              for (i = m; i < q; i++) c[i][m] = c[i][m] / M;
            } else for (i = m; i < q; i++) c[i][m] = 0;
            c[m][m] = c[m][m] + 1;
          }
        }
        for (e *= b, a = y - 1; 0 <= a; a--) for (var k = 0; k < 50; k++) {
          for (S = false, n = a; 0 <= n; n--) {
            if (Math.abs(v[n]) <= e) {
              S = true;
              break;
            }
            if (Math.abs(T[n - 1]) <= e) break;
          }
          if (!S) {
            for (h = 0, s = n - (p = 1), m = n; m < a + 1 && (l = p * v[m], v[m] = h * v[m], !(Math.abs(l) <= e)); m++) if (M = T[m], T[m] = Math.sqrt(l * l + M * M), h = M / (d = T[m]), p = -l / d, f) for (i = 0; i < q; i++) u = c[i][s], w = c[i][m], c[i][s] = u * h + w * p, c[i][m] = -u * p + w * h;
          }
          if (w = T[a], n === a) {
            if (w < 0 && (T[a] = -w, o)) for (i = 0; i < y; i++) x[i][a] = -x[i][a];
            break;
          }
          for (b = T[n], l = (((u = T[a - 1]) - w) * (u + w) + ((M = v[a - 1]) - (d = v[a])) * (M + d)) / (2 * d * u), M = Math.sqrt(l * l + 1), l = ((b - w) * (b + w) + d * (u / (l < 0 ? l - M : l + M) - d)) / b, m = n + (p = h = 1); m < a + 1; m++) {
            if (M = v[m], u = T[m], d = p * M, M *= h, w = Math.sqrt(l * l + d * d), l = b * (h = l / (v[m - 1] = w)) + M * (p = d / w), M = -b * p + M * h, d = u * p, u *= h, o) for (i = 0; i < y; i++) b = x[i][m - 1], w = x[i][m], x[i][m - 1] = b * h + w * p, x[i][m] = -b * p + w * h;
            if (w = Math.sqrt(l * l + d * d), l = (h = l / (T[m - 1] = w)) * M + (p = d / w) * u, b = -p * M + h * u, f) for (i = 0; i < q; i++) u = c[i][m - 1], w = c[i][m], c[i][m - 1] = u * h + w * p, c[i][m] = -u * p + w * h;
          }
          v[n] = 0, v[a] = l, T[a] = b;
        }
        for (m = 0; m < y; m++) T[m] < e && (T[m] = 0);
        return { u: c, q: T, v: x };
      }, r.VERSION = "1.1.1", Object.defineProperty(r, "__esModule", { value: true });
    });
  }
});

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/common.js
var EPSILON = 1e-6;
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
var RANDOM = Math.random;
var ANGLE_ORDER = "zyx";
function round(a) {
  if (a >= 0) return Math.round(a);
  return a % 0.5 === 0 ? Math.floor(a) : Math.round(a);
}
var degree = Math.PI / 180;
var radian = 180 / Math.PI;

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/mat3.js
function create() {
  var out = new ARRAY_TYPE(9);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
  }
  out[0] = 1;
  out[4] = 1;
  out[8] = 1;
  return out;
}

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/mat4.js
var mat4_exports = {};
__export(mat4_exports, {
  add: () => add,
  adjoint: () => adjoint,
  clone: () => clone,
  copy: () => copy,
  create: () => create2,
  decompose: () => decompose,
  determinant: () => determinant,
  equals: () => equals,
  exactEquals: () => exactEquals,
  frob: () => frob,
  fromQuat: () => fromQuat,
  fromQuat2: () => fromQuat2,
  fromRotation: () => fromRotation,
  fromRotationTranslation: () => fromRotationTranslation,
  fromRotationTranslationScale: () => fromRotationTranslationScale,
  fromRotationTranslationScaleOrigin: () => fromRotationTranslationScaleOrigin,
  fromScaling: () => fromScaling,
  fromTranslation: () => fromTranslation,
  fromValues: () => fromValues,
  fromXRotation: () => fromXRotation,
  fromYRotation: () => fromYRotation,
  fromZRotation: () => fromZRotation,
  frustum: () => frustum,
  getRotation: () => getRotation,
  getScaling: () => getScaling,
  getTranslation: () => getTranslation,
  identity: () => identity,
  invert: () => invert,
  lookAt: () => lookAt,
  mul: () => mul,
  multiply: () => multiply,
  multiplyScalar: () => multiplyScalar,
  multiplyScalarAndAdd: () => multiplyScalarAndAdd,
  ortho: () => ortho,
  orthoNO: () => orthoNO,
  orthoZO: () => orthoZO,
  perspective: () => perspective,
  perspectiveFromFieldOfView: () => perspectiveFromFieldOfView,
  perspectiveNO: () => perspectiveNO,
  perspectiveZO: () => perspectiveZO,
  rotate: () => rotate,
  rotateX: () => rotateX,
  rotateY: () => rotateY,
  rotateZ: () => rotateZ,
  scale: () => scale,
  set: () => set,
  str: () => str,
  sub: () => sub,
  subtract: () => subtract,
  targetTo: () => targetTo,
  translate: () => translate,
  transpose: () => transpose
});
function create2() {
  var out = new ARRAY_TYPE(16);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
  }
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}
function clone(a) {
  var out = new ARRAY_TYPE(16);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function fromValues(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  var out = new ARRAY_TYPE(16);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function set(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function transpose(out, a) {
  if (out === a) {
    var a01 = a[1], a02 = a[2], a03 = a[3];
    var a12 = a[6], a13 = a[7];
    var a23 = a[11];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a01;
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a02;
    out[9] = a12;
    out[11] = a[14];
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
  } else {
    out[0] = a[0];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a[1];
    out[5] = a[5];
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a[2];
    out[9] = a[6];
    out[10] = a[10];
    out[11] = a[14];
    out[12] = a[3];
    out[13] = a[7];
    out[14] = a[11];
    out[15] = a[15];
  }
  return out;
}
function invert(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
function adjoint(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  out[0] = a11 * b11 - a12 * b10 + a13 * b09;
  out[1] = a02 * b10 - a01 * b11 - a03 * b09;
  out[2] = a31 * b05 - a32 * b04 + a33 * b03;
  out[3] = a22 * b04 - a21 * b05 - a23 * b03;
  out[4] = a12 * b08 - a10 * b11 - a13 * b07;
  out[5] = a00 * b11 - a02 * b08 + a03 * b07;
  out[6] = a32 * b02 - a30 * b05 - a33 * b01;
  out[7] = a20 * b05 - a22 * b02 + a23 * b01;
  out[8] = a10 * b10 - a11 * b08 + a13 * b06;
  out[9] = a01 * b08 - a00 * b10 - a03 * b06;
  out[10] = a30 * b04 - a31 * b02 + a33 * b00;
  out[11] = a21 * b02 - a20 * b04 - a23 * b00;
  out[12] = a11 * b07 - a10 * b09 - a12 * b06;
  out[13] = a00 * b09 - a01 * b07 + a02 * b06;
  out[14] = a31 * b01 - a30 * b03 - a32 * b00;
  out[15] = a20 * b03 - a21 * b01 + a22 * b00;
  return out;
}
function determinant(a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b0 = a00 * a11 - a01 * a10;
  var b1 = a00 * a12 - a02 * a10;
  var b2 = a01 * a12 - a02 * a11;
  var b3 = a20 * a31 - a21 * a30;
  var b4 = a20 * a32 - a22 * a30;
  var b5 = a21 * a32 - a22 * a31;
  var b6 = a00 * b5 - a01 * b4 + a02 * b3;
  var b7 = a10 * b5 - a11 * b4 + a12 * b3;
  var b8 = a20 * b2 - a21 * b1 + a22 * b0;
  var b9 = a30 * b2 - a31 * b1 + a32 * b0;
  return a13 * b6 - a03 * b7 + a33 * b8 - a23 * b9;
}
function multiply(out, a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}
function translate(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
    a00 = a[0];
    a01 = a[1];
    a02 = a[2];
    a03 = a[3];
    a10 = a[4];
    a11 = a[5];
    a12 = a[6];
    a13 = a[7];
    a20 = a[8];
    a21 = a[9];
    a22 = a[10];
    a23 = a[11];
    out[0] = a00;
    out[1] = a01;
    out[2] = a02;
    out[3] = a03;
    out[4] = a10;
    out[5] = a11;
    out[6] = a12;
    out[7] = a13;
    out[8] = a20;
    out[9] = a21;
    out[10] = a22;
    out[11] = a23;
    out[12] = a00 * x + a10 * y + a20 * z + a[12];
    out[13] = a01 * x + a11 * y + a21 * z + a[13];
    out[14] = a02 * x + a12 * y + a22 * z + a[14];
    out[15] = a03 * x + a13 * y + a23 * z + a[15];
  }
  return out;
}
function scale(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  out[0] = a[0] * x;
  out[1] = a[1] * x;
  out[2] = a[2] * x;
  out[3] = a[3] * x;
  out[4] = a[4] * y;
  out[5] = a[5] * y;
  out[6] = a[6] * y;
  out[7] = a[7] * y;
  out[8] = a[8] * z;
  out[9] = a[9] * z;
  out[10] = a[10] * z;
  out[11] = a[11] * z;
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function rotate(out, a, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len4 = Math.sqrt(x * x + y * y + z * z);
  var s, c, t;
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  var b00, b01, b02;
  var b10, b11, b12;
  var b20, b21, b22;
  if (len4 < EPSILON) {
    return null;
  }
  len4 = 1 / len4;
  x *= len4;
  y *= len4;
  z *= len4;
  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;
  a00 = a[0];
  a01 = a[1];
  a02 = a[2];
  a03 = a[3];
  a10 = a[4];
  a11 = a[5];
  a12 = a[6];
  a13 = a[7];
  a20 = a[8];
  a21 = a[9];
  a22 = a[10];
  a23 = a[11];
  b00 = x * x * t + c;
  b01 = y * x * t + z * s;
  b02 = z * x * t - y * s;
  b10 = x * y * t - z * s;
  b11 = y * y * t + c;
  b12 = z * y * t + x * s;
  b20 = x * z * t + y * s;
  b21 = y * z * t - x * s;
  b22 = z * z * t + c;
  out[0] = a00 * b00 + a10 * b01 + a20 * b02;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22;
  if (a !== out) {
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  return out;
}
function rotateX(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}
function rotateY(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c - a20 * s;
  out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s;
  out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c;
  out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c;
  out[11] = a03 * s + a23 * c;
  return out;
}
function rotateZ(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  if (a !== out) {
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}
function fromTranslation(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromScaling(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = v[1];
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = v[2];
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotation(out, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len4 = Math.sqrt(x * x + y * y + z * z);
  var s, c, t;
  if (len4 < EPSILON) {
    return null;
  }
  len4 = 1 / len4;
  x *= len4;
  y *= len4;
  z *= len4;
  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;
  out[0] = x * x * t + c;
  out[1] = y * x * t + z * s;
  out[2] = z * x * t - y * s;
  out[3] = 0;
  out[4] = x * y * t - z * s;
  out[5] = y * y * t + c;
  out[6] = z * y * t + x * s;
  out[7] = 0;
  out[8] = x * z * t + y * s;
  out[9] = y * z * t - x * s;
  out[10] = z * z * t + c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromXRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = c;
  out[6] = s;
  out[7] = 0;
  out[8] = 0;
  out[9] = -s;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromYRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = s;
  out[9] = 0;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromZRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = c;
  out[1] = s;
  out[2] = 0;
  out[3] = 0;
  out[4] = -s;
  out[5] = c;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotationTranslation(out, q, v) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromQuat2(out, a) {
  var translation = new ARRAY_TYPE(3);
  var bx = -a[0], by = -a[1], bz = -a[2], bw = a[3], ax = a[4], ay = a[5], az = a[6], aw = a[7];
  var magnitude2 = bx * bx + by * by + bz * bz + bw * bw;
  if (magnitude2 > 0) {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2 / magnitude2;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2 / magnitude2;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2 / magnitude2;
  } else {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2;
  }
  fromRotationTranslation(out, a, translation);
  return out;
}
function getTranslation(out, mat2) {
  out[0] = mat2[12];
  out[1] = mat2[13];
  out[2] = mat2[14];
  return out;
}
function getScaling(out, mat2) {
  var m11 = mat2[0];
  var m12 = mat2[1];
  var m13 = mat2[2];
  var m21 = mat2[4];
  var m22 = mat2[5];
  var m23 = mat2[6];
  var m31 = mat2[8];
  var m32 = mat2[9];
  var m33 = mat2[10];
  out[0] = Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
  out[1] = Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
  out[2] = Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);
  return out;
}
function getRotation(out, mat2) {
  var scaling = new ARRAY_TYPE(3);
  getScaling(scaling, mat2);
  var is1 = 1 / scaling[0];
  var is2 = 1 / scaling[1];
  var is3 = 1 / scaling[2];
  var sm11 = mat2[0] * is1;
  var sm12 = mat2[1] * is2;
  var sm13 = mat2[2] * is3;
  var sm21 = mat2[4] * is1;
  var sm22 = mat2[5] * is2;
  var sm23 = mat2[6] * is3;
  var sm31 = mat2[8] * is1;
  var sm32 = mat2[9] * is2;
  var sm33 = mat2[10] * is3;
  var trace = sm11 + sm22 + sm33;
  var S = 0;
  if (trace > 0) {
    S = Math.sqrt(trace + 1) * 2;
    out[3] = 0.25 * S;
    out[0] = (sm23 - sm32) / S;
    out[1] = (sm31 - sm13) / S;
    out[2] = (sm12 - sm21) / S;
  } else if (sm11 > sm22 && sm11 > sm33) {
    S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
    out[3] = (sm23 - sm32) / S;
    out[0] = 0.25 * S;
    out[1] = (sm12 + sm21) / S;
    out[2] = (sm31 + sm13) / S;
  } else if (sm22 > sm33) {
    S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
    out[3] = (sm31 - sm13) / S;
    out[0] = (sm12 + sm21) / S;
    out[1] = 0.25 * S;
    out[2] = (sm23 + sm32) / S;
  } else {
    S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
    out[3] = (sm12 - sm21) / S;
    out[0] = (sm31 + sm13) / S;
    out[1] = (sm23 + sm32) / S;
    out[2] = 0.25 * S;
  }
  return out;
}
function decompose(out_r, out_t, out_s, mat2) {
  out_t[0] = mat2[12];
  out_t[1] = mat2[13];
  out_t[2] = mat2[14];
  var m11 = mat2[0];
  var m12 = mat2[1];
  var m13 = mat2[2];
  var m21 = mat2[4];
  var m22 = mat2[5];
  var m23 = mat2[6];
  var m31 = mat2[8];
  var m32 = mat2[9];
  var m33 = mat2[10];
  out_s[0] = Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
  out_s[1] = Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
  out_s[2] = Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);
  var is1 = 1 / out_s[0];
  var is2 = 1 / out_s[1];
  var is3 = 1 / out_s[2];
  var sm11 = m11 * is1;
  var sm12 = m12 * is2;
  var sm13 = m13 * is3;
  var sm21 = m21 * is1;
  var sm22 = m22 * is2;
  var sm23 = m23 * is3;
  var sm31 = m31 * is1;
  var sm32 = m32 * is2;
  var sm33 = m33 * is3;
  var trace = sm11 + sm22 + sm33;
  var S = 0;
  if (trace > 0) {
    S = Math.sqrt(trace + 1) * 2;
    out_r[3] = 0.25 * S;
    out_r[0] = (sm23 - sm32) / S;
    out_r[1] = (sm31 - sm13) / S;
    out_r[2] = (sm12 - sm21) / S;
  } else if (sm11 > sm22 && sm11 > sm33) {
    S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
    out_r[3] = (sm23 - sm32) / S;
    out_r[0] = 0.25 * S;
    out_r[1] = (sm12 + sm21) / S;
    out_r[2] = (sm31 + sm13) / S;
  } else if (sm22 > sm33) {
    S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
    out_r[3] = (sm31 - sm13) / S;
    out_r[0] = (sm12 + sm21) / S;
    out_r[1] = 0.25 * S;
    out_r[2] = (sm23 + sm32) / S;
  } else {
    S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
    out_r[3] = (sm12 - sm21) / S;
    out_r[0] = (sm31 + sm13) / S;
    out_r[1] = (sm23 + sm32) / S;
    out_r[2] = 0.25 * S;
  }
  return out_r;
}
function fromRotationTranslationScale(out, q, v, s) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromRotationTranslationScaleOrigin(out, q, v, s, o) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  var ox = o[0];
  var oy = o[1];
  var oz = o[2];
  var out0 = (1 - (yy + zz)) * sx;
  var out1 = (xy + wz) * sx;
  var out2 = (xz - wy) * sx;
  var out4 = (xy - wz) * sy;
  var out5 = (1 - (xx + zz)) * sy;
  var out6 = (yz + wx) * sy;
  var out8 = (xz + wy) * sz;
  var out9 = (yz - wx) * sz;
  var out10 = (1 - (xx + yy)) * sz;
  out[0] = out0;
  out[1] = out1;
  out[2] = out2;
  out[3] = 0;
  out[4] = out4;
  out[5] = out5;
  out[6] = out6;
  out[7] = 0;
  out[8] = out8;
  out[9] = out9;
  out[10] = out10;
  out[11] = 0;
  out[12] = v[0] + ox - (out0 * ox + out4 * oy + out8 * oz);
  out[13] = v[1] + oy - (out1 * ox + out5 * oy + out9 * oz);
  out[14] = v[2] + oz - (out2 * ox + out6 * oy + out10 * oz);
  out[15] = 1;
  return out;
}
function fromQuat(out, q) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - yy - zz;
  out[1] = yx + wz;
  out[2] = zx - wy;
  out[3] = 0;
  out[4] = yx - wz;
  out[5] = 1 - xx - zz;
  out[6] = zy + wx;
  out[7] = 0;
  out[8] = zx + wy;
  out[9] = zy - wx;
  out[10] = 1 - xx - yy;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function frustum(out, left, right, bottom, top, near, far) {
  var rl = 1 / (right - left);
  var tb = 1 / (top - bottom);
  var nf = 1 / (near - far);
  out[0] = near * 2 * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = near * 2 * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near * 2 * nf;
  out[15] = 0;
  return out;
}
function perspectiveNO(out, fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;
  if (far != null && far !== Infinity) {
    var nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -2 * near;
  }
  return out;
}
var perspective = perspectiveNO;
function perspectiveZO(out, fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;
  if (far != null && far !== Infinity) {
    var nf = 1 / (near - far);
    out[10] = far * nf;
    out[14] = far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -near;
  }
  return out;
}
function perspectiveFromFieldOfView(out, fov, near, far) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180);
  var xScale = 2 / (leftTan + rightTan);
  var yScale = 2 / (upTan + downTan);
  out[0] = xScale;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = yScale;
  out[6] = 0;
  out[7] = 0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = (upTan - downTan) * yScale * 0.5;
  out[10] = far / (near - far);
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near / (near - far);
  out[15] = 0;
  return out;
}
function orthoNO(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}
var ortho = orthoNO;
function orthoZO(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = near * nf;
  out[15] = 1;
  return out;
}
function lookAt(out, eye, center, up) {
  var x0, x1, x2, y0, y1, y2, z0, z1, z2, len4;
  var eyex = eye[0];
  var eyey = eye[1];
  var eyez = eye[2];
  var upx = up[0];
  var upy = up[1];
  var upz = up[2];
  var centerx = center[0];
  var centery = center[1];
  var centerz = center[2];
  if (Math.abs(eyex - centerx) < EPSILON && Math.abs(eyey - centery) < EPSILON && Math.abs(eyez - centerz) < EPSILON) {
    return identity(out);
  }
  z0 = eyex - centerx;
  z1 = eyey - centery;
  z2 = eyez - centerz;
  len4 = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
  z0 *= len4;
  z1 *= len4;
  z2 *= len4;
  x0 = upy * z2 - upz * z1;
  x1 = upz * z0 - upx * z2;
  x2 = upx * z1 - upy * z0;
  len4 = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
  if (!len4) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len4 = 1 / len4;
    x0 *= len4;
    x1 *= len4;
    x2 *= len4;
  }
  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;
  len4 = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
  if (!len4) {
    y0 = 0;
    y1 = 0;
    y2 = 0;
  } else {
    len4 = 1 / len4;
    y0 *= len4;
    y1 *= len4;
    y2 *= len4;
  }
  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  out[15] = 1;
  return out;
}
function targetTo(out, eye, target, up) {
  var eyex = eye[0], eyey = eye[1], eyez = eye[2], upx = up[0], upy = up[1], upz = up[2];
  var z0 = eyex - target[0], z1 = eyey - target[1], z2 = eyez - target[2];
  var len4 = z0 * z0 + z1 * z1 + z2 * z2;
  if (len4 > 0) {
    len4 = 1 / Math.sqrt(len4);
    z0 *= len4;
    z1 *= len4;
    z2 *= len4;
  }
  var x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
  len4 = x0 * x0 + x1 * x1 + x2 * x2;
  if (len4 > 0) {
    len4 = 1 / Math.sqrt(len4);
    x0 *= len4;
    x1 *= len4;
    x2 *= len4;
  }
  out[0] = x0;
  out[1] = x1;
  out[2] = x2;
  out[3] = 0;
  out[4] = z1 * x2 - z2 * x1;
  out[5] = z2 * x0 - z0 * x2;
  out[6] = z0 * x1 - z1 * x0;
  out[7] = 0;
  out[8] = z0;
  out[9] = z1;
  out[10] = z2;
  out[11] = 0;
  out[12] = eyex;
  out[13] = eyey;
  out[14] = eyez;
  out[15] = 1;
  return out;
}
function str(a) {
  return "mat4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ", " + a[9] + ", " + a[10] + ", " + a[11] + ", " + a[12] + ", " + a[13] + ", " + a[14] + ", " + a[15] + ")";
}
function frob(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3] + a[4] * a[4] + a[5] * a[5] + a[6] * a[6] + a[7] * a[7] + a[8] * a[8] + a[9] * a[9] + a[10] * a[10] + a[11] * a[11] + a[12] * a[12] + a[13] * a[13] + a[14] * a[14] + a[15] * a[15]);
}
function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  out[9] = a[9] + b[9];
  out[10] = a[10] + b[10];
  out[11] = a[11] + b[11];
  out[12] = a[12] + b[12];
  out[13] = a[13] + b[13];
  out[14] = a[14] + b[14];
  out[15] = a[15] + b[15];
  return out;
}
function subtract(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  out[9] = a[9] - b[9];
  out[10] = a[10] - b[10];
  out[11] = a[11] - b[11];
  out[12] = a[12] - b[12];
  out[13] = a[13] - b[13];
  out[14] = a[14] - b[14];
  out[15] = a[15] - b[15];
  return out;
}
function multiplyScalar(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  out[9] = a[9] * b;
  out[10] = a[10] * b;
  out[11] = a[11] * b;
  out[12] = a[12] * b;
  out[13] = a[13] * b;
  out[14] = a[14] * b;
  out[15] = a[15] * b;
  return out;
}
function multiplyScalarAndAdd(out, a, b, scale6) {
  out[0] = a[0] + b[0] * scale6;
  out[1] = a[1] + b[1] * scale6;
  out[2] = a[2] + b[2] * scale6;
  out[3] = a[3] + b[3] * scale6;
  out[4] = a[4] + b[4] * scale6;
  out[5] = a[5] + b[5] * scale6;
  out[6] = a[6] + b[6] * scale6;
  out[7] = a[7] + b[7] * scale6;
  out[8] = a[8] + b[8] * scale6;
  out[9] = a[9] + b[9] * scale6;
  out[10] = a[10] + b[10] * scale6;
  out[11] = a[11] + b[11] * scale6;
  out[12] = a[12] + b[12] * scale6;
  out[13] = a[13] + b[13] * scale6;
  out[14] = a[14] + b[14] * scale6;
  out[15] = a[15] + b[15] * scale6;
  return out;
}
function exactEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
}
function equals(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  var a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
  var a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11];
  var a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  var b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
  var b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11];
  var b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8)) && Math.abs(a9 - b9) <= EPSILON * Math.max(1, Math.abs(a9), Math.abs(b9)) && Math.abs(a10 - b10) <= EPSILON * Math.max(1, Math.abs(a10), Math.abs(b10)) && Math.abs(a11 - b11) <= EPSILON * Math.max(1, Math.abs(a11), Math.abs(b11)) && Math.abs(a12 - b12) <= EPSILON * Math.max(1, Math.abs(a12), Math.abs(b12)) && Math.abs(a13 - b13) <= EPSILON * Math.max(1, Math.abs(a13), Math.abs(b13)) && Math.abs(a14 - b14) <= EPSILON * Math.max(1, Math.abs(a14), Math.abs(b14)) && Math.abs(a15 - b15) <= EPSILON * Math.max(1, Math.abs(a15), Math.abs(b15));
}
var mul = multiply;
var sub = subtract;

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/quat.js
var quat_exports = {};
__export(quat_exports, {
  add: () => add4,
  calculateW: () => calculateW,
  clone: () => clone4,
  conjugate: () => conjugate,
  copy: () => copy4,
  create: () => create5,
  dot: () => dot3,
  equals: () => equals4,
  exactEquals: () => exactEquals4,
  exp: () => exp,
  fromEuler: () => fromEuler,
  fromMat3: () => fromMat3,
  fromValues: () => fromValues4,
  getAngle: () => getAngle,
  getAxisAngle: () => getAxisAngle,
  identity: () => identity2,
  invert: () => invert2,
  len: () => len3,
  length: () => length3,
  lerp: () => lerp3,
  ln: () => ln,
  mul: () => mul4,
  multiply: () => multiply4,
  normalize: () => normalize3,
  pow: () => pow,
  random: () => random3,
  rotateX: () => rotateX3,
  rotateY: () => rotateY3,
  rotateZ: () => rotateZ3,
  rotationTo: () => rotationTo,
  scale: () => scale4,
  set: () => set4,
  setAxes: () => setAxes,
  setAxisAngle: () => setAxisAngle,
  slerp: () => slerp2,
  sqlerp: () => sqlerp,
  sqrLen: () => sqrLen3,
  squaredLength: () => squaredLength3,
  str: () => str4
});

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/vec3.js
var vec3_exports = {};
__export(vec3_exports, {
  add: () => add2,
  angle: () => angle,
  bezier: () => bezier,
  ceil: () => ceil,
  clone: () => clone2,
  copy: () => copy2,
  create: () => create3,
  cross: () => cross,
  dist: () => dist,
  distance: () => distance,
  div: () => div,
  divide: () => divide,
  dot: () => dot,
  equals: () => equals2,
  exactEquals: () => exactEquals2,
  floor: () => floor,
  forEach: () => forEach,
  fromValues: () => fromValues2,
  hermite: () => hermite,
  inverse: () => inverse,
  len: () => len,
  length: () => length,
  lerp: () => lerp,
  max: () => max,
  min: () => min,
  mul: () => mul2,
  multiply: () => multiply2,
  negate: () => negate,
  normalize: () => normalize,
  random: () => random,
  rotateX: () => rotateX2,
  rotateY: () => rotateY2,
  rotateZ: () => rotateZ2,
  round: () => round2,
  scale: () => scale2,
  scaleAndAdd: () => scaleAndAdd,
  set: () => set2,
  slerp: () => slerp,
  sqrDist: () => sqrDist,
  sqrLen: () => sqrLen,
  squaredDistance: () => squaredDistance,
  squaredLength: () => squaredLength,
  str: () => str2,
  sub: () => sub2,
  subtract: () => subtract2,
  transformMat3: () => transformMat3,
  transformMat4: () => transformMat4,
  transformQuat: () => transformQuat,
  zero: () => zero
});
function create3() {
  var out = new ARRAY_TYPE(3);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}
function clone2(a) {
  var out = new ARRAY_TYPE(3);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function length(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return Math.sqrt(x * x + y * y + z * z);
}
function fromValues2(x, y, z) {
  var out = new ARRAY_TYPE(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function copy2(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function set2(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function add2(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
function subtract2(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}
function multiply2(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  return out;
}
function divide(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
  return out;
}
function ceil(out, a) {
  out[0] = Math.ceil(a[0]);
  out[1] = Math.ceil(a[1]);
  out[2] = Math.ceil(a[2]);
  return out;
}
function floor(out, a) {
  out[0] = Math.floor(a[0]);
  out[1] = Math.floor(a[1]);
  out[2] = Math.floor(a[2]);
  return out;
}
function min(out, a, b) {
  out[0] = Math.min(a[0], b[0]);
  out[1] = Math.min(a[1], b[1]);
  out[2] = Math.min(a[2], b[2]);
  return out;
}
function max(out, a, b) {
  out[0] = Math.max(a[0], b[0]);
  out[1] = Math.max(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]);
  return out;
}
function round2(out, a) {
  out[0] = round(a[0]);
  out[1] = round(a[1]);
  out[2] = round(a[2]);
  return out;
}
function scale2(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}
function scaleAndAdd(out, a, b, scale6) {
  out[0] = a[0] + b[0] * scale6;
  out[1] = a[1] + b[1] * scale6;
  out[2] = a[2] + b[2] * scale6;
  return out;
}
function distance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return Math.sqrt(x * x + y * y + z * z);
}
function squaredDistance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return x * x + y * y + z * z;
}
function squaredLength(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return x * x + y * y + z * z;
}
function negate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  return out;
}
function inverse(out, a) {
  out[0] = 1 / a[0];
  out[1] = 1 / a[1];
  out[2] = 1 / a[2];
  return out;
}
function normalize(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var len4 = x * x + y * y + z * z;
  if (len4 > 0) {
    len4 = 1 / Math.sqrt(len4);
  }
  out[0] = a[0] * len4;
  out[1] = a[1] * len4;
  out[2] = a[2] * len4;
  return out;
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(out, a, b) {
  var ax = a[0], ay = a[1], az = a[2];
  var bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}
function lerp(out, a, b, t) {
  var ax = a[0];
  var ay = a[1];
  var az = a[2];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  return out;
}
function slerp(out, a, b, t) {
  var angle2 = Math.acos(Math.min(Math.max(dot(a, b), -1), 1));
  var sinTotal = Math.sin(angle2);
  var ratioA = Math.sin((1 - t) * angle2) / sinTotal;
  var ratioB = Math.sin(t * angle2) / sinTotal;
  out[0] = ratioA * a[0] + ratioB * b[0];
  out[1] = ratioA * a[1] + ratioB * b[1];
  out[2] = ratioA * a[2] + ratioB * b[2];
  return out;
}
function hermite(out, a, b, c, d, t) {
  var factorTimes2 = t * t;
  var factor1 = factorTimes2 * (2 * t - 3) + 1;
  var factor2 = factorTimes2 * (t - 2) + t;
  var factor3 = factorTimes2 * (t - 1);
  var factor4 = factorTimes2 * (3 - 2 * t);
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function bezier(out, a, b, c, d, t) {
  var inverseFactor = 1 - t;
  var inverseFactorTimesTwo = inverseFactor * inverseFactor;
  var factorTimes2 = t * t;
  var factor1 = inverseFactorTimesTwo * inverseFactor;
  var factor2 = 3 * t * inverseFactorTimesTwo;
  var factor3 = 3 * factorTimes2 * inverseFactor;
  var factor4 = factorTimes2 * t;
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function random(out, scale6) {
  scale6 = scale6 === void 0 ? 1 : scale6;
  var r = RANDOM() * 2 * Math.PI;
  var z = RANDOM() * 2 - 1;
  var zScale = Math.sqrt(1 - z * z) * scale6;
  out[0] = Math.cos(r) * zScale;
  out[1] = Math.sin(r) * zScale;
  out[2] = z * scale6;
  return out;
}
function transformMat4(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  var w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
function transformMat3(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}
function transformQuat(out, a, q) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  var vx = a[0], vy = a[1], vz = a[2];
  var tx = qy * vz - qz * vy;
  var ty = qz * vx - qx * vz;
  var tz = qx * vy - qy * vx;
  tx = tx + tx;
  ty = ty + ty;
  tz = tz + tz;
  out[0] = vx + qw * tx + qy * tz - qz * ty;
  out[1] = vy + qw * ty + qz * tx - qx * tz;
  out[2] = vz + qw * tz + qx * ty - qy * tx;
  return out;
}
function rotateX2(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0];
  r[1] = p[1] * Math.cos(rad) - p[2] * Math.sin(rad);
  r[2] = p[1] * Math.sin(rad) + p[2] * Math.cos(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateY2(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[2] * Math.sin(rad) + p[0] * Math.cos(rad);
  r[1] = p[1];
  r[2] = p[2] * Math.cos(rad) - p[0] * Math.sin(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateZ2(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0] * Math.cos(rad) - p[1] * Math.sin(rad);
  r[1] = p[0] * Math.sin(rad) + p[1] * Math.cos(rad);
  r[2] = p[2];
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function angle(a, b) {
  var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2], mag = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz)), cosine = mag && dot(a, b) / mag;
  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}
function zero(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}
function str2(a) {
  return "vec3(" + a[0] + ", " + a[1] + ", " + a[2] + ")";
}
function exactEquals2(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
function equals2(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2];
  var b0 = b[0], b1 = b[1], b2 = b[2];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2));
}
var sub2 = subtract2;
var mul2 = multiply2;
var div = divide;
var dist = distance;
var sqrDist = squaredDistance;
var len = length;
var sqrLen = squaredLength;
var forEach = (function() {
  var vec = create3();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 3;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
    }
    return a;
  };
})();

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/vec4.js
var vec4_exports = {};
__export(vec4_exports, {
  add: () => add3,
  ceil: () => ceil2,
  clone: () => clone3,
  copy: () => copy3,
  create: () => create4,
  cross: () => cross2,
  dist: () => dist2,
  distance: () => distance2,
  div: () => div2,
  divide: () => divide2,
  dot: () => dot2,
  equals: () => equals3,
  exactEquals: () => exactEquals3,
  floor: () => floor2,
  forEach: () => forEach2,
  fromValues: () => fromValues3,
  inverse: () => inverse2,
  len: () => len2,
  length: () => length2,
  lerp: () => lerp2,
  max: () => max2,
  min: () => min2,
  mul: () => mul3,
  multiply: () => multiply3,
  negate: () => negate2,
  normalize: () => normalize2,
  random: () => random2,
  round: () => round3,
  scale: () => scale3,
  scaleAndAdd: () => scaleAndAdd2,
  set: () => set3,
  sqrDist: () => sqrDist2,
  sqrLen: () => sqrLen2,
  squaredDistance: () => squaredDistance2,
  squaredLength: () => squaredLength2,
  str: () => str3,
  sub: () => sub3,
  subtract: () => subtract3,
  transformMat4: () => transformMat42,
  transformQuat: () => transformQuat2,
  zero: () => zero2
});
function create4() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
  }
  return out;
}
function clone3(a) {
  var out = new ARRAY_TYPE(4);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}
function fromValues3(x, y, z, w) {
  var out = new ARRAY_TYPE(4);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}
function copy3(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}
function set3(out, x, y, z, w) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}
function add3(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  return out;
}
function subtract3(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  return out;
}
function multiply3(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  out[3] = a[3] * b[3];
  return out;
}
function divide2(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
  out[3] = a[3] / b[3];
  return out;
}
function ceil2(out, a) {
  out[0] = Math.ceil(a[0]);
  out[1] = Math.ceil(a[1]);
  out[2] = Math.ceil(a[2]);
  out[3] = Math.ceil(a[3]);
  return out;
}
function floor2(out, a) {
  out[0] = Math.floor(a[0]);
  out[1] = Math.floor(a[1]);
  out[2] = Math.floor(a[2]);
  out[3] = Math.floor(a[3]);
  return out;
}
function min2(out, a, b) {
  out[0] = Math.min(a[0], b[0]);
  out[1] = Math.min(a[1], b[1]);
  out[2] = Math.min(a[2], b[2]);
  out[3] = Math.min(a[3], b[3]);
  return out;
}
function max2(out, a, b) {
  out[0] = Math.max(a[0], b[0]);
  out[1] = Math.max(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]);
  out[3] = Math.max(a[3], b[3]);
  return out;
}
function round3(out, a) {
  out[0] = round(a[0]);
  out[1] = round(a[1]);
  out[2] = round(a[2]);
  out[3] = round(a[3]);
  return out;
}
function scale3(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  return out;
}
function scaleAndAdd2(out, a, b, scale6) {
  out[0] = a[0] + b[0] * scale6;
  out[1] = a[1] + b[1] * scale6;
  out[2] = a[2] + b[2] * scale6;
  out[3] = a[3] + b[3] * scale6;
  return out;
}
function distance2(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  var w = b[3] - a[3];
  return Math.sqrt(x * x + y * y + z * z + w * w);
}
function squaredDistance2(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  var w = b[3] - a[3];
  return x * x + y * y + z * z + w * w;
}
function length2(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var w = a[3];
  return Math.sqrt(x * x + y * y + z * z + w * w);
}
function squaredLength2(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var w = a[3];
  return x * x + y * y + z * z + w * w;
}
function negate2(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  out[3] = -a[3];
  return out;
}
function inverse2(out, a) {
  out[0] = 1 / a[0];
  out[1] = 1 / a[1];
  out[2] = 1 / a[2];
  out[3] = 1 / a[3];
  return out;
}
function normalize2(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var w = a[3];
  var len4 = x * x + y * y + z * z + w * w;
  if (len4 > 0) {
    len4 = 1 / Math.sqrt(len4);
  }
  out[0] = x * len4;
  out[1] = y * len4;
  out[2] = z * len4;
  out[3] = w * len4;
  return out;
}
function dot2(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}
function cross2(out, u, v, w) {
  var A = v[0] * w[1] - v[1] * w[0], B = v[0] * w[2] - v[2] * w[0], C = v[0] * w[3] - v[3] * w[0], D = v[1] * w[2] - v[2] * w[1], E = v[1] * w[3] - v[3] * w[1], F = v[2] * w[3] - v[3] * w[2];
  var G = u[0];
  var H = u[1];
  var I = u[2];
  var J = u[3];
  out[0] = H * F - I * E + J * D;
  out[1] = -(G * F) + I * C - J * B;
  out[2] = G * E - H * C + J * A;
  out[3] = -(G * D) + H * B - I * A;
  return out;
}
function lerp2(out, a, b, t) {
  var ax = a[0];
  var ay = a[1];
  var az = a[2];
  var aw = a[3];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  out[3] = aw + t * (b[3] - aw);
  return out;
}
function random2(out, scale6) {
  scale6 = scale6 === void 0 ? 1 : scale6;
  var v1, v2, v3, v4;
  var s1, s2;
  var rand;
  rand = RANDOM();
  v1 = rand * 2 - 1;
  v2 = (4 * RANDOM() - 2) * Math.sqrt(rand * -rand + rand);
  s1 = v1 * v1 + v2 * v2;
  rand = RANDOM();
  v3 = rand * 2 - 1;
  v4 = (4 * RANDOM() - 2) * Math.sqrt(rand * -rand + rand);
  s2 = v3 * v3 + v4 * v4;
  var d = Math.sqrt((1 - s1) / s2);
  out[0] = scale6 * v1;
  out[1] = scale6 * v2;
  out[2] = scale6 * v3 * d;
  out[3] = scale6 * v4 * d;
  return out;
}
function transformMat42(out, a, m) {
  var x = a[0], y = a[1], z = a[2], w = a[3];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
  return out;
}
function transformQuat2(out, a, q) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  var vx = a[0], vy = a[1], vz = a[2];
  var tx = qy * vz - qz * vy;
  var ty = qz * vx - qx * vz;
  var tz = qx * vy - qy * vx;
  tx = tx + tx;
  ty = ty + ty;
  tz = tz + tz;
  out[0] = vx + qw * tx + qy * tz - qz * ty;
  out[1] = vy + qw * ty + qz * tx - qx * tz;
  out[2] = vz + qw * tz + qx * ty - qy * tx;
  out[3] = a[3];
  return out;
}
function zero2(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  return out;
}
function str3(a) {
  return "vec4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ")";
}
function exactEquals3(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
function equals3(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3));
}
var sub3 = subtract3;
var mul3 = multiply3;
var div2 = divide2;
var dist2 = distance2;
var sqrDist2 = squaredDistance2;
var len2 = length2;
var sqrLen2 = squaredLength2;
var forEach2 = (function() {
  var vec = create4();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 4;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      vec[3] = a[i + 3];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
      a[i + 3] = vec[3];
    }
    return a;
  };
})();

// solver-build/node_modules/.pnpm/gl-matrix@3.4.4/node_modules/gl-matrix/esm/quat.js
function create5() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  out[3] = 1;
  return out;
}
function identity2(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}
function setAxisAngle(out, axis, rad) {
  rad = rad * 0.5;
  var s = Math.sin(rad);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(rad);
  return out;
}
function getAxisAngle(out_axis, q) {
  var rad = Math.acos(q[3]) * 2;
  var s = Math.sin(rad / 2);
  if (s > EPSILON) {
    out_axis[0] = q[0] / s;
    out_axis[1] = q[1] / s;
    out_axis[2] = q[2] / s;
  } else {
    out_axis[0] = 1;
    out_axis[1] = 0;
    out_axis[2] = 0;
  }
  return rad;
}
function getAngle(a, b) {
  var dotproduct = dot3(a, b);
  return Math.acos(2 * dotproduct * dotproduct - 1);
}
function multiply4(out, a, b) {
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
function rotateX3(out, a, rad) {
  rad *= 0.5;
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bx = Math.sin(rad), bw = Math.cos(rad);
  out[0] = ax * bw + aw * bx;
  out[1] = ay * bw + az * bx;
  out[2] = az * bw - ay * bx;
  out[3] = aw * bw - ax * bx;
  return out;
}
function rotateY3(out, a, rad) {
  rad *= 0.5;
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var by = Math.sin(rad), bw = Math.cos(rad);
  out[0] = ax * bw - az * by;
  out[1] = ay * bw + aw * by;
  out[2] = az * bw + ax * by;
  out[3] = aw * bw - ay * by;
  return out;
}
function rotateZ3(out, a, rad) {
  rad *= 0.5;
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bz = Math.sin(rad), bw = Math.cos(rad);
  out[0] = ax * bw + ay * bz;
  out[1] = ay * bw - ax * bz;
  out[2] = az * bw + aw * bz;
  out[3] = aw * bw - az * bz;
  return out;
}
function calculateW(out, a) {
  var x = a[0], y = a[1], z = a[2];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = Math.sqrt(Math.abs(1 - x * x - y * y - z * z));
  return out;
}
function exp(out, a) {
  var x = a[0], y = a[1], z = a[2], w = a[3];
  var r = Math.sqrt(x * x + y * y + z * z);
  var et = Math.exp(w);
  var s = r > 0 ? et * Math.sin(r) / r : 0;
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = et * Math.cos(r);
  return out;
}
function ln(out, a) {
  var x = a[0], y = a[1], z = a[2], w = a[3];
  var r = Math.sqrt(x * x + y * y + z * z);
  var t = r > 0 ? Math.atan2(r, w) / r : 0;
  out[0] = x * t;
  out[1] = y * t;
  out[2] = z * t;
  out[3] = 0.5 * Math.log(x * x + y * y + z * z + w * w);
  return out;
}
function pow(out, a, b) {
  ln(out, a);
  scale4(out, out, b);
  exp(out, out);
  return out;
}
function slerp2(out, a, b, t) {
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bx = b[0], by = b[1], bz = b[2], bw = b[3];
  var omega, cosom, sinom, scale0, scale1;
  cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (1 - cosom > EPSILON) {
    omega = Math.acos(cosom);
    sinom = Math.sin(omega);
    scale0 = Math.sin((1 - t) * omega) / sinom;
    scale1 = Math.sin(t * omega) / sinom;
  } else {
    scale0 = 1 - t;
    scale1 = t;
  }
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
  return out;
}
function random3(out) {
  var u1 = RANDOM();
  var u2 = RANDOM();
  var u3 = RANDOM();
  var sqrt1MinusU1 = Math.sqrt(1 - u1);
  var sqrtU1 = Math.sqrt(u1);
  out[0] = sqrt1MinusU1 * Math.sin(2 * Math.PI * u2);
  out[1] = sqrt1MinusU1 * Math.cos(2 * Math.PI * u2);
  out[2] = sqrtU1 * Math.sin(2 * Math.PI * u3);
  out[3] = sqrtU1 * Math.cos(2 * Math.PI * u3);
  return out;
}
function invert2(out, a) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  var dot4 = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
  var invDot = dot4 ? 1 / dot4 : 0;
  out[0] = -a0 * invDot;
  out[1] = -a1 * invDot;
  out[2] = -a2 * invDot;
  out[3] = a3 * invDot;
  return out;
}
function conjugate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  out[3] = a[3];
  return out;
}
function fromMat3(out, m) {
  var fTrace = m[0] + m[4] + m[8];
  var fRoot;
  if (fTrace > 0) {
    fRoot = Math.sqrt(fTrace + 1);
    out[3] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[0] = (m[5] - m[7]) * fRoot;
    out[1] = (m[6] - m[2]) * fRoot;
    out[2] = (m[1] - m[3]) * fRoot;
  } else {
    var i = 0;
    if (m[4] > m[0]) i = 1;
    if (m[8] > m[i * 3 + i]) i = 2;
    var j = (i + 1) % 3;
    var k = (i + 2) % 3;
    fRoot = Math.sqrt(m[i * 3 + i] - m[j * 3 + j] - m[k * 3 + k] + 1);
    out[i] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[3] = (m[j * 3 + k] - m[k * 3 + j]) * fRoot;
    out[j] = (m[j * 3 + i] + m[i * 3 + j]) * fRoot;
    out[k] = (m[k * 3 + i] + m[i * 3 + k]) * fRoot;
  }
  return out;
}
function fromEuler(out, x, y, z) {
  var order = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : ANGLE_ORDER;
  var halfToRad = Math.PI / 360;
  x *= halfToRad;
  z *= halfToRad;
  y *= halfToRad;
  var sx = Math.sin(x);
  var cx = Math.cos(x);
  var sy = Math.sin(y);
  var cy = Math.cos(y);
  var sz = Math.sin(z);
  var cz = Math.cos(z);
  switch (order) {
    case "xyz":
      out[0] = sx * cy * cz + cx * sy * sz;
      out[1] = cx * sy * cz - sx * cy * sz;
      out[2] = cx * cy * sz + sx * sy * cz;
      out[3] = cx * cy * cz - sx * sy * sz;
      break;
    case "xzy":
      out[0] = sx * cy * cz - cx * sy * sz;
      out[1] = cx * sy * cz - sx * cy * sz;
      out[2] = cx * cy * sz + sx * sy * cz;
      out[3] = cx * cy * cz + sx * sy * sz;
      break;
    case "yxz":
      out[0] = sx * cy * cz + cx * sy * sz;
      out[1] = cx * sy * cz - sx * cy * sz;
      out[2] = cx * cy * sz - sx * sy * cz;
      out[3] = cx * cy * cz + sx * sy * sz;
      break;
    case "yzx":
      out[0] = sx * cy * cz + cx * sy * sz;
      out[1] = cx * sy * cz + sx * cy * sz;
      out[2] = cx * cy * sz - sx * sy * cz;
      out[3] = cx * cy * cz - sx * sy * sz;
      break;
    case "zxy":
      out[0] = sx * cy * cz - cx * sy * sz;
      out[1] = cx * sy * cz + sx * cy * sz;
      out[2] = cx * cy * sz + sx * sy * cz;
      out[3] = cx * cy * cz - sx * sy * sz;
      break;
    case "zyx":
      out[0] = sx * cy * cz - cx * sy * sz;
      out[1] = cx * sy * cz + sx * cy * sz;
      out[2] = cx * cy * sz - sx * sy * cz;
      out[3] = cx * cy * cz + sx * sy * sz;
      break;
    default:
      throw new Error("Unknown angle order " + order);
  }
  return out;
}
function str4(a) {
  return "quat(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ")";
}
var clone4 = clone3;
var fromValues4 = fromValues3;
var copy4 = copy3;
var set4 = set3;
var add4 = add3;
var mul4 = multiply4;
var scale4 = scale3;
var dot3 = dot2;
var lerp3 = lerp2;
var length3 = length2;
var len3 = length3;
var squaredLength3 = squaredLength2;
var sqrLen3 = squaredLength3;
var normalize3 = normalize2;
var exactEquals4 = exactEquals3;
function equals4(a, b) {
  return Math.abs(dot2(a, b)) >= 1 - EPSILON;
}
var rotationTo = (function() {
  var tmpvec3 = create3();
  var xUnitVec3 = fromValues2(1, 0, 0);
  var yUnitVec3 = fromValues2(0, 1, 0);
  return function(out, a, b) {
    var dot4 = dot(a, b);
    if (dot4 < -0.999999) {
      cross(tmpvec3, xUnitVec3, a);
      if (len(tmpvec3) < 1e-6) cross(tmpvec3, yUnitVec3, a);
      normalize(tmpvec3, tmpvec3);
      setAxisAngle(out, tmpvec3, Math.PI);
      return out;
    } else if (dot4 > 0.999999) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
      return out;
    } else {
      cross(tmpvec3, a, b);
      out[0] = tmpvec3[0];
      out[1] = tmpvec3[1];
      out[2] = tmpvec3[2];
      out[3] = 1 + dot4;
      return normalize3(out, out);
    }
  };
})();
var sqlerp = (function() {
  var temp1 = create5();
  var temp2 = create5();
  return function(out, a, b, c, d, t) {
    slerp2(temp1, a, d, t);
    slerp2(temp2, b, c, t);
    slerp2(out, temp1, temp2, 2 * t * (1 - t));
    return out;
  };
})();
var setAxes = (function() {
  var matr = create();
  return function(out, view, right, up) {
    matr[0] = right[0];
    matr[3] = right[1];
    matr[6] = right[2];
    matr[1] = up[0];
    matr[4] = up[1];
    matr[7] = up[2];
    matr[2] = -view[0];
    matr[5] = -view[1];
    matr[8] = -view[2];
    return normalize3(out, fromMat3(out, matr));
  };
})();

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/quaternion.js
var tempQuat = new Float64Array(4);
var tempQuat2 = new Float64Array(4);
function smallestDifferenceQuaternion(output, a, b) {
  vec4_exports.scale(tempQuat, b, -1);
  if (vec4_exports.squaredDistance(a, tempQuat) < vec4_exports.squaredDistance(a, b)) {
    vec4_exports.subtract(output, a, tempQuat);
  } else {
    vec4_exports.subtract(output, a, b);
  }
}
function rotationVectorFromQuaternion(output, q) {
  quat_exports.normalize(tempQuat, q);
  let angle2 = quat_exports.getAxisAngle(output, tempQuat);
  if (angle2 > Math.PI) {
    angle2 -= 2 * Math.PI;
  }
  vec3_exports.scale(output, output, angle2);
}
function quaternionDelta(output, a, b) {
  quat_exports.conjugate(tempQuat2, b);
  quat_exports.multiply(output, a, tempQuat2);
}
function quaternionSquaredDistance(a, b) {
  smallestDifferenceQuaternion(tempQuat2, a, b);
  return vec4_exports.squaredLength(tempQuat2);
}

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/constants.js
var PI = Math.PI;
var PI2 = 2 * PI;
var HALF_PI = PI / 2;
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 1 / DEG2RAD;
var AXES = [
  new Float64Array([1, 0, 0]),
  // X
  new Float64Array([0, 1, 0]),
  // Y
  new Float64Array([0, 0, 1]),
  // Z
  new Float64Array([1, 0, 0]),
  // EX (rotation around X)
  new Float64Array([0, 1, 0]),
  // EY (rotation around Y)
  new Float64Array([0, 0, 1])
  // EZ (rotation around Z)
];

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/Frame.js
var tempInverse = new Float32Array(16);
var tempMatrix = new Float32Array(16);
var tempQuat3 = new Float32Array(4);
var tempPos = new Float32Array(3);
var sharedTraversedChildren = /* @__PURE__ */ new Set();
var sharedTraverseArray = [];
var traverseVariablesInUse = false;
var Frame = class {
  constructor() {
    this.name = "";
    this.quaternion = new Float32Array([0, 0, 0, 1]);
    this.position = new Float32Array(3);
    this.matrix = new Float32Array(16);
    mat4_exports.identity(this.matrix);
    this.matrixWorld = new Float32Array(16);
    mat4_exports.identity(this.matrixWorld);
    this.matrixNeedsUpdate = false;
    this.matrixWorldNeedsUpdate = false;
    this.parent = null;
    this.children = [];
  }
  /**
   * Sets the position of the frame relative to its parent.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(...args) {
    const position = this.position;
    if (vec3_exports.sqrDist(position, args) > 1e-10) {
      position[0] = args[0];
      position[1] = args[1];
      position[2] = args[2];
      this.setMatrixNeedsUpdate();
    }
  }
  /**
   * Sets the orientation of the frame relative to its parent from Euler angles in radians.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setEuler(x, y, z) {
    quat_exports.fromEuler(tempQuat3, x * RAD2DEG, y * RAD2DEG, z * RAD2DEG);
    this.setQuaternion(...tempQuat3);
  }
  /**
   * Sets the orientation of the frame relative to its parent.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} w
   */
  setQuaternion(...args) {
    const quaternion = this.quaternion;
    if (quaternionSquaredDistance(quaternion, args) > 1e-10) {
      quaternion[0] = args[0];
      quaternion[1] = args[1];
      quaternion[2] = args[2];
      quaternion[3] = args[3];
      this.setMatrixNeedsUpdate();
    }
  }
  /**
   * Sets the position of the frame in world space. The local position relative to the parent
   * is computed automatically.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setWorldPosition(x, y, z) {
    const parent = this.parent;
    tempPos[0] = x;
    tempPos[1] = y;
    tempPos[2] = z;
    if (parent) {
      parent.updateMatrixWorld();
      mat4_exports.invert(tempInverse, parent.matrixWorld);
      vec3_exports.transformMat4(tempPos, tempPos, tempInverse);
    }
    this.setPosition(...tempPos);
  }
  /**
   * Sets the orientation of the frame in world space from Euler angles in radians. The local
   * orientation relative to the parent is computed automatically.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setWorldEuler(x, y, z) {
    quat_exports.fromEuler(tempQuat3, x * RAD2DEG, y * RAD2DEG, z * RAD2DEG);
    this.setWorldQuaternion(...tempQuat3);
  }
  /**
   * Sets the orientation of the frame in world space. The local orientation relative to the
   * parent is computed automatically.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} w
   */
  setWorldQuaternion(x, y, z, w) {
    const parent = this.parent;
    tempQuat3[0] = x;
    tempQuat3[1] = y;
    tempQuat3[2] = z;
    tempQuat3[3] = w;
    if (parent) {
      parent.updateMatrixWorld();
      mat4_exports.invert(tempInverse, parent.matrixWorld);
      mat4_exports.fromQuat(tempMatrix, tempQuat3);
      mat4_exports.multiply(tempMatrix, tempInverse, tempMatrix);
      mat4_exports.getRotation(tempQuat3, tempMatrix);
    }
    this.setQuaternion(...tempQuat3);
  }
  /**
   * Writes the position of the frame in world space into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getWorldPosition(arr) {
    this.updateMatrixWorld();
    mat4_exports.getTranslation(arr, this.matrixWorld);
  }
  /**
   * Writes the orientation of the frame in world space into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getWorldQuaternion(arr) {
    this.updateMatrixWorld();
    mat4_exports.getRotation(arr, this.matrixWorld);
  }
  /**
   * Calls `callback` for every ancestor starting with the parent. Returning `true` from the
   * callback stops the traversal.
   * @param {FrameCallback} callback
   */
  traverseParents(cb) {
    let traversedChildren;
    const originalVariablesInUse = traverseVariablesInUse;
    if (traverseVariablesInUse) {
      traversedChildren = /* @__PURE__ */ new Set();
    } else {
      traversedChildren = sharedTraversedChildren;
      traversedChildren.clear();
    }
    traverseVariablesInUse = true;
    let curr = this.parent;
    while (curr) {
      if (traversedChildren.has(curr)) {
        break;
      }
      const stop = cb(curr);
      if (stop) {
        break;
      }
      traversedChildren.add(curr);
      curr = curr.parent;
    }
    traverseVariablesInUse = originalVariablesInUse;
    traversedChildren.clear();
  }
  /**
   * Calls `callback` for this frame and every descendant in breadth first order. Returning
   * `true` from the callback stops traversal below that frame.
   * @param {FrameCallback} callback
   */
  traverse(cb) {
    const originalVariablesInUse = traverseVariablesInUse;
    let traversedChildren;
    let stack;
    if (traverseVariablesInUse) {
      traversedChildren = /* @__PURE__ */ new Set();
      stack = [this];
    } else {
      traversedChildren = sharedTraversedChildren;
      traversedChildren.clear();
      stack = sharedTraverseArray;
      stack[0] = this;
    }
    traverseVariablesInUse = true;
    let i = 0;
    let tot = 1;
    while (i < tot) {
      const curr = stack[i];
      const stop = cb(curr);
      if (!stop) {
        const children = curr.children;
        for (let c = 0, l = children.length; c < l; c++) {
          const child = children[c];
          if (traversedChildren.has(child)) {
            continue;
          } else {
            traversedChildren.add(child);
            stack[tot] = child;
            tot++;
          }
        }
      }
      i++;
    }
    traverseVariablesInUse = originalVariablesInUse;
    traversedChildren.clear();
    stack.fill(null, 0, tot);
  }
  /**
   * Returns the first frame in the tree, including this one, for which `callback` returns
   * `true`, or `null` if none does.
   * @param {FrameCallback} callback
   * @returns {Frame | null}
   */
  find(cb) {
    let result = null;
    this.traverse((c) => {
      if (result) {
        return true;
      } else if (cb(c)) {
        result = c;
        return true;
      }
    });
    return result;
  }
  /**
   * Adds a child to this frame and sets its parent to this frame. Throws if the child already
   * has a parent.
   * @param {Frame} child
   */
  addChild(child) {
    if (child.parent) {
      throw new Error("Frame: Added child must not already have a parent.");
    }
    if (child === this) {
      throw new Error("Frame: Frame cannot be added as a child to itself.");
    }
    this.traverseParents((p) => {
      if (p === child) {
        throw new Error("Frame: Added child is an ancestor of this Frame. Use Joint.makeClosure instead.");
      }
    });
    child.parent = this;
    this.children.push(child);
    child.setMatrixWorldNeedsUpdate();
  }
  /**
   * Removes the given child from this frame. Throws if the frame is not a child of this frame.
   * @param {Frame} child
   */
  removeChild(child) {
    if (child.parent !== this) {
      throw new Error("Frame: Child to be removed is not a child of this Frame.");
    }
    const index = this.children.indexOf(child);
    this.children.splice(index, 1);
    child.parent = null;
    child.setMatrixWorldNeedsUpdate();
  }
  /**
   * Adds the given frame as a child while preserving its world transform.
   * @param {Frame} child
   */
  attachChild(child) {
    this.updateMatrixWorld();
    child.updateMatrixWorld();
    this.addChild(child);
    mat4_exports.invert(tempInverse, this.matrixWorld);
    mat4_exports.multiply(child.matrix, tempInverse, child.matrixWorld);
    mat4_exports.getTranslation(child.position, child.matrix);
    mat4_exports.getRotation(child.quaternion, child.matrix);
  }
  /**
   * Removes the given child while preserving its world transform.
   * @param {Frame} child
   */
  detachChild(child) {
    this.updateMatrixWorld();
    child.updateMatrixWorld();
    this.removeChild(child);
    mat4_exports.copy(child.matrix, child.matrixWorld);
    mat4_exports.getTranslation(child.position, child.matrix);
    mat4_exports.getRotation(child.quaternion, child.matrix);
  }
  computeMatrixWorld() {
    if (this.parent) {
      mat4_exports.multiply(this.matrixWorld, this.parent.matrixWorld, this.matrix);
    } else {
      mat4_exports.copy(this.matrixWorld, this.matrix);
    }
  }
  /**
   * Flags this frame as needing its local and world matrices updated.
   */
  setMatrixNeedsUpdate() {
    if (this.matrixNeedsUpdate === false) {
      this.matrixNeedsUpdate = true;
      this.setMatrixWorldNeedsUpdate();
    }
  }
  /**
   * Flags this frame and all its descendants as needing their world matrices updated.
   */
  setMatrixWorldNeedsUpdate() {
    this.traverse((c) => {
      if (c.matrixWorldNeedsUpdate) {
        return true;
      }
      c.matrixWorldNeedsUpdate = true;
      return false;
    });
  }
  /**
   * Updates the local matrix if it has been flagged as needing an update.
   */
  updateMatrix() {
    if (this.matrixNeedsUpdate) {
      mat4_exports.fromRotationTranslation(this.matrix, this.quaternion, this.position);
      this.matrixNeedsUpdate = false;
    }
  }
  /**
   * Updates the local and world matrices if they have been flagged as needing an update,
   * updating parent matrices first as needed.
   * @param {boolean} [updateChildren=false] - Also update the world matrices of all descendants.
   */
  updateMatrixWorld(updateChildren = false) {
    const { parent } = this;
    if (this.matrixWorldNeedsUpdate) {
      if (parent && parent.matrixWorldNeedsUpdate) {
        parent.updateMatrixWorld(false);
      }
      this.updateMatrix();
      this.computeMatrixWorld();
      this.matrixWorldNeedsUpdate = false;
    }
    if (updateChildren) {
      this.traverse((c) => {
        if (this !== c) {
          c.updateMatrixWorld(false);
        }
      });
    }
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/Link.js
var Link = class extends Frame {
  constructor() {
    super();
    this.isLink = true;
    this.closureJoints = [];
  }
  /**
   * Adds a joint as a child of this link. Throws if the child is not a joint.
   * @param {Joint} child
   */
  addChild(child) {
    if (!child.isJoint) {
      throw new Error("Link: Added child must be a Joint.");
    } else {
      super.addChild(child);
    }
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/euler.js
function clampEulerValue(value) {
  let result = value % PI2;
  if (result > PI) {
    result -= PI2;
  } else if (result <= -PI) {
    result += PI2;
  }
  return result;
}
function toSmallestEulerValueDistance(target, toAdjust) {
  const wholeRotation = Math.round(target / PI2) * PI2;
  const clampedValue = clampEulerValue(toAdjust);
  let result = wholeRotation + clampedValue;
  const delta = result - target;
  if (Math.abs(delta) > PI) {
    result -= Math.sign(delta) * PI2;
  }
  return result;
}
function toSmallestEulerDistance(output, target, toAdjust) {
  output[0] = toSmallestEulerValueDistance(target[0], toAdjust[0]);
  output[1] = toSmallestEulerValueDistance(target[1], toAdjust[1]);
  output[2] = toSmallestEulerValueDistance(target[2], toAdjust[2]);
}
function diffEulerDistance(a, b) {
  let result = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  return result;
}
function getRedundantEulerRepresentation(output, input) {
  output[0] = input[0] + PI;
  output[1] = PI - input[1];
  output[2] = input[2] + PI;
}
function isRedundantTwist(euler) {
  const pivotAngle = clampEulerValue(euler[1]);
  if (Math.abs(Math.abs(pivotAngle) - HALF_PI) > 1e-7) {
    return false;
  }
  return true;
}
function toSmallestRedundantTwistRepresentation(output, target, toAdjust) {
  if (!isRedundantTwist(toAdjust)) {
    return false;
  }
  const pivotAngle = clampEulerValue(toAdjust[1]);
  const zRotationSign = -1 * Math.sign(pivotAngle);
  const combinedXRotation = toAdjust[0] + zRotationSign * toAdjust[2];
  output[0] = target[0];
  output[1] = toSmallestEulerValueDistance(target[1], toAdjust[1]);
  output[2] = toSmallestEulerValueDistance(target[2], zRotationSign * (combinedXRotation - target[0]));
  toSmallestEulerDistance(output, target, output);
  return true;
}
var tempEuler1 = new Float64Array(3);
var tempEuler2 = new Float64Array(3);
function getClosestEulerRepresentation(output, target, input) {
  let score = Infinity;
  if (isRedundantTwist(input)) {
    toSmallestRedundantTwistRepresentation(tempEuler1, target, input);
    getRedundantEulerRepresentation(tempEuler2, input);
    toSmallestRedundantTwistRepresentation(tempEuler2, target, tempEuler2);
    const d12 = diffEulerDistance(target, tempEuler1);
    const d22 = diffEulerDistance(target, tempEuler2);
    if (d12 < d22) {
      vec3_exports.copy(output, tempEuler1);
      score = d12;
    } else {
      vec3_exports.copy(output, tempEuler2);
      score = d22;
    }
  }
  toSmallestEulerDistance(tempEuler1, target, input);
  getRedundantEulerRepresentation(tempEuler2, input);
  toSmallestEulerDistance(tempEuler2, target, tempEuler2);
  const d1 = diffEulerDistance(target, tempEuler1);
  const d2 = diffEulerDistance(target, tempEuler2);
  if (d1 < score || d2 < score) {
    if (d1 < d2) {
      vec3_exports.copy(output, tempEuler1);
    } else {
      vec3_exports.copy(output, tempEuler2);
    }
  }
}

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/glmatrix.js
var tempPos2 = new Float64Array(3);
var tempQuat4 = new Float64Array(4);
var tempPos22 = new Float64Array(3);
var tempQuat22 = new Float64Array(4);
function getEuler(out, quat) {
  const [x, y, z, w] = quat;
  const t0 = 2 * (w * x + y * z);
  const t1 = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(t0, t1);
  let t2 = 2 * (w * y - z * x);
  t2 = t2 > 1 ? 1 : t2;
  t2 = t2 < -1 ? -1 : t2;
  const pitch = Math.asin(t2);
  const t3 = 2 * (w * z + x * y);
  const t4 = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(t3, t4);
  out[0] = roll * RAD2DEG;
  out[1] = pitch * RAD2DEG;
  out[2] = yaw * RAD2DEG;
  return out;
}
function getMatrixDifference(a, b, outPos, outRotVec) {
  mat4_exports.getTranslation(tempPos2, a);
  mat4_exports.getRotation(tempQuat4, a);
  mat4_exports.getTranslation(tempPos22, b);
  mat4_exports.getRotation(tempQuat22, b);
  vec3_exports.subtract(outPos, tempPos2, tempPos22);
  quaternionDelta(tempQuat4, tempQuat4, tempQuat22);
  rotationVectorFromQuaternion(outRotVec, tempQuat4);
}

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/Joint.js
var DOF = {
  X: 0,
  Y: 1,
  Z: 2,
  EX: 3,
  EY: 4,
  EZ: 5
};
var DOF_NAMES = Object.entries(DOF).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
var tempInverse2 = new Float32Array(16);
var tempQuat5 = new Float32Array(4);
var tempEuler = new Float32Array(3);
var tempValueEuler = new Float32Array(3);
var quatEuler = new Float32Array(3);
function dofToMatrix(out, dof) {
  quat_exports.fromEuler(tempQuat5, dof[DOF.EX] * RAD2DEG, dof[DOF.EY] * RAD2DEG, dof[DOF.EZ] * RAD2DEG);
  mat4_exports.fromRotationTranslation(out, tempQuat5, dof);
}
var Joint = class extends Frame {
  constructor() {
    super();
    this.isJoint = true;
    this.child = null;
    this.isClosure = false;
    this.trackJointWrap = false;
    this.rotationDoFCount = 0;
    this.translationDoFCount = 0;
    this.dof = [];
    this.dofFlags = new Uint8Array(6);
    this.dofValues = new Float32Array(6);
    this.dofTarget = new Float32Array(6);
    this.dofRestPose = new Float32Array(6);
    this.minDoFLimit = new Float32Array(6).fill(-Infinity);
    this.maxDoFLimit = new Float32Array(6).fill(Infinity);
    this.targetSet = false;
    this.restPoseSet = false;
    this.matrixDoFNeedsUpdate = false;
    this.matrixDoF = new Float32Array(16);
    mat4_exports.identity(this.matrixDoF);
    this.cachedIdentityDoFMatrixWorld = new Float32Array(16);
    mat4_exports.identity(this.cachedIdentityDoFMatrixWorld);
  }
  // private helpers
  _getQuaternion(target, outQuat) {
    quat_exports.fromEuler(outQuat, target[DOF.EX] * RAD2DEG, target[DOF.EY] * RAD2DEG, target[DOF.EZ] * RAD2DEG);
  }
  _getEuler(target, outEuler) {
    outEuler[0] = target[DOF.EX];
    outEuler[1] = target[DOF.EY];
    outEuler[2] = target[DOF.EZ];
  }
  _getPosition(target, outPos) {
    outPos[0] = target[DOF.X];
    outPos[1] = target[DOF.Y];
    outPos[2] = target[DOF.Z];
  }
  _setValue(target, dof, value) {
    if (target === this.minDoFLimit || target == this.maxDoFLimit) {
      throw new Error("Joint: Cannot set minDoFLimit or maxDoFLimit with _setValue.");
    }
    if (dof < 0 || dof > 6 || typeof dof !== "number") {
      throw new Error("Joint: Invalid DoF.");
    }
    if (!this.dofFlags[dof]) {
      return false;
    }
    const minVal = this.minDoFLimit[dof];
    const maxVal = this.maxDoFLimit[dof];
    if (value < minVal) {
      value = minVal;
    }
    if (value > maxVal) {
      value = maxVal;
    }
    target[dof] = value;
    return value === maxVal || value === minVal;
  }
  _setValues(target, values) {
    const dof = this.dof;
    for (let i = 0, l = values.length; i < l; i++) {
      this._setValue(target, dof[i], values[i]);
    }
  }
  // TODO: these functions are unused
  _setViaFullPosition(target, values) {
    const dofFlags = this.dofFlags;
    for (let i = 0; i < 3; i++) {
      target[i] = dofFlags[i] * values[i];
    }
  }
  _setViaFullEuler(target, values) {
    const dofFlags = this.dofFlags;
    for (let i = 3; i < 6; i++) {
      target[i] = dofFlags[i] * values[i - 3];
    }
    this.tryMinimizeEulerAngles();
  }
  _setViaQuaternion(target, values) {
    getEuler(quatEuler, values);
    quatEuler[0] *= DEG2RAD;
    quatEuler[1] *= DEG2RAD;
    quatEuler[2] *= DEG2RAD;
    if (this.trackJointWrap) {
      const dofValues = this.dofValues;
      tempEuler[0] = dofValues[DOF.EX];
      tempEuler[1] = dofValues[DOF.EY];
      tempEuler[2] = dofValues[DOF.EZ];
      getClosestEulerRepresentation(quatEuler, tempEuler, quatEuler);
    }
    this._setViaFullEuler(target, quatEuler);
  }
  /**
   * Removes all degrees of freedom from the joint.
   */
  clearDoF() {
    this.setDoF();
  }
  /**
   * Sets the degrees of freedom of the joint and resets all related values and limits.
   * Arguments must be in `X`, `Y`, `Z`, `EX`, `EY`, `EZ` order without duplicates.
   * @param {...number} dof - The `DOF` fields to set.
   */
  setDoF(...args) {
    args.forEach((dof, i) => {
      if (dof < 0 || dof >= 6) {
        throw new Error("Joint: Invalid degree of freedom enum " + dof + ".");
      }
      if (args.includes(dof, i + 1)) {
        throw new Error("Joint: Duplicate degree of freedom " + DOF_NAMES[dof] + "specified.");
      }
      if (i !== 0 && args[i - 1] > dof) {
        throw new Error("Joint: Joints degrees of freedom must be specified in position then rotation, XYZ order");
      }
    });
    this.dof = args;
    this.dofValues.fill(0);
    this.dofTarget.fill(0);
    this.dofRestPose.fill(0);
    this.minDoFLimit.fill(-Infinity);
    this.maxDoFLimit.fill(Infinity);
    this.setMatrixDoFNeedsUpdate();
    for (let i = 0; i < 6; i++) {
      this.dofFlags[i] = Number(args.includes(i));
    }
    this.rotationDoFCount = this.dofFlags[DOF.EX] + this.dofFlags[DOF.EY] + this.dofFlags[DOF.EZ];
    this.translationDoFCount = this.dofFlags[DOF.X] + this.dofFlags[DOF.Y] + this.dofFlags[DOF.Z];
  }
  /**
   * Sets the value of every degree of freedom in `dof` order, clamped to the joint limits.
   * @param {...number} values - One value per degree of freedom.
   */
  setDoFValues(...values) {
    this.setMatrixDoFNeedsUpdate();
    this._setValues(this.dofValues, values);
  }
  /**
   * Sets the value of a degree of freedom, clamped to the joint limits.
   * @param {number} dof - The `DOF` field to set.
   * @param {number} value
   * @returns {boolean} Whether the value was clamped to a limit.
   */
  setDoFValue(dof, value) {
    this.setMatrixDoFNeedsUpdate();
    return this._setValue(this.dofValues, dof, value);
  }
  /**
   * Returns the value of a degree of freedom.
   * @param {number} dof - The `DOF` field to get.
   * @returns {number}
   */
  getDoFValue(dof) {
    return this.dofValues[dof];
  }
  /**
   * Writes the rotation degree of freedom values as a quaternion into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getDoFQuaternion(outQuat) {
    this._getQuaternion(this.dofValues, outQuat);
  }
  /**
   * Writes the rotation degree of freedom values as Euler angles into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getDoFEuler(outEuler) {
    this._getEuler(this.dofValues, outEuler);
  }
  /**
   * Writes the translation degree of freedom values into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getDoFPosition(outPos) {
    this._getPosition(this.dofValues, outPos);
  }
  /**
   * Sets the rest pose of every degree of freedom in `dof` order, clamped to the joint limits.
   * @param {...number} values - One value per degree of freedom.
   */
  setRestPoseValues(...values) {
    this._setValues(this.dofRestPose, values);
  }
  /**
   * Sets the rest pose of a degree of freedom, clamped to the joint limits.
   * @param {number} dof - The `DOF` field to set.
   * @param {number} value
   * @returns {boolean} Whether the value was clamped to a limit.
   */
  setRestPoseValue(dof, value) {
    return this._setValue(this.dofRestPose, dof, value);
  }
  /**
   * Returns the rest pose of a degree of freedom.
   * @param {number} dof - The `DOF` field to get.
   * @returns {number}
   */
  getRestPoseValue(dof) {
    return this.dofRestPose[dof];
  }
  /**
   * Writes the rotation rest pose as a quaternion into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getRestPoseQuaternion(outQuat) {
    this._getQuaternion(this.dofRestPose, outQuat);
  }
  /**
   * Writes the rotation rest pose as Euler angles into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getRestPoseEuler(outEuler) {
    this._getEuler(this.dofRestPose, outEuler);
  }
  /**
   * Writes the translation rest pose into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getRestPosePosition(outPos) {
    this._getPosition(this.dofRestPose, outPos);
  }
  /**
   * Sets the target of every degree of freedom in `dof` order, clamped to the joint limits.
   * @param {...number} values - One value per degree of freedom.
   */
  setTargetValues(...values) {
    this._setValues(this.dofTarget, values);
  }
  /**
   * Sets the target of a degree of freedom, clamped to the joint limits.
   * @param {number} dof - The `DOF` field to set.
   * @param {number} value
   */
  setTargetValue(dof, value) {
    this._setValue(this.dofTarget, dof, value);
  }
  /**
   * Returns the target of a degree of freedom.
   * @param {number} dof - The `DOF` field to get.
   * @returns {number}
   */
  getTargetValue(dof) {
    return this.dofTarget[dof];
  }
  /**
   * Writes the rotation target as a quaternion into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getTargetQuaternion(outQuat) {
    this._getQuaternion(this.dofTarget, outQuat);
  }
  /**
   * Writes the rotation target as Euler angles into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getTargetEuler(outEuler) {
    this._getEuler(this.dofTarget, outEuler);
  }
  /**
   * Writes the translation target into `target`.
   * @param {Array<number> | Float32Array} target
   */
  getTargetPosition(outPos) {
    this._getPosition(this.dofTarget, outPos);
  }
  /**
   * Sets the minimum limit of every degree of freedom in `dof` order.
   * @param {...number} values - One value per degree of freedom.
   */
  setMinLimits(...values) {
    const { dof } = this;
    for (const i in values) {
      const d = dof[i];
      this.setMinLimit(d, values[i]);
    }
  }
  /**
   * Sets the minimum limit of a degree of freedom and clamps the current value to it.
   * @param {number} dof - The `DOF` field to set.
   * @param {number} value
   */
  setMinLimit(dof, value) {
    this.minDoFLimit[dof] = value;
    this.setDoFValue(dof, this.dofValues[dof]);
  }
  /**
   * Returns the minimum limit of a degree of freedom.
   * @param {number} dof - The `DOF` field to get.
   * @returns {number}
   */
  getMinLimit(dof) {
    return this.minDoFLimit[dof];
  }
  /**
   * Sets the maximum limit of every degree of freedom in `dof` order.
   * @param {...number} values - One value per degree of freedom.
   */
  setMaxLimits(...values) {
    const { dof } = this;
    for (const i in values) {
      const d = dof[i];
      this.setMaxLimit(d, values[i]);
    }
  }
  /**
   * Sets the maximum limit of a degree of freedom and clamps the current value to it.
   * @param {number} dof - The `DOF` field to set.
   * @param {number} value
   */
  setMaxLimit(dof, value) {
    this.maxDoFLimit[dof] = value;
    this.setDoFValue(dof, this.dofValues[dof]);
  }
  /**
   * Returns the maximum limit of a degree of freedom.
   * @param {number} dof - The `DOF` field to get.
   * @returns {number}
   */
  getMaxLimit(dof) {
    return this.maxDoFLimit[dof];
  }
  // Returns the error between this joint and the next link if this is a closure.
  // TODO: remove this and put it in solver
  getClosureError(outPos, outRotVec) {
    if (!this.isClosure) {
      throw new Error("Joint: Cannot get closure error on non closure Joint.");
    }
    this.updateMatrixWorld();
    this.child.updateMatrixWorld();
    getMatrixDifference(this.matrixWorld, this.child.matrixWorld, outPos, outRotVec);
  }
  // Update matrix overrides
  // TODO: it might be best if we skip this and try to characterize joint error with quats in
  // the error vector
  tryMinimizeEulerAngles() {
    const {
      trackJointWrap,
      rotationDoFCount,
      dofRestPose,
      dofTarget,
      dofValues
    } = this;
    if (!trackJointWrap) {
      if (rotationDoFCount < 3) {
        for (let i = DOF.EX; i <= DOF.EZ; i++) {
          dofTarget[i] = toSmallestEulerValueDistance(dofValues[i], dofTarget[i]);
          dofRestPose[i] = toSmallestEulerValueDistance(dofValues[i], dofRestPose[i]);
        }
      } else {
        tempValueEuler[0] = dofValues[DOF.EX];
        tempValueEuler[1] = dofValues[DOF.EY];
        tempValueEuler[2] = dofValues[DOF.EZ];
        tempEuler[0] = dofTarget[DOF.EX];
        tempEuler[1] = dofTarget[DOF.EY];
        tempEuler[2] = dofTarget[DOF.EZ];
        getClosestEulerRepresentation(tempEuler, tempValueEuler, tempEuler);
        dofTarget[DOF.EX] = tempEuler[0];
        dofTarget[DOF.EY] = tempEuler[1];
        dofTarget[DOF.EZ] = tempEuler[2];
        tempEuler[0] = dofRestPose[DOF.EX];
        tempEuler[1] = dofRestPose[DOF.EY];
        tempEuler[2] = dofRestPose[DOF.EZ];
        getClosestEulerRepresentation(tempEuler, tempValueEuler, tempEuler);
        dofRestPose[DOF.EX] = tempEuler[0];
        dofRestPose[DOF.EY] = tempEuler[1];
        dofRestPose[DOF.EZ] = tempEuler[2];
      }
    }
  }
  /**
   * Flags the joint as needing its degree of freedom matrix and world matrix updated.
   */
  setMatrixDoFNeedsUpdate() {
    if (this.matrixDoFNeedsUpdate === false) {
      this.matrixDoFNeedsUpdate = true;
      this.setMatrixWorldNeedsUpdate();
    }
  }
  updateDoFMatrix() {
    if (this.matrixDoFNeedsUpdate) {
      dofToMatrix(this.matrixDoF, this.dofValues);
      this.matrixDoFNeedsUpdate = false;
    }
  }
  computeMatrixWorld() {
    const {
      parent,
      matrixWorld,
      matrix,
      matrixDoF,
      cachedIdentityDoFMatrixWorld
    } = this;
    this.updateDoFMatrix();
    mat4_exports.multiply(matrixWorld, matrix, matrixDoF);
    if (parent) {
      mat4_exports.multiply(matrixWorld, parent.matrixWorld, matrixWorld);
      mat4_exports.multiply(cachedIdentityDoFMatrixWorld, parent.matrixWorld, matrix);
    } else {
      mat4_exports.copy(cachedIdentityDoFMatrixWorld, matrix);
    }
  }
  /**
   * Connects the given link to this joint as a closure. The link is not added to `children`
   * and keeps its own parent, but is set as `child` and the joint is appended to the link's
   * `closureJoints`. The solver constrains all six axes between the joint and the link to
   * keep the closure closed.
   * @param {Link} child
   */
  makeClosure(child) {
    if (!child.isLink || this.child || child.parent === this) {
      throw new Error("Joint: Given child cannot be used to make closure.");
    } else {
      this.child = child;
      this.isClosure = true;
      child.closureJoints.push(this);
    }
  }
  /**
   * Adds a link as the child of this joint. Throws if the child is not a link or the joint
   * already has a child.
   * @param {Link} child
   */
  addChild(child) {
    if (!child.isLink || this.child || child.parent === this) {
      throw new Error("Joint: Given child cannot be added to Joint.");
    } else {
      super.addChild(child);
      this.child = child;
      this.isClosure = false;
    }
  }
  removeChild(child) {
    if (this.isClosure) {
      if (this.child !== child) {
        throw new Error("Frame: Child to be removed is not a child of this Joint.");
      } else {
        this.child = null;
        this.isClosure = false;
        const index = child.closureJoints.indexOf(this);
        child.closureJoints.splice(index, 1);
      }
    } else {
      super.removeChild(child);
    }
  }
  attachChild(child) {
    super.attachChild(child);
    mat4_exports.invert(tempInverse2, this.matrixDoF);
    mat4_exports.multiply(child.matrix, tempInverse2, child.matrix);
    mat4_exports.getTranslation(child.position, child.matrix);
    mat4_exports.getRotation(child.quaternion, child.matrix);
  }
  detachChild(child) {
    super.detachChild(child);
    mat4_exports.invert(tempInverse2, this.matrixDoF);
    mat4_exports.multiply(child.matrix, tempInverse2, child.matrix);
    mat4_exports.getTranslation(child.position, child.matrix);
    mat4_exports.getRotation(child.quaternion, child.matrix);
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/Goal.js
var Goal = class extends Joint {
  constructor(...args) {
    super(...args);
    this.isGoal = true;
    this.setFreeDoF();
  }
  setDoF(...args) {
    let rotCount = Number(args.includes(DOF.EX)) + Number(args.includes(DOF.EY)) + Number(args.includes(DOF.EZ));
    if (rotCount !== 0 && rotCount !== 3) {
      throw new Error("Goal: Only full 3 DoF or 0 DoF rotation goals are supported.");
    }
    super.setDoF(...args);
  }
  /**
   * Sets the axes the goal constrains. Rotation must be constrained on all three axes or
   * none, so `EX`, `EY`, and `EZ` must be passed together or omitted.
   * @param {...number} dof - The constrained `DOF` fields.
   */
  setGoalDoF(...args) {
    this.setDoF(...args);
  }
  /**
   * Sets the axes the goal leaves free. Every other axis is constrained. The same rotation
   * restriction as `setGoalDoF` applies.
   * @param {...number} dof - The free `DOF` fields.
   */
  setFreeDoF(...args) {
    const freeDoF = [
      DOF.X,
      DOF.Y,
      DOF.Z,
      DOF.EX,
      DOF.EY,
      DOF.EZ
    ].filter((d) => !args.includes(d));
    this.setDoF(...freeDoF);
  }
  addChild() {
    throw new Error("Goal: Cannot add children to Goal.");
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/matrix.js
var import_linear_solve = __toESM(require_gauss_jordan(), 1);
var import_svd_js = __toESM(require_svd_js_min(), 1);
var Matrix = class extends Array {
  constructor(rows, cols) {
    super(rows);
    this.rows = rows;
    this.cols = cols;
    const backing = new Float64Array(rows * cols);
    for (let i = 0; i < rows; i++) {
      this[i] = new Float64Array(backing.buffer, i * cols * 8, cols);
    }
  }
};
function transpose2(outMatrix, a) {
  const tr = a.length;
  const tc = a[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[c][r] = a[r][c];
    }
  }
}
function identity3(outMatrix) {
  const tr = outMatrix.length;
  const tc = outMatrix[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = r === c ? 1 : 0;
    }
  }
}
function zero3(outMatrix) {
  fill(outMatrix, 0);
}
function fill(outMatrix, value) {
  for (let r = 0, tr = outMatrix.length; r < tr; r++) {
    outMatrix[r].fill(value);
  }
}
function scale5(outMatrix, matrix, scalar) {
  const tr = outMatrix.length;
  const tc = outMatrix[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = matrix[r][c] * scalar;
    }
  }
}
function multiply5(outMatrix, a, b) {
  if (a === outMatrix || b === outMatrix) {
    throw new Error("Matrix: Cannot multiply to a matrix in place.");
  }
  const m = a.length;
  const n = b.length;
  const k = b[0].length;
  for (let r = 0, tr = m; r < tr; r++) {
    for (let c = 0, tc = k; c < tc; c++) {
      let sum = 0;
      for (let i = 0, ti = n; i < ti; i++) {
        sum += a[r][i] * b[i][c];
      }
      outMatrix[r][c] = sum;
    }
  }
}
function create6(rows, cols) {
  return new Matrix(rows, cols);
}
function copy5(outMatrix, sourceMatrix) {
  const tr = sourceMatrix.length;
  const tc = sourceMatrix[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = sourceMatrix[r][c];
    }
  }
}
function clone5(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const resultMatrix = create6(rows, cols);
  copy5(resultMatrix, matrix);
  return resultMatrix;
}
function solve(outMatrix, matrix, vector) {
  const res = import_linear_solve.default.solve(matrix, vector);
  for (let i = 0, l = res.length; i < l; i++) {
    outMatrix[i].set(res[i]);
  }
}
function svd(ru, rq, rv, matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  let u, v, q;
  if (rows < cols) {
    const transposed = create6(cols, rows);
    transpose2(transposed, matrix);
    ({ u: v, v: u, q } = (0, import_svd_js.SVD)(transposed));
  } else {
    ({ u, v, q } = (0, import_svd_js.SVD)(matrix));
  }
  const urows = u.length;
  for (let r = 0; r < urows; r++) {
    ru[r].set(u[r]);
  }
  const vrows = v.length;
  for (let r = 0; r < vrows; r++) {
    rv[r].set(v[r]);
  }
  const qlen = q.length;
  for (let r = 0; r < qlen; r++) {
    rq[r][r] = q[r];
  }
}
function invert3(outMatrix, matrix) {
  const res = import_linear_solve.default.invert(matrix);
  const tr = matrix[0].length;
  const tc = matrix.length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = res[r][c];
    }
  }
}
function add5(outMatrix, a, b) {
  const tr = a.length;
  const tc = a[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = a[r][c] + b[r][c];
    }
  }
}
function subtract4(outMatrix, a, b) {
  const tr = a.length;
  const tc = a[0].length;
  for (let r = 0; r < tr; r++) {
    for (let c = 0; c < tc; c++) {
      outMatrix[r][c] = a[r][c] - b[r][c];
    }
  }
}
function magnitudeSquared(matrix) {
  let sum = 0;
  const rows = matrix.length;
  const cols = matrix[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sum += matrix[r][c] ** 2;
    }
  }
  return sum;
}
function magnitude(matrix) {
  return Math.sqrt(magnitudeSquared(matrix));
}
function toString(matrix, dec = 3) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  let str5 = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      str5 += matrix[r][c].toFixed(dec) + ", ";
    }
    str5 += "\n";
  }
  return str5;
}
function log(matrix, dec) {
  console.log(toString(matrix, dec));
}
function get(matrix, r, c) {
  return matrix[r][c];
}
function set5(matrix, r, c, value) {
  matrix[r][c] = value;
}
function sameDimensions(a, b) {
  return a.length === b.length && a[0].length === b[0].length;
}
function equal(a, b) {
  if (!sameDimensions(a, b)) {
    return false;
  }
  const rows = a.length;
  const cols = a[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (a[r][c] !== b[r][c]) {
        return false;
      }
    }
  }
  return true;
}
function copySubMatrix(outMatrix, sourceMatrix, rows, cols) {
  if (outMatrix.rows < rows || outMatrix.cols < cols || sourceMatrix.rows < rows || sourceMatrix.cols < cols) {
    throw new Error("copySubMatrix: matrix dimensions insufficient");
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      outMatrix[r][c] = sourceMatrix[r][c];
    }
  }
}
function equalSubMatrix(a, b, rows, cols) {
  if (a.rows < rows || a.cols < cols || b.rows < rows || b.cols < cols) {
    return false;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (a[r][c] !== b[r][c]) {
        return false;
      }
    }
  }
  return true;
}
var mat = {
  copySubMatrix,
  equalSubMatrix,
  equal,
  sameDimensions,
  transpose: transpose2,
  identity: identity3,
  zero: zero3,
  fill,
  scale: scale5,
  multiply: multiply5,
  create: create6,
  copy: copy5,
  clone: clone5,
  solve,
  svd,
  invert: invert3,
  add: add5,
  subtract: subtract4,
  magnitudeSquared,
  magnitude,
  toString,
  log,
  get,
  set: set5
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/solver.js
var tempPos3 = new Float64Array(3);
var tempRotVec = new Float64Array(3);
var tempEuler3 = new Float64Array(3);
function getClosureRowCount(joint) {
  if (joint.isGoal) {
    return joint.translationDoFCount + (joint.rotationDoFCount > 0 ? 3 : 0);
  }
  return 6;
}
function accumulateClosureError(solver, joint, startIndex, errorVector = null, result = { isConverged: false, rowCount: 6, totalError: 0 }) {
  const {
    translationConvergeThreshold,
    rotationConvergeThreshold,
    translationErrorClamp,
    rotationErrorClamp,
    translationFactor,
    rotationFactor
  } = solver;
  const {
    translationDoFCount,
    rotationDoFCount,
    dofFlags,
    dof
  } = joint;
  joint.getClosureError(tempPos3, tempRotVec);
  const rowCount = getClosureRowCount(joint);
  if (joint.isGoal) {
    tempPos3[0] *= dofFlags[0];
    tempPos3[1] *= dofFlags[1];
    tempPos3[2] *= dofFlags[2];
    if (rotationDoFCount === 0) {
      tempRotVec[0] = 0;
      tempRotVec[1] = 0;
      tempRotVec[2] = 0;
    }
  }
  let isConverged = false;
  let totalError = 0;
  const posMag = vec3_exports.length(tempPos3);
  const rotMag = vec3_exports.length(tempRotVec);
  if (posMag < translationConvergeThreshold && rotMag < rotationConvergeThreshold) {
    isConverged = true;
  }
  totalError += posMag + rotMag;
  if (errorVector) {
    if (posMag > translationErrorClamp) {
      vec3_exports.scale(tempPos3, tempPos3, translationErrorClamp / posMag);
    }
    vec3_exports.scale(tempPos3, tempPos3, translationFactor);
    if (rotMag > rotationErrorClamp) {
      vec3_exports.scale(tempRotVec, tempRotVec, rotationErrorClamp / rotMag);
    }
    vec3_exports.scale(tempRotVec, tempRotVec, rotationFactor);
    if (joint.isGoal) {
      for (let i = 0; i < translationDoFCount; i++) {
        const d = dof[i];
        mat.set(errorVector, startIndex + i, 0, tempPos3[d]);
      }
      if (rotationDoFCount > 0) {
        mat.set(errorVector, startIndex + translationDoFCount + 0, 0, tempRotVec[0]);
        mat.set(errorVector, startIndex + translationDoFCount + 1, 0, tempRotVec[1]);
        mat.set(errorVector, startIndex + translationDoFCount + 2, 0, tempRotVec[2]);
      }
    } else {
      mat.set(errorVector, startIndex + 0, 0, tempPos3[0]);
      mat.set(errorVector, startIndex + 1, 0, tempPos3[1]);
      mat.set(errorVector, startIndex + 2, 0, tempPos3[2]);
      mat.set(errorVector, startIndex + 3, 0, tempRotVec[0]);
      mat.set(errorVector, startIndex + 4, 0, tempRotVec[1]);
      mat.set(errorVector, startIndex + 5, 0, tempRotVec[2]);
    }
  }
  result.totalError = totalError;
  result.isConverged = isConverged;
  result.rowCount = rowCount;
  return result;
}
function accumulateTargetError(solver, joint, startIndex, errorVector = null, result = { isConverged: false, rowCount: 6, totalError: 0 }) {
  const {
    translationConvergeThreshold,
    rotationConvergeThreshold,
    lockedJointDoFCount,
    translationErrorClamp,
    rotationErrorClamp,
    translationFactor,
    rotationFactor,
    lockedJointDoF
  } = solver;
  const {
    dofTarget,
    dofValues,
    translationDoFCount,
    rotationDoFCount,
    dof: dofList
  } = joint;
  const posDelta = vec3_exports.distance(dofValues, dofTarget);
  let rotDelta = Math.abs(dofTarget[DOF.EX] - dofValues[DOF.EX]) + Math.abs(dofTarget[DOF.EY] - dofValues[DOF.EY]) + Math.abs(dofTarget[DOF.EZ] - dofValues[DOF.EZ]);
  const lockedDoFCount = lockedJointDoFCount.get(joint) || 0;
  result.rowCount = translationDoFCount + rotationDoFCount - lockedDoFCount;
  result.isConverged = posDelta < translationConvergeThreshold && rotDelta < rotationConvergeThreshold;
  result.totalError = posDelta + rotDelta;
  if (errorVector) {
    const lockedDoF = lockedJointDoF.get(joint);
    const isLocked = lockedDoFCount !== 0;
    let rowIndex = 0;
    tempPos3[0] = dofTarget[0] - dofValues[0];
    tempPos3[1] = dofTarget[1] - dofValues[1];
    tempPos3[2] = dofTarget[2] - dofValues[2];
    const posMag = vec3_exports.length(tempPos3);
    if (posMag > translationErrorClamp) {
      vec3_exports.scale(tempPos3, tempPos3, translationErrorClamp / posMag);
    }
    vec3_exports.scale(tempPos3, tempPos3, translationFactor);
    for (let i = 0, l = translationDoFCount; i < l; i++) {
      const dof = dofList[i];
      if (isLocked && lockedDoF[dof]) {
        continue;
      }
      mat.set(errorVector, startIndex + rowIndex, 0, tempPos3[dof]);
      rowIndex++;
    }
    tempEuler3[0] = joint.dofTarget[3] - joint.dofValues[3];
    tempEuler3[1] = joint.dofTarget[4] - joint.dofValues[4];
    tempEuler3[2] = joint.dofTarget[5] - joint.dofValues[5];
    const eulerMag = vec3_exports.length(tempEuler3);
    if (eulerMag > rotationErrorClamp) {
      vec3_exports.scale(tempEuler3, tempEuler3, rotationErrorClamp / eulerMag);
    }
    vec3_exports.scale(tempEuler3, tempEuler3, rotationFactor);
    for (let i = translationDoFCount, l = translationDoFCount + rotationDoFCount; i < l; i++) {
      const dof = dofList[i];
      if (isLocked && lockedDoF[dof]) {
        continue;
      }
      mat.set(errorVector, startIndex + rowIndex, 0, tempEuler3[dof - 3]);
      rowIndex++;
    }
  }
  return result;
}

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/ChainSolver.js
var tempRotVec2 = new Float64Array(3);
var tempPos4 = new Float64Array(3);
var pivotWorldPos = new Float64Array(3);
var frameWorldPos = new Float64Array(3);
var axisWorld = new Float64Array(3);
var leverArm = new Float64Array(3);
var tempAxisQuat = new Float64Array(4);
var targetJoints = [];
var freeJoints = [];
var errorResultInfo = {
  rowCount: 0,
  isConverged: false,
  totalError: 0
};
var dofResultInfo = {
  errorRows: 0,
  freeDoF: 0,
  totalError: 0
};
var MAX_LINE_SEARCH_STEPS = 6;
var SINGULARITY_RATIO = 0.02;
var MAX_SINGULARITY_RATIO = 0.2;
var SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3
};
var SOLVE_STATUS_NAMES = Object.entries(SOLVE_STATUS).sort((a, b) => a[1] - b[1]).map((el) => el[0]);
function accumulateRotationInfluence(rotationAxis, pivotPos, frameMatrix, errorSign, outPos, outRotVec) {
  mat4_exports.getTranslation(frameWorldPos, frameMatrix);
  vec3_exports.subtract(leverArm, frameWorldPos, pivotPos);
  vec3_exports.cross(leverArm, rotationAxis, leverArm);
  vec3_exports.scaleAndAdd(outPos, outPos, leverArm, errorSign);
  vec3_exports.scaleAndAdd(outRotVec, outRotVec, rotationAxis, errorSign);
}
var ChainSolver = class {
  constructor(chain) {
    this.chain = Array.from(chain);
    this.targets = null;
    this.affectedClosures = null;
    this.affectedConnectedClosures = null;
    this.lockedJointDoFCount = null;
    this.lockedJointDoF = null;
    this.prevDoFValues = null;
    this.maxIterations = -1;
    this.matrixPool = null;
    this.useSVD = false;
    this.translationConvergeThreshold = -1;
    this.rotationConvergeThreshold = -1;
    this.translationFactor = -1;
    this.rotationFactor = -1;
    this.translationErrorClamp = -1;
    this.rotationErrorClamp = -1;
    this.stallThreshold = -1;
    this.dampingFactor = -1;
    this.divergeThreshold = -1;
    this.restPoseFactor = -1;
    this.singularityRatio = SINGULARITY_RATIO;
    this.prevJacobian = mat.create(0, 0);
    this.prevPseudoInverse = mat.create(0, 0);
    this.init();
  }
  init() {
    const chain = this.chain;
    const targets = chain.filter((j) => j.targetSet || j.isClosure);
    const lockedJointDoF = /* @__PURE__ */ new Map();
    const lockedJointDoFCount = /* @__PURE__ */ new Map();
    const prevDoFValues = /* @__PURE__ */ new Map();
    const affectedClosures = /* @__PURE__ */ new Map();
    const affectedConnectedClosures = /* @__PURE__ */ new Map();
    chain.forEach((j) => {
      affectedClosures.set(j, /* @__PURE__ */ new Set());
      affectedConnectedClosures.set(j, /* @__PURE__ */ new Set());
      lockedJointDoF.set(j, new Uint8Array(6));
      prevDoFValues.set(j, new Float64Array(6));
    });
    targets.forEach((target) => {
      if (target.isClosure) {
        let currJoint = target;
        while (currJoint) {
          if (currJoint.isJoint) {
            affectedClosures.get(currJoint).add(target);
          }
          currJoint = currJoint.parent;
        }
        currJoint = target.child;
        while (currJoint) {
          if (currJoint.isJoint) {
            affectedConnectedClosures.get(currJoint).add(target);
          }
          currJoint = currJoint.parent;
        }
      }
    });
    this.targets = targets;
    this.affectedClosures = affectedClosures;
    this.affectedConnectedClosures = affectedConnectedClosures;
    this.lockedJointDoF = lockedJointDoF;
    this.lockedJointDoFCount = lockedJointDoFCount;
    this.prevDoFValues = prevDoFValues;
  }
  solve() {
    const {
      divergeThreshold,
      stallThreshold,
      chain,
      restPoseFactor,
      lockedJointDoFCount,
      prevDoFValues,
      useSVD,
      matrixPool,
      dampingFactor,
      maxIterations
    } = this;
    let iterations = 0;
    let status = -1;
    lockedJointDoFCount.clear();
    mat.fill(this.prevJacobian, Infinity);
    for (let i = 0, l = chain.length; i < l; i++) {
      const joint = chain[i];
      if (joint.targetSet || joint.restPoseSet) {
        joint.tryMinimizeEulerAngles();
      }
    }
    do {
      matrixPool.releaseAll();
      for (let i = 0, l = chain.length; i < l; i++) {
        const joint = chain[i];
        joint.updateMatrixWorld();
      }
      targetJoints.length = 0;
      freeJoints.length = 0;
      this.countUnconvergedVariables(freeJoints, targetJoints, dofResultInfo);
      const { freeDoF, errorRows, totalError } = dofResultInfo;
      if (errorRows === 0) {
        status = SOLVE_STATUS.CONVERGED;
        break;
      }
      if (freeDoF === 0) {
        status = SOLVE_STATUS.STALLED;
        break;
      }
      prevDoFValues.forEach((dofValues, joint) => {
        dofValues.set(joint.dofValues);
      });
      if (iterations > maxIterations) {
        status = SOLVE_STATUS.TIMEOUT;
        break;
      }
      const errorVector = matrixPool.get(errorRows, 1);
      this.fillErrorVector(targetJoints, errorVector);
      const jacobian = matrixPool.get(errorRows, freeDoF);
      this.fillJacobian(targetJoints, freeJoints, jacobian);
      const pseudoInverse = matrixPool.get(freeDoF, errorRows);
      if (this.jacobianCacheEquals(jacobian)) {
        this.restorePseudoInverse(pseudoInverse);
      } else {
        let failedSVD = false;
        if (useSVD) {
          try {
            const m = errorRows;
            const n = freeDoF;
            const k = Math.min(m, n);
            const u = matrixPool.get(m, k);
            const q = matrixPool.get(k, k);
            const v = matrixPool.get(n, k);
            mat.svd(u, q, v, jacobian);
            const uTranspose = matrixPool.get(k, m);
            const qInverse = matrixPool.get(k, k);
            mat.transpose(uTranspose, u);
            let sigmaMax = 0;
            for (let i = 0, l = q.length; i < l; i++) {
              sigmaMax = Math.max(sigmaMax, mat.get(q, i, i));
            }
            const singularityThreshold = sigmaMax * this.singularityRatio;
            const lambda2 = dampingFactor ** 2;
            for (let i = 0, l = q.length; i < l; i++) {
              const sigma = mat.get(q, i, i);
              let damping = lambda2;
              if (sigma < singularityThreshold) {
                const ratio = sigma / singularityThreshold;
                damping += singularityThreshold * singularityThreshold * (1 - ratio * ratio);
              }
              const inv = sigma / (sigma * sigma + damping);
              mat.set(qInverse, i, i, inv);
            }
            const vqinv = matrixPool.get(n, k);
            mat.multiply(vqinv, v, qInverse);
            mat.multiply(pseudoInverse, vqinv, uTranspose);
          } catch {
            failedSVD = true;
          }
        }
        if (!useSVD || failedSVD) {
          const jacobianIdentityDamping = matrixPool.get(errorRows, errorRows);
          mat.identity(jacobianIdentityDamping);
          mat.scale(jacobianIdentityDamping, jacobianIdentityDamping, this.dampingFactor ** 2);
          const jacobianTranspose = matrixPool.get(freeDoF, errorRows);
          mat.transpose(jacobianTranspose, jacobian);
          const jjt = matrixPool.get(errorRows, errorRows);
          mat.multiply(jjt, jacobian, jacobianTranspose);
          const jjti = matrixPool.get(errorRows, errorRows);
          mat.add(jjti, jjt, jacobianIdentityDamping);
          const jjtii = matrixPool.get(errorRows, errorRows);
          mat.invert(jjtii, jjti);
          mat.multiply(pseudoInverse, jacobianTranspose, jjtii);
        }
        this.cacheJacobianResult(jacobian, pseudoInverse);
      }
      const deltaTheta = matrixPool.get(freeDoF, 1);
      mat.multiply(deltaTheta, pseudoInverse, errorVector);
      if (restPoseFactor !== 0) {
        const restPose = matrixPool.get(freeDoF, 1);
        const restPoseResult = matrixPool.get(freeDoF, 1);
        let colIndex = 0;
        for (let i = 0, l = freeJoints.length; i < l; i++) {
          const joint = freeJoints[i];
          const lockedDoFCount = this.lockedJointDoFCount.get(joint) || 0;
          const isLocked = lockedDoFCount !== 0;
          const lockedDoF = this.lockedJointDoF.get(joint);
          const colCount = joint.rotationDoFCount + joint.translationDoFCount - lockedDoFCount;
          if (joint.restPoseSet) {
            const dofList = joint.dof;
            const dofValues = joint.dofValues;
            const dofRestPose = joint.dofRestPose;
            for (let d = 0; d < colCount; d++) {
              const dof = dofList[d];
              if (isLocked && lockedDoF[dof]) continue;
              mat.set(restPose, colIndex, 0, dofRestPose[dof] - dofValues[dof]);
              colIndex++;
            }
          } else {
            colIndex += colCount;
          }
        }
        const jRestPose = matrixPool.get(errorRows, 1);
        mat.multiply(jRestPose, jacobian, restPose);
        const jijRestPose = matrixPool.get(freeDoF, 1);
        mat.multiply(jijRestPose, pseudoInverse, jRestPose);
        mat.subtract(restPoseResult, restPose, jijRestPose);
        for (let r = 0; r < freeDoF; r++) {
          const val = mat.get(restPoseResult, r, 0);
          mat.set(deltaTheta, r, 0, mat.get(deltaTheta, r, 0) + val * restPoseFactor);
        }
      }
      if (stallThreshold > 0) {
        let stalled = true;
        for (let i = 0, l = deltaTheta.length; i < l; i++) {
          const delta = mat.get(deltaTheta, i, 0);
          if (Math.abs(delta) > stallThreshold) {
            stalled = false;
            break;
          }
        }
        if (stalled) {
          this.singularityRatio = Math.max(SINGULARITY_RATIO, this.singularityRatio * 0.5);
          status = SOLVE_STATUS.STALLED;
          break;
        }
      }
      let stepScale = 1;
      let bestScale = 0;
      let bestError = totalError + divergeThreshold;
      for (let attempt = 0; attempt < MAX_LINE_SEARCH_STEPS; attempt++) {
        this.applyJointAngles(freeJoints, deltaTheta, stepScale);
        targetJoints.length = 0;
        freeJoints.length = 0;
        this.countUnconvergedVariables(freeJoints, targetJoints, dofResultInfo);
        const stepError = dofResultInfo.totalError;
        const improved = stepError < bestError;
        if (improved) {
          bestScale = stepScale;
          bestError = stepError;
        }
        if (bestScale === 1) {
          break;
        }
        this.revertJointAngles();
        const walk = 0.5 ** (attempt + 1);
        stepScale += improved ? walk : -walk;
      }
      if (bestScale === 1) {
        this.singularityRatio = Math.max(SINGULARITY_RATIO, this.singularityRatio * 0.5);
      } else {
        this.singularityRatio = Math.min(MAX_SINGULARITY_RATIO, this.singularityRatio * 2);
      }
      if (bestScale === 0) {
        status = SOLVE_STATUS.DIVERGED;
        break;
      }
      if (bestScale !== 1) {
        this.applyJointAngles(freeJoints, deltaTheta, bestScale);
      }
      this.lockLimitedJointAngles(freeJoints);
      iterations++;
    } while (true);
    targetJoints.length = 0;
    freeJoints.length = 0;
    return status;
  }
  // Apply the delta values from the solve to the free joints in the list scaled by the given amount
  applyJointAngles(freeJoints2, deltaTheta, scale6 = 1) {
    const {
      lockedJointDoF,
      lockedJointDoFCount
    } = this;
    let dti = 0;
    for (let i = 0, l = freeJoints2.length; i < l; i++) {
      const joint = freeJoints2[i];
      const dofList = joint.dof;
      const lockedDoF = lockedJointDoF.get(joint);
      const isLocked = lockedJointDoFCount.has(joint);
      for (let d = 0, l2 = dofList.length; d < l2; d++) {
        const dof = dofList[d];
        if (isLocked && lockedDoF[dof]) {
          continue;
        }
        const value = joint.getDoFValue(dof);
        joint.setDoFValue(dof, value + scale6 * mat.get(deltaTheta, dti, 0));
        dti++;
      }
    }
    if (dti !== deltaTheta.length) {
      throw new Error();
    }
  }
  // Restore the joint values cached at the start of the iteration
  revertJointAngles() {
    this.prevDoFValues.forEach((dofValues, joint) => {
      joint.dofValues.set(dofValues);
      joint.setMatrixDoFNeedsUpdate();
    });
  }
  // Lock any unlocked degrees of freedom that are sitting at a joint limit
  lockLimitedJointAngles(freeJoints2) {
    const {
      lockedJointDoF,
      lockedJointDoFCount
    } = this;
    for (let i = 0, l = freeJoints2.length; i < l; i++) {
      const joint = freeJoints2[i];
      const dofList = joint.dof;
      const lockedDoF = lockedJointDoF.get(joint);
      const isLocked = lockedJointDoFCount.has(joint);
      for (let d = 0, l2 = dofList.length; d < l2; d++) {
        const dof = dofList[d];
        if (isLocked && lockedDoF[dof]) {
          continue;
        }
        const value = joint.getDoFValue(dof);
        if (value === joint.getMinLimit(dof) || value === joint.getMaxLimit(dof)) {
          if (!lockedJointDoFCount.has(joint)) {
            lockedJointDoFCount.set(joint, 0);
            lockedDoF.fill(0);
          }
          const lockedCount = lockedJointDoFCount.get(joint);
          lockedJointDoFCount.set(joint, lockedCount + 1);
          lockedDoF[dof] = 1;
        }
      }
    }
  }
  // generate the jacobian
  // The jacobian has one column for each free degree of freedom and a row for every
  // target degree of freedom we have.
  fillJacobian(targetJoints2, freeJoints2, outJacobian) {
    const {
      lockedJointDoF,
      lockedJointDoFCount,
      translationFactor,
      rotationFactor
    } = this;
    const affectedClosures = this.affectedClosures;
    const affectedConnectedClosures = this.affectedConnectedClosures;
    let colIndex = 0;
    for (let c = 0, tc = freeJoints2.length; c < tc; c++) {
      const freeJoint = freeJoints2[c];
      const relevantClosures = affectedClosures.get(freeJoint);
      const relevantConnectedClosures = affectedConnectedClosures.get(freeJoint);
      const dofList = freeJoint.dof;
      const colCount = freeJoint.translationDoFCount + freeJoint.rotationDoFCount;
      const identityDoFMatrixWorld = freeJoint.cachedIdentityDoFMatrixWorld;
      const isLocked = lockedJointDoFCount.has(freeJoint);
      const lockedDoF = lockedJointDoF.get(freeJoint);
      let jointColIndex = 0;
      for (let co = 0; co < colCount; co++) {
        const dof = dofList[co];
        if (isLocked && lockedDoF[dof]) {
          continue;
        }
        let rowIndex = 0;
        for (let r = 0, tr = targetJoints2.length; r < tr; r++) {
          const targetJoint = targetJoints2[r];
          if (targetJoint.isClosure) {
            const affectsClosure = relevantClosures.has(targetJoint);
            const affectsChild = relevantConnectedClosures.has(targetJoint);
            if (affectsClosure || affectsChild) {
              mat4_exports.getRotation(tempAxisQuat, identityDoFMatrixWorld);
              vec3_exports.transformQuat(axisWorld, AXES[dof], tempAxisQuat);
              mat4_exports.getTranslation(pivotWorldPos, identityDoFMatrixWorld);
              vec3_exports.zero(tempPos4);
              vec3_exports.zero(tempRotVec2);
              if (dof < 3) {
                if (affectsClosure) {
                  vec3_exports.subtract(tempPos4, tempPos4, axisWorld);
                }
                if (affectsChild) {
                  vec3_exports.add(tempPos4, tempPos4, axisWorld);
                }
              } else {
                if (affectsClosure) {
                  accumulateRotationInfluence(axisWorld, pivotWorldPos, targetJoint.matrixWorld, -1, tempPos4, tempRotVec2);
                }
                if (affectsChild) {
                  accumulateRotationInfluence(axisWorld, pivotWorldPos, targetJoint.child.matrixWorld, 1, tempPos4, tempRotVec2);
                }
              }
              vec3_exports.scale(tempPos4, tempPos4, translationFactor);
              vec3_exports.scale(tempRotVec2, tempRotVec2, rotationFactor);
              if (targetJoint.isGoal) {
                const { translationDoFCount, rotationDoFCount, dof: dof2 } = targetJoint;
                for (let i = 0; i < translationDoFCount; i++) {
                  const d = dof2[i];
                  mat.set(outJacobian, rowIndex + i, colIndex, tempPos4[d]);
                }
                for (let i = 0; i < rotationDoFCount; i++) {
                  const d = dof2[translationDoFCount + i];
                  mat.set(outJacobian, rowIndex + translationDoFCount + i, colIndex, tempRotVec2[d - 3]);
                }
              } else {
                mat.set(outJacobian, rowIndex + 0, colIndex, tempPos4[0]);
                mat.set(outJacobian, rowIndex + 1, colIndex, tempPos4[1]);
                mat.set(outJacobian, rowIndex + 2, colIndex, tempPos4[2]);
                mat.set(outJacobian, rowIndex + 3, colIndex, tempRotVec2[0]);
                mat.set(outJacobian, rowIndex + 4, colIndex, tempRotVec2[1]);
                mat.set(outJacobian, rowIndex + 5, colIndex, tempRotVec2[2]);
              }
            }
            rowIndex += getClosureRowCount(targetJoint);
          }
          if (targetJoint.targetSet) {
            const rowCount = targetJoint.translationDoFCount + targetJoint.rotationDoFCount - (lockedJointDoFCount.get(targetJoint) || 0);
            if (freeJoint === targetJoint) {
              const factor = dof < 3 ? translationFactor : rotationFactor;
              mat.set(outJacobian, rowIndex + jointColIndex, colIndex, factor);
            }
            rowIndex += rowCount;
          }
        }
        colIndex++;
        jointColIndex++;
      }
    }
    if (colIndex !== outJacobian[0].length) {
      throw new Error();
    }
  }
  // Fill in the error vector
  fillErrorVector(targetJoints2, errorVector) {
    let rowIndex = 0;
    for (let i = 0, l = targetJoints2.length; i < l; i++) {
      const joint = targetJoints2[i];
      if (joint.isClosure) {
        accumulateClosureError(this, joint, rowIndex, errorVector, errorResultInfo);
        rowIndex += errorResultInfo.rowCount;
      }
      if (joint.targetSet) {
        accumulateTargetError(this, joint, rowIndex, errorVector, errorResultInfo);
        rowIndex += errorResultInfo.rowCount;
      }
    }
  }
  // Count the unconverged targets in the chain and store them in targetJoints and store
  // any freeJoints in
  countUnconvergedVariables(freeJoints2, targetJoints2, dofResultInfo2) {
    const { lockedJointDoFCount } = this;
    const chain = this.chain;
    let totalError = 0;
    let errorRows = 0;
    let unconvergedRows = 0;
    let freeDoF = 0;
    for (let i = 0, l = chain.length; i < l; i++) {
      let addToTargetList = false;
      const joint = chain[i];
      const lockedDoF = lockedJointDoFCount.get(joint) || 0;
      if (joint.isClosure) {
        accumulateClosureError(this, joint, errorRows, null, errorResultInfo);
        if (!errorResultInfo.isConverged) {
          unconvergedRows += errorResultInfo.rowCount;
          totalError += errorResultInfo.totalError;
        }
        addToTargetList = true;
        errorRows += errorResultInfo.rowCount;
      }
      const dofList = joint.dof;
      if (joint.targetSet) {
        accumulateTargetError(this, joint, errorRows, null, errorResultInfo);
        if (!errorResultInfo.isConverged) {
          unconvergedRows += errorResultInfo.rowCount;
          totalError += errorResultInfo.totalError;
        }
        addToTargetList = true;
        errorRows += errorResultInfo.rowCount;
      }
      if (!joint.isGoal && dofList.length > 0) {
        freeDoF += dofList.length - lockedDoF;
        freeJoints2.push(joint);
      }
      if (addToTargetList) {
        targetJoints2.push(joint);
      }
    }
    if (unconvergedRows === 0) {
      errorRows = 0;
    }
    dofResultInfo2.errorRows = errorRows;
    dofResultInfo2.freeDoF = freeDoF;
    dofResultInfo2.totalError = totalError;
  }
  // Check if the cached jacobian equals the given jacobian
  jacobianCacheEquals(matrix) {
    return mat.equalSubMatrix(this.prevJacobian, matrix, matrix.rows, matrix.cols);
  }
  // Copy cached pseudo-inverse to the output matrix
  restorePseudoInverse(target) {
    mat.copySubMatrix(target, this.prevPseudoInverse, target.rows, target.cols);
  }
  cacheJacobianResult(jacobian, pseudoInverse) {
    const { rows, cols } = jacobian;
    if (this.prevJacobian.rows < rows || this.prevJacobian.cols < cols) {
      this.prevJacobian = mat.create(rows, cols);
    }
    if (this.prevPseudoInverse.rows < pseudoInverse.rows || this.prevPseudoInverse.cols < pseudoInverse.cols) {
      this.prevPseudoInverse = mat.create(pseudoInverse.rows, pseudoInverse.cols);
    }
    mat.fill(this.prevJacobian, Infinity);
    mat.fill(this.prevPseudoInverse, Infinity);
    mat.copySubMatrix(this.prevJacobian, jacobian, rows, cols);
    mat.copySubMatrix(this.prevPseudoInverse, pseudoInverse, pseudoInverse.rows, pseudoInverse.cols);
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/utils/IKUtils.js
var IKUtils_exports = {};
__export(IKUtils_exports, {
  findRoots: () => findRoots,
  saveRestPose: () => saveRestPose
});
function findRoots(frames) {
  const potentialRoots = frames.map((f) => {
    let lastParent = f;
    f.traverseParents((p) => {
      lastParent = p;
    });
    return lastParent;
  });
  const roots = [];
  const set6 = /* @__PURE__ */ new Set();
  for (let i = 0; i < potentialRoots.length; i++) {
    const frame = potentialRoots[i];
    if (set6.has(frame)) {
      continue;
    }
    roots.push(frame);
    frame.traverse((c) => {
      if (set6.has(c)) {
        return true;
      }
      set6.add(c);
      let closureConnections;
      if (c.isLink) {
        closureConnections = c.closureJoints;
      } else if (c.isJoint && c.isClosure) {
        closureConnections = [c.child];
      }
      if (closureConnections) {
        closureConnections.forEach((cl) => {
          let lastParent = cl;
          cl.traverseParents((p) => {
            lastParent = p;
          });
          if (!set6.has(lastParent)) {
            potentialRoots.push(lastParent);
          }
        });
      }
    });
  }
  return roots;
}
function saveRestPose(ik) {
  ik.traverse((c) => {
    if (c.isJoint) {
      c.dofRestPose.set(c.dofValues);
      c.restPoseSet = true;
    }
  });
}

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/MatrixPool.js
var FixedMatrixPool = class {
  constructor(row, col) {
    const matrices = [];
    let index = 0;
    this.get = function() {
      let matrix = matrices[index];
      if (!matrix) {
        matrices[index] = matrix = mat.create(row, col);
      } else {
        mat.zero(matrix);
      }
      index++;
      return matrix;
    };
    this.releaseAll = function() {
      index = 0;
    };
  }
};
var MatrixPool = class {
  constructor() {
    const pools = {};
    const poolArray = [];
    this.get = function(row, col) {
      let colPools = pools[row];
      if (!colPools) {
        colPools = pools[row] = {};
      }
      let pool = colPools[col];
      if (!pool) {
        pool = colPools[col] = new FixedMatrixPool(row, col);
        poolArray.push(pool);
      }
      return pool.get();
    };
    this.releaseAll = function() {
      for (let i = 0, l = poolArray.length; i < l; i++) {
        poolArray[i].releaseAll();
      }
    };
  }
};

// solver-build/closed-chain-ik-js-35e50d6551772762c2f79eefd8a3221adcd1fb53/src/core/Solver.js
var Solver = class {
  constructor(roots = []) {
    this.matrixPool = new MatrixPool();
    this.useSVD = false;
    this.maxIterations = 5;
    this.stallThreshold = 1e-4;
    this.dampingFactor = 1e-3;
    this.divergeThreshold = 0.01;
    this.restPoseFactor = 0.01;
    this.translationConvergeThreshold = 1e-3;
    this.rotationConvergeThreshold = 1e-5;
    this.translationFactor = 1;
    this.rotationFactor = 1;
    this.translationErrorClamp = 0.1;
    this.rotationErrorClamp = 0.1;
    this.roots = Array.isArray(roots) ? [...roots] : [roots];
    this.solvers = null;
    this.updateStructure();
  }
  /**
   * Rebuilds the joint chains to solve. Must be called whenever the parent child structure of
   * the trees, the degrees of freedom of a joint, or `roots` change.
   */
  updateStructure() {
    const roots = findRoots(this.roots);
    const chains = [];
    const traversal = /* @__PURE__ */ new Set();
    const allChainJoints = /* @__PURE__ */ new Set();
    const traverseChains = (frame) => {
      if (frame.isJoint) {
        const joint = frame;
        traversal.add(joint);
        if (joint.isClosure) {
          const chainSet = /* @__PURE__ */ new Set();
          let curr = joint.child;
          while (curr) {
            if (curr.isJoint) {
              if (traversal.has(curr)) {
                break;
              } else {
                chainSet.add(curr);
                allChainJoints.add(curr);
              }
            }
            curr = curr.parent;
          }
          traversal.forEach((c) => {
            chainSet.add(c);
            allChainJoints.add(c);
          });
          chains.push(chainSet);
        }
      }
      const children = frame.children;
      for (let i = 0, l = children.length; i < l; i++) {
        traverseChains(children[i]);
      }
      traversal.delete(frame);
    };
    roots.forEach(traverseChains);
    const independentChains = [];
    while (chains.length) {
      const currChain = chains.pop();
      independentChains.push(currChain);
      for (let i = 0; i < chains.length; i++) {
        const otherChain = chains[i];
        let dependent = false;
        otherChain.forEach((c) => {
          dependent = dependent || currChain.has(c);
        });
        if (dependent) {
          otherChain.forEach((c) => currChain.add(c));
          chains.splice(i, 1);
          i--;
        }
      }
    }
    const nonChainJoints = /* @__PURE__ */ new Set();
    roots.forEach((root) => root.traverse((c) => {
      if (c.isJoint && c.dof.length > 0 && !allChainJoints.has(c)) {
        nonChainJoints.add(c);
      }
    }));
    this.solvers = independentChains.map((c) => new ChainSolver(c));
    this.nonChainJoints = nonChainJoints;
  }
  /**
   * Runs a solve on every independent joint chain and returns a `SOLVE_STATUS` for each.
   * @returns {Array<number>}
   */
  solve() {
    const { solvers, nonChainJoints } = this;
    nonChainJoints.forEach((joint) => {
      if (joint.targetSet) {
        joint.dofValues.set(joint.dofTarget);
        joint.setMatrixDoFNeedsUpdate();
      }
    });
    const results = [];
    for (let i = 0, l = solvers.length; i < l; i++) {
      const s = solvers[i];
      s.matrixPool = this.matrixPool;
      s.useSVD = this.useSVD;
      s.maxIterations = this.maxIterations;
      s.stallThreshold = this.stallThreshold;
      s.dampingFactor = this.dampingFactor;
      s.divergeThreshold = this.divergeThreshold;
      s.restPoseFactor = this.restPoseFactor;
      s.translationConvergeThreshold = this.translationConvergeThreshold;
      s.rotationConvergeThreshold = this.rotationConvergeThreshold;
      s.translationFactor = this.translationFactor;
      s.rotationFactor = this.rotationFactor;
      s.translationErrorClamp = this.translationErrorClamp;
      s.rotationErrorClamp = this.rotationErrorClamp;
      const result = s.solve();
      results.push(result);
    }
    return results;
  }
};
export {
  DOF,
  DOF_NAMES,
  Goal,
  IKUtils_exports as IKUtils,
  Joint,
  Link,
  SOLVE_STATUS,
  SOLVE_STATUS_NAMES,
  Solver
};
