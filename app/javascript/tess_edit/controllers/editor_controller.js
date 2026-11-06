// <div data-controller="tess-edit"> … </div>
//
// Values:
//   document  JSON of the document to load (falls back to the json input, then a sample)
//   sample    load the sample document when there is nothing else (default true)
//   panels    "split" (Blocks and Layers left, Inspect right), "left" or "right" (all panels
//             as tabs on one side). The default; a choice made in the editor's
//             top bar is remembered per browser. Below NARROW_WIDTH the editor
//             puts all panels on the left, whatever the choice, to leave room
//             for the canvas.
// Targets (all optional, usually hidden inputs in a form):
//   jsonInput, mjmlInput, htmlInput  kept up to date with every change
// Events:
//   tess-edit:change  detail: { json, mjml, html, document }

import { Controller } from "@hotwired/stimulus"
import { accepted, ancestors, createDocument, createFromPalette, duplicate, find, getValue, insert, itemType, move, normalize, remove, setValue } from "tess_edit/core/document"
import { History } from "tess_edit/core/history"
import { getBlock, paletteItems } from "tess_edit/core/registry"
import { starterDocument } from "tess_edit/core/starter"
import { toMjml } from "tess_edit/export/mjml"
import { compile } from "tess_edit/export/compile"
import { Canvas } from "tess_edit/ui/canvas"
import { Tree } from "tess_edit/ui/tree"
import { Inspector } from "tess_edit/ui/inspector"
import { TextEditing } from "tess_edit/ui/text_editing"
import { renderBlocksPanel } from "tess_edit/ui/blocks_panel"
import { debounce, h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const TOOL = "w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent"
const TAB = "px-3 h-12 text-[13px] font-medium border-b-2 -mb-px"
const PANELS = ["left", "split", "right"]
const PANELS_KEY = "tess_edit:panels"
// Two sidebars (256px + 320px) leave too little canvas below this editor width.
const NARROW_WIDTH = 1000

export default class extends Controller {
  static values = { document: String, sample: { type: Boolean, default: true }, panels: { type: String, default: "split" } }
  static targets = ["jsonInput", "mjmlInput", "htmlInput"]

  connect() {
    this.history = new History()
    this.doc = this.loadInitial()
    this.selectedId = this.doc.id
    this.editingId = null
    this.drag = null
    this.mode = "edit"
    this.device = "desktop"
    this.leftTab = "blocks"
    this.panels = [this.storedPanels(), this.panelsValue].find((value) => PANELS.includes(value)) || "split"
    this.narrow = false
    this.renderToken = 0

    this.scheduleCanvas = debounce(() => this.renderCanvas(), 60)
    this.scheduleOutputs = debounce(() => this.writeOutputs(), 300)

    this.build()
    this.renderAll()
    this.writeOutputs()
    this.element.tessEdit = this
  }

  disconnect() {
    this.scheduleCanvas.cancel()
    this.scheduleOutputs.cancel()
    this.textEditing?.stop()
    this.closeMenu()
    this.resizeObserver?.disconnect()
    document.removeEventListener("mousedown", this.outsideClick)
    document.removeEventListener("keydown", this.menuKeydown, true)
    window.removeEventListener("resize", this.closeMenuOnResize)
    this.root?.remove()
    delete this.element.tessEdit
  }

  loadInitial() {
    const source = this.documentValue || (this.hasJsonInputTarget && this.jsonInputTarget.value)
    if (source && source.trim()) {
      try {
        return normalize(source)
      } catch (error) {
        console.error("TessEdit: could not load the document", error)
      }
    }
    return this.sampleValue ? starterDocument() : createDocument()
  }

  // --- public API -------------------------------------------------------------

  getDocument() {
    return JSON.parse(JSON.stringify(this.doc))
  }

  setDocument(input) {
    this.stopEditing()
    this.history.record(JSON.stringify(this.doc))
    this.doc = normalize(input)
    this.selectedId = this.doc.id
    this.renderAll()
  }

  async export() {
    const mjml = toMjml(this.doc)
    const { html, errors } = await compile(mjml)
    return { json: JSON.stringify(this.doc), mjml, html, errors }
  }

  // --- layout -------------------------------------------------------------------

  build() {
    this.blocksElement = h("div", { class: "flex-1 overflow-y-auto pb-4" })
    this.treeElement = h("div", { class: "flex-1 overflow-y-auto" })
    this.leftTabs = h("div", { class: "flex border-b border-gray-200 px-2 shrink-0" })
    this.inspectorElement = h("div", { class: "flex flex-1 flex-col min-h-0", dataset: { tessEditPanel: "inspect" } })
    this.sidePanel = h("aside")
    this.inspectPanel = h("aside")
    this.textToolbar = h("div", { class: "hidden absolute left-1/2 top-3 z-20 -translate-x-1/2 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-md" })
    this.frame = h("iframe", { class: "block h-full w-full border-0 bg-white transition-[width] duration-200", title: "Email canvas" })
    this.frameWrap = h("div", { class: "relative h-full mx-auto" }, this.frame)
    this.topBar = h("div", { class: "flex items-center gap-1 h-12 px-3 border-b border-gray-200 bg-white shrink-0" })
    this.body = h("div", { class: "flex flex-1 min-h-0" })

    this.root = h(
      "div",
      { class: "tess-edit relative flex flex-col h-full min-h-[560px] overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 antialiased", tabindex: "-1", onkeydown: (event) => this.onKeydown(event) },
      this.topBar,
      this.body
    )
    this.main = h("main", { class: "relative flex-1 min-w-0 bg-gray-100", ondragover: (event) => this.drag && event.preventDefault() }, this.textToolbar, this.frameWrap)
    this.arrangePanels()
    this.element.append(this.root)

    this.canvas = new Canvas(this, this.frame)
    this.tree = new Tree(this, this.treeElement)
    this.inspector = new Inspector(this, this.inspectorElement)
    this.textEditing = new TextEditing(this.textToolbar)
    renderBlocksPanel(this, this.blocksElement)
    this.observeWidth()

    // The insert menu closes on a mousedown outside it (here or in the canvas,
    // see Canvas#listen), on Escape anywhere, and when the window resizes.
    this.outsideClick = (event) => {
      if (this.menu && !this.menu.contains(event.target)) this.closeMenu({ outside: true })
    }
    this.menuKeydown = (event) => {
      if (this.menu && event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        this.closeMenu()
      }
    }
    this.closeMenuOnResize = () => this.closeMenu()
    document.addEventListener("mousedown", this.outsideClick)
    document.addEventListener("keydown", this.menuKeydown, true)
    window.addEventListener("resize", this.closeMenuOnResize)
  }

  // Split: Blocks and Layers on the left, Inspect on the right. Left or right:
  // one sidebar on that side with Blocks, Layers and Inspect as tabs.
  arrangePanels() {
    const panelClass = (border, width) => `${width} shrink-0 flex flex-col ${border} border-gray-200 bg-white min-h-0`
    // Only the sidebars move: moving <main> would reload the canvas iframe and blank it.
    if (!this.main.isConnected) this.body.append(this.main)
    this.sidePanel.replaceChildren(this.leftTabs, this.blocksElement, this.treeElement)
    if (this.layout === "split") {
      this.sidePanel.className = panelClass("border-r", "w-64")
      this.inspectPanel.className = panelClass("border-l", "w-80")
      this.inspectPanel.replaceChildren(this.inspectorElement)
      this.main.before(this.sidePanel)
      this.main.after(this.inspectPanel)
    } else {
      this.sidePanel.className = panelClass(this.layout === "left" ? "border-r" : "border-l", "w-80")
      this.sidePanel.append(this.inspectorElement)
      this.inspectPanel.remove()
      this.layout === "left" ? this.main.before(this.sidePanel) : this.main.after(this.sidePanel)
    }
  }

  setPanels(panels) {
    if (!PANELS.includes(panels)) return
    this.panels = panels
    try {
      localStorage.setItem(PANELS_KEY, panels)
    } catch {}
    this.applyPanels()
  }

  applyPanels() {
    if (!this.combined && this.leftTab === "inspect") this.leftTab = "blocks"
    this.arrangePanels()
    this.renderTopBar()
    this.renderLeftTabs()
  }

  // Combines the panels while the editor is narrower than NARROW_WIDTH.
  observeWidth() {
    if (typeof ResizeObserver === "undefined") return
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const narrow = entry.contentRect.width < NARROW_WIDTH
      if (narrow === this.narrow) return
      this.narrow = narrow
      this.applyPanels()
      this.canvas.refresh()
    })
    this.resizeObserver.observe(this.root)
  }

  // The layout in use: the chosen one, unless the editor is too narrow to split.
  get layout() {
    return this.narrow && this.panels === "split" ? "left" : this.panels
  }

  storedPanels() {
    try {
      return localStorage.getItem(PANELS_KEY)
    } catch {
      return null
    }
  }

  get combined() {
    return this.layout !== "split"
  }

  renderAll() {
    this.renderTopBar()
    this.renderLeftTabs()
    this.tree.render()
    this.inspector.render()
    this.scheduleCanvas()
    this.scheduleOutputs()
  }

  renderTopBar() {
    const toggle = (current, options, onchange) =>
      h(
        "div",
        { class: "flex rounded-lg bg-gray-100 p-0.5" },
        options.map(([value, name, title, disabled = false]) =>
          h("button", {
            type: "button",
            title,
            disabled,
            class: `w-8 h-7 flex items-center justify-center rounded-md disabled:opacity-40 disabled:pointer-events-none ${current === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`,
            html: icon(name),
            onclick: () => onchange(value)
          })
        )
      )

    this.topBar.replaceChildren(
      h("span", { class: "font-semibold text-gray-900 mr-3" }, "Email"),
      toggle(this.mode, [["edit", "edit", "Edit"], ["preview", "eye", "Preview the email as sent, with Liquid tags"]], (mode) => this.setMode(mode)),
      toggle(this.device, [["desktop", "desktop", "Desktop"], ["mobile", "mobile", "Mobile"]], (device) => this.setDevice(device)),
      h("div", { class: "flex-1" }),
      toggle(
        this.layout,
        [
          ["left", "panels-left", "All panels on the left"],
          ["split", "panels-split", this.narrow ? "Too narrow to split the panels" : "Blocks on the left, Inspect on the right", this.narrow],
          ["right", "panels-right", "All panels on the right"]
        ],
        (panels) => this.setPanels(panels)
      ),
      h("span", { class: "mx-1 h-5 w-px bg-gray-200" }),
      h("button", { type: "button", title: "Undo (⌘Z)", class: TOOL, disabled: !this.history.canUndo, html: icon("undo"), onclick: () => this.undo() }),
      h("button", { type: "button", title: "Redo (⇧⌘Z)", class: TOOL, disabled: !this.history.canRedo, html: icon("redo"), onclick: () => this.redo() }),
      h(
        "button",
        { type: "button", class: "ml-2 flex items-center gap-1.5 h-8 rounded-md bg-gray-900 px-3 text-[13px] font-medium text-white hover:bg-gray-700", onclick: () => this.openCodeDialog() },
        h("span", { html: icon("export") }),
        "Code"
      )
    )
  }

  renderLeftTabs() {
    const tab = (key, name) =>
      h("button", { type: "button", class: `${TAB} ${this.leftTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"}`, onclick: () => this.setLeftTab(key) }, name)
    // replaceChildren would turn a null into the text "null", so only pass real tabs.
    const tabs = [tab("blocks", "Blocks"), tab("layers", "Layers")]
    if (this.combined) tabs.push(tab("inspect", "Inspect"))
    this.leftTabs.replaceChildren(...tabs)
    this.blocksElement.classList.toggle("hidden", this.leftTab !== "blocks")
    this.treeElement.classList.toggle("hidden", this.leftTab !== "layers")
    this.inspectorElement.classList.toggle("hidden", this.combined && this.leftTab !== "inspect")
  }

  setLeftTab(tab) {
    this.leftTab = tab
    this.renderLeftTabs()
  }

  setMode(mode) {
    this.stopEditing()
    this.mode = mode
    this.renderTopBar()
    this.renderCanvas()
  }

  setDevice(device) {
    this.device = device
    // Desktop fills the canvas area; mobile shows a full-height 375px frame in the middle of it.
    const mobile = device === "mobile"
    this.frameWrap.style.width = mobile ? "375px" : ""
    this.frameWrap.classList.toggle("shadow-sm", mobile)
    this.main.classList.toggle("px-4", mobile)
    this.renderTopBar()
    setTimeout(() => this.canvas.refresh(), 250)
  }

  // --- rendering --------------------------------------------------------------

  async renderCanvas() {
    if (this.editingId) return
    const token = ++this.renderToken
    const { html, errors } = await compile(toMjml(this.doc, { editor: this.mode === "edit" }))
    if (token !== this.renderToken || this.editingId) return
    if (errors.length) console.warn("TessEdit: MJML warnings", errors)
    this.canvas.write(html, this.mode)
  }

  async writeOutputs() {
    const json = JSON.stringify(this.doc)
    const mjml = toMjml(this.doc)
    const { html } = await compile(mjml)
    if (this.hasJsonInputTarget) this.jsonInputTarget.value = json
    if (this.hasMjmlInputTarget) this.mjmlInputTarget.value = mjml
    if (this.hasHtmlInputTarget) this.htmlInputTarget.value = html
    this.dispatch("change", { detail: { json, mjml, html, document: this.doc } })
  }

  // Applies a change to the document as one undo step.
  commit(mutate, { coalesce = null, skipInspector = false } = {}) {
    const before = JSON.stringify(this.doc)
    mutate(this.doc)
    if (JSON.stringify(this.doc) === before) return
    this.history.record(before, coalesce)
    this.renderTopBar()
    this.tree.render()
    if (!skipInspector) this.inspector.render()
    this.scheduleCanvas()
    this.scheduleOutputs()
  }

  // --- selection and editing ---------------------------------------------------

  // `reveal` (a click on the canvas) shows the Inspect tab when the panels are combined.
  select(id, { reveal = false } = {}) {
    if (reveal && this.combined && this.leftTab !== "inspect") this.setLeftTab("inspect")
    if (this.editingId && this.editingId !== id) this.stopEditing()
    if (!find(this.doc, id)) id = this.doc.id
    if (this.selectedId === id) return
    this.selectedId = id
    for (const node of ancestors(this.doc, id)) this.tree.collapsed.delete(node.id)
    this.tree.render()
    this.inspector.render()
    this.canvas.refresh()
  }

  selectParent() {
    const parent = find(this.doc, this.selectedId)?.parent
    if (parent) this.select(parent.id)
  }

  setValue(id, key, value, { coalesce = true } = {}) {
    if (this.editingId) this.stopEditing()
    this.commit((doc) => setValue(doc, id, key, value), { coalesce: coalesce ? `${id}:${key}` : null, skipInspector: true })
  }

  duplicate(id) {
    let copy
    this.commit((doc) => (copy = duplicate(doc, id)))
    if (copy) this.select(copy.id)
  }

  remove(id) {
    const hit = find(this.doc, id)
    if (!hit?.parent) return
    this.stopEditing()
    this.commit((doc) => remove(doc, id))
    const siblings = hit.parent.children
    this.select(siblings[Math.min(hit.index, siblings.length - 1)]?.id || hit.parent.id)
  }

  startEditing(id) {
    const hit = find(this.doc, id)
    const key = hit && getBlock(hit.node.type)?.richText
    if (!key || this.mode !== "edit") return
    if (this.editingId === id) return
    this.stopEditing()
    this.select(id)
    const container = this.canvas.textContainer(id)
    if (!container) return
    this.editingId = id
    this.editSnapshot = JSON.stringify(this.doc)
    this.textEditing.start(container, getValue(hit.node, key), (json) => {
      setValue(this.doc, id, key, json)
      this.tree.render()
      this.canvas.refresh()
      this.scheduleOutputs()
    })
    this.canvas.refresh()
  }

  stopEditing() {
    if (!this.editingId) return
    this.textEditing.stop()
    this.editingId = null
    if (this.editSnapshot !== JSON.stringify(this.doc)) this.history.record(this.editSnapshot)
    this.editSnapshot = null
    this.renderTopBar()
    this.inspector.render()
    this.renderCanvas()
  }

  undo() {
    this.stopEditing()
    const snapshot = this.history.undo(JSON.stringify(this.doc))
    if (snapshot) this.restore(snapshot)
  }

  redo() {
    this.stopEditing()
    const snapshot = this.history.redo(JSON.stringify(this.doc))
    if (snapshot) this.restore(snapshot)
  }

  restore(snapshot) {
    this.doc = JSON.parse(snapshot)
    if (!find(this.doc, this.selectedId)) this.selectedId = this.doc.id
    this.renderAll()
  }

  // --- adding and moving blocks ------------------------------------------------

  startDrag(drag) {
    this.closeMenu()
    if (this.editingId) this.stopEditing()
    this.drag = drag
    this.canvas.setHover(null)
  }

  endDrag() {
    this.drag = null
    this.canvas.hideIndicator()
    this.tree.clearMarker()
  }

  drop(drag, parentId, index) {
    if (!drag) return
    if (drag.kind === "new") {
      const node = createFromPalette(drag.key)
      this.commit((doc) => insert(doc, parentId, index, node))
      this.select(node.id)
    } else {
      this.commit((doc) => move(doc, drag.id, parentId, index))
      this.select(drag.id)
    }
  }

  insertAt(key, parentId, index) {
    const node = createFromPalette(key)
    this.commit((doc) => insert(doc, parentId, index, node))
    this.select(node.id)
    this.leftTab === "layers" && this.tree.render()
  }

  // Clicking a tile: add inside the selection when it fits, otherwise after the
  // nearest ancestor that fits, otherwise at the end of the page.
  addFromPalette(key) {
    const type = itemType(key)
    const chain = [find(this.doc, this.selectedId)?.node || this.doc, ...ancestors(this.doc, this.selectedId)]
    if (accepted(this.doc, chain[0].id).includes(type)) return this.insertAt(key, chain[0].id, chain[0].children.length)
    for (let i = 0; i < chain.length - 1; i++) {
      if (accepted(this.doc, chain[i + 1].id).includes(type)) return this.insertAt(key, chain[i + 1].id, chain[i + 1].children.indexOf(chain[i]) + 1)
    }
    if (accepted(this.doc, this.doc.id).includes(type)) return this.insertAt(key, this.doc.id, this.doc.children.length)
    this.flash(`${getBlock(type)?.name || key} has to go inside a column. Select one first, or drag it onto the canvas.`)
  }

  openInsertMenu(parentId, index, rect) {
    const anchor = `${parentId}:${index}`
    // A second click on the same plus button or placeholder closes the menu.
    // Its mousedown already closed it as an outside click, so check for that.
    const closed = this.menuClosed
    if (this.menu?.dataset.anchor === anchor || (closed?.anchor === anchor && Date.now() - closed.at < 500)) {
      this.closeMenu()
      this.menuClosed = null
      return
    }
    this.closeMenu()
    const allowed = accepted(this.doc, parentId)
    const items = paletteItems().filter((item) => allowed.includes(item.type))
    if (!items.length) return
    this.menu = h(
      "div",
      { class: "fixed z-50 w-56 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg", role: "menu", "data-anchor": anchor, "data-tess-edit-menu": "insert" },
      h("div", { class: "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500" }, "Add block"),
      items.map((item) =>
        h(
          "button",
          {
            type: "button",
            role: "menuitem",
            class: "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-gray-700 hover:bg-blue-50 hover:text-blue-700",
            onclick: () => {
              this.closeMenu()
              this.insertAt(item.key, parentId, index)
            }
          },
          h("span", { class: "text-gray-400", html: icon(item.icon) }),
          item.label
        )
      )
    )
    document.body.append(this.menu)
    const width = 224
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
    const below = rect.bottom + 6
    const height = Math.min(this.menu.offsetHeight, 320)
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
    Object.assign(this.menu.style, { left: `${left}px`, top: `${top}px` })
  }

  closeMenu({ outside = false } = {}) {
    if (this.menu && outside) this.menuClosed = { anchor: this.menu.dataset.anchor, at: Date.now() }
    this.menu?.remove()
    this.menu = null
  }

  flash(message) {
    const note = h("div", { class: "absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg" }, message)
    this.root.append(note)
    setTimeout(() => note.remove(), 3500)
  }

  // --- keyboard -----------------------------------------------------------------

  onKeydown(event) {
    const target = event.target
    const typing = target.closest?.("input, textarea, select, [contenteditable='true']")
    const mod = event.metaKey || event.ctrlKey

    if (this.menu && event.key === "Escape") {
      event.preventDefault()
      this.closeMenu()
      return
    }
    if (this.editingId) {
      if (event.key === "Escape") {
        event.preventDefault()
        this.stopEditing()
      }
      return
    }
    if (typing) return
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault()
      event.shiftKey ? this.redo() : this.undo()
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault()
      this.redo()
    } else if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault()
      if (this.selectedId !== this.doc.id) this.duplicate(this.selectedId)
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (this.selectedId !== this.doc.id) {
        event.preventDefault()
        this.remove(this.selectedId)
      }
    } else if (event.key === "Enter" && getBlock(find(this.doc, this.selectedId)?.node.type)?.richText) {
      event.preventDefault()
      this.startEditing(this.selectedId)
    } else if (event.key === "Escape") {
      this.closeMenu()
      this.selectParent()
    }
  }

  // --- code dialog ----------------------------------------------------------------

  async openCodeDialog(tab = "json") {
    this.stopEditing()
    const { json, mjml, html, errors } = await this.export()
    const contents = { json: JSON.stringify(JSON.parse(json), null, 2), mjml, html }
    const textarea = h("textarea", { class: "flex-1 w-full resize-none rounded-md border border-gray-300 p-3 font-mono text-xs text-gray-800 outline-none focus:border-blue-500", spellcheck: false })
    const status = h("span", { class: "text-xs text-gray-500" })
    const tabs = h("div", { class: "flex gap-1" })
    const apply = h("button", { type: "button", class: "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700", onclick: () => {
      try {
        this.setDocument(textarea.value)
        close()
      } catch (error) {
        status.textContent = error.message
        status.className = "text-xs text-red-600"
      }
    } }, "Load this JSON")

    const show = (key) => {
      tab = key
      textarea.value = contents[key]
      textarea.readOnly = key !== "json"
      apply.classList.toggle("hidden", key !== "json")
      status.className = "text-xs text-gray-500"
      status.textContent =
        key === "json" ? "The document. Edit and load it, or paste one in." : key === "mjml" ? "Liquid loops and conditions are in <mj-raw> tags." : `Liquid is left in place for rendering at send time.${errors.length ? ` MJML reported ${errors.length} warning(s).` : ""}`
      tabs.replaceChildren(
        ...["json", "mjml", "html"].map((name) =>
          h("button", { type: "button", class: `rounded-md px-3 py-1.5 text-xs font-medium ${name === tab ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`, onclick: () => show(name) }, name.toUpperCase())
        )
      )
    }

    const close = () => dialog.remove()
    const download = () => {
      const blob = new Blob([textarea.value], { type: tab === "json" ? "application/json" : tab === "html" ? "text/html" : "text/plain" })
      const link = h("a", { href: URL.createObjectURL(blob), download: `email.${tab}` })
      link.click()
      URL.revokeObjectURL(link.href)
    }

    const dialog = h(
      "div",
      { class: "absolute inset-0 z-40 flex items-center justify-center bg-gray-900/40 p-6", onmousedown: (event) => event.target === dialog && close(), onkeydown: (event) => event.key === "Escape" && close() },
      h(
        "div",
        { class: "flex h-full max-h-[720px] w-full max-w-4xl flex-col gap-3 rounded-xl bg-white p-4 shadow-xl" },
        h("div", { class: "flex items-center gap-3" }, tabs, status, h("button", { type: "button", class: "ml-auto " + TOOL, title: "Close", html: icon("close"), onclick: close })),
        textarea,
        h(
          "div",
          { class: "flex items-center justify-end gap-2" },
          h("button", { type: "button", class: "rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50", onclick: () => navigator.clipboard?.writeText(textarea.value).then(() => (status.textContent = "Copied.")) }, "Copy"),
          h("button", { type: "button", class: "rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50", onclick: download }, "Download"),
          apply
        )
      )
    )
    show(tab)
    this.root.append(dialog)
    textarea.focus()
  }
}
