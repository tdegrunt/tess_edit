// Free layout: a container whose definition has layout: "free" places its
// children by x and y (data.x, data.y, in the kit's own units, such as a
// label's dots) instead of one after another. On the canvas its children
// are dragged to move them, nudged with the arrow keys (Shift: by 10), and
// resized by a handle when their definition, or the container's for all of
// its children, says what their size is:
//
//   registerBlock({ type: "label", accepts: ["field"], layout: "free", … })
//   registerBlock({ type: "box", roles: ["field"], resize: { width: "data.width", height: "data.height" }, … })
//   registerBlock({ type: "band", accepts: ["content"], layout: "free", resizeChildren: { width: "data.width" }, … })
//
// resizeChildren can also be a function of the child, for a size per type
// of block. A size with a unit (unit: "mm") is kept as text with it, such
// as an image's attributes.width "52mm"; a value in another unit counts as
// not set.
//
// The container's element says what a unit is: how many units wide it is
// (data-tess-width="812"), or how many CSS pixels a unit is
// (data-tess-unit="3.7795" for millimetres); without either a unit is one
// of its CSS pixels. Positions and sizes are whole units. Edges snap to the
// container's and the other children's edges and middles, with a guide,
// and otherwise to the container's grid when it has one
// (data-tess-grid="5", in units), shown while dragging; Alt turns snapping
// off. A block dropped from the palette lands where it is let go.

import { find, getValue } from "tess_edit/core/document"
import { getBlock } from "tess_edit/core/registry"

// Screen pixels a press moves before it drags, and within which edges snap
const THRESHOLD = 3
const SNAP = 5

export const FREE_CSS = `
.tess-guide{position:absolute;background:#ec4899;pointer-events:none}
.tess-resize{position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;box-sizing:border-box;background:#fff;border:2px solid #2563eb;border-radius:2px;pointer-events:auto;cursor:nwse-resize;touch-action:none}
.tess-free-dragging,.tess-free-dragging *{cursor:grabbing!important;user-select:none}
.tess-grid{position:absolute;pointer-events:none;background-image:radial-gradient(circle,rgba(37,99,235,.45) 1px,transparent 1.5px)}
`

export function isFreeLayout(node) {
  return getBlock(node?.type)?.layout === "free"
}

// The block in a free container that holds the node, from the node outwards
export function freeChild(doc, id) {
  let hit = find(doc, id)
  while (hit?.parent) {
    if (isFreeLayout(hit.parent)) return hit
    hit = find(doc, hit.parent.id)
  }
  return null
}

export const number = (value) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

// The value on the grid nearest to it, or the value without a grid
export const onGrid = (value, grid) => (grid > 0 ? Math.round(value / grid) * grid : value)

// The size a block resizes, from its definition or its free container's
export function resizeOf(child) {
  const children = getBlock(child?.parent?.type)?.resizeChildren
  return getBlock(child?.node.type)?.resize || (typeof children === "function" ? children(child.node) : children) || null
}

// A size in the resize's unit as a number, 0 when not set or in another unit
export function sizeOf(value, unit = "") {
  const text = String(value ?? "").trim()
  if (!unit || !text.endsWith(unit)) return unit ? 0 : number(text)
  return number(text.slice(0, -unit.length).trim())
}

// The nearest of the candidates to one of the edges, within SNAP: the
// offset that puts it there and where the guide goes
export function snap(edges, candidates) {
  let best = null
  for (const edge of edges) {
    for (const candidate of candidates) {
      const offset = candidate - edge
      if (Math.abs(offset) <= SNAP && (!best || Math.abs(offset) < Math.abs(best.offset))) best = { offset, at: candidate }
    }
  }
  return best
}

export class FreeLayout {
  constructor(canvas) {
    this.canvas = canvas
    this.gesture = null
  }

  get editor() {
    return this.canvas.editor
  }

  get dragging() {
    return !!this.gesture?.active
  }

  container(parentId) {
    return this.canvas.elementOf(parentId) || (parentId === this.editor.doc.id ? this.canvas.doc.body : null)
  }

  // Screen pixels per unit of a free container, CSS pixels per screen
  // pixel inside it (the canvas may be zoomed), and its grid in units
  scale(parentId) {
    const element = this.container(parentId)
    const rect = element?.getBoundingClientRect()
    const grid = Number(element?.dataset.tessGrid) || 0
    if (!rect?.width) return { unit: 1, css: 1, rect, grid }
    const css = element.offsetWidth ? element.offsetWidth / rect.width : 1
    const units = Number(element.dataset.tessWidth)
    const cssPerUnit = Number(element.dataset.tessUnit)
    const unit = units > 0 ? rect.width / units : (cssPerUnit > 0 ? cssPerUnit : 1) / css
    return { unit, css, rect, grid }
  }

  // --- moving and resizing -------------------------------------------------------

  onPointerDown(event) {
    if (event.button !== 0 || this.editor.editingId || this.canvas.mode !== "edit") return
    if (event.target.closest?.("#tess-overlay")) return
    const hit = this.canvas.hit(event.target)
    if (!hit || hit.placeholder) return
    const child = freeChild(this.editor.doc, hit.id)
    if (child && this.editor.isFree(child.node.id)) this.start(event, "move", child)
  }

  // The selected block's resize handle, when its definition says what its size is
  handle(id) {
    const child = freeChild(this.editor.doc, id)
    const resize = resizeOf(child)
    if (!resize || !this.editor.isFree(id) || this.editor.editingId) return null
    const handle = this.canvas.doc.createElement("div")
    handle.className = "tess-resize"
    handle.title = "Drag to resize"
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.start(event, "resize", child)
    })
    return handle
  }

  start(event, kind, child) {
    const { node, parent } = child
    const element = this.canvas.elementOf(node.id)
    if (!element) return
    const resize = resizeOf(child) || {}
    const others = parent.children.filter((other) => other.id !== node.id).map((other) => this.canvas.rectOf(other.id)).filter(Boolean)
    const { unit, css, rect: frame, grid } = this.scale(parent.id)
    const rect = element.getBoundingClientRect()
    this.gesture = {
      kind,
      id: node.id,
      element,
      resize,
      unit,
      css,
      grid,
      x: event.clientX,
      y: event.clientY,
      rect,
      size: { width: element.style.width, height: element.style.height },
      // A size not set yet is the size shown
      values: {
        x: number(node.data?.x),
        y: number(node.data?.y),
        width: resize.width ? sizeOf(getValue(node, resize.width), resize.unit) || Math.round(rect.width / unit) : 0,
        height: resize.height ? sizeOf(getValue(node, resize.height), resize.unit) || Math.round(rect.height / unit) : 0
      },
      targets: {
        x: [frame, ...others].filter(Boolean).flatMap((rect) => [rect.left, rect.left + rect.width / 2, rect.right]),
        y: [frame, ...others].filter(Boolean).flatMap((rect) => [rect.top, rect.top + rect.height / 2, rect.bottom])
      },
      frame,
      pointerId: event.pointerId,
      target: event.target
    }
    const doc = this.canvas.doc
    this.onMove = (moveEvent) => this.move(moveEvent)
    this.onUp = (upEvent) => this.end(upEvent)
    doc.addEventListener("pointermove", this.onMove)
    doc.addEventListener("pointerup", this.onUp)
    doc.addEventListener("pointercancel", this.onUp)
  }

  move(event) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    let dx = event.clientX - gesture.x
    let dy = event.clientY - gesture.y
    if (!gesture.active) {
      if (Math.hypot(dx, dy) < THRESHOLD) return
      gesture.active = true
      try {
        gesture.target.setPointerCapture?.(gesture.pointerId)
      } catch {}
      this.canvas.doc.documentElement.classList.add("tess-free-dragging")
      this.editor.closeMenu()
      this.editor.select(gesture.id)
      this.canvas.setHover(null)
    }
    event.preventDefault()
    const { rect, unit } = gesture
    const guides = []
    let x = null
    let y = null
    if (!event.altKey) {
      const xs = gesture.kind === "move" ? [rect.left + dx, rect.left + rect.width / 2 + dx, rect.right + dx] : [rect.right + dx]
      const ys = gesture.kind === "move" ? [rect.top + dy, rect.top + rect.height / 2 + dy, rect.bottom + dy] : [rect.bottom + dy]
      x = snap(xs, gesture.targets.x)
      y = snap(ys, gesture.targets.y)
      if (x) {
        dx += x.offset
        guides.push({ left: x.at, top: gesture.frame.top, width: 1, height: gesture.frame.height })
      }
      if (y) {
        dy += y.offset
        guides.push({ left: gesture.frame.left, top: y.at, width: gesture.frame.width, height: 1 })
      }
    }
    // Whole units, shown as they will be; on the grid when no edge snapped
    const grid = event.altKey ? 0 : gesture.grid
    const start = gesture.kind === "move" ? gesture.values : { x: gesture.values.width, y: gesture.values.height }
    const du = x || !grid ? Math.round(dx / unit) : onGrid(start.x + dx / unit, grid) - start.x
    const dv = y || !grid ? Math.round(dy / unit) : onGrid(start.y + dy / unit, grid) - start.y
    const px = (units) => `${units * gesture.unit * gesture.css}px`
    if (gesture.kind === "move") {
      gesture.change = { x: gesture.values.x + du, y: gesture.values.y + dv }
      gesture.element.style.translate = `${px(du)} ${px(dv)}`
    } else {
      gesture.change = this.resized(gesture, du, dv)
      const width = gesture.resize.width ? gesture.change.width - gesture.values.width : 0
      const height = gesture.resize.height ? gesture.change.height - gesture.values.height : 0
      gesture.element.style.width = `calc(${px(rect.width / gesture.unit)} + ${px(width)})`
      gesture.element.style.height = `calc(${px(rect.height / gesture.unit)} + ${px(height)})`
    }
    this.guides = guides
    this.grid = grid * unit >= 4 && gesture.frame ? { rect: gesture.frame, step: grid * unit } : null
    this.canvas.refresh()
  }

  // The new size; one key for both (a circle's diameter) takes the larger change
  resized(gesture, du, dv) {
    const { width, height } = gesture.values
    if (gesture.resize.width && gesture.resize.width === gesture.resize.height) {
      const size = Math.max(1, width + (Math.abs(du) > Math.abs(dv) ? du : dv))
      return { width: size, height: size }
    }
    return { width: Math.max(1, width + du), height: Math.max(1, height + dv) }
  }

  end(event) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const doc = this.canvas.doc
    doc.removeEventListener("pointermove", this.onMove)
    doc.removeEventListener("pointerup", this.onUp)
    doc.removeEventListener("pointercancel", this.onUp)
    doc.documentElement.classList.remove("tess-free-dragging")
    this.gesture = null
    this.guides = []
    this.grid = null
    if (!gesture.active) return
    // The click that ends a drag isn't one (see swallowClick)
    this.dragged = true
    setTimeout(() => (this.dragged = false))
    gesture.element.style.translate = ""
    Object.assign(gesture.element.style, gesture.size)
    const change = gesture.change || {}
    if (event.type === "pointercancel") return this.canvas.refresh()
    if (gesture.kind === "move") this.editor.place(gesture.id, { "data.x": change.x, "data.y": change.y })
    else {
      const size = (value) => (gesture.resize.unit ? `${value}${gesture.resize.unit}` : value)
      this.editor.place(gesture.id, { [gesture.resize.width]: size(change.width), [gesture.resize.height]: size(change.height) })
    }
    this.canvas.refresh()
  }

  // Whether a click ends a drag, and so selects or edits nothing
  swallowClick() {
    const dragged = this.dragged
    this.dragged = false
    return dragged
  }

  // --- the overlay -----------------------------------------------------------------

  drawGuides(overlay) {
    if (this.grid) {
      const { rect, step } = this.grid
      const box = this.canvas.box(rect, "tess-grid")
      Object.assign(box.style, { backgroundSize: `${step}px ${step}px`, backgroundPosition: `${-step / 2}px ${-step / 2}px` })
      overlay.append(box)
    }
    for (const rect of this.guides || []) overlay.append(this.canvas.box(rect, "tess-guide"))
  }

  // --- dropping from the palette -------------------------------------------------

  // A free container under the pointer that takes the dragged block, and
  // where in it, in units
  dropTarget(x, y, drag) {
    const doc = this.editor.doc
    const hit = this.canvas.hit(this.canvas.doc.elementFromPoint(x, y))
    let current = find(doc, hit ? hit.id : doc.id)
    while (current && !isFreeLayout(current.node)) current = current.parent && find(doc, current.parent.id)
    if (!current || !this.canvas.allowed(current.node.id, drag)) return null
    const container = current.node
    const { unit, rect, grid } = this.scale(container.id)
    if (!rect) return null
    const moving = drag.kind === "move" && container.children.some((child) => child.id === drag.id)
    const index = moving ? container.children.findIndex((child) => child.id === drag.id) : container.children.length
    return { parentId: container.id, index, fill: this.canvas.rectOf(container.id), at: { x: Math.max(0, Math.round(onGrid((x - rect.left) / unit, grid))), y: Math.max(0, Math.round(onGrid((y - rect.top) / unit, grid))) } }
  }
}

