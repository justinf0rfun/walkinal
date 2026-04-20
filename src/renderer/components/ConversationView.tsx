import React, { useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PencilSimple, FolderOpen, Trash, ArrowBendUpLeft, ArrowUp, ArrowDown, X, CaretDown, CaretUp,
} from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors, useThemeStore } from '../theme'
import type { QueueItem, SentEntry } from '../../shared/types'

// ─── Constants ───

const DRAFT_PANEL_MAX_HEIGHT_EXPANDED = 280
const DRAFT_PANEL_MAX_HEIGHT_COMPACT = 220

// ─── Main Component ───

export function ConversationView() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const removeQueueItem = useSessionStore((s) => s.removeQueueItem)
  const editQueueItem = useSessionStore((s) => s.editQueueItem)
  const moveQueueItem = useSessionStore((s) => s.moveQueueItem)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevTabIdRef = useRef(activeTabId)
  const colors = useColors()
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const tab = tabs.find((t) => t.id === activeTabId)

  // Reset render offset and scroll state when switching tabs
  useEffect(() => {
    if (activeTabId !== prevTabIdRef.current) {
      prevTabIdRef.current = activeTabId
      isNearBottomRef.current = true
    }
  }, [activeTabId])

  // Track whether user is scrolled near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  // Auto-scroll when content changes and user is near bottom.
  const sentCount = tab?.sentEntries.length ?? 0
  const lastEntry = tab?.sentEntries[tab.sentEntries.length - 1]
  const queueCount = tab?.queueItems.length ?? 0
  const scrollTrigger = `${sentCount}:${lastEntry?.contentPreview?.length ?? 0}:${queueCount}`

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scrollTrigger])

  useEffect(() => {
    if (!historyExpanded || !scrollRef.current) return
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      isNearBottomRef.current = true
    })
  }, [historyExpanded, sentCount])

  if (!tab) return null

  const isRunning = tab.status === 'running' || tab.status === 'connecting'
  const isFailed = tab.status === 'failed'

  if (tab.sentEntries.length === 0 && tab.queueItems.length === 0) {
    return <EmptyState />
  }

  const handleEditQueueItem = (itemId: string) => {
    const content = editQueueItem(itemId)
    if (content) {
      window.dispatchEvent(new CustomEvent('walkinal:set-input', { detail: content }))
    }
  }

  return (
    <div data-clui-ui>
      <div
        className="flex flex-col overflow-hidden"
        style={{
          maxHeight: expandedUI ? 560 : 420,
        }}
      >
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-2 conversation-selectable"
          style={{ paddingBottom: 20 }}
          onScroll={handleScroll}
        >
          {tab.sentEntries.length > 0 && (
            <div className="pb-3">
              <button
                onClick={() => setHistoryExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between text-left rounded-xl px-3 py-2 transition-colors sticky top-0"
                style={{
                  marginBottom: historyExpanded ? 8 : 0,
                  background: colors.surfaceHover,
                  border: `1px solid ${colors.toolBorder}`,
                  color: colors.textSecondary,
                  zIndex: 3,
                }}
              >
                <span className="text-[11px] uppercase tracking-[0.12em]">Sent History</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span style={{ color: colors.textTertiary }}>
                    {tab.sentEntries.length} {tab.sentEntries.length === 1 ? 'item' : 'items'}
                  </span>
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{
                      color: colors.accent,
                      background: colors.accentLight,
                      border: `1px solid ${colors.accentBorder}`,
                    }}
                  >
                    {historyExpanded ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
                    <span>{historyExpanded ? 'Hide' : 'Show'}</span>
                  </span>
                </span>
              </button>
              {historyExpanded && (
                <div className="space-y-2">
                  {tab.sentEntries.map((entry) => (
                    <SentHistoryItem key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {(tab.queueItems.length > 0 || tab.sentEntries.length > 0) && (
          <div
            className="px-4 pt-3 pb-2 flex-shrink-0"
            style={{
              minHeight: expandedUI ? 190 : 156,
              borderTop: `1px solid ${colors.toolBorder}`,
              background: `linear-gradient(to bottom, ${colors.containerBg}, ${colors.containerBgCollapsed})`,
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.12em] mb-2" style={{ color: colors.textTertiary }}>
              Draft Queue
            </div>
            {tab.queueItems.length > 0 ? (
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: expandedUI ? DRAFT_PANEL_MAX_HEIGHT_EXPANDED : DRAFT_PANEL_MAX_HEIGHT_COMPACT }}>
                {tab.queueItems.map((item, index) => (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    total={tab.queueItems.length}
                    onEdit={() => handleEditQueueItem(item.id)}
                    onRemove={() => removeQueueItem(item.id)}
                    onMoveUp={() => moveQueueItem(item.id, 'up')}
                    onMoveDown={() => moveQueueItem(item.id, 'down')}
                  />
                ))}
              </div>
            ) : (
              <div
                className="rounded-2xl px-3 py-3 text-[12px]"
                style={{
                  minHeight: expandedUI ? 86 : 72,
                  display: 'flex',
                  alignItems: 'center',
                  color: colors.textTertiary,
                  background: colors.surfacePrimary,
                  border: `1px solid ${colors.toolBorder}`,
                }}
              >
                Queue is empty. Add text or attachments to prepare the next send.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity row — overlaps bottom of scroll area as a fade strip */}
      <div
        className="flex items-center justify-between px-4 relative"
        style={{
          height: 28,
          minHeight: 28,
          marginTop: -28,
          background: `linear-gradient(to bottom, transparent, ${colors.containerBg} 70%)`,
          zIndex: 2,
        }}
      >
        {/* Left: status indicator */}
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          {isRunning && (
            <span className="flex items-center gap-1.5">
              <span className="flex gap-[3px]">
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '0ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '150ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '300ms' }} />
              </span>
              <span style={{ color: colors.textSecondary }}>{tab.currentActivity || 'Working...'}</span>
            </span>
          )}

          {isFailed && (
            <span className="flex items-center gap-1.5">
              <span style={{ color: colors.statusError, fontSize: 11 }}>Failed</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty State (directory picker before first message) ───

function EmptyState() {
  const setBaseDirectory = useSessionStore((s) => s.setBaseDirectory)
  const colors = useColors()

  const handleChooseFolder = async () => {
    const dir = await window.clui.selectDirectory()
    if (dir) {
      setBaseDirectory(dir)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-3 gap-1.5"
      style={{ minHeight: 140 }}
    >
      <button
        onClick={handleChooseFolder}
        className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
        style={{
          color: colors.accent,
          background: colors.surfaceHover,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <FolderOpen size={13} />
        Choose folder
      </button>
      <span className="text-[11px]" style={{ color: colors.textTertiary }}>
        Press <strong style={{ color: colors.textSecondary }}>⌥ + Space</strong> to show/hide this overlay
      </span>
    </div>
  )
}

function QueueItemCard({
  item,
  index,
  total,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: QueueItem
  index: number
  total: number
  onEdit: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const colors = useColors()
  const label = item.type === 'text' ? 'Text' : item.type === 'screenshot' ? 'Image' : 'File'
  const preview = item.content.length > 140 ? `${item.content.slice(0, 137)}...` : item.content
  const [pulseMove, setPulseMove] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    setPulseMove(true)
    const timeout = setTimeout(() => setPulseMove(false), 220)
    return () => clearTimeout(timeout)
  }, [index])

  return (
    <>
      <div
        data-no-window-drag
        className="group rounded-2xl px-3 py-2"
        style={{
          background: pulseMove ? colors.surfaceHover : colors.surfacePrimary,
          border: `1px solid ${pulseMove ? colors.accent : colors.toolBorder}`,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            data-no-window-drag
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ color: colors.textTertiary, background: colors.surfaceHover, marginTop: 2 }}
            title="Queued item"
          >
            {index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.12em] mb-1" style={{ color: colors.textTertiary }}>
              {label}
            </div>
            {item.type === 'screenshot' && item.metadata?.dataUrl ? (
              <button
                onClick={() => setPreviewOpen(true)}
                className="w-full text-left"
                style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                title="Preview image"
              >
                <div className="text-[13px] leading-[1.5] whitespace-pre-wrap break-words" style={{ color: colors.textPrimary }}>
                  {preview}
                </div>
                <div className="text-[11px] mt-2 truncate" style={{ color: colors.textTertiary }} title={item.metadata.filePath}>
                  {item.metadata.filePath}
                </div>
              </button>
            ) : (
              <>
                <div className="text-[13px] leading-[1.5] whitespace-pre-wrap break-words" style={{ color: colors.textPrimary }}>
                  {preview}
                </div>
                {item.metadata?.filePath && (
                  <div className="text-[11px] mt-2 truncate" style={{ color: colors.textTertiary }} title={item.metadata.filePath}>
                    {item.metadata.filePath}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-25"
              style={{ color: colors.textSecondary, background: colors.surfaceHover }}
              title="Move up"
            >
              <ArrowUp size={13} />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-25"
              style={{ color: colors.textSecondary, background: colors.surfaceHover }}
              title="Move down"
            >
              <ArrowDown size={13} />
            </button>
            <button
              onClick={onEdit}
              className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: colors.textSecondary, background: colors.surfaceHover }}
              title="Edit queue item"
            >
              <PencilSimple size={13} />
            </button>
            <button
              onClick={onRemove}
              className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: colors.statusError, background: colors.statusErrorBg }}
              title="Remove queue item"
            >
              <Trash size={13} />
            </button>
          </div>
        </div>
      </div>
      {item.type === 'screenshot' && item.metadata?.dataUrl && (
        <QueueImagePreview
          open={previewOpen}
          name={item.metadata.fileName || 'Image'}
          dataUrl={item.metadata.dataUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  )
}

function QueueImagePreview({ open, name, dataUrl, onClose }: { open: boolean; name: string; dataUrl: string; onClose: () => void }) {
  const colors = useColors()

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.55)', zIndex: 80 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="rounded-2xl overflow-hidden"
        style={{
          maxWidth: 'min(80vw, 960px)',
          maxHeight: '80vh',
          background: colors.popoverBg,
          border: `1px solid ${colors.popoverBorder}`,
          boxShadow: colors.popoverShadow,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-3 py-2 flex items-center justify-between gap-3 text-[11px] font-medium"
          style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.popoverBorder}` }}
        >
          <span className="truncate">{name}</span>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ color: colors.textTertiary, background: colors.surfaceHover }}
            title="Close preview"
          >
            <Trash size={12} style={{ opacity: 0 }} />
            <X size={12} style={{ position: 'absolute' }} />
          </button>
        </div>
        <img
          src={dataUrl}
          alt={name}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(80vh - 38px)', objectFit: 'contain' }}
        />
      </motion.div>
    </motion.div>
  )
}

function SentHistoryItem({ entry }: { entry: SentEntry }) {
  const colors = useColors()
  const label = entry.mode === 'run' ? 'Sent and Run' : 'Sent Draft'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-2xl px-3 py-2"
      style={{
        background: colors.userBubble,
        border: `1px solid ${colors.toolBorder}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.12em] mb-1 flex items-center gap-1" style={{ color: colors.textTertiary }}>
        <ArrowBendUpLeft size={10} />
        {label}
      </div>
      <div className="text-[10px] mb-1" style={{ color: colors.textTertiary }}>
        {new Date(entry.timestamp).toLocaleString()} · {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}
      </div>
      <div className="text-[13px] leading-[1.5] whitespace-pre-wrap break-words" style={{ color: colors.textPrimary }}>
        {entry.contentPreview}
      </div>
    </motion.div>
  )
}
