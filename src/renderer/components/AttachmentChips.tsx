import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Image, FileCode, File } from '@phosphor-icons/react'
import { useColors } from '../theme'
import type { Attachment } from '../../shared/types'

const FILE_ICONS: Record<string, React.ReactNode> = {
  'image/png': <Image size={14} />,
  'image/jpeg': <Image size={14} />,
  'image/gif': <Image size={14} />,
  'image/webp': <Image size={14} />,
  'image/svg+xml': <Image size={14} />,
  'text/plain': <FileText size={14} />,
  'text/markdown': <FileText size={14} />,
  'application/json': <FileCode size={14} />,
  'text/yaml': <FileCode size={14} />,
  'text/toml': <FileCode size={14} />,
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) {
  const colors = useColors()
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null)

  if (attachments.length === 0) return null

  return (
    <>
      <div data-clui-ui className="flex gap-1.5 pb-1" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
        <AnimatePresence mode="popLayout">
          {attachments.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-1.5 group flex-shrink-0"
              style={{
                background: colors.surfacePrimary,
                border: `1px solid ${colors.surfaceSecondary}`,
                borderRadius: 14,
                padding: a.dataUrl ? '3px 8px 3px 3px' : '4px 8px',
                maxWidth: 200,
              }}
            >
              {a.dataUrl ? (
                <button
                  onClick={() => setPreviewAttachment(a)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                  title="Preview image"
                >
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="rounded-[10px] object-cover flex-shrink-0"
                    style={{ width: 24, height: 24 }}
                  />
                  <span
                    className="text-[11px] font-medium truncate min-w-0 flex-1"
                    style={{ color: colors.textPrimary }}
                  >
                    {a.name}
                  </span>
                </button>
              ) : (
                <>
                  <span className="flex-shrink-0" style={{ color: colors.textTertiary }}>
                    {FILE_ICONS[a.mimeType || ''] || <File size={14} />}
                  </span>
                  <span
                    className="text-[11px] font-medium truncate min-w-0 flex-1"
                    style={{ color: colors.textPrimary }}
                  >
                    {a.name}
                  </span>
                </>
              )}

              <button
                onClick={() => onRemove(a.id)}
                className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: colors.textTertiary }}
              >
                <X size={10} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <ImagePreviewOverlay attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </>
  )
}

function ImagePreviewOverlay({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const colors = useColors()

  if (!attachment?.dataUrl) return null

  return (
    <AnimatePresence>
      <motion.div
        key={attachment.id}
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
            <span className="truncate">{attachment.name}</span>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ color: colors.textTertiary, background: colors.surfaceHover }}
              title="Close preview"
            >
              <X size={12} />
            </button>
          </div>
          <img
            src={attachment.dataUrl}
            alt={attachment.name}
            style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(80vh - 38px)', objectFit: 'contain' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
