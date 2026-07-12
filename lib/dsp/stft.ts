import { FFT } from "./fft";
import { FFT_SIZE, HOP_SIZE, NUM_BINS } from "./params";

export interface Spectrogram {
  /** Log-magnitude (dB), frame-major: mags[frame * NUM_BINS + bin]. */
  mags: Float32Array;
  numFrames: number;
  numBins: number;
}

/**
 * Short-time Fourier transform: Hann window, 50% overlap, log magnitude.
 */
export function computeSpectrogram(samples: Float32Array): Spectrogram {
  const numFrames = Math.max(
    0,
    Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1
  );
  const mags = new Float32Array(numFrames * NUM_BINS);

  const fft = new FFT(FFT_SIZE);
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[start + i] * window[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    const base = frame * NUM_BINS;
    for (let bin = 0; bin < NUM_BINS; bin++) {
      const power = re[bin] * re[bin] + im[bin] * im[bin];
      mags[base + bin] = 10 * Math.log10(power + 1e-12);
    }
  }

  return { mags, numFrames, numBins: NUM_BINS };
}
