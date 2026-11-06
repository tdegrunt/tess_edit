// The Layers panel: the document as a collapsible tree that can be reordered by
// dragging. Rows also take blocks dragged from the Blocks panel.

import { canInsert, find, isDescendant } from "tess_edit/core/document"
import { getBlock, isContainer, label } from "tess_edit/core/registry"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

export class Tree {
  constructor(editor, element) {
    this.editor = editor
    this.element = element
    this.collapsed = new Set()
  }

  render() {
    const { doc } = this.editor
    this.element.replaceChildren(h("ul", { class: "py-1", role: "tree" }, this.row(doc, 0)))
    this.element.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" })
  }

  row(node, depth) {
    const { selectedId } = this.editor
    const children = node.children || []
    const open = !this.collapsed.has(node.id)
    const selected = node.id === selectedId
    const container = isContainer(node.type)
    // Layout parts under a lock; the root shows no lock, as some of its fields may be open.
    const locked = !!this.editor.lock && node.id !== this.editor.doc.id && !this.editor.canFill(node.id)

    const toggle = h(
      "button",
      {
        type: "button",
        class: `w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 ${children.length ? "" : "invisible"}`,
        onclick: (event) => {
          event.stopPropagation()
          open ? this.collapsed.add(node.id) : this.collapsed.delete(node.id)
          this.render()
        },
        html: icon("chevron", `w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`)
      }
    )

    const add = container && this.editor.accepted(node.id).length
      ? h("button", {
          type: "button",
          title: "Add a block inside",
          class: "ml-auto hidden group-hover:flex w-5 h-5 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-900",
          html: icon("plus", "w-3.5 h-3.5"),
          onclick: (event) => {
            event.stopPropagation()
            this.editor.openInsertMenu(node.id, children.length, event.currentTarget.getBoundingClientRect())
          }
        })
      : null

    const line = h(
      "div",
      {
        class: `group relative flex items-center gap-1.5 pr-2 h-7 cursor-pointer select-none rounded-md mx-1 ${selected ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"}`,
        style: `padding-left:${depth * 14 + 4}px`,
        role: "treeitem",
        "aria-selected": selected ? "true" : "false",
        draggable: this.editor.isFree(node.id),
        dataset: { id: node.id },
        onclick: () => this.editor.select(node.id),
        ondragstart: (event) => {
          event.stopPropagation()
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", node.id)
          this.editor.startDrag({ kind: "move", id: node.id, type: node.type })
        },
        ondragend: () => this.editor.endDrag(),
        ondragover: (event) => this.onDragOver(event, node),
        ondragleave: () => this.clearMarker(),
        ondrop: (event) => this.onDrop(event, node),
        onmouseenter: () => this.editor.canvas?.setHover(node.id),
        onmouseleave: () => this.editor.canvas?.setHover(null)
      },
      toggle,
      h("span", { class: `shrink-0 ${getBlock(node.type)?.accepts === "inherit" ? "text-amber-600" : "text-gray-400"}`, html: icon(getBlock(node.type)?.icon, "w-4 h-4") }),
      h("span", { class: `truncate text-[13px] ${locked ? "text-gray-400" : ""}` }, label(node)),
      locked ? h("span", { class: "ml-auto shrink-0 text-gray-300", title: "Part of the layout", html: icon("lock", "w-3.5 h-3.5") }) : add,
      h("div", { class: "tess-tree-marker pointer-events-none absolute left-1 right-1 hidden" })
    )

    return h("li", { role: "none" }, line, open && children.length ? h("ul", { role: "group" }, children.map((child) => this.row(child, depth + 1))) : null)
  }

  // Top third: before, bottom third: after, middle: inside (when allowed).
  position(event, node) {
    const drag = this.editor.drag
    if (!drag) return null
    const doc = this.editor.doc
    const ok = (parentId) => this.editor.canFill(parentId) && canInsert(doc, parentId, drag.type) && !(drag.kind === "move" && (parentId === drag.id || isDescendant(doc, drag.id, parentId)))
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    const hit = find(doc, node.id)
    if (drag.kind === "move" && drag.id === node.id) return null
    const inside = ok(node.id) ? { parentId: node.id, index: (node.children || []).length, marker: "inside" } : null
    const sibling = (after) => (hit.parent && ok(hit.parent.id) ? { parentId: hit.parent.id, index: hit.index + (after ? 1 : 0), marker: after ? "after" : "before" } : null)
    if (ratio < 0.3) return sibling(false) || inside
    // Below an expanded container the next row is its first child, so "after" means "first inside".
    const expanded = !this.collapsed.has(node.id) && node.children?.length
    if (ratio > 0.7) return (expanded && inside ? { ...inside, index: 0 } : null) || sibling(true) || inside
    return inside || sibling(ratio > 0.5)
  }

  onDragOver(event, node) {
    const target = this.position(event, node)
    this.clearMarker()
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const marker = event.currentTarget.querySelector(".tess-tree-marker")
    marker.classList.remove("hidden")
    marker.className = `tess-tree-marker pointer-events-none absolute left-1 right-1 ${
      target.marker === "inside" ? "inset-y-0 rounded-md ring-2 ring-blue-500 bg-blue-500/5" : target.marker === "before" ? "top-0 h-0.5 bg-blue-600" : "bottom-0 h-0.5 bg-blue-600"
    }`
    this.markerElement = marker
  }

  onDrop(event, node) {
    const target = this.position(event, node)
    this.clearMarker()
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    this.editor.drop(this.editor.drag, target.parentId, target.index)
    this.editor.endDrag()
  }

  clearMarker() {
    if (this.markerElement) this.markerElement.className = "tess-tree-marker pointer-events-none absolute left-1 right-1 hidden"
    this.markerElement = null
  }
}
