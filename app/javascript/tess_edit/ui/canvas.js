// The editing canvas: an iframe showing the compiled email, with an overlay for
// hover and selection outlines, block tools, plus buttons and drop indicators.
// Elements are mapped back to blocks through the "tess-<id>" classes that the
// editor-mode MJML puts on every element. With the host's translations, t
// filters show their text in the editor's language, and with its values
// other Liquid output shows its value (see annotate).

import { ancestors, find, isDescendant, isHorizontal } from "tess_edit/core/document"
import { t } from "tess_edit/core/i18n"
import { imageFields } from "tess_edit/core/media"
import { getBlock, inlinePart, label } from "tess_edit/core/registry"
import { missingArguments, textParts, translationCalls } from "tess_edit/core/translations"
import { valueCalls } from "tess_edit/core/values"
import { cellOf, columnCount, rowGroups, rows, setColumnAt, span, tableOf } from "tess_edit/core/table"
import { FREE_CSS, FreeLayout, freeChild } from "tess_edit/ui/free_layout"
import { icon } from "tess_edit/ui/icons"

const OVERLAY_CSS = `
html{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.35) transparent}
body{min-height:100vh;margin:0}
#tess-overlay{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;font:11px/1.2 system-ui,-apple-system,sans-serif}
.tess-box{position:absolute;box-sizing:border-box;pointer-events:none}
.tess-hover{outline:1px dashed #3b82f6;outline-offset:-1px}
.tess-selected{outline:2px solid #2563eb;outline-offset:-2px}
.tess-selected.tess-editing{outline-color:#f59e0b}
.tess-label{position:absolute;bottom:100%;left:0;background:#2563eb;color:#fff;padding:3px 6px;border-radius:4px 4px 0 0;white-space:nowrap}
.tess-hover .tess-label{background:#60a5fa}
.tess-editing .tess-label{background:#f59e0b}
.tess-plain{outline:none;cursor:text}
.tess-plain:empty{display:inline-block;min-width:1px}
.tess-inside .tess-label,.tess-inside .tess-tools{bottom:auto;top:0;border-radius:0 0 4px 4px}
.tess-tools{position:absolute;bottom:100%;right:0;display:flex;gap:1px;pointer-events:auto;background:#2563eb;border-radius:4px 4px 0 0;padding:1px}
.tess-tools [data-tool]{cursor:pointer;color:#fff;width:22px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;background:none;border:0;padding:0}
.tess-tools [data-tool]:hover{background:#1d4ed8}
.tess-tools [data-tool="drag"]{cursor:grab}
.tess-plus{position:absolute;left:50%;top:100%;transform:translate(-50%,-50%);pointer-events:auto;width:20px;height:20px;border-radius:999px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #fff;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.tess-plus:hover{background:#1d4ed8}
.tess-bracket{position:absolute;box-sizing:border-box;width:6px;border:2px solid #8b5cf6;border-right:0;border-radius:3px 0 0 3px;pointer-events:auto;cursor:pointer}
.tess-bracket:hover,.tess-bracket.tess-on{border-color:#6d28d9}
.tess-bracket span{position:absolute;right:calc(100% + 4px);top:-2px;color:#6d28d9;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.tess-column{position:absolute;width:9px;margin-left:-4px;pointer-events:auto;cursor:col-resize}
.tess-column::after{content:"";position:absolute;left:4px;top:0;bottom:0;width:1px;background:#2563eb;opacity:0}
.tess-column:hover::after,.tess-column.tess-on::after{opacity:1}
.tess-indicator{position:absolute;background:#2563eb;border-radius:2px;pointer-events:none;box-shadow:0 0 0 2px rgba(37,99,235,.2)}
.tess-indicator.tess-fill{background:rgba(37,99,235,.08);outline:2px dashed #2563eb;outline-offset:-2px;box-shadow:none}
[class*="tessph-"]{cursor:pointer}
[class*="tessph-"] td,[class*="tessph-"]{outline:1px dashed #cbd5e1;outline-offset:-4px}
a{cursor:default}
.ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word;cursor:text}
.ProseMirror p{margin:0}
.ProseMirror ul,.ProseMirror ol{margin:0;padding-left:1.5em}
.tess-t,.tess-t-raw{border-radius:3px;background:rgba(37,99,235,.08);box-shadow:inset 0 -1px 0 rgba(37,99,235,.55)}
.tess-t.tess-t-missing,.tess-t-raw.tess-t-missing{background:rgba(220,38,38,.08);box-shadow:inset 0 -1px 0 rgba(220,38,38,.65)}
.ProseMirror .tess-t{cursor:pointer}
.tess-t-arg{border-radius:3px;padding:0 2px;background:rgba(37,99,235,.18);font-size:.9em}
.tess-t-missing .tess-t-arg{background:rgba(220,38,38,.18)}
.tess-t-hidden{display:none}
.tess-v-filled,.tess-v-raw{border-radius:3px;background:rgba(5,150,105,.08);box-shadow:inset 0 -1px 0 rgba(5,150,105,.55)}
.ProseMirror .tess-v-filled{cursor:text}
.tess-v-hidden{display:none}
.tess-v-empty{border-radius:3px;background:rgba(220,38,38,.08);box-shadow:inset 0 -1px 0 rgba(220,38,38,.65)}
.tess-liquid-error{text-decoration:underline wavy rgba(220,38,38,.9);text-decoration-skip-ink:none;text-underline-offset:3px}
`

// A file dragged in from outside the browser (block drags set editor.drag)
function isFileDrag(event, editor) {
  return !editor.drag && Array.from(event.dataTransfer?.types || []).includes("Files")
}

const TABLE_ICON = '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 10v9M15 10v9"/>'
const CLASS = /\btess-(b[a-z0-9]+)\b/
const PLACEHOLDER = /\btessph-(b[a-z0-9]+)\b/

export class Canvas {
  constructor(editor, frame) {
    this.editor = editor
    this.frame = frame
    this.hoverId = null
    this.mode = "edit"
    this.free = new FreeLayout(this)
  }

  get doc() {
    return this.frame.contentDocument
  }

  get win() {
    return this.frame.contentWindow
  }

  // Replaces the iframe's content, keeping the scroll position.
  write(html, mode) {
    // A column being dragged is let go: its listeners were the old document's
    this.resizing = false
    const scrollY = this.win?.scrollY || 0
    this.mode = mode
    const doc = this.doc
    doc.open()
    doc.write(html)
    doc.close()
    const style = doc.createElement("style")
    style.textContent = OVERLAY_CSS + FREE_CSS
    doc.head.append(style)
    this.overlay = doc.createElement("div")
    this.overlay.id = "tess-overlay"
    // Outside the body, which a kit may position (a sheet of paper), so the
    // overlay's coordinates are the document's
    doc.documentElement.append(this.overlay)
    this.win.scrollTo(0, scrollY)
    if (mode === "edit") {
      this.listen()
      this.annotate()
    } else {
      doc.addEventListener("click", (event) => {
        if (!event.target.closest("a")) return
        event.preventDefault()
        this.openLink(event)
      }, true)
    }
    this.refresh()
  }

  listen() {
    const doc = this.doc
    doc.addEventListener("mousemove", (event) => this.onMove(event))
    doc.addEventListener("mouseleave", () => this.setHover(null))
    doc.addEventListener("pointerdown", (event) => this.free.onPointerDown(event))
    doc.addEventListener("click", (event) => this.onClick(event), true)
    doc.addEventListener("dblclick", (event) => this.onDoubleClick(event))
    doc.addEventListener("dragover", (event) => this.onDragOver(event))
    doc.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget) this.hideIndicator()
    })
    doc.addEventListener("drop", (event) => this.onDrop(event))
    doc.addEventListener("keydown", (event) => this.editor.onKeydown(event))
    // Events in the iframe don't reach the host page, so close the insert menu from here.
    doc.addEventListener("mousedown", () => this.editor.closeMenu({ outside: true }), true)
    this.win.addEventListener("scroll", () => this.editor.closeMenu(), { passive: true })
    this.win.addEventListener("resize", () => this.refresh())
    for (const image of doc.images) image.addEventListener("load", () => this.refresh(), { once: true })
    // Translations list every language while pointed at
    doc.addEventListener("mouseover", (event) => {
      const chip = event.target.closest?.("[data-tess-key]")
      if (chip) this.editor.translationPopover?.show(chip.dataset.tessKey, this.toParentRect(chip.getBoundingClientRect()))
    })
    doc.addEventListener("mouseout", (event) => event.target.closest?.("[data-tess-key]") && this.editor.translationPopover?.scheduleHide())
  }

  // --- translations and values -----------------------------------------------

  // Wraps every t filter in the email's text in a span that shows its text
  // (showTranslations), and with the host's values every other output tag in
  // one that shows its value (showValues), keeping the Liquid for when there's
  // none. Again when the values change: what's wrapped stays as it is.
  annotate() {
    const translating = Boolean(this.editor.translations?.enabled)
    const valuing = Boolean(this.editor.values?.enabled)
    if (!this.doc?.body) return
    // Without values any more, what shows one shows its Liquid again
    if (!translating && !valuing) return this.showValues()
    const doc = this.doc
    const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */)
    const nodes = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeValue.includes("{{") && !node.parentElement?.closest("#tess-overlay, script, style, title, .tess-t, .tess-v, .ProseMirror")) nodes.push(node)
    }
    for (const node of nodes) {
      const text = node.nodeValue
      const calls = [...(translating ? translationCalls(text) : []), ...(valuing ? valueCalls(text).map((call) => ({ ...call, value: true })) : [])].sort((a, b) => a.start - b.start)
      if (!calls.length) continue
      const fragment = doc.createDocumentFragment()
      let at = 0
      for (const call of calls) {
        fragment.append(text.slice(at, call.start))
        const span = doc.createElement("span")
        if (call.value) {
          span.className = "tess-v"
          Object.assign(span.dataset, { tessExpression: call.expression, tessCall: call.text })
          span.textContent = call.text
        } else {
          span.className = "tess-t"
          Object.assign(span.dataset, { tessKey: call.key, tessCall: call.text, tessArgs: call.args.join(",") }, call.locale ? { tessLocale: call.locale } : {})
        }
        fragment.append(span)
        at = call.end
      }
      fragment.append(text.slice(at))
      node.replaceWith(fragment)
    }
    this.showTranslations()
    this.showValues()
  }

  // Each output tag's value, its Liquid when pointed at, or the Liquid when
  // there's none
  showValues() {
    const values = this.editor.values
    if (!values || !this.doc?.body) return
    for (const span of this.doc.querySelectorAll(".tess-v[data-tess-call]")) {
      const value = values.value(span.dataset.tessExpression)
      const empty = value === null && values.empty(span.dataset.tessExpression)
      span.textContent = value ?? span.dataset.tessCall
      span.title = empty ? t("Empty for now: fill it in where it comes from") : value === null ? "" : span.dataset.tessCall
      span.classList.toggle("tess-v-filled", value !== null)
      span.classList.toggle("tess-v-empty", empty)
    }
    this.refresh()
  }

  // The text in the editor's language (or the call's own), or the Liquid when
  // there's none; red when a language is missing it
  showTranslations() {
    const translations = this.editor.translations
    if (!translations?.enabled || !this.doc) return
    for (const span of this.doc.querySelectorAll(".tess-t[data-tess-call]")) {
      const key = span.dataset.tessKey
      const locale = span.dataset.tessLocale || this.editor.translationLocale
      const value = locale ? translations.value(key, locale) : null
      const unfilled = value === null ? [] : missingArguments(value, { args: span.dataset.tessArgs ? span.dataset.tessArgs.split(",") : [] })
      if (value === null) span.textContent = span.dataset.tessCall
      else showText(span, value)
      span.title = unfilled.length ? t("No argument for %{names} in the t filter", { names: unfilled.map((name) => `%{${name}}`).join(", ") }) : ""
      span.classList.toggle("tess-t-missing", unfilled.length > 0 || (translations.has(key) && (locale ? value === null : translations.missing(key).length > 0)))
    }
    this.refresh()
  }

  // --- mapping between DOM and blocks -------------------------------------

  hit(target) {
    let element = target?.nodeType === 1 ? target : target?.parentElement
    while (element && element !== this.doc.documentElement) {
      if (element.closest?.("#tess-overlay")) return null
      const className = typeof element.className === "string" ? element.className : ""
      const placeholder = className.match(PLACEHOLDER)
      if (placeholder) return { id: placeholder[1], placeholder: true, element }
      const match = className.match(CLASS)
      if (match && find(this.editor.doc, match[1])) return { id: match[1], placeholder: false, element }
      element = element.parentElement
    }
    return null
  }

  // A block's element. A Loop's blocks can show once per item, as a Table's
  // rows do with a record's values (a host's canvas), each copy with the
  // block's class: the copy clicked last is the one meant, and so are the
  // blocks in it and around it, until another is clicked. The copy is kept
  // by its place among them, as the canvas is written again.
  elementOf(id) {
    const anchor = this.anchorElement()
    const near = anchor && (anchor.closest(`.tess-${id}`) || anchor.querySelector(`.tess-${id}, .tessph-${id}`))
    return near || this.doc?.querySelector(`.tess-${id}`) || this.doc?.querySelector(`.tessph-${id}`)
  }

  // Remembers the copy of a block that was clicked
  anchorAt(hit) {
    if (!hit || hit.placeholder) return
    const copies = [...this.doc.querySelectorAll(`.tess-${hit.id}`)]
    this.anchor = copies.length > 1 ? { id: hit.id, index: Math.max(0, copies.indexOf(hit.element)) } : null
  }

  anchorElement() {
    if (!this.anchor || !this.doc) return null
    return this.doc.querySelectorAll(`.tess-${this.anchor.id}`)[this.anchor.index] || null
  }

  // The rectangle of the copy of a block an element is in, else its first
  hoverRect(id) {
    const element = this.hoverElement?.isConnected && this.hoverElement.closest(`.tess-${id}`)
    return element ? element.getBoundingClientRect() : this.rectOf(id)
  }

  // The rectangle of a block in viewport coordinates of the iframe. Blocks
  // without their own element (loops, conditions) use the union of their children.
  rectOf(id) {
    const hit = find(this.editor.doc, id)
    if (!hit) return null
    if (hit.node === this.editor.doc) {
      const body = this.doc.body
      const rect = body.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.top + body.scrollHeight, width: rect.width, height: body.scrollHeight }
    }
    const element = this.elementOf(id)
    if (element) return element.getBoundingClientRect()
    const rects = (hit.node.children || []).map((child) => this.rectOf(child.id)).filter(Boolean)
    if (!rects.length) return null
    const left = Math.min(...rects.map((r) => r.left))
    const top = Math.min(...rects.map((r) => r.top))
    const right = Math.max(...rects.map((r) => r.right))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  // Where an inline part is edited: the element its render marks with
  // data-tess-edit-field, or for the richText shorthand the block's own
  textContainer(id, key) {
    const cell = this.elementOf(id)
    const part = this.partElement(cell, key)
    if (part) return part
    if (key !== getBlock(find(this.editor.doc, id)?.node.type)?.richText) return null
    return cell?.querySelector(":scope > div") || cell
  }

  partElement(cell, key) {
    return [...(cell?.querySelectorAll("[data-tess-edit-field]") || [])].find((element) => element.dataset.tessEditField === key)
  }

  // The inline part of a block at a clicked element: a marked one, or the
  // richText shorthand's anywhere in the block
  partAt(target, id) {
    const definition = getBlock(find(this.editor.doc, id)?.node.type)
    const marked = target.closest?.("[data-tess-edit-field]")
    if (marked && this.hit(marked)?.id === id && definition && inlinePart(definition.type, marked.dataset.tessEditField)) return marked.dataset.tessEditField
    return definition?.richText || null
  }

  // --- overlay ---------------------------------------------------------------

  box(rect, className) {
    const box = this.doc.createElement("div")
    box.className = `tess-box ${className}`
    const sx = this.win.scrollX
    const sy = this.win.scrollY
    Object.assign(box.style, { left: `${rect.left + sx}px`, top: `${rect.top + sy}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    if (rect.top + sy < 24) box.classList.add("tess-inside")
    return box
  }

  refresh() {
    if (!this.overlay || this.resizing) return
    this.overlay.replaceChildren()
    if (this.mode !== "edit") return
    this.free.drawGuides(this.overlay)
    const { selectedId, editingId } = this.editor

    if (this.hoverId && this.hoverId !== selectedId) {
      const hit = find(this.editor.doc, this.hoverId)
      const rect = hit && this.hoverRect(this.hoverId)
      if (rect && hit.node !== this.editor.doc) {
        const box = this.box(rect, "tess-hover")
        box.append(Object.assign(this.doc.createElement("div"), { className: "tess-label", textContent: getBlock(hit.node.type)?.name || hit.node.type }))
        this.overlay.append(box)
      }
    }

    const hit = selectedId && find(this.editor.doc, selectedId)
    if (!hit || hit.node === this.editor.doc) return
    this.drawTable(selectedId, editingId)
    const rect = this.rectOf(selectedId)
    if (!rect) return
    const box = this.box(rect, editingId === selectedId ? "tess-selected tess-editing" : "tess-selected")
    const free = this.editor.isFree(selectedId)
    box.append(Object.assign(this.doc.createElement("div"), { className: "tess-label", textContent: editingId === selectedId ? t("Editing text · %{key} to finish", { key: this.editor.editingPart?.plain ? "Enter" : "Esc" }) : free || !this.editor.lock ? label(hit.node) : `${label(hit.node)} · ${t("Layout")}` }))

    const handle = this.free.handle(selectedId)
    if (handle) box.append(handle)

    if (editingId !== selectedId && !this.free.dragging) {
      // In a table's cell (the cell, or its text): its rows and columns
      const cell = free && cellOf(this.editor.doc, selectedId)
      // A free container's own block moves by its handle as when it's dragged
      // itself (ui/free_layout.js): as it goes, on the grid and the guides;
      // any other block by dragging it elsewhere in the document
      const placed = freeChild(this.editor.doc, selectedId)
      const freeMove = placed?.node.id === selectedId
      const tools = this.doc.createElement("div")
      tools.className = "tess-tools"
      tools.innerHTML = [
        ["parent", t("Select parent")],
        ...(cell ? [["table", t("Rows and columns")]] : []),
        ...(free ? [["drag", t("Drag to move")], ["duplicate", t("Duplicate")], ["delete", t("Delete")]] : [])
      ]
        .map(([tool, title]) => `<span data-tool="${tool}" title="${title}" ${tool === "drag" && !freeMove ? 'draggable="true"' : ""}>${icon({ parent: "parent", drag: "move", duplicate: "copy", delete: "trash", table: TABLE_ICON }[tool], "tess-icon")}</span>`)
        .join("")
      tools.querySelectorAll("svg").forEach((svg) => svg.setAttribute("style", "width:14px;height:14px"))
      tools.addEventListener("mousedown", (event) => event.stopPropagation())
      tools.addEventListener("click", (event) => {
        const tool = event.target.closest("[data-tool]")?.dataset.tool
        event.preventDefault()
        event.stopPropagation()
        if (tool === "parent") this.editor.selectParent()
        if (tool === "table") this.editor.openTableMenu(cell.id, this.toParentRect(event.target.closest("[data-tool]").getBoundingClientRect()))
        if (tool === "duplicate") this.editor.duplicate(selectedId)
        if (tool === "delete") this.editor.remove(selectedId)
      })
      if (freeMove) {
        tools.querySelector('[data-tool="drag"]')?.addEventListener("pointerdown", (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.free.start(event, "move", placed)
        })
      }
      tools.querySelector('[data-tool="drag"]')?.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", selectedId)
        const element = this.elementOf(selectedId)
        if (element) event.dataTransfer.setDragImage(element, 10, 10)
        this.editor.startDrag({ kind: "move", id: selectedId, type: hit.node.type })
      })
      tools.querySelector('[data-tool="drag"]')?.addEventListener("dragend", () => this.editor.endDrag())
      box.append(tools)

      if (hit.parent && this.editor.canFill(hit.parent.id)) {
        const plus = this.doc.createElement("button")
        plus.className = "tess-plus"
        plus.title = t("Add a block below")
        plus.innerHTML = icon("plus")
        plus.querySelector("svg").setAttribute("style", "width:12px;height:12px")
        plus.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.editor.openInsertMenu(hit.parent.id, hit.index + 1, this.toParentRect(plus.getBoundingClientRect()))
        })
        box.append(plus)
      }
    }
    this.overlay.append(box)
  }

  // The table the selection is in: a bracket at its side by each Loop's and
  // Condition's rows, labelled as the block, which a click selects; and, when
  // not editing text, a handle on each column's right border, dragged to set
  // its width (in pt when it was in pt, else px)
  drawTable(selectedId, editingId) {
    const table = tableOf(this.editor.doc, selectedId)
    // The table element itself, not a wrapper with its padding
    const element = table && this.elementOf(table.id)
    const inner = element && (element.tagName === "TABLE" ? element : element.querySelector("table"))
    const tableRect = inner ? inner.getBoundingClientRect() : table && this.rectOf(table.id)
    if (!tableRect) return
    for (const { node, depth } of rowGroups(table)) {
      const rect = this.rectOf(node.id)
      if (!rect) continue
      const bracket = this.box({ left: tableRect.left - 10 - depth * 10, top: rect.top, width: 6, height: rect.height }, "tess-bracket")
      if (node.id === selectedId) bracket.classList.add("tess-on")
      bracket.dataset.tessBracket = node.id
      bracket.title = label(node)
      bracket.append(Object.assign(this.doc.createElement("span"), { textContent: label(node) }))
      bracket.addEventListener("mousedown", (event) => event.stopPropagation())
      bracket.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.editor.select(node.id, { reveal: true })
      })
      this.overlay.append(bracket)
    }
    if (editingId || !this.editor.isFree(table.id)) return
    for (const handle of this.columnHandles(table, tableRect)) this.overlay.append(handle)
  }

  // A row of single cells shows where the columns are
  columnHandles(table, tableRect) {
    const count = columnCount(table)
    const row = rows(table).find((candidate) => candidate.children.length === count && candidate.children.every((cell) => span(cell) === 1))
    const cells = row ? [...(this.elementOf(row.id)?.children || [])].filter((element) => /^T[DH]$/.test(element.tagName)) : []
    if (cells.length !== count) return []
    return cells.map((cell, column) => {
      const right = cell.getBoundingClientRect().right
      const handle = this.box({ left: right, top: tableRect.top, width: 9, height: tableRect.height }, "tess-column")
      handle.title = t("Drag to set the column's width")
      handle.addEventListener("mousedown", (event) => this.resizeColumn(event, table, column, cell, handle))
      return handle
    })
  }

  resizeColumn(event, table, column, cell, handle) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startLeft = parseFloat(handle.style.left)
    const startWidth = cell.getBoundingClientRect().width
    const inPt = /pt$/.test(table.data?.columns?.[column]?.width || "")
    const width = (clientX) => Math.max(12, startWidth + clientX - startX)
    this.resizing = true
    handle.classList.add("tess-on")
    const move = (moved) => (handle.style.left = `${startLeft + width(moved.clientX) - startWidth}px`)
    const up = (released) => {
      this.doc.removeEventListener("mousemove", move)
      this.doc.removeEventListener("mouseup", up)
      this.resizing = false
      this.resized = true
      setTimeout(() => (this.resized = false))
      const px = width(released.clientX)
      if (Math.abs(px - startWidth) < 1) return this.refresh()
      const value = inPt ? `${Math.round(px * 0.75)}pt` : `${Math.round(px)}px`
      this.editor.commit((doc) => setColumnAt(doc, table.id, column, "width", value))
    }
    this.doc.addEventListener("mousemove", move)
    this.doc.addEventListener("mouseup", up)
  }

  setHover(id) {
    if (this.hoverId === id) return
    this.hoverId = id
    this.refresh()
  }

  // Converts a rect in iframe viewport coordinates to the parent page's viewport.
  toParentRect(rect) {
    const frame = this.frame.getBoundingClientRect()
    return { left: rect.left + frame.left, top: rect.top + frame.top, right: rect.right + frame.left, bottom: rect.bottom + frame.top, width: rect.width, height: rect.height }
  }

  // --- events ---------------------------------------------------------------

  onMove(event) {
    if (this.editor.drag || this.free.dragging || this.resizing) return
    const hit = this.hit(event.target)
    const element = hit && !hit.placeholder ? hit.element : null
    if (element !== this.hoverElement) {
      this.hoverElement = element
      this.hoverId = null
    }
    this.setHover(hit && !hit.placeholder ? hit.id : null)
  }

  onClick(event) {
    if (this.editor.editingId && event.target.closest?.(".ProseMirror, .tess-plain")) return
    if (event.target.closest?.("#tess-overlay")) return
    event.preventDefault()
    if (this.resized) return
    if (this.openLink(event)) return
    if (this.free.swallowClick()) return
    const hit = this.hit(event.target)
    this.anchorAt(hit)
    if (hit?.placeholder) {
      const rect = this.toParentRect(hit.element.getBoundingClientRect())
      this.editor.select(hit.id)
      this.editor.openInsertMenu(hit.id, 0, rect)
      return
    }
    const part = hit && hit.id === this.editor.selectedId && this.partAt(event.target, hit.id)
    if (part) {
      this.editor.startEditing(hit.id, part)
      return
    }
    this.editor.select(hit ? hit.id : this.editor.doc.id, { reveal: true })
  }

  // A link a kit marks with data-tess-open, part of its canvas rather than of
  // the document (a link to a designer), opens in a new tab
  openLink(event) {
    const link = event.target.closest?.("a[data-tess-open][href]")
    if (!link) return false
    window.open(link.href, "_blank", "noopener")
    return true
  }

  onDoubleClick(event) {
    const hit = this.hit(event.target)
    this.anchorAt(hit)
    const part = hit && !hit.placeholder && this.partAt(event.target, hit.id)
    if (part) this.editor.startEditing(hit.id, part)
  }

  onDragOver(event) {
    if (isFileDrag(event, this.editor)) return this.onFileDragOver(event)
    const drag = this.editor.drag
    if (!drag) return
    const target = this.free.dropTarget(event.clientX, event.clientY, drag) || this.dropTarget(event.clientX, event.clientY, drag)
    if (!target) {
      this.hideIndicator()
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = drag.kind === "move" ? "move" : "copy"
    this.showIndicator(target)
  }

  onDrop(event) {
    if (isFileDrag(event, this.editor)) return this.onFileDrop(event)
    const drag = this.editor.drag
    if (!drag) return
    event.preventDefault()
    const target = this.free.dropTarget(event.clientX, event.clientY, drag) || this.dropTarget(event.clientX, event.clientY, drag)
    this.hideIndicator()
    if (target) this.editor.drop(drag, target.parentId, target.index, target.at)
    this.editor.endDrag()
  }

  // An image file dragged from the desktop onto a block with an image field
  // uploads it there: an Image block's image, or the background of the hero,
  // section or wrapper the pointer is in. Elsewhere the drop is refused, so
  // the browser doesn't open the file.
  onFileDragOver(event) {
    event.preventDefault()
    const target = this.imageTarget(event.target)
    event.dataTransfer.dropEffect = target ? "copy" : "none"
    const rect = target && this.rectOf(target.id)
    if (rect) this.showIndicator({ fill: rect })
    else this.hideIndicator()
  }

  onFileDrop(event) {
    event.preventDefault()
    this.hideIndicator()
    const target = this.imageTarget(event.target)
    const file = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"))
    if (target && file) this.editor.dropImage(target.id, file, target.field)
  }

  // The nearest block, from the one under the pointer outwards, with an image
  // field that can be edited. The root's (e.g. a page background) only when
  // dropped on the page itself, not on a block in it.
  imageTarget(target) {
    if (!this.editor.media.enabled) return null
    const hit = this.hit(target)
    if (!hit) return null
    const doc = this.editor.doc
    for (const node of [find(doc, hit.id).node, ...ancestors(doc, hit.id).filter((node) => node !== doc)]) {
      const field = imageFields(getBlock(node.type)).find((field) => this.editor.canEditField(node.id, field.key))
      if (field) return { id: node.id, field }
    }
    return null
  }

  // Shows another image in a block before the upload finishes (until the
  // next render): where the block shows its current image, or else as the
  // block's background
  preview(id, current, url) {
    const element = this.elementOf(id)
    if (!element) return
    let shown = false
    for (const child of [element, ...element.querySelectorAll("*")]) {
      if (current && child.tagName === "IMG" && child.getAttribute("src") === current) {
        child.removeAttribute("srcset")
        child.src = url
        shown = true
      }
      if (current && child.getAttribute("background") === current) child.setAttribute("background", url)
      const style = child.getAttribute("style")
      if (current && style?.includes(current)) {
        child.setAttribute("style", style.split(current).join(url))
        shown = true
      }
    }
    if (!shown) Object.assign(element.style, { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" })
    element.style.opacity = "0.6"
  }

  // --- dropping --------------------------------------------------------------

  allowed(parentId, drag) {
    const doc = this.editor.doc
    if (!this.editor.canInsert(parentId, drag.type, { moving: drag.kind !== "new" })) return false
    if (drag.kind === "move" && (parentId === drag.id || isDescendant(doc, drag.id, parentId))) return false
    return true
  }

  // Finds where a block of drag.type would land for a pointer at (x, y).
  dropTarget(x, y, drag) {
    const doc = this.editor.doc
    const hit = this.hit(this.doc.elementFromPoint(x, y))
    if (hit?.placeholder) return this.allowed(hit.id, drag) ? { parentId: hit.id, index: 0, fill: hit.element.getBoundingClientRect() } : null

    const startId = hit ? hit.id : doc.id
    const chain = [find(doc, startId).node, ...ancestors(doc, startId)]

    // 1. Pointer over a container that accepts the block: insert among its children.
    const first = chain[0]
    if (this.allowed(first.id, drag) && (first.children || []).length) {
      return this.among(first, x, y)
    }
    // 2. Otherwise go up until a parent accepts it, and insert before or after.
    for (let i = 0; i < chain.length - 1; i++) {
      const node = chain[i]
      const parent = chain[i + 1]
      if (drag.kind === "move" && node.id === drag.id) continue
      if (!this.allowed(parent.id, drag)) continue
      const rect = this.rectOf(node.id)
      if (!rect) continue
      const horizontal = isHorizontal(doc, parent.id)
      const after = horizontal ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2
      const index = parent.children.indexOf(node) + (after ? 1 : 0)
      return { parentId: parent.id, index, line: this.line(rect, horizontal, after) }
    }
    if (this.allowed(doc.id, drag)) return this.among(doc, x, y)
    return null
  }

  among(container, x, y) {
    const horizontal = isHorizontal(this.editor.doc, container.id)
    const children = container.children || []
    let index = children.length
    let line = null
    for (let i = 0; i < children.length; i++) {
      const rect = this.rectOf(children[i].id)
      if (!rect) continue
      const before = horizontal ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2
      if (before) {
        index = i
        line = this.line(rect, horizontal, false)
        break
      }
    }
    if (!line && children.length) {
      const rect = this.rectOf(children[children.length - 1].id)
      if (rect) line = this.line(rect, horizontal, true)
    }
    if (!line) return { parentId: container.id, index, fill: this.rectOf(container.id) }
    return { parentId: container.id, index, line }
  }

  line(rect, horizontal, after) {
    if (horizontal) return { left: (after ? rect.right : rect.left) - 2, top: rect.top, width: 4, height: rect.height }
    return { left: rect.left, top: (after ? rect.bottom : rect.top) - 2, width: rect.width, height: 4 }
  }

  showIndicator(target) {
    this.hideIndicator()
    const rect = target.line || target.fill
    if (!rect) return
    this.indicator = this.box(rect, target.line ? "tess-indicator" : "tess-indicator tess-fill")
    this.overlay.append(this.indicator)
  }

  hideIndicator() {
    this.indicator?.remove()
    this.indicator = null
  }
}

// A translation's text in an element, its %{…} placeholders apart
export function showText(element, value) {
  const doc = element.ownerDocument
  element.replaceChildren(
    ...textParts(value).map((part) => {
      if (part.text !== undefined) return doc.createTextNode(part.text)
      const placeholder = doc.createElement("span")
      placeholder.className = "tess-t-arg"
      placeholder.textContent = part.placeholder
      return placeholder
    })
  )
}
