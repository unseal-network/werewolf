export function resamplePcmForPlaybackRate(
  samples: Int16Array,
  playbackRate: number
): Int16Array {
  const rate = Number.isFinite(playbackRate)
    ? Math.min(2, Math.max(0.75, playbackRate))
    : 1;
  if (samples.length === 0 || Math.abs(rate - 1) < 0.001) return samples;

  const outputLength = Math.max(1, Math.floor(samples.length / rate));
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * rate;
    const leftIndex = Math.min(samples.length - 1, Math.floor(sourceIndex));
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    const fraction = sourceIndex - leftIndex;
    output[i] = Math.round(left * (1 - fraction) + right * fraction);
  }
  return output;
}
