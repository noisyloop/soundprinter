/**
 * Minimal iterative radix-2 Cooley-Tukey FFT, written from scratch.
 * Operates in-place on interleaved-free separate re/im arrays.
 * Only power-of-two sizes are supported (all we need for the STFT).
 */

export class FFT {
  readonly size: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly reverseTable: Uint32Array;

  constructor(size: number) {
    if (size <= 1 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;

    // Precompute twiddle factors.
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Precompute bit-reversal permutation.
    this.reverseTable = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let rev = 0;
      for (let b = 0; b < bits; b++) {
        rev = (rev << 1) | ((i >>> b) & 1);
      }
      this.reverseTable[i] = rev;
    }
  }

  /** In-place complex FFT over (re, im), each of length `size`. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    const rev = this.reverseTable;

    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let tmp = re[i];
        re[i] = re[j];
        re[j] = tmp;
        tmp = im[i];
        im[i] = im[j];
        im[j] = tmp;
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const tIdx = k * step;
          const wr = this.cosTable[tIdx];
          const wi = this.sinTable[tIdx];
          const i0 = start + k;
          const i1 = i0 + half;
          const xr = re[i1] * wr - im[i1] * wi;
          const xi = re[i1] * wi + im[i1] * wr;
          re[i1] = re[i0] - xr;
          im[i1] = im[i0] - xi;
          re[i0] += xr;
          im[i0] += xi;
        }
      }
    }
  }
}
