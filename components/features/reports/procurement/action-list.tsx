"use client"

import { useId, useState } from "react"
import { ArrowDown, ArrowUp, Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import {
  mostUrgentIndex,
  urgencyForText,
  urgencySegments,
  type ReportAction,
} from "@/lib/domain/procurement-report"

// ============================================================================
// Priority Procurement Actions — a numbered list the stock office can edit,
// reorder, add to and remove from before printing.
//
// The sentence is what prints. On screen each line also carries small controls,
// which are marked `.no-print` and never reach the paper. Urgency is read from
// the text itself: anything that says "immediately" is an immediate action, and
// the first of those in the arranged order gets the red underline.
// ============================================================================

const iconButton =
  "w-11 h-11 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink-primary disabled:opacity-40 disabled:hover:bg-transparent"

function ActionSentence({ text, mostUrgent }: { text: string; mostUrgent: boolean }) {
  return (
    <>
      {urgencySegments(text).map((seg, i) =>
        seg.emphasis ? (
          <strong key={i} className={mostUrgent ? "rd-most-urgent" : "rd-urgent"}>
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

export function ActionList({
  actions,
  onChange,
  onRestore,
  canRestore,
}: {
  actions: ReportAction[]
  onChange: (next: ReportAction[]) => void
  onRestore: () => void
  canRestore: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const addId = useId()
  const urgent = mostUrgentIndex(actions)

  const update = (id: string, text: string) =>
    onChange(
      actions.map((a) => (a.id === id ? { ...a, text, urgency: urgencyForText(text, a.urgency) } : a)),
    )
  const remove = (id: string) => onChange(actions.filter((a) => a.id !== id))
  const move = (index: number, by: -1 | 1) => {
    const next = [...actions]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }
  const add = () => {
    const text = draft.trim()
    if (!text) return
    onChange([...actions, { id: `custom-${Date.now()}`, text, urgency: urgencyForText(text) }])
    setDraft("")
  }

  return (
    <div>
      {actions.length === 0 ? (
        <p className="rd-note">No priority actions. Add one below, or restore the suggestions.</p>
      ) : (
        <ol className="rd-actions">
          {actions.map((a, i) => (
            <li key={a.id}>
              {editingId === a.id ? (
                <div className="no-print rd-screen-only flex items-center gap-1">
                  <input
                    className="rd-edit-input"
                    aria-label={`Edit action ${i + 1}`}
                    value={a.text}
                    autoFocus
                    onChange={(e) => update(a.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") setEditingId(null)
                    }}
                  />
                  <button type="button" className={iconButton} aria-label="Done editing" onClick={() => setEditingId(null)}>
                    <Check className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              {/* The sentence itself; while editing it is shown only in print. */}
              <span className={editingId === a.id ? "rd-print-only" : undefined}>
                <ActionSentence text={a.text} mostUrgent={i === urgent} />
              </span>
              {editingId !== a.id && (
                <span className="no-print rd-screen-only inline-flex flex-wrap align-middle ml-1">
                  <button type="button" className={iconButton} aria-label={`Edit action ${i + 1}`} onClick={() => setEditingId(a.id)}>
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button type="button" className={iconButton} aria-label={`Move action ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={`Move action ${i + 1} down`}
                    disabled={i === actions.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button type="button" className={iconButton} aria-label={`Remove action ${i + 1}`} onClick={() => remove(a.id)}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="no-print rd-screen-only mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={addId} className="sr-only">
          New action
        </label>
        <input
          id={addId}
          className="rd-edit-input flex-1 min-w-[12rem]"
          placeholder="Add an action…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add()
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="h-11 px-3 inline-flex items-center gap-1.5 rounded-lg border border-hairline text-sm font-semibold text-ink-primary hover:bg-surface-sunken disabled:opacity-50"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> Add
        </button>
        {canRestore && (
          <button
            type="button"
            onClick={onRestore}
            className="h-11 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-secondary hover:bg-surface-sunken"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> Restore suggestions
          </button>
        )}
      </div>
    </div>
  )
}
