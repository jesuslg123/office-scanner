import { useEffect, useState } from 'react'

import type { TagDraft, TagOption } from '../types'

type TagDialogProps = {
  open: boolean
  barcode: string | null
  availableTags: TagOption[]
  initialSelectedTags: string[]
  initialComment: string
  onCancel: () => void
  onSave: (draft: TagDraft) => Promise<void>
}

export function TagDialog({
  open,
  barcode,
  availableTags,
  initialSelectedTags,
  initialComment,
  onCancel,
  onSave,
}: TagDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(initialSelectedTags)
  const [customTagInput, setCustomTagInput] = useState('')
  const [comment, setComment] = useState(initialComment)
  const [isSaving, setIsSaving] = useState(false)
  const preloadedLabels = new Set(availableTags.map((tag) => tag.label))

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedTags(initialSelectedTags)
    setCustomTagInput('')
    setComment(initialComment)
  }, [barcode, initialComment, initialSelectedTags, open])

  if (!open || !barcode) {
    return null
  }

  const toggleTag = (tagValue: string) => {
    setSelectedTags((current) =>
      current.includes(tagValue)
        ? current.filter((value) => value !== tagValue)
        : [...current, tagValue],
    )
  }

  const addCustomTags = () => {
    const nextTags = customTagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (nextTags.length === 0) {
      return
    }

    setSelectedTags((current) => [...new Set([...current, ...nextTags])])
    setCustomTagInput('')
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      await onSave({
        tags: selectedTags,
        comment,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const customSelectedTags = selectedTags.filter((tag) => !preloadedLabels.has(tag))

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
      role="presentation"
    >
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
            const isActive = selectedTags.includes(tag.label)

            return (
              <button
                aria-pressed={isActive}
                className={`tag-chip ${isActive ? 'active' : ''}`}
                key={tag.id}
                onClick={() => toggleTag(tag.label)}
                type="button"
              >
                {tag.label}
              </button>
            )
          })}
        </div>
        <label className="field-group">
          <span className="field-label">Custom tags</span>
          <div className="field-row">
            <input
              className="text-input"
              onChange={(event) => setCustomTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustomTags()
                }
              }}
              placeholder="Add tags separated by commas"
              type="text"
              value={customTagInput}
            />
            <button
              className="secondary-button tag-add-button"
              onClick={addCustomTags}
              type="button"
            >
              Add
            </button>
          </div>
        </label>
        {customSelectedTags.length > 0 ? (
          <div className="tag-row compact">
            {customSelectedTags.map((tag) => (
              <button
                aria-pressed="true"
                className="tag-chip active"
                key={tag}
                onClick={() => toggleTag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
        <label className="field-group">
          <span className="field-label">Comment</span>
          <textarea
            className="text-area"
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a note for this barcode"
            rows={3}
            value={comment}
          />
        </label>
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
