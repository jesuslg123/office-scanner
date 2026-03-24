import { useEffect, useState } from 'react'

import type { TagOption } from '../types'

type TagDialogProps = {
  open: boolean
  barcode: string | null
  availableTags: TagOption[]
  initialSelectedTags: string[]
  onCancel: () => void
  onSave: (tags: string[]) => Promise<void>
}

export function TagDialog({
  open,
  barcode,
  availableTags,
  initialSelectedTags,
  onCancel,
  onSave,
}: TagDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(initialSelectedTags)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedTags(initialSelectedTags)
  }, [initialSelectedTags, open, barcode])

  if (!open || !barcode) {
    return null
  }

  const toggleTag = (tagId: string) => {
    setSelectedTags((current) =>
      current.includes(tagId)
        ? current.filter((value) => value !== tagId)
        : [...current, tagId],
    )
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      await onSave(selectedTags)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="tag-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <p className="eyebrow">Tag scanned barcode</p>
        <h2 id="tag-dialog-title">Assign tags</h2>
        <p className="dialog-barcode">{barcode}</p>
        <div className="tag-grid">
          {availableTags.map((tag) => {
            const isActive = selectedTags.includes(tag.id)

            return (
              <button
                aria-pressed={isActive}
                className={`tag-chip ${isActive ? 'active' : ''}`}
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                type="button"
              >
                {tag.label}
              </button>
            )
          })}
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel scan
          </button>
          <button
            className="primary-button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? 'Saving...' : 'Save item'}
          </button>
        </div>
      </section>
    </div>
  )
}
