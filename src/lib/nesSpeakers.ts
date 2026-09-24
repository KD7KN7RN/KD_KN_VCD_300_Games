/**
 * Official reference implementation of JSNES Audio System (Speakers)
 * Based directly on bfirsh/jsnes/src/browser/speakers.js
 * 
 * Features:
 * - Runs on real-time dedicated AudioWorklet thread (zero stuttering from main thread UI)
 * - 128-sample batching matching AudioWorklet render quantum
 * - Natural, authentic NES APU sound without artificial distortion
 * - Underrun callback to allow emulator to catch up frames
 * - Automatic resume on user gesture
 * - Fallback to ScriptProcessorNode if AudioWorklet is blocked
 */

const WORKLET_CODE = `
class NESAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Circular buffer sized to hold ~340ms of audio at 48kHz (16384 samples)
    this.capacity = 16384;
    this.bufferL = new Float32Array(this.capacity);
    this.bufferR = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'samples') {
        const left = e.data.left;
        const right = e.data.right;
        const len = left.length;

        // If adding these samples would overflow, drop oldest to make room
        if (this.count + len > this.capacity) {
          const drop = this.count + len - this.capacity;
          this.readPos = (this.readPos + drop) % this.capacity;
          this.count -= drop;
        }

        for (let i = 0; i < len; i++) {
          this.bufferL[this.writePos] = left[i];
          this.bufferR[this.writePos] = right[i];
          this.writePos = (this.writePos + 1) % this.capacity;
        }
        this.count += len;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outL = output[0];
    const outR = output[1];
    const size = outL.length;

    if (this.count < size) {
      // Buffer underrun: output available samples and fill remainder with silence
      for (let i = 0; i < this.count; i++) {
        outL[i] = this.bufferL[this.readPos];
        outR[i] = this.bufferR[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
      }
      for (let i = this.count; i < size; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      this.count = 0;
      this.port.postMessage({ type: 'underrun' });
    } else {
      for (let i = 0; i < size; i++) {
        outL[i] = this.bufferL[this.readPos];
        outR[i] = this.bufferR[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
      }
      this.count -= size;
    }

    return true;
  }
}

registerProcessor('nes-audio-processor', NESAudioProcessor);
`;

const BATCH_SIZE = 128;

export interface NESSpeakersOptions {
  onBufferUnderrun?: () => void;
}

export class NESSpeakers {
  private onBufferUnderrun?: () => void;
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private batchL = new Float32Array(BATCH_SIZE);
  private batchR = new Float32Array(BATCH_SIZE);
  private batchPos = 0;
  private isMuted = false;
  private fallbackBufferL = new Float32Array(16384);
  private fallbackBufferR = new Float32Array(16384);
  private fallbackReadPos = 0;
  private fallbackWritePos = 0;
  private fallbackCount = 0;
  private resumeListener: (() => void) | null = null;

  constructor(options: NESSpeakersOptions = {}) {
    this.onBufferUnderrun = options.onBufferUnderrun;
  }

  getSampleRate(): number {
    if (this.audioCtx) {
      return this.audioCtx.sampleRate;
    }
    return 48000;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  async start(): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('AudioContext not supported');
      return;
    }

    try {
      this.audioCtx = new AudioContextClass({
        latencyHint: 'interactive',
      });

      // Attempt to initialize standard AudioWorklet (Real-time dedicated thread)
      if (this.audioCtx.audioWorklet) {
        try {
          const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await this.audioCtx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          this.workletNode = new AudioWorkletNode(this.audioCtx, 'nes-audio-processor', {
            outputChannelCount: [2],
          });

          this.workletNode.port.onmessage = (e) => {
            if (e.data.type === 'underrun' && this.onBufferUnderrun) {
              this.onBufferUnderrun();
            }
          };

          this.workletNode.connect(this.audioCtx.destination);
        } catch (workletErr) {
          console.warn('AudioWorklet failed, using fallback script processor:', workletErr);
          this.initFallbackProcessor();
        }
      } else {
        this.initFallbackProcessor();
      }

      // Resume on user interaction if suspended
      if (this.audioCtx.state === 'suspended') {
        this.resumeListener = () => {
          if (this.audioCtx && this.audioCtx.state === 'suspended') {
            void this.audioCtx.resume();
          }
          this.removeResumeListener();
        };
        window.addEventListener('pointerdown', this.resumeListener, { passive: true });
        window.addEventListener('keydown', this.resumeListener, { passive: true });
        window.addEventListener('touchstart', this.resumeListener, { passive: true });
      }
    } catch (err) {
      console.error('Failed to initialize NES audio context:', err);
    }
  }

  private initFallbackProcessor() {
    if (!this.audioCtx) return;
    const bufferSize = 2048;
    this.scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 0, 2);

    this.scriptNode.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const size = outL.length;

      if (this.isMuted || this.fallbackCount < size) {
        for (let i = 0; i < Math.min(this.fallbackCount, size); i++) {
          outL[i] = this.isMuted ? 0 : this.fallbackBufferL[this.fallbackReadPos];
          outR[i] = this.isMuted ? 0 : this.fallbackBufferR[this.fallbackReadPos];
          this.fallbackReadPos = (this.fallbackReadPos + 1) % 16384;
        }
        for (let i = this.fallbackCount; i < size; i++) {
          outL[i] = 0;
          outR[i] = 0;
        }
        this.fallbackCount = 0;
        if (this.onBufferUnderrun) {
          this.onBufferUnderrun();
        }
      } else {
        for (let i = 0; i < size; i++) {
          outL[i] = this.isMuted ? 0 : this.fallbackBufferL[this.fallbackReadPos];
          outR[i] = this.isMuted ? 0 : this.fallbackBufferR[this.fallbackReadPos];
          this.fallbackReadPos = (this.fallbackReadPos + 1) % 16384;
        }
        this.fallbackCount -= size;
      }
    };

    this.scriptNode.connect(this.audioCtx.destination);
  }

  private removeResumeListener() {
    if (this.resumeListener) {
      window.removeEventListener('pointerdown', this.resumeListener);
      window.removeEventListener('keydown', this.resumeListener);
      window.removeEventListener('touchstart', this.resumeListener);
      this.resumeListener = null;
    }
  }

  public ensureRunning() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public writeSample = (left: number, right: number) => {
    if (this.isMuted) return;

    if (this.workletNode) {
      this.batchL[this.batchPos] = left;
      this.batchR[this.batchPos] = right;
      this.batchPos++;

      if (this.batchPos >= BATCH_SIZE) {
        this.workletNode.port.postMessage({
          type: 'samples',
          left: this.batchL.slice(),
          right: this.batchR.slice(),
        });
        this.batchPos = 0;
      }
    } else if (this.scriptNode) {
      if (this.fallbackCount < 16384) {
        this.fallbackBufferL[this.fallbackWritePos] = left;
        this.fallbackBufferR[this.fallbackWritePos] = right;
        this.fallbackWritePos = (this.fallbackWritePos + 1) % 16384;
        this.fallbackCount++;
      }
    }
  };

  public flush() {
    if (this.batchPos > 0 && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'samples',
        left: this.batchL.slice(0, this.batchPos),
        right: this.batchR.slice(0, this.batchPos),
      });
      this.batchPos = 0;
    }
  }

  public stop() {
    this.onBufferUnderrun = undefined;
    this.removeResumeListener();

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.batchPos = 0;
    this.fallbackCount = 0;
  }
}
