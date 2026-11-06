// Locking a document, for editing one part of a design that is otherwise
// fixed, such as a template's own content in its layout:
//
//   { "except": ["content"], "fields": ["data.subject", "data.preheader"] }
//
// With a lock, only what is inside a block whose type is in `except` can
// change: those blocks take new children, and everything below them can be
// edited, moved, duplicated and deleted. The `except` blocks themselves stay
// where they are. Of the root, only the listed `fields` can change. Without a
// lock (null) everything can change.

import { ancestors, find } from "tess_edit/core/document"

export function parseLock(value) {
  if (!value) return null
  const lock = typeof value === "string" ? JSON.parse(value) : value
  return { except: lock.except || [], fields: lock.fields || [] }
}

// Whether the node may be edited, moved, duplicated or deleted.
export function isFree(doc, lock, id) {
  if (!lock) return true
  return ancestors(doc, id).some((node) => lock.except.includes(node.type))
}

// Whether blocks may be added to, or moved into, the node.
export function canFill(doc, lock, parentId) {
  if (!lock) return true
  const hit = find(doc, parentId)
  return !!hit && (lock.except.includes(hit.node.type) || isFree(doc, lock, parentId))
}

export function canEditField(doc, lock, id, key) {
  if (!lock || isFree(doc, lock, id)) return true
  return id === doc.id && lock.fields.includes(key)
}
