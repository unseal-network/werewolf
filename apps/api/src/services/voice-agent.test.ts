import { describe, expect, it } from "vitest";
import { resamplePcmForPlaybackRate } from "./voice-audio";

describe("TTS playback rate resampling", () => {
  it("shortens PCM samples for faster agent speech", () => {
    const input = Int16Array.from([0, 1000, 2000, 3000, 4000, 5000]);
    const output = resamplePcmForPlaybackRate(input, 1.5);

    expect(output.length).toBe(4);
    expect(Array.from(output)).toEqual([0, 1500, 3000, 4500]);
  });

  it("keeps invalid rates within supported bounds", () => {
    const input = Int16Array.from([0, 1000, 2000, 3000]);

    expect(resamplePcmForPlaybackRate(input, 20).length).toBe(2);
    expect(resamplePcmForPlaybackRate(input, Number.NaN)).toBe(input);
  });
});
