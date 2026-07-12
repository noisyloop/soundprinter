import { SAMPLE_RATE } from "../dsp/params";

/**
 * Decode a user-supplied audio file entirely client-side and resample it to
 * the analysis rate as mono. decodeAudioData handles the container/codec;
 * an OfflineAudioContext renders the resample so we never touch the
 * speakers and nothing leaves the machine.
 */
export async function decodeFileToMono(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    void decodeCtx.close();
  }

  const targetLength = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded; // mono downmix + resample happen in the render
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  return rendered.getChannelData(0).slice();
}
