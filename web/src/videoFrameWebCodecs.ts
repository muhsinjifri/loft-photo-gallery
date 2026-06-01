import { withTimeout } from "./util";

export interface ExtractedVideoFrame {
  frame: VideoFrame;
  /** Display rotation in degrees (0/90/180/270) from the track matrix. */
  rotation: number;
  durationMs: number;
  codec: string;
  /** Pixel format of the decoded frame, e.g. "I420", "NV12", "P010" (HDR). */
  format: string | null;
}

// The track matrix is a 3x3 affine in 16.16 fixed point (rows: [a b u][c d v][x y w]).
// The upper-left 2x2 [a b; c d] encodes rotation/flip. atan2(b, a) → angle.
function rotationFromMatrix(matrix: ArrayLike<number> | undefined): number {
  if (!matrix || matrix.length < 5) return 0;
  const a = matrix[0] / 65536;
  const b = matrix[1] / 65536;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

interface CodecConfigBox {
  write: (stream: unknown) => void;
}

/**
 * Decode the first keyframe of a video file via WebCodecs, demuxing the
 * ISOBMFF (mp4/mov/m4v) container with mp4box.js. Returns a VideoFrame the
 * caller must close(). Works for H.264 and HEVC where the platform decoder
 * supports them (Safari, Chrome/macOS). Throws on unsupported codecs or
 * non-ISOBMFF containers so the caller can fall back.
 */
export async function extractVideoFrameWebCodecs(file: File): Promise<ExtractedVideoFrame> {
  if (typeof VideoDecoder === "undefined") {
    throw new Error("WebCodecs VideoDecoder unavailable");
  }

  const { createFile, DataStream, Endianness, MP4BoxBuffer } = await import("mp4box");
  const buffer = await file.arrayBuffer();

  return withTimeout(
    new Promise<ExtractedVideoFrame>((resolve, reject) => {
      const mp4 = createFile();
      let decoder: VideoDecoder | null = null;
      let settled = false;
      let codec = "";
      let codedWidth = 0;
      let codedHeight = 0;
      let rotation = 0;
      let durationMs = 0;

      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        try {
          decoder?.close();
        } catch {
          /* already closed */
        }
        reject(e instanceof Error ? e : new Error(String(e)));
      };

      mp4.onError = (_module: string, message: string) => fail(new Error(`mp4box: ${message}`));

      mp4.onReady = (info) => {
        try {
          const track = info.videoTracks?.[0];
          if (!track) throw new Error("no video track in container");
          codec = track.codec;
          codedWidth = track.video?.width ?? track.track_width;
          codedHeight = track.video?.height ?? track.track_height;
          rotation = rotationFromMatrix(track.matrix as unknown as ArrayLike<number>);
          durationMs =
            track.movie_timescale > 0
              ? (track.movie_duration / track.movie_timescale) * 1000
              : 0;
          // Extract a small run of samples (not just 1): the first sample
          // mp4box delivers isn't guaranteed to be a sync frame (edit lists,
          // open-GOP, B-frame reordering), and WebCodecs requires the first
          // decoded chunk to be a real key frame.
          mp4.setExtractionOptions(track.id, null, { nbSamples: 64 });
          mp4.start();
        } catch (e) {
          fail(e);
        }
      };

      mp4.onSamples = (_id, _user, samples) => {
        if (settled) return;
        try {
          // Start from the first true key frame (is_sync). Decoding must begin
          // on a key frame; everything before it is undecodable on its own.
          const firstKey = samples.findIndex((s) => s.is_sync);
          if (firstKey < 0) {
            fail(new Error("no key frame found in first samples"));
            return;
          }
          const startSample = samples[firstKey];
          if (!startSample.data) {
            fail(new Error("key frame has no data"));
            return;
          }

          // Build the WebCodecs `description` from the codec config box
          // (hvcC/avcC/av1C/vpcC) so the decoder has the parameter sets for
          // length-prefixed (hvc1/avc1) bitstreams.
          const entry = startSample.description as unknown as {
            hvcC?: CodecConfigBox;
            avcC?: CodecConfigBox;
            av1C?: CodecConfigBox;
            vpcC?: CodecConfigBox;
          };
          const cfgBox = entry.hvcC ?? entry.avcC ?? entry.av1C ?? entry.vpcC;
          let description: Uint8Array | undefined;
          if (cfgBox) {
            const ds = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
            cfgBox.write(ds);
            description = new Uint8Array(ds.buffer, 8); // strip 8-byte box header
          }

          const config: VideoDecoderConfig = {
            codec,
            codedWidth,
            codedHeight,
            ...(description ? { description } : {}),
          };

          decoder = new VideoDecoder({
            output: (frame) => {
              if (settled) {
                frame.close();
                return;
              }
              settled = true;
              // Hand the frame to the caller; close the decoder (delivered
              // frames stay valid until the caller closes them).
              try {
                decoder?.close();
              } catch {
                /* noop */
              }
              resolve({ frame, rotation, durationMs, codec, format: frame.format });
            },
            error: (e) => fail(e),
          });

          VideoDecoder.isConfigSupported(config)
            .then((support) => {
              if (settled) return;
              if (!support.supported) {
                fail(new Error(`codec not supported by VideoDecoder: ${codec}`));
                return;
              }
              decoder!.configure(config);
              // Feed from the first key frame onward, marking each chunk by its
              // real sync flag, with correct microsecond timestamps. The first
              // decoded output (the key frame) resolves the promise.
              for (let i = firstKey; i < samples.length; i++) {
                const s = samples[i];
                if (!s.data) continue;
                const ts = s.timescale ? (s.cts * 1e6) / s.timescale : 0;
                const dur = s.timescale ? (s.duration * 1e6) / s.timescale : 0;
                decoder!.decode(
                  new EncodedVideoChunk({
                    type: s.is_sync ? "key" : "delta",
                    timestamp: Math.round(ts),
                    duration: Math.round(dur),
                    data: s.data,
                  }),
                );
                if (s.is_sync && i > firstKey) break; // one GOP is plenty
              }
              // flush() rejects if we close() right after first output — ignore.
              decoder!.flush().catch(() => {});
            })
            .catch(fail);
        } catch (e) {
          fail(e);
        }
      };

      try {
        const mp4buf = MP4BoxBuffer.fromArrayBuffer(buffer, 0);
        mp4.appendBuffer(mp4buf);
        mp4.flush();
      } catch (e) {
        fail(e);
      }
    }),
    6000,
    "webcodecs video decode",
  );
}
