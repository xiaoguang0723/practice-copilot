const TARGET_SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096
const SPEECH_RMS_THRESHOLD = 0.01
const PRE_ROLL_MAX_FRAMES = 2
const SILENCE_FLUSH_FRAMES = 3
const MAX_SPEECH_FRAMES_BEFORE_FLUSH = 22
const MIN_SPEECH_FRAMES = 2

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) {
    const val = samples[i]
    sum += val * val
  }
  return Math.sqrt(sum / samples.length)
}

export function encodeWavBase64(chunks: Float32Array[], sampleRate = TARGET_SAMPLE_RATE): string {
  let totalSamples = 0
  for (const chunk of chunks) {
    totalSamples += chunk.length
  }
  const dataByteLength = totalSamples * 2
  const buffer = new ArrayBuffer(44 + dataByteLength)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataByteLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataByteLength, true)

  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, chunk[i]))
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

export interface SystemAudioListenerCallbacks {
  onAudioChunk(wavBase64: string): Promise<unknown> | unknown
  onError?(message: string): void
  onSpeakingChange?(speaking: boolean): void
}

export class SystemAudioListener {
  private audioContext?: AudioContext
  private mediaStream?: MediaStream
  private processor?: ScriptProcessorNode
  private preRollFrames: Float32Array[] = []
  private speechFrames: Float32Array[] = []
  private speechFrameCount = 0
  private silenceFrameCount = 0
  private speaking = false
  private running = false
  private pendingTasks = new Set<Promise<unknown>>()

  constructor(private readonly callbacks: SystemAudioListenerCallbacks) {}

  async start(): Promise<void> {
    if (this.running) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.callbacks.onError?.('当前环境不支持系统音频捕获')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      })
      for (const videoTrack of stream.getVideoTracks()) {
        videoTrack.stop()
      }
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        this.callbacks.onError?.('未检测到系统音频轨道')
        return
      }

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const context = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE })
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
      const silentGain = context.createGain()
      silentGain.gain.value = 0

      processor.onaudioprocess = (event) => {
        if (!this.running) return
        const input = event.inputBuffer.getChannelData(0)
        const copy = new Float32Array(input.length)
        copy.set(input)
        this.processFrame(copy)
      }

      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(context.destination)

      this.mediaStream = stream
      this.audioContext = context
      this.processor = processor
      this.running = true
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : '开启系统声音监听失败')
    }
  }

  async flushNow(stopCapture = false, onCaptureStopped?: () => void): Promise<void> {
    if (this.speechFrames.length > 0 && this.speechFrameCount >= 1) {
      this.emitCurrentSpeechChunk()
    }
    if (stopCapture) {
      this.stop()
      onCaptureStopped?.()
    } else if (this.speaking) {
      this.speaking = false
      this.callbacks.onSpeakingChange?.(false)
    }
    if (this.pendingTasks.size > 0) {
      await Promise.allSettled([...this.pendingTasks])
    }
  }

  stop(): void {
    this.running = false
    if (this.speaking) {
      this.speaking = false
      this.callbacks.onSpeakingChange?.(false)
    }
    this.preRollFrames = []
    this.speechFrames = []
    this.speechFrameCount = 0
    this.silenceFrameCount = 0

    try {
      this.processor?.disconnect()
    } catch {
      // ignore
    }
    this.processor = undefined

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop()
      }
      this.mediaStream = undefined
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined)
      this.audioContext = undefined
    }
  }

  private processFrame(frame: Float32Array): void {
    const rms = computeRms(frame)
    if (rms >= SPEECH_RMS_THRESHOLD) {
      if (!this.speaking) {
        this.speaking = true
        this.callbacks.onSpeakingChange?.(true)
        this.speechFrames = [...this.preRollFrames]
        this.preRollFrames = []
      }
      this.speechFrames.push(frame)
      this.speechFrameCount += 1
      this.silenceFrameCount = 0

      if (this.speechFrameCount >= MAX_SPEECH_FRAMES_BEFORE_FLUSH) {
        this.emitCurrentSpeechChunk()
      }
      return
    }

    if (this.speaking) {
      this.speechFrames.push(frame)
      this.silenceFrameCount += 1
      if (this.silenceFrameCount >= SILENCE_FLUSH_FRAMES) {
        this.speaking = false
        this.callbacks.onSpeakingChange?.(false)
        if (this.speechFrameCount >= MIN_SPEECH_FRAMES) {
          this.emitCurrentSpeechChunk()
        } else {
          this.speechFrames = []
          this.speechFrameCount = 0
          this.silenceFrameCount = 0
        }
      }
    } else {
      this.preRollFrames.push(frame)
      if (this.preRollFrames.length > PRE_ROLL_MAX_FRAMES) {
        this.preRollFrames.shift()
      }
    }
  }

  private emitCurrentSpeechChunk(): void {
    const framesToEncode = this.speechFrames
    this.speechFrames = []
    this.speechFrameCount = 0
    this.silenceFrameCount = 0
    const sampleRate = this.audioContext?.sampleRate ?? TARGET_SAMPLE_RATE
    const wavBase64 = encodeWavBase64(framesToEncode, sampleRate)
    const task = Promise.resolve(this.callbacks.onAudioChunk(wavBase64)).finally(() => {
      this.pendingTasks.delete(task)
    })
    this.pendingTasks.add(task)
  }
}
