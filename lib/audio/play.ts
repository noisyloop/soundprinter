import { SAMPLE_RATE } from "../dsp/params";

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** Play a mono buffer through the speakers; returns a stop function. */
export function playSamples(
  samples: Float32Array,
  onEnded?: () => void
): () => void {
  if (!ctx) ctx = new AudioContext();
  void ctx.resume();
  stopPlayback();

  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (current === source) current = null;
    onEnded?.();
  };
  source.start();
  current = source;
  return () => {
    if (current === source) stopPlayback();
  };
}

export function stopPlayback(): void {
  if (current) {
    current.onended = null;
    try {
      current.stop();
    } catch {
      // already stopped
    }
    current = null;
  }
}
