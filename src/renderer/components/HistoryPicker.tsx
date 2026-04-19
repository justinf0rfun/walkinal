import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Clock, ChatCircle, MagnifyingGlass } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import type { HistoryEntry, HistoryIndexEntry } from '../../shared/types'

const HISTORY_PAGE_SIZE = 50
const HISTORY_SEARCH_DEBOUNCE_MS = 250
const HISTORY_PREVIEW_HOVER_DELAY_MS = 180
type HistoryModeFilter = 'all' | 'draft' | 'run'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(text: string, query: string, highlightColor: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return text

  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi')
  const parts = text.split(pattern)
  if (parts.length === 1) return text
  const lowerQuery = normalizedQuery.toLowerCase()

  return parts.map((part, index) => (
    part.toLowerCase() === lowerQuery
      ? (
        <mark
          key={`${part}-${index}`}
          style={{
            background: highlightColor,
            color: 'inherit',
            padding: '0 2px',
            borderRadius: 4,
            fontWeight: 700,
            boxShadow: `inset 0 -1px 0 ${highlightColor}`,
          }}
        >
          {part}
        </mark>
      )
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ))
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}

function estimateSize(text: string): number {
  return new TextEncoder().encode(text).length
}

export function HistoryPicker() {
  const restoreHistoryEntry = useSessionStore((s) => s.restoreHistoryEntry)
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<HistoryIndexEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [queryInput, setQueryInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [modeFilter, setModeFilter] = useState<HistoryModeFilter>('all')
  const [nextOffset, setNextOffset] = useState(0)
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null)
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewOffsetTop, setPreviewOffsetTop] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const previewCacheRef = useRef<Record<string, HistoryEntry>>({})
  const previewHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewRequestIdRef = useRef<string | null>(null)
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    if (isExpanded) {
      const top = rect.bottom + 6
      setPos({
        top,
        right: window.innerWidth - rect.right,
        maxHeight: window.innerHeight - top - 12,
      })
    } else {
      setPos({
        bottom: window.innerHeight - rect.top + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isExpanded])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.clui.listWalkinalHistoryIndex({
        limit: HISTORY_PAGE_SIZE,
        offset: 0,
        query: appliedQuery,
        mode: modeFilter,
      })
      setEntries(result)
      setHasMore(result.length === HISTORY_PAGE_SIZE)
      setNextOffset(result.length)
    } catch {
      setEntries([])
      setHasMore(false)
      setNextOffset(0)
    }
    setLoading(false)
  }, [appliedQuery, modeFilter])

  const loadMore = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.clui.listWalkinalHistoryIndex({
        limit: HISTORY_PAGE_SIZE,
        offset: nextOffset,
        query: appliedQuery,
        mode: modeFilter,
      })
      setEntries((prev) => [...prev, ...result])
      setHasMore(result.length === HISTORY_PAGE_SIZE)
      setNextOffset((prev) => prev + result.length)
    } catch {
      setHasMore(false)
    }
    setLoading(false)
  }, [appliedQuery, nextOffset, modeFilter])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (!open) {
      updatePos()
      void loadSessions()
    }
    setOpen((o) => !o)
  }

  const handleSelect = async (entry: HistoryIndexEntry) => {
    setOpen(false)
    const full = await window.clui.importWalkinalHistory(entry.id)
    if (full) {
      void restoreHistoryEntry(full)
    }
  }

  const handleSearchSubmit = useCallback(() => {
    setAppliedQuery(queryInput.trim())
  }, [queryInput])

  const normalizedQuery = appliedQuery.trim()

  const clearPreviewHoverTimer = useCallback(() => {
    if (previewHoverTimerRef.current) {
      clearTimeout(previewHoverTimerRef.current)
      previewHoverTimerRef.current = null
    }
  }, [])

  const closePreview = useCallback(() => {
    clearPreviewHoverTimer()
    previewRequestIdRef.current = null
    setHoveredEntryId(null)
    setPreviewEntryId(null)
    setPreviewEntry(null)
    setPreviewLoading(false)
  }, [clearPreviewHoverTimer])

  const openPreview = useCallback(async (entry: HistoryIndexEntry) => {
    clearPreviewHoverTimer()
    setPreviewEntryId(entry.id)

    const cached = previewCacheRef.current[entry.id]
    if (cached) {
      setPreviewEntry(cached)
      setPreviewLoading(false)
      return
    }

    setPreviewEntry(null)
    setPreviewLoading(true)
    previewRequestIdRef.current = entry.id

    try {
      const full = await window.clui.importWalkinalHistory(entry.id)
      if (!full || previewRequestIdRef.current !== entry.id) return
      previewCacheRef.current[entry.id] = full
      setPreviewEntry(full)
    } finally {
      if (previewRequestIdRef.current === entry.id) {
        setPreviewLoading(false)
      }
    }
  }, [clearPreviewHoverTimer])

  const handleEntryMouseEnter = useCallback((entry: HistoryIndexEntry, element: HTMLButtonElement) => {
    clearPreviewHoverTimer()
    setHoveredEntryId(entry.id)
    if (popoverRef.current) {
      const entryRect = element.getBoundingClientRect()
      const popoverRect = popoverRef.current.getBoundingClientRect()
      setPreviewOffsetTop(Math.max(0, entryRect.top - popoverRect.top - 6))
    }
    previewHoverTimerRef.current = setTimeout(() => {
      void openPreview(entry)
    }, HISTORY_PREVIEW_HOVER_DELAY_MS)
  }, [clearPreviewHoverTimer, openPreview])

  useEffect(() => {
    if (!open) return
    void loadSessions()
  }, [open, loadSessions])

  useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => {
      setAppliedQuery(queryInput.trim())
    }, HISTORY_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeoutId)
  }, [open, queryInput])

  useEffect(() => () => {
    clearPreviewHoverTimer()
  }, [clearPreviewHoverTimer])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Open sent history"
      >
        <Clock size={13} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          data-clui-ui
          initial={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          transition={{ duration: 0.12 }}
          style={{
            position: 'fixed',
            ...(pos.top != null ? { top: pos.top } : {}),
            ...(pos.bottom != null ? { bottom: pos.bottom } : {}),
            right: pos.right,
            pointerEvents: 'auto',
            width: 280,
          }}
          onMouseLeave={closePreview}
        >
          <div
            ref={popoverRef}
            className="rounded-xl"
            style={{
              width: 280,
              background: colors.popoverBg,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: colors.popoverShadow,
              border: `1px solid ${colors.popoverBorder}`,
              ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
          >
            <div className="px-3 py-2 text-[11px] font-medium flex-shrink-0" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.popoverBorder}` }}>
              Sent History
            </div>

            <div className="px-3 py-2 border-b" style={{ borderBottomColor: colors.popoverBorder }}>
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: colors.surfaceHover, border: `1px solid ${colors.popoverBorder}` }}
              >
                <MagnifyingGlass size={12} style={{ color: colors.textTertiary }} />
                <input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSearchSubmit()
                    }
                  }}
                  placeholder="Search history..."
                  className="flex-1 bg-transparent outline-none text-[11px]"
                  style={{ color: colors.textPrimary }}
                />
              </div>
              <div className="flex gap-1.5 mt-2">
                {[
                  { value: 'all' as const, label: 'All' },
                  { value: 'draft' as const, label: 'Sent' },
                  { value: 'run' as const, label: 'Sent and Run' },
                ].map((option) => {
                  const active = modeFilter === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => setModeFilter(option.value)}
                      className="text-[10px] rounded-full px-2.5 py-1 transition-colors"
                      style={{
                        color: active ? colors.textOnAccent : colors.textSecondary,
                        background: active ? colors.accent : colors.surfaceHover,
                        border: `1px solid ${active ? colors.accent : colors.popoverBorder}`,
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight != null ? undefined : 180 }}>
              {loading && (
                <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                  Loading...
                </div>
              )}

              {!loading && entries.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                  {normalizedQuery ? (
                    <>
                      <div style={{ color: colors.textPrimary }}>No results for "{normalizedQuery}"</div>
                      <div className="mt-1">Try a different keyword or clear the search.</div>
                    </>
                  ) : (
                    'No history yet'
                  )}
                </div>
              )}

              {!loading && entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry)}
                  onMouseEnter={(e) => { void handleEntryMouseEnter(entry, e.currentTarget) }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
                  style={{
                    background: previewEntryId === entry.id || hoveredEntryId === entry.id ? colors.surfaceHover : 'transparent',
                    boxShadow: previewEntryId === entry.id || hoveredEntryId === entry.id ? `inset 0 0 0 1px ${colors.accentBorder}` : 'none',
                  }}
                >
                  <ChatCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>
                      {renderHighlightedText(entry.title || entry.id.substring(0, 8), normalizedQuery, colors.accentSoft)}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                      <span>{formatTimeAgo(entry.timestamp)}</span>
                      <span>{entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="text-[10px] mt-1 line-clamp-2" style={{ color: colors.textTertiary }}>
                      {renderHighlightedText(entry.contentPreview, normalizedQuery, colors.accentSoft)}
                    </div>
                  </div>
                </button>
              ))}

              {!loading && hasMore && (
                <div className="px-3 py-2">
                  <button
                    onClick={() => { void loadMore() }}
                    className="w-full text-[11px] rounded-full px-3 py-1.5 transition-colors"
                    style={{
                      color: colors.textPrimary,
                      background: colors.surfaceHover,
                      border: `1px solid ${colors.popoverBorder}`,
                    }}
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          </div>
          {(previewEntryId || previewLoading || previewEntry) && (
            <div
              className="rounded-xl"
              style={{
                position: 'absolute',
                top: previewOffsetTop,
                left: 290,
                width: 320,
                background: colors.popoverBg,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: colors.popoverShadow,
                border: `1px solid ${colors.popoverBorder}`,
                ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column' as const,
              }}
            >
              <div className="px-3 py-2 text-[11px] font-medium flex-shrink-0" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.popoverBorder}` }}>
                Preview
              </div>
              <div className="overflow-y-auto px-3 py-3" style={{ maxHeight: pos.maxHeight != null ? undefined : 220 }}>
                {previewLoading && (
                  <div className="text-[11px]" style={{ color: colors.textTertiary }}>
                    Loading preview...
                  </div>
                )}

                {!previewLoading && previewEntry && (
                  <>
                    <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                      {previewEntry.title || previewEntry.id.substring(0, 8)}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
                      {new Date(previewEntry.timestamp).toLocaleString()} • {previewEntry.itemCount} item{previewEntry.itemCount === 1 ? '' : 's'}
                    </div>
                    <div
                      className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-5"
                      style={{ color: colors.textSecondary }}
                    >
                      {previewEntry.content}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
