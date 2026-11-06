// Undo/redo over whole-document snapshots. Changes with the same coalesce key
// within a second (typing in one field) become a single undo step.

export class History {
  constructor(limit = 100) {
    this.limit = limit
    this.undoStack = []
    this.redoStack = []
    this.lastKey = null
    this.lastTime = 0
  }

  record(snapshot, coalesceKey = null) {
    const now = Date.now()
    const coalesce = coalesceKey && coalesceKey === this.lastKey && now - this.lastTime < 1000
    if (!coalesce) {
      this.undoStack.push(snapshot)
      if (this.undoStack.length > this.limit) this.undoStack.shift()
    }
    this.redoStack = []
    this.lastKey = coalesceKey
    this.lastTime = now
  }

  undo(current) {
    if (!this.undoStack.length) return null
    this.redoStack.push(current)
    this.lastKey = null
    return this.undoStack.pop()
  }

  redo(current) {
    if (!this.redoStack.length) return null
    this.undoStack.push(current)
    this.lastKey = null
    return this.redoStack.pop()
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }
}
