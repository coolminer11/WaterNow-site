/*
 * QR Code generator library (JavaScript), byte mode only: every code the site draws is a link.
 * A port of Project Nayuki's QR Code generator library (https://www.nayuki.io/page/qr-code-generator-library) with the
 * API of its official TypeScript/JavaScript version: qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM)
 * gives an object with .version, .size, .mask, .errorCorrectionLevel and .getModule(x, y). The app's Kotlin port
 * (shared/src/commonMain/kotlin/com/example/qr/QrCode.kt) is the same code. Self-hosted: no CDN.
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */
(function (root) {
  "use strict";

  // Index 0 is padding; rows LOW, MEDIUM, QUARTILE, HIGH (ISO/IEC 18004 table 9).
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  /** Error correction level: ordinal (LOW..HIGH) and the format bits the standard writes. */
  var Ecc = {
    LOW: { ordinal: 0, formatBits: 1 }, MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 }, HIGH: { ordinal: 3, formatBits: 2 }
  };

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function numRawDataModules(ver) {
    var size = ver * 4 + 17;
    var result = size * size - 8 * 8 * 3 - 15 * 2 - 1 - (size - 16) * 2;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      result -= (n - 1) * (n - 1) * 25 + (n - 2) * 2 * 20;
      if (ver >= 7) result -= 6 * 3 * 2;
    }
    return result;
  }

  /** Data codewords (bytes) a version holds at a level, before mode and length headers. */
  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
  }

  function rsMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    var result = [], root = 1, i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= rsMultiply(coef, factor); });
    });
    return result;
  }

  /** The QR code of version [version] at level [ecl] for these data codewords, mask 0..7 or -1 (the best). */
  function QrCode(version, ecl, dataCodewords, msk) {
    var size = version * 4 + 17, modules = [], isFunction = [], i, j;
    for (i = 0; i < size; i++) {
      modules.push(new Array(size).fill(false));
      isFunction.push(new Array(size).fill(false));
    }

    function setFunction(x, y, dark) { modules[y][x] = dark; isFunction[y][x] = true; }

    function drawFormatBits(m) {
      var data = ecl.formatBits << 3 | m, rem = data, k;
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = (data << 10 | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) setFunction(8, k, getBit(bits, k));
      setFunction(8, 7, getBit(bits, 6));
      setFunction(8, 8, getBit(bits, 7));
      setFunction(7, 8, getBit(bits, 8));
      for (k = 9; k < 15; k++) setFunction(14 - k, 8, getBit(bits, k));
      for (k = 0; k < 8; k++) setFunction(size - 1 - k, 8, getBit(bits, k));
      for (k = 8; k < 15; k++) setFunction(8, size - 15 + k, getBit(bits, k));
      setFunction(8, size - 8, true);
    }

    function drawVersion() {
      if (version < 7) return;
      var rem = version, k;
      for (k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var bits = version << 12 | rem;
      for (k = 0; k < 18; k++) {
        var b = getBit(bits, k), a = size - 11 + k % 3, c = Math.floor(k / 3);
        setFunction(a, c, b);
        setFunction(c, a, b);
      }
    }

    function drawFinder(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunction(xx, yy, dist !== 2 && dist !== 4);
      }
    }

    function drawAlignment(x, y) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    function alignmentPositions() {
      if (version === 1) return [];
      var n = Math.floor(version / 7) + 2;
      var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
      var result = [6];
      for (var pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
      return result;
    }

    function addEccAndInterleave(data) {
      var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version];
      var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version];
      var rawCodewords = Math.floor(numRawDataModules(version) / 8);
      var numShortBlocks = numBlocks - rawCodewords % numBlocks;
      var shortBlockLen = Math.floor(rawCodewords / numBlocks);
      var divisor = rsDivisor(blockEccLen), blocks = [], result = [], k = 0, b;
      for (b = 0; b < numBlocks; b++) {
        var dat = data.slice(k, k + shortBlockLen - blockEccLen + (b < numShortBlocks ? 0 : 1));
        k += dat.length;
        var ecc = rsRemainder(dat, divisor);
        if (b < numShortBlocks) dat.push(0);
        blocks.push(dat.concat(ecc));
      }
      for (var c = 0; c < blocks[0].length; c++) {
        for (b = 0; b < blocks.length; b++) {
          // The short blocks' padding byte is skipped.
          if (c !== shortBlockLen - blockEccLen || b >= numShortBlocks) result.push(blocks[b][c]);
        }
      }
      return result;
    }

    function drawCodewords(data) {
      var k = 0;
      for (var right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (var vert = 0; vert < size; vert++) {
          for (var jj = 0; jj < 2; jj++) {
            var x = right - jj, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
            if (!isFunction[y][x] && k < data.length * 8) {
              modules[y][x] = getBit(data[k >>> 3], 7 - (k & 7));
              k++;
            }
          }
        }
      }
    }

    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var invert;
        switch (m) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (invert && !isFunction[y][x]) modules[y][x] = !modules[y][x];
      }
    }

    function addHistory(length, h) {
      if (h[0] === 0) length += size; // the light border before the first module
      h.pop();
      h.unshift(length);
    }

    function countFinderLike(h) {
      var n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    }

    function terminateAndCount(color, run, h) {
      if (color) { addHistory(run, h); run = 0; }
      addHistory(run + size, h); // the light border after the last module
      return countFinderLike(h);
    }

    function penaltyScore() {
      var result = 0, pass, a, b, x, y;
      for (pass = 0; pass < 2; pass++) { // rows, then columns
        for (a = 0; a < size; a++) {
          var runColor = false, run = 0, history = [0, 0, 0, 0, 0, 0, 0];
          for (b = 0; b < size; b++) {
            var m = pass === 0 ? modules[a][b] : modules[b][a];
            if (m === runColor) {
              run++;
              if (run === 5) result += PENALTY_N1; else if (run > 5) result++;
            } else {
              addHistory(run, history);
              if (!runColor) result += countFinderLike(history) * PENALTY_N3;
              runColor = m;
              run = 1;
            }
          }
          result += terminateAndCount(runColor, run, history) * PENALTY_N3;
        }
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += PENALTY_N2;
      }
      var dark = 0, total = size * size;
      modules.forEach(function (row) { row.forEach(function (d) { if (d) dark++; }); });
      var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return result + k * PENALTY_N4;
    }

    // Function patterns, then the data, then the mask with the lowest penalty (or the one asked for).
    for (i = 0; i < size; i++) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);
    var align = alignmentPositions(), n = align.length;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      if (!(i === 0 && j === 0 || i === 0 && j === n - 1 || i === n - 1 && j === 0)) drawAlignment(align[i], align[j]);
    }
    drawFormatBits(0);
    drawVersion();
    drawCodewords(addEccAndInterleave(dataCodewords));
    if (msk === -1) {
      var minPenalty = Infinity;
      for (i = 0; i < 8; i++) {
        applyMask(i);
        drawFormatBits(i);
        var penalty = penaltyScore();
        if (penalty < minPenalty) { msk = i; minPenalty = penalty; }
        applyMask(i); // XOR again: undone
      }
    }
    applyMask(msk);
    drawFormatBits(msk);

    this.version = version;
    this.size = size;
    this.mask = msk;
    this.errorCorrectionLevel = ecl;
    /** True for a dark module; outside the square is light (the quiet zone). */
    this.getModule = function (x, y) { return x >= 0 && x < size && y >= 0 && y < size && modules[y][x]; };
  }

  /**
   * [text] as UTF-8 bytes in the smallest version that holds it at [ecl], the level then raised while the version stays
   * (unless boostEcl is false). Throws RangeError when even version 40 can't hold it.
   */
  QrCode.encodeText = function (text, ecl, minVersion, maxVersion, mask, boostEcl) {
    minVersion = minVersion || 1;
    maxVersion = maxVersion || 40;
    mask = mask === undefined ? -1 : mask;
    if (!(minVersion >= 1 && minVersion <= maxVersion && maxVersion <= 40 && mask >= -1 && mask <= 7)) throw new RangeError("Invalid value");
    var data = Array.from(new TextEncoder().encode(String(text)));
    var version, ccBits, usedBits;
    for (version = minVersion; ; version++) {
      ccBits = version <= 9 ? 8 : 16;
      usedBits = 4 + ccBits + data.length * 8;
      if (data.length < (1 << ccBits) && usedBits <= numDataCodewords(version, ecl) * 8) break;
      if (version >= maxVersion) throw new RangeError("Data too long");
    }
    [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH].forEach(function (e) {
      if (boostEcl !== false && e.ordinal > ecl.ordinal && usedBits <= numDataCodewords(version, e) * 8) ecl = e;
    });

    var capacity = numDataCodewords(version, ecl) * 8, bits = [];
    function append(value, count) { for (var k = count - 1; k >= 0; k--) bits.push((value >>> k) & 1); }
    append(0x4, 4); // byte mode
    append(data.length, ccBits);
    data.forEach(function (b) { append(b, 8); });
    append(0, Math.min(4, capacity - bits.length)); // terminator
    append(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) append(pad, 8);
    var codewords = new Array(bits.length / 8).fill(0);
    bits.forEach(function (b, k) { codewords[k >>> 3] |= b << (7 - (k & 7)); });
    return new QrCode(version, ecl, codewords, mask);
  };
  QrCode.Ecc = Ecc;

  var qrcodegen = { QrCode: QrCode };
  if (typeof module === "object" && module.exports) module.exports = qrcodegen;
  else root.qrcodegen = qrcodegen;
})(this);
