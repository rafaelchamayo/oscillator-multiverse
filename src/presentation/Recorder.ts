/** Track returned by `canvas.captureStream(0)`: frames are pushed with `requestFrame()`. */
interface CanvasTrack extends MediaStreamTrack {
  requestFrame?: () => void;
}

/** VP8 first: it encodes ~5× cheaper than VP9, which made the page drop frames at 1080p. */
const MIME_TYPES = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];

/** Picks the best WebM codec this browser can record ('' when it cannot record at all). */
export function recordingMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/**
 * Records a canvas to WebM. The stream is created with frame rate 0 and the controller calls
 * `frame()` after drawing each simulation frame, so the video gets exactly one frame per
 * (frame-locked) simulation step and nothing in between.
 */
export class Recorder {
  readonly mime: string;
  frames = 0;
  private readonly rec: MediaRecorder;
  private readonly track: CanvasTrack;
  private readonly chunks: Blob[] = [];
  private readonly done: Promise<Blob>;

  constructor(canvas: HTMLCanvasElement, bitsPerSecond = 12_000_000) {
    this.mime = recordingMime();
    const stream = canvas.captureStream(0);
    this.track = stream.getVideoTracks()[0] as CanvasTrack;
    this.rec = new MediaRecorder(stream, {
      mimeType: this.mime || undefined,
      videoBitsPerSecond: bitsPerSecond,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.done = new Promise((resolve) => {
      this.rec.onstop = () => {
        this.track.stop();
        resolve(new Blob(this.chunks, { type: 'video/webm' }));
      };
    });
    this.rec.start(1000);
  }

  /** Pushes the canvas as it is now as the next video frame. */
  frame(): void {
    this.track.requestFrame?.();
    this.frames++;
  }

  stop(): Promise<Blob> {
    if (this.rec.state !== 'inactive') this.rec.stop();
    return this.done;
  }
}

/** Saves a blob through a temporary link. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
