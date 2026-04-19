import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Microphone, ArrowUp, SpinnerGap, X, Check } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { AttachmentChips } from './AttachmentChips'
import { useColors } from '../theme'

const INPUT_MIN_HEIGHT = 20
const INPUT_MAX_HEIGHT = 140
const MULTILINE_ENTER_HEIGHT = 52
const MULTILINE_EXIT_HEIGHT = 50
const INLINE_CONTROLS_RESERVED_WIDTH = 104
const ACTION_HINT_IDLE_MS = 600
const ACTION_HINT_VISIBLE_MS = 3000
type VoiceState = 'idle' | 'recording' | 'transcribing'

/**
 * InputBar renders inside a glass-surface rounded-full pill provided by App.tsx.
 * It provides: textarea + mic/send buttons. Attachment chips render above when present.
 */
export function InputBar() {
  const [input, setInput] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showActionHints, setShowActionHints] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const submitLockRef = useRef(false)
  const hintIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enqueueDraft = useSessionStore((s) => s.enqueueDraft)
  const sendQueuedItems = useSessionStore((s) => s.sendQueuedItems)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const removeAttachment = useSessionStore((s) => s.removeAttachment)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const colors = useColors()
  const isBusy = isSubmitting || tab?.status === 'running' || tab?.status === 'connecting'
  const isConnecting = tab?.status === 'connecting'
  const queueCount = tab?.queueItems.length ?? 0
  const attachments = tab?.attachments || []
  const hasContent = input.trim().length > 0 || queueCount > 0 || attachments.length > 0
  const hasPendingComposerContent = input.trim().length > 0 || attachments.length > 0
  const canSend = !!tab && !isConnecting && hasContent
  const canQueue = !!tab && !isConnecting && hasPendingComposerContent

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeTabId])

  // Focus textarea when window is shown (shortcut toggle, screenshot return)
  useEffect(() => {
    const unsub = window.clui.onWindowShown(() => {
      textareaRef.current?.focus()
    })
    return unsub
  }, [])

  useEffect(() => {
    const onSetInput = (event: Event) => {
      const custom = event as CustomEvent<string>
      if (typeof custom.detail === 'string') {
        setInput(custom.detail)
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
    }

    window.addEventListener('walkinal:set-input', onSetInput as EventListener)
    return () => window.removeEventListener('walkinal:set-input', onSetInput as EventListener)
  }, [])

  const measureInlineHeight = useCallback((value: string): number => {
    if (typeof document === 'undefined') return 0
    if (!measureRef.current) {
      const m = document.createElement('textarea')
      m.setAttribute('aria-hidden', 'true')
      m.tabIndex = -1
      m.style.position = 'absolute'
      m.style.top = '-99999px'
      m.style.left = '0'
      m.style.height = '0'
      m.style.minHeight = '0'
      m.style.overflow = 'hidden'
      m.style.visibility = 'hidden'
      m.style.pointerEvents = 'none'
      m.style.zIndex = '-1'
      m.style.resize = 'none'
      m.style.border = '0'
      m.style.outline = '0'
      m.style.boxSizing = 'border-box'
      document.body.appendChild(m)
      measureRef.current = m
    }

    const m = measureRef.current
    const hostWidth = wrapperRef.current?.clientWidth ?? 0
    const inlineWidth = Math.max(120, hostWidth - INLINE_CONTROLS_RESERVED_WIDTH)
    m.style.width = `${inlineWidth}px`
    m.style.fontSize = '14px'
    m.style.lineHeight = '20px'
    m.style.paddingTop = '15px'
    m.style.paddingBottom = '15px'
    m.style.paddingLeft = '0'
    m.style.paddingRight = '0'

    const computed = textareaRef.current ? window.getComputedStyle(textareaRef.current) : null
    if (computed) {
      m.style.fontFamily = computed.fontFamily
      m.style.letterSpacing = computed.letterSpacing
      m.style.fontWeight = computed.fontWeight
    }

    m.value = value || ' '
    return m.scrollHeight
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${INPUT_MIN_HEIGHT}px`
    const naturalHeight = el.scrollHeight
    const clampedHeight = Math.min(naturalHeight, INPUT_MAX_HEIGHT)
    el.style.height = `${clampedHeight}px`
    el.style.overflowY = naturalHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
    if (naturalHeight <= INPUT_MAX_HEIGHT) {
      el.scrollTop = 0
    }
    // Decide multiline mode against fixed inline-width measurement to avoid
    // expand/collapse bounce when layout switches between modes.
    const inlineHeight = measureInlineHeight(input)
    setIsMultiLine((prev) => {
      if (!prev) return inlineHeight > MULTILINE_ENTER_HEIGHT
      return inlineHeight > MULTILINE_EXIT_HEIGHT
    })
    if (!input) {
      el.scrollLeft = 0
      el.scrollTop = 0
    }
  }, [attachments.length, input, measureInlineHeight])

  useLayoutEffect(() => { autoResize() }, [attachments.length, input, isMultiLine, autoResize])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (measureRef.current) {
        measureRef.current.remove()
        measureRef.current = null
      }
      if (hintIdleTimerRef.current) clearTimeout(hintIdleTimerRef.current)
      if (hintHideTimerRef.current) clearTimeout(hintHideTimerRef.current)
    }
  }, [])

  const hideActionHints = useCallback(() => {
    setShowActionHints(false)
    if (hintIdleTimerRef.current) {
      clearTimeout(hintIdleTimerRef.current)
      hintIdleTimerRef.current = null
    }
    if (hintHideTimerRef.current) {
      clearTimeout(hintHideTimerRef.current)
      hintHideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!hasPendingComposerContent || isBusy || isConnecting || voiceState !== 'idle') {
      hideActionHints()
      return
    }

    setShowActionHints(false)
    if (hintIdleTimerRef.current) clearTimeout(hintIdleTimerRef.current)
    if (hintHideTimerRef.current) clearTimeout(hintHideTimerRef.current)

    hintIdleTimerRef.current = setTimeout(() => {
      setShowActionHints(true)
      hintHideTimerRef.current = setTimeout(() => {
        setShowActionHints(false)
      }, ACTION_HINT_VISIBLE_MS)
    }, ACTION_HINT_IDLE_MS)

    return () => {
      if (hintIdleTimerRef.current) clearTimeout(hintIdleTimerRef.current)
      if (hintHideTimerRef.current) clearTimeout(hintHideTimerRef.current)
    }
  }, [attachments.length, hasPendingComposerContent, hideActionHints, input, isBusy, isConnecting, voiceState])

  // ─── Send ───
  const handleQueue = useCallback(() => {
    hideActionHints()
    const prompt = input.trim()
    if (!prompt && attachments.length === 0) return
    enqueueDraft(prompt)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
    }
  }, [attachments.length, enqueueDraft, input])

  const handleSend = useCallback(async (run: boolean) => {
    if (submitLockRef.current) return
    hideActionHints()
    const prompt = input.trim()
    if (!prompt && queueCount === 0 && attachments.length === 0) return
    if (isConnecting) return
    if (prompt || attachments.length > 0) {
      enqueueDraft(prompt)
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
      }
    }
    submitLockRef.current = true
    setIsSubmitting(true)
    try {
      await sendQueuedItems(run)
    } finally {
      submitLockRef.current = false
      setIsSubmitting(false)
    }
  }, [attachments.length, enqueueDraft, hideActionHints, input, isConnecting, queueCount, sendQueuedItems])

  // ─── Keyboard ───
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (e.repeat) return
      if (e.metaKey || e.ctrlKey) {
        void handleSend(true)
      } else {
        handleQueue()
      }
    }
    if (e.key === 'Escape') { window.clui.hideWindow() }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setShowActionHints(false)
    setInput(e.target.value)
  }

  // ─── Paste image ───
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const attachment = await window.clui.pasteImage(dataUrl)
          if (attachment) addAttachments([attachment])
        }
        reader.readAsDataURL(blob)
        return
      }
    }
  }, [addAttachments])

  // ─── Voice ───
  const cancelledRef = useRef(false)

  const stopRecording = useCallback(() => {
    cancelledRef.current = false
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  const startRecording = useCallback(async () => {
    setVoiceError(null)
    chunksRef.current = []
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceError('Microphone permission denied.')
      return
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      if (cancelledRef.current) { cancelledRef.current = false; setVoiceState('idle'); return }
      if (chunksRef.current.length === 0) { setVoiceState('idle'); return }
      setVoiceState('transcribing')
      try {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const wavBase64 = await blobToWavBase64(blob)
        const result = await window.clui.transcribeAudio(wavBase64)
        if (result.error) setVoiceError(result.error)
        else if (result.transcript) setInput((prev) => (prev ? `${prev} ${result.transcript}` : result.transcript!))
      } catch (err: any) { setVoiceError(`Voice failed: ${err.message}`) }
      finally { setVoiceState('idle') }
    }
    recorder.onerror = () => { stream.getTracks().forEach((t) => t.stop()); setVoiceError('Recording failed.'); setVoiceState('idle') }
    mediaRecorderRef.current = recorder
    setVoiceState('recording')
    recorder.start()
  }, [])

  const handleVoiceToggle = useCallback(() => {
    if (voiceState === 'recording') stopRecording()
    else if (voiceState === 'idle') void startRecording()
  }, [voiceState, startRecording, stopRecording])

  return (
    <div ref={wrapperRef} data-clui-ui className="flex flex-col w-full relative">
      {attachments.length > 0 && (
        <div style={{ paddingTop: 6, paddingBottom: 4 }}>
          <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
        </div>
      )}

      {/* Single-line: inline controls. Multi-line: controls in bottom row */}
      <div className="w-full" style={{ minHeight: 50 }}>
        {isMultiLine ? (
          <div className="w-full">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isConnecting
                  ? 'Initializing...'
                  : voiceState === 'recording'
                    ? 'Recording... ✓ to confirm, ✕ to cancel'
                    : voiceState === 'transcribing'
                      ? 'Transcribing...'
                      : isBusy
                        ? 'Sending to Warp...'
                        : 'Type a prompt, press Enter to queue...'
              }
              rows={1}
              className="w-full bg-transparent resize-none"
              style={{
                fontSize: 14,
                lineHeight: '20px',
                color: colors.textPrimary,
                minHeight: 20,
                maxHeight: INPUT_MAX_HEIGHT,
                paddingTop: 11,
                paddingBottom: 2,
              }}
            />

            <div className="flex items-center justify-end gap-1" style={{ marginTop: 0, paddingBottom: 4 }}>
              <AnimatePresence>
                {voiceState !== 'recording' && (
                  <motion.div key="send" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }} className="flex items-center gap-1">
                    <div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        className={`h-9 rounded-full px-3 flex items-center gap-2 transition-all text-[11px] font-medium ${showActionHints ? 'justify-between' : 'justify-center'}`}
                        style={{ background: colors.surfacePrimary, color: canQueue ? colors.textPrimary : colors.textTertiary, border: `1px solid ${colors.toolBorder}`, minWidth: showActionHints ? 104 : 82, opacity: canQueue ? 1 : 0.55 }}
                        onClick={handleQueue}
                        disabled={!canQueue}
                        title="Queue current input"
                      >
                        <span>Queue</span>
                        {showActionHints && <InlineKeycap label="↩" />}
                      </button>
                    </div>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      className="h-9 rounded-full px-3 flex items-center justify-center transition-colors text-[11px] font-medium"
                      style={{ background: colors.surfacePrimary, color: canSend ? colors.textPrimary : colors.textTertiary, border: `1px solid ${colors.toolBorder}`, opacity: canSend ? 1 : 0.55 }}
                      onClick={() => void handleSend(false)}
                      disabled={!canSend}
                      title="Send queue to Warp"
                    >
                      Send
                    </button>
                    <div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        className={`h-9 rounded-full px-3 flex items-center gap-2 transition-all ${showActionHints ? 'justify-between' : 'justify-center'}`}
                        style={{ background: colors.sendBg, color: colors.textOnAccent, minWidth: showActionHints ? 116 : 68, opacity: canSend ? 1 : 0.45 }}
                        onClick={() => void handleSend(true)}
                        disabled={!canSend}
                        title="Send queue to Warp and run"
                      >
                        <ArrowUp size={16} weight="bold" />
                        {showActionHints && <InlineKeycap label="⌘↩" accent />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="flex items-center w-full" style={{ minHeight: 50 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isConnecting
                  ? 'Initializing...'
                  : voiceState === 'recording'
                    ? 'Recording... ✓ to confirm, ✕ to cancel'
                    : voiceState === 'transcribing'
                      ? 'Transcribing...'
                      : isBusy
                        ? 'Sending to Warp...'
                        : 'Type a prompt, press Enter to queue...'
              }
              rows={1}
              className="flex-1 bg-transparent resize-none"
              style={{
                fontSize: 14,
                lineHeight: '20px',
                color: colors.textPrimary,
                minHeight: 20,
                maxHeight: INPUT_MAX_HEIGHT,
                paddingTop: 15,
                paddingBottom: 15,
              }}
            />

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <AnimatePresence>
                {voiceState !== 'recording' && (
                  <motion.div key="send" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }} className="flex items-center gap-1">
                    <div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleQueue}
                        className={`h-9 rounded-full px-3 flex items-center gap-2 transition-all text-[11px] font-medium ${showActionHints ? 'justify-between' : 'justify-center'}`}
                        style={{ background: colors.surfacePrimary, color: canQueue ? colors.textPrimary : colors.textTertiary, border: `1px solid ${colors.toolBorder}`, minWidth: showActionHints ? 104 : 82, opacity: canQueue ? 1 : 0.55 }}
                        disabled={!canQueue}
                        title="Queue current input"
                      >
                        <span>Queue</span>
                        {showActionHints && <InlineKeycap label="↩" />}
                      </button>
                    </div>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleSend(false)}
                      className="h-9 rounded-full px-3 flex items-center justify-center transition-colors text-[11px] font-medium"
                      style={{ background: colors.surfacePrimary, color: canSend ? colors.textPrimary : colors.textTertiary, border: `1px solid ${colors.toolBorder}`, opacity: canSend ? 1 : 0.55 }}
                      disabled={!canSend}
                      title="Send queue to Warp"
                    >
                      Send
                    </button>
                    <div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void handleSend(true)}
                        className={`h-9 rounded-full px-3 flex items-center gap-2 transition-all ${showActionHints ? 'justify-between' : 'justify-center'}`}
                        style={{ background: colors.sendBg, color: colors.textOnAccent, minWidth: showActionHints ? 116 : 68, opacity: canSend ? 1 : 0.45 }}
                        disabled={!canSend}
                        title="Send queue to Warp and run"
                      >
                        <ArrowUp size={16} weight="bold" />
                        {showActionHints && <InlineKeycap label="⌘↩" accent />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="px-1 pb-2 text-[11px]" style={{ color: colors.statusError }}>
          {voiceError}
        </div>
      )}
    </div>
  )
}

function InlineKeycap({ label, accent = false }: { label: string; accent?: boolean }) {
  const colors = useColors()
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: accent ? colors.textOnAccent : colors.textPrimary,
        background: accent ? 'rgba(0, 0, 0, 0.18)' : colors.surfaceHover,
        border: `1px solid ${accent ? 'rgba(255,255,255,0.14)' : colors.popoverBorder}`,
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  )
}

// ─── Voice Buttons (extracted to avoid duplication) ───

function VoiceButtons({ voiceState, isConnecting, colors, onToggle, onCancel, onStop }: {
  voiceState: VoiceState
  isConnecting: boolean
  colors: ReturnType<typeof useColors>
  onToggle: () => void
  onCancel: () => void
  onStop: () => void
}) {
  return (
    <AnimatePresence mode="wait">
      {voiceState === 'recording' ? (
        <motion.div
          key="voice-controls"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.12 }}
          className="flex items-center gap-1"
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: colors.surfaceHover, color: colors.textTertiary }}
            title="Cancel recording"
          >
            <X size={15} weight="bold" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onStop}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: colors.accent, color: colors.textOnAccent }}
            title="Confirm recording"
          >
            <Check size={15} weight="bold" />
          </button>
        </motion.div>
      ) : voiceState === 'transcribing' ? (
        <motion.div key="transcribing" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
          <button
            disabled
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: colors.micBg, color: colors.micColor }}
          >
            <SpinnerGap size={16} className="animate-spin" />
          </button>
        </motion.div>
      ) : (
        <motion.div key="mic" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
            disabled={isConnecting}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: colors.micBg,
              color: isConnecting ? colors.micDisabled : colors.micColor,
            }}
            title="Voice input"
          >
            <Microphone size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Audio conversion: WebM blob → WAV base64 ───

async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()
  const mono = mixToMono(decoded)
  const inputRms = rmsLevel(mono)
  if (inputRms < 0.003) {
    throw new Error('No voice detected. Check microphone permission and speak closer to the mic.')
  }
  const resampled = resampleLinear(mono, decoded.sampleRate, 16000)
  const normalized = normalizePcm(resampled)
  const wavBuffer = encodeWav(normalized, 16000)
  return bufferToBase64(wavBuffer)
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels <= 1) return buffer.getChannelData(0)

  const mono = new Float32Array(length)
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channel = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) mono[i] += channel[i]
  }
  const inv = 1 / numberOfChannels
  for (let i = 0; i < length; i++) mono[i] *= inv
  return mono
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input
  const ratio = inRate / outRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const t = pos - i0
    output[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return output
}

function normalizePcm(samples: Float32Array): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
  }
  if (peak < 1e-4 || peak > 0.95) return samples

  const gain = Math.min(0.95 / peak, 8)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  return Math.sqrt(sumSq / samples.length)
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, numSamples * 2, true)
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }
  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
