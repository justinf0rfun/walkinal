import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { HistoryPicker } from './HistoryPicker'
import { SettingsPopover } from './SettingsPopover'
import { useColors } from '../theme'
import type { TabStatus } from '../../shared/types'

const TAB_CLICK_DELAY_MS = 180

function StatusDot({ status, hasUnread, isActive }: { status: TabStatus; hasUnread: boolean; isActive: boolean }) {
  const colors = useColors()
  let bg: string = colors.statusIdle
  let pulse = false

  if (isActive) {
    bg = colors.statusComplete
  } else if (status === 'dead' || status === 'failed') {
    bg = colors.statusError
  } else if (status === 'connecting' || status === 'running') {
    bg = colors.statusRunning
    pulse = true
  } else if (hasUnread) {
    bg = colors.statusComplete
  }

  return (
    <span
      className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${pulse ? 'animate-pulse-dot' : ''}`}
      style={{ background: bg }}
    />
  )
}

export function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const renameTab = useSessionStore((s) => s.renameTab)
  const createTab = useSessionStore((s) => s.createTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const colors = useColors()
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
    }
  }, [])

  const startRename = (tabId: string, title: string) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    setEditingTabId(tabId)
    setDraftTitle(title)
  }

  const commitRename = () => {
    if (!editingTabId) return
    const fallbackTitle = tabs.find((tab) => tab.id === editingTabId)?.title || 'New Tab'
    const nextTitle = draftTitle.trim() || fallbackTitle
    renameTab(editingTabId, nextTitle)
    setEditingTabId(null)
    setDraftTitle('')
  }

  const handleTabClick = (tabId: string) => {
    if (editingTabId) return
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }
    clickTimeoutRef.current = setTimeout(() => {
      selectTab(tabId)
      clickTimeoutRef.current = null
    }, TAB_CLICK_DELAY_MS)
  }

  const cancelRename = () => {
    setEditingTabId(null)
    setDraftTitle('')
  }

  return (
    <div
      data-clui-ui
      className="flex items-center no-drag"
      style={{ padding: '8px 0' }}
    >
      {/* Scrollable tabs area — clipped by master card edge */}
      <div className="relative min-w-0 flex-1">
        <div
          className="flex items-center gap-1 overflow-x-auto min-w-0"
          style={{
            scrollbarWidth: 'none',
            paddingLeft: 8,
            // Extra right breathing room so clipped tabs fade out before the edge.
            paddingRight: 14,
            // Right-only content fade so the parent card's own animated background
            // shows through cleanly in both collapsed and expanded states.
            maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
          }}
        >
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              const isEditing = tab.id === editingTabId
              return (
                <motion.div
                  key={tab.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => handleTabClick(tab.id)}
                  onDoubleClick={() => startRename(tab.id, tab.title)}
                  className="group flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0 max-w-[160px] transition-all duration-150"
                  style={{
                    background: isActive ? colors.tabActive : 'transparent',
                    border: isActive ? `1px solid ${colors.tabActiveBorder}` : '1px solid transparent',
                    borderRadius: 9999,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: isActive ? colors.textPrimary : colors.textTertiary,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <StatusDot status={tab.status} hasUnread={tab.hasUnread} isActive={isActive} />
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelRename()
                        }
                      }}
                      className="flex-1 bg-transparent outline-none min-w-0"
                      style={{ color: colors.textPrimary, fontSize: 12 }}
                    />
                  ) : (
                    <span className="truncate flex-1">{tab.title}</span>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                      className="flex-shrink-0 rounded-full w-4 h-4 flex items-center justify-center transition-opacity"
                      style={{
                        opacity: isActive ? 0.5 : 0,
                        color: colors.textSecondary,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = isActive ? '0.5' : '0' }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Pinned action buttons — always visible on the right */}
      <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 pr-2">
        <button
          onClick={() => createTab()}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
          style={{ color: colors.textTertiary }}
          title="New tab"
        >
          <Plus size={14} />
        </button>

        <HistoryPicker />

        <SettingsPopover />
      </div>
    </div>
  )
}
