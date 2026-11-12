// <div data-controller="tess-edit"> … </div>
//
// Values:
//   kit       what the editor makes: "email" (the default), or a kit the host
//             registered (see core/registry.js)
//   document  JSON of the document to load (falls back to the json input, then a sample)
//   sample    load the sample document when there is nothing else (default true)
//   frame     a border with rounded corners around the editor (default true); a
//             host that frames it itself, such as a card it fills, turns it off
//   panels    "split" (Blocks and Layers left, Inspect right), "left" or "right" (all panels
//             as tabs on one side). The default; a choice made in the editor's
//             top bar is remembered per browser. Below NARROW_WIDTH the editor
//             puts all panels on the left, whatever the choice, to leave room
//             for the canvas.
//   compileUrl  the endpoint that compiles the email kit's MJML to HTML (default
//               /tess_edit/compile, the engine mounted at /tess_edit)
//   mediaUrl    the host's images, chosen and uploaded in Image blocks (see
//               core/media.js); without it images only have a URL
//   variablesUrl  the variables a template can use, suggested while typing {{
//                 and browsed with { } buttons (see core/variables.js), e.g.
//                 Liquidum's /liquidum/variables?roots=…
//   translationsUrl  the host's translations for Liquid's t filter ({{ '.greeting' | t }}),
//                    shown in a language chosen in the top bar, listed and edited
//                    while pointed at, and made from selected text (see
//                    core/translations.js)
//   lock        JSON: only the insides of some blocks and some root fields can
//               change, e.g. {"except": ["content"], "fields": ["data.subject"]}
//               (see core/lock.js)
//   blocks      JSON: the only block types that can be added, e.g. ["text", "image"];
//               without it, all of the kit's
//   options     JSON: anything a host's blocks need from the page, as
//               editor.options, e.g. the choices of a select field
//               (options: (editor) => editor.options.parties)
// Targets (all optional, usually hidden inputs in a form):
//   jsonInput, mjmlInput, htmlInput  kept up to date with every change, with
//                    the kit's outputs (an <output>Input target for each)
// Events:
//   tess-edit:change  detail: { json, ...the kit's outputs, errors, document }:
//                     for an email { json, mjml, html, errors, document }, with
//                     html empty when the MJML could not be compiled and errors saying why

import { Controller } from "@hotwired/stimulus"
import { accepted, ancestors, createDocument, createFromPalette, duplicate, find, findType, getValue, insert, itemType, misfit, move, normalize, remove, setValue, walk } from "tess_edit/core/document"
import { History } from "tess_edit/core/history"
import { canEditField, canFill, isFree, parseLock } from "tess_edit/core/lock"
import { DEFAULT_KIT, getBlock, getKit, paletteItems, paletteSources } from "tess_edit/core/registry"
import { COMPILE_URL } from "tess_edit/export/compile"
import { IMAGE_FIELD, fetchMedia, uploadMedia } from "tess_edit/core/media"
import { Translations, keysIn, suggestKey, toTranslation, translationTag } from "tess_edit/core/translations"
import { Variables, loopScope } from "tess_edit/core/variables"
import { Canvas } from "tess_edit/ui/canvas"
import { freeChild, number } from "tess_edit/ui/free_layout"
import { Tree } from "tess_edit/ui/tree"
import { Inspector } from "tess_edit/ui/inspector"
import { TextEditing } from "tess_edit/ui/text_editing"
import { VariableMenu } from "tess_edit/ui/variable_menu"
import { TranslationPopover } from "tess_edit/ui/translation_popover"
import { askTranslationKey } from "tess_edit/ui/translate_dialog"
import { renderBlocksPanel } from "tess_edit/ui/blocks_panel"
import { debounce, h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const TOOL = "w-8 h-8 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
const TAB = "px-3 h-12 text-[13px] font-medium border-b-2 -mb-px"
const PANELS = ["left", "split", "right"]
const PANELS_KEY = "tess_edit:panels"
const TRANSLATION_LOCALE_KEY = "tess_edit:translation_locale"
// Two sidebars (256px + 320px) leave too little canvas below this editor width.
const NARROW_WIDTH = 1000
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

// A new block where it was let go in a free layout
function placed(node, at) {
  if (at) node.data = { ...node.data, x: at.x, y: at.y }
  return node
}

export default class extends Controller {
  static values = { kit: { type: String, default: DEFAULT_KIT }, document: String, sample: { type: Boolean, default: true }, frame: { type: Boolean, default: true }, panels: { type: String, default: "split" }, compileUrl: { type: String, default: COMPILE_URL }, mediaUrl: String, variablesUrl: String, translationsUrl: String, lock: String, blocks: String, options: String }
  static targets = ["jsonInput", "mjmlInput", "htmlInput"]

  connect() {
    this.kit = getKit(this.kitValue)
    if (!this.kit) {
      console.error(`TessEdit: unknown kit ${this.kitValue}, editing an email instead`)
      this.kit = getKit(DEFAULT_KIT)
    }
    this.lock = parseLock(this.lockValue)
    this.allowedTypes = this.parseJson(this.blocksValue, "blocks")
    this.options = this.parseJson(this.optionsValue, "options") || {}
    // The host's tiles from palette sources (core/registry.js), by source key
    this.sources = new Map()
    this.history = new History()
    this.doc = this.loadInitial()
    this.selectedId = this.doc.id
    this.editingId = null
    this.drag = null
    this.mode = "edit"
    this.device = this.kit.devices?.[0]?.key || null
    this.leftTab = "blocks"
    this.panels = [this.storedPanels(), this.panelsValue].find((value) => PANELS.includes(value)) || "split"
    this.narrow = false
    this.requests = {}
    this.media = { enabled: Boolean(this.mediaUrlValue), images: [], uploading: false, error: null }
    this.variables = new Variables(this.variablesUrlValue)
    this.translations = new Translations(this.translationsUrlValue)
    this.translationPopover = this.translations.enabled ? new TranslationPopover(this) : null
    this.translationLocaleChoice = this.stored(TRANSLATION_LOCALE_KEY)
    this.variableMenu = this.variables.enabled || this.translations.enabled ? new VariableMenu(this) : null

    this.scheduleCanvas = debounce(() => this.renderCanvas(), 60)
    this.scheduleOutputs = debounce(() => this.writeOutputs(), 300)

    this.build()
    this.renderAll()
    this.writeOutputs()
    if (this.media.enabled) this.loadMedia()
    this.loadSources()
    if (this.translations.enabled) {
      this.translations.subscribe(() => this.showTranslations())
      this.loadTranslations()
    }
    this.element.tessEdit = this
  }

  // --- translations -------------------------------------------------------------

  // The language translations show in: the one chosen in the top bar, else
  // the host's first; null shows their Liquid ("Keys")
  get translationLocale() {
    const { locales } = this.translations
    if (this.translationLocaleChoice === "") return null
    return locales.includes(this.translationLocaleChoice) ? this.translationLocaleChoice : locales[0] || null
  }

  setTranslationLocale(locale) {
    this.translationLocaleChoice = locale
    try {
      localStorage.setItem(TRANSLATION_LOCALE_KEY, locale)
    } catch {}
    this.showTranslations()
  }

  // The keys in the document the editor doesn't have yet
  loadTranslations() {
    if (this.translations.enabled) this.translations.load(keysIn(this.doc))
  }

  showTranslations() {
    this.renderTopBar()
    this.canvas.showTranslations()
    this.textEditing.refreshTranslations()
    this.inspector.refreshTranslations()
    this.translationPopover?.refresh()
  }

  // Keeps a text as a translation in the editor's language (the host's first
  // in "Keys"), under a key the user confirms, and gives its t filter; null
  // when it isn't. Its Liquid variables become placeholders, given as the
  // filter's arguments: "Hi {{ user.name }}" is kept as "Hi %{name}", in
  // {{ '.hi' | t: name: user.name }}.
  async makeTranslatable(text) {
    const translations = this.translations
    const locale = this.translationLocale || translations.locales[0]
    if (!locale) {
      this.flash(translations.error || "There are no languages to translate into yet.")
      return null
    }
    const translation = toTranslation(text)
    if (translation.error) {
      this.flash(translation.error)
      return null
    }
    const key = await askTranslationKey(this.root, {
      text: translation.text,
      locale,
      suggested: suggestKey(text),
      existing: async (key) => {
        await translations.load([key])
        return translations.value(key, locale)
      }
    })
    if (!key) return null
    try {
      await translations.save(key, locale, translation.text)
    } catch (error) {
      this.flash(error.message)
      return null
    }
    return translationTag(key, translation.args)
  }

  parseJson(value, name) {
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch (error) {
      console.error(`TessEdit: the ${name} value is not JSON`, error)
      return null
    }
  }

  // The palette sources' tiles; a source whose items are null has none here
  async loadSources() {
    await Promise.all(
      paletteSources().map(async (source) => {
        try {
          const items = await source.items(this)
          if (items) this.sources.set(source.key, { source, items, error: null })
        } catch (error) {
          this.sources.set(source.key, { source, items: [], error: error.message })
        }
      })
    )
    if (this.sources.size) renderBlocksPanel(this, this.blocksElement)
  }

  async loadMedia() {
    try {
      this.media.images = await fetchMedia(this.mediaUrlValue)
      this.media.error = null
    } catch (error) {
      this.media.error = error.message
    }
    this.inspector?.render()
  }

  // Puts one of the host's images in a block's image field (an Image block's
  // image by default): its id and its URL
  chooseImage(id, image, field = IMAGE_FIELD) {
    if (!this.canEditField(id, field.key)) return
    this.commit((doc) => {
      setValue(doc, id, field.source, "upload")
      setValue(doc, id, field.image, image.id)
      setValue(doc, id, field.key, image.url)
    })
  }

  // An image file dropped on a block: shown at once, then uploaded
  async dropImage(id, file, field = IMAGE_FIELD) {
    this.select(id)
    const url = URL.createObjectURL(file)
    this.canvas.preview(id, getValue(find(this.doc, id).node, field.key), url)
    await this.uploadImage(id, file, field)
    // On failure the canvas goes back to the block's own image
    if (this.media.error) this.renderCanvas()
    URL.revokeObjectURL(url)
  }

  async uploadImage(id, file, field = IMAGE_FIELD) {
    this.media.uploading = true
    this.media.error = null
    this.inspector.render()
    try {
      const image = await uploadMedia(this.mediaUrlValue, file)
      this.media.images = [...this.media.images.filter((other) => other.id !== image.id), image]
      this.chooseImage(id, image, field)
    } catch (error) {
      this.media.error = error.message
    } finally {
      this.media.uploading = false
      this.inspector.render()
    }
  }

  disconnect() {
    this.scheduleCanvas.cancel()
    this.scheduleOutputs.cancel()
    Object.values(this.requests).forEach((request) => request.abort())
    this.textEditing?.stop()
    this.variableMenu?.close()
    this.translationPopover?.hide({ force: true })
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
        return normalize(source, { kit: this.kit.key })
      } catch (error) {
        console.error("TessEdit: could not load the document", error)
      }
    }
    return this.sampleValue ? this.kit.starter() : createDocument(this.kit.key)
  }

  // --- public API -------------------------------------------------------------

  getDocument() {
    return JSON.parse(JSON.stringify(this.doc))
  }

  setDocument(input) {
    this.stopEditing()
    this.history.record(JSON.stringify(this.doc))
    this.doc = normalize(input, { kit: this.kit.key })
    this.selectedId = this.doc.id
    this.renderAll()
  }

  // The JSON and the kit's outputs, e.g. { json, mjml, html, errors } for an email
  async export() {
    const { outputs, errors } = await this.kit.outputs(this.doc, { compileUrl: this.compileUrlValue })
    return { json: JSON.stringify(this.doc), ...outputs, errors }
  }

  // --- locking ------------------------------------------------------------------

  isFree(id) {
    return id !== this.doc.id && isFree(this.doc, this.lock, id)
  }

  canFill(parentId) {
    return canFill(this.doc, this.lock, parentId)
  }

  canEditField(id, key) {
    return canEditField(this.doc, this.lock, id, key)
  }

  // The block types that may be added to the node: none when it is locked,
  // only the allowed ones when the host limits them.
  accepted(parentId) {
    if (!this.canFill(parentId)) return []
    return accepted(this.doc, parentId).filter((type) => this.allows(type))
  }

  // Whether a block of the type can go in the node; with `moving`, a block
  // that is in the document already, which can always move where it fits
  // A palette source's tile counts as moving: the host gave it, so the allowed
  // blocks don't apply.
  canInsert(parentId, type, { moving = false } = {}) {
    if (!moving) return this.accepted(parentId).includes(type)
    return this.canFill(parentId) && accepted(this.doc, parentId, { moving }).includes(type)
  }

  allows(type) {
    return !this.allowedTypes || this.allowedTypes.includes(type)
  }

  // The Blocks panel's tiles
  paletteItems() {
    return paletteItems(this.kit.key).filter((item) => this.allows(item.type))
  }

  // --- layout -------------------------------------------------------------------

  build() {
    this.blocksElement = h("div", { class: "flex-1 overflow-y-auto pb-4" })
    this.treeElement = h("div", { class: "flex-1 overflow-y-auto" })
    this.leftTabs = h("div", { class: "flex border-b border-gray-200 dark:border-gray-700 px-2 shrink-0" })
    this.inspectorElement = h("div", { class: "flex flex-1 flex-col min-h-0", dataset: { tessEditPanel: "inspect" } })
    this.sidePanel = h("aside")
    this.inspectPanel = h("aside")
    this.textToolbar = h("div", { class: "hidden absolute left-1/2 top-3 z-20 -translate-x-1/2 flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-1 shadow-md" })
    this.frame = h("iframe", { class: "block h-full w-full border-0 bg-white transition-[width] duration-200", title: `${this.kit.name} canvas` })
    this.frameWrap = h("div", { class: "relative h-full mx-auto" }, this.frame)
    this.topBar = h("div", { class: "flex items-center gap-1 h-12 px-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0" })
    this.body = h("div", { class: "flex flex-1 min-h-0" })

    this.root = h(
      "div",
      { class: `tess-edit relative flex flex-col h-full min-h-[560px] overflow-hidden ${this.frameValue ? "rounded-lg border border-gray-200 dark:border-gray-700 " : ""}bg-gray-50 dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 antialiased dark:[color-scheme:dark]`, tabindex: "-1", onkeydown: (event) => this.onKeydown(event) },
      this.topBar,
      this.body
    )
    this.errorBar = h("div", { class: "hidden absolute inset-x-3 bottom-3 z-20 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 shadow-sm", role: "alert" })
    this.main = h("main", { class: "relative flex-1 min-w-0 bg-gray-100 dark:bg-gray-900", ondragover: (event) => this.drag && event.preventDefault() }, this.textToolbar, this.frameWrap, this.errorBar)
    this.arrangePanels()
    this.element.append(this.root)

    this.canvas = new Canvas(this, this.frame)
    this.tree = new Tree(this, this.treeElement)
    this.inspector = new Inspector(this, this.inspectorElement)
    this.textEditing = new TextEditing(this.textToolbar, { menu: this.variableMenu, editor: this })
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
    const panelClass = (border, width) => `${width} shrink-0 flex flex-col ${border} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-0`
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
    return this.stored(PANELS_KEY)
  }

  stored(key) {
    try {
      return localStorage.getItem(key)
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
        { class: "flex rounded-lg bg-gray-100 dark:bg-gray-900 p-0.5" },
        options.map(([value, name, title, disabled = false]) =>
          h("button", {
            type: "button",
            title,
            disabled,
            class: `w-8 h-7 flex items-center justify-center rounded-md disabled:opacity-40 disabled:pointer-events-none ${current === value ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"}`,
            html: icon(name),
            onclick: () => onchange(value)
          })
        )
      )

    // replaceChildren would turn a null into the text "null", so only pass real elements.
    this.topBar.replaceChildren(...[
      h("span", { class: "font-semibold text-gray-900 dark:text-gray-100 mr-3" }, this.kit.name),
      toggle(this.mode, [["edit", "edit", "Edit"], ["preview", "eye", this.kit.previewTitle || "Preview"]], (mode) => this.setMode(mode)),
      this.kit.devices?.length ? toggle(this.device, this.kit.devices.map((device) => [device.key, device.icon, device.title]), (device) => this.setDevice(device)) : null,
      this.translations.enabled ? this.translationLocaleMenu() : null,
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
      h("span", { class: "mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" }),
      h("button", { type: "button", title: "Undo (⌘Z)", class: TOOL, disabled: !this.history.canUndo, html: icon("undo"), onclick: () => this.undo() }),
      h("button", { type: "button", title: "Redo (⇧⌘Z)", class: TOOL, disabled: !this.history.canRedo, html: icon("redo"), onclick: () => this.redo() }),
      h(
        "button",
        { type: "button", class: "ml-2 flex items-center gap-1.5 h-8 rounded-md bg-gray-900 px-3 text-[13px] font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300", onclick: () => this.openCodeDialog() },
        h("span", { html: icon("export") }),
        "Code"
      )
    ].filter(Boolean))
  }

  // Which language translations show in on the canvas
  translationLocaleMenu() {
    const current = this.translationLocale || ""
    return h(
      "label",
      { class: "ml-1 flex items-center gap-1 text-gray-500 dark:text-gray-400", title: "Show translations in" },
      h("span", { html: icon("globe") }),
      h(
        "select",
        {
          class: "h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-0 pl-1.5 pr-7 text-xs text-gray-800 dark:text-gray-200",
          "aria-label": "Show translations in",
          onchange: (event) => this.setTranslationLocale(event.target.value)
        },
        this.translations.locales.map((locale) => h("option", { value: locale, selected: locale === current }, locale.toUpperCase())),
        h("option", { value: "", selected: current === "" }, "Keys")
      )
    )
  }

  renderLeftTabs() {
    const tab = (key, name) =>
      h("button", { type: "button", class: `${TAB} ${this.leftTab === key ? "border-blue-600 dark:border-blue-400 text-blue-700 dark:text-blue-300" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"}`, onclick: () => this.setLeftTab(key) }, name)
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
    // A device without a width (desktop) fills the canvas area; one with a
    // width (mobile, 375px) shows a full-height frame in the middle of it.
    const width = this.kit.devices?.find((option) => option.key === device)?.width
    this.frameWrap.style.width = width || ""
    this.frameWrap.classList.toggle("shadow-sm", !!width)
    this.main.classList.toggle("px-4", !!width)
    this.renderTopBar()
    setTimeout(() => this.canvas.refresh(), 250)
  }

  // --- rendering --------------------------------------------------------------

  // Runs one of the kit's renderings, which may go to the server (the email's
  // compiling). A newer run on the same channel aborts the older one, which
  // then resolves to null.
  async run(channel, render) {
    this.requests[channel]?.abort()
    const request = (this.requests[channel] = new AbortController())
    const result = await render({ compileUrl: this.compileUrlValue, signal: request.signal })
    return request.signal.aborted ? null : result
  }

  async renderCanvas() {
    if (this.editingId) return
    const result = await this.run("canvas", (options) => this.kit.canvas(this.doc, { ...options, editor: this.mode === "edit" }))
    if (!result || this.editingId) return
    this.showErrors(result.errors)
    // Without HTML the canvas keeps the last document that rendered.
    if (result.html !== null) this.canvas.write(result.html, this.mode)
  }

  showErrors(errors) {
    this.errorBar.textContent = errors.length ? `${this.kit.errors}: ${errors.join("; ")}` : ""
    this.errorBar.classList.toggle("hidden", !errors.length)
  }

  async writeOutputs() {
    this.loadTranslations()
    const json = JSON.stringify(this.doc)
    const result = await this.run("outputs", (options) => this.kit.outputs(this.doc, options))
    if (!result) return
    const outputs = { json, ...result.outputs }
    for (const [name, value] of Object.entries(outputs)) {
      if (this[`has${name[0].toUpperCase()}${name.slice(1)}InputTarget`]) this[`${name}InputTarget`].value = value
    }
    this.dispatch("change", { detail: { ...outputs, errors: result.errors, document: this.doc } })
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
    if (!this.canEditField(id, key)) return
    if (this.editingId) this.stopEditing()
    this.commit((doc) => setValue(doc, id, key, value), { coalesce: coalesce ? `${id}:${key}` : null, skipInspector: true })
  }

  duplicate(id) {
    if (!this.isFree(id)) return
    let copy
    this.commit((doc) => (copy = duplicate(doc, id)))
    if (copy) this.select(copy.id)
  }

  remove(id) {
    const hit = find(this.doc, id)
    if (!hit?.parent || !this.isFree(id)) return
    this.stopEditing()
    this.commit((doc) => remove(doc, id))
    const siblings = hit.parent.children
    this.select(siblings[Math.min(hit.index, siblings.length - 1)]?.id || hit.parent.id)
  }

  startEditing(id) {
    const hit = find(this.doc, id)
    const key = hit && getBlock(hit.node.type)?.richText
    if (!key || this.mode !== "edit" || !this.isFree(id)) return
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
    }, { scope: loopScope(this.doc, id) })
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
    if (drag.kind === "move" && !this.isFree(drag.id)) return
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

  // `at` is where in a free layout (ui/free_layout.js) it was let go: { x, y }
  drop(drag, parentId, index, at = null) {
    if (!drag || !this.canFill(parentId) || (drag.kind === "move" && !this.isFree(drag.id))) return
    if (drag.kind === "source") {
      this.insertFromSource(drag.source, drag.item, { parentId, index, at })
    } else if (drag.kind === "new") {
      const node = placed(createFromPalette(drag.key), at)
      this.commit((doc) => insert(doc, parentId, index, node))
      this.select(node.id)
    } else {
      this.commit((doc) => {
        move(doc, drag.id, parentId, index)
        if (at) placed(find(doc, drag.id).node, at)
      })
      this.select(drag.id)
    }
  }

  // Sets several values of a block as one undo step, such as its x and y
  // when it is dragged in a free layout; a run of them on the same block
  // (arrow-key nudges) as one, with `coalesce`
  place(id, values, { coalesce = null } = {}) {
    const editable = Object.entries(values).filter(([key, value]) => key && key !== "undefined" && value !== undefined && this.canEditField(id, key))
    if (!editable.length) return
    if (this.editingId) this.stopEditing()
    this.commit((doc) => editable.forEach(([key, value]) => setValue(doc, id, key, value)), { coalesce })
  }

  // Moves the selection in a free layout by whole units
  nudge(dx, dy) {
    const child = freeChild(this.doc, this.selectedId)
    if (!child || !this.isFree(child.node.id)) return false
    const { node } = child
    this.place(node.id, { "data.x": number(node.data?.x) + dx, "data.y": number(node.data?.y) + dy }, { coalesce: `${node.id}:nudge` })
    return true
  }

  insertAt(key, parentId, index) {
    if (!this.canFill(parentId)) return
    const node = createFromPalette(key)
    this.commit((doc) => insert(doc, parentId, index, node))
    this.select(node.id)
    this.leftTab === "layers" && this.tree.render()
  }

  // Clicking a tile: add inside the selection when it fits, otherwise after the
  // nearest ancestor that fits, otherwise at the end of the root, or with a
  // lock, at the end of the first unlocked block it fits in.
  addFromPalette(key) {
    const type = itemType(key)
    const place = this.placeFor((parentId) => this.accepted(parentId).includes(type))
    if (place) return this.insertAt(key, place.parentId, place.index)
    const definition = getBlock(type)
    if (definition?.unique && findType(this.doc, type)) return this.flash(`There is a ${definition.name} already; a document has one.`)
    this.flash(`${definition?.name || key} has to go inside a column. Select one first, or drag it onto the canvas.`)
  }

  // Where a click on a tile adds a block, for blocks that `fits` a parent
  placeFor(fits) {
    const chain = [find(this.doc, this.selectedId)?.node || this.doc, ...ancestors(this.doc, this.selectedId)]
    if (fits(chain[0].id)) return { parentId: chain[0].id, index: chain[0].children.length }
    for (let i = 0; i < chain.length - 1; i++) {
      if (fits(chain[i + 1].id)) return { parentId: chain[i + 1].id, index: chain[i + 1].children.indexOf(chain[i]) + 1 }
    }
    if (fits(this.doc.id)) return { parentId: this.doc.id, index: this.doc.children.length }
    if (this.lock) {
      let target = null
      walk(this.doc, (node) => {
        if (target) return false
        if (this.lock.except.includes(node.type) && fits(node.id)) target = node
      })
      if (target) return { parentId: target.id, index: target.children.length }
    }
    return null
  }

  // Inserts what a palette source's tile creates (see core/registry.js) at a
  // place, or where a click on a tile would add it
  async insertFromSource(source, item, { parentId, index, at = null } = {}) {
    let node
    try {
      node = placed(await source.create(item, this), at)
    } catch (error) {
      this.flash(error.message)
      return null
    }
    const name = item.label || getBlock(node.type)?.name || "This"
    const fits = (id) => this.canFill(id) && !misfit(node, accepted(this.doc, id, { moving: true }))
    const place = parentId ? { parentId, index } : this.placeFor(fits)
    if (!place || !fits(place.parentId)) {
      const type = place && misfit(node, accepted(this.doc, place.parentId, { moving: true }))
      this.flash(type && type !== node.type ? `${name} can't go here: its ${getBlock(type)?.name || type} blocks don't fit.` : `${name} doesn't fit here. Select where it goes first, or drag it onto the canvas.`)
      return null
    }
    this.commit((doc) => insert(doc, place.parentId, place.index, node))
    this.select(node.id)
    return node
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
    const allowed = this.accepted(parentId)
    const items = this.paletteItems().filter((item) => allowed.includes(item.type))
    if (!items.length) return
    this.menu = h(
      "div",
      { class: "fixed z-50 w-56 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-lg", role: "menu", "data-anchor": anchor, "data-tess-edit-menu": "insert" },
      h("div", { class: "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, "Add block"),
      items.map((item) =>
        h(
          "button",
          {
            type: "button",
            role: "menuitem",
            class: "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300",
            onclick: () => {
              this.closeMenu()
              this.insertAt(item.key, parentId, index)
            }
          },
          h("span", { class: "text-gray-400 dark:text-gray-500", html: icon(item.icon) }),
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
    const note = h("div", { class: "absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700 dark:ring-1 dark:ring-white/10" }, message)
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
    } else if (ARROWS[event.key]) {
      const [dx, dy] = ARROWS[event.key].map((step) => step * (event.shiftKey ? 10 : 1))
      if (this.nudge(dx, dy)) event.preventDefault()
    }
  }

  // --- code dialog ----------------------------------------------------------------

  async openCodeDialog(tab = "json") {
    this.stopEditing()
    const { json, errors, ...outputs } = await this.export()
    const contents = { json: JSON.stringify(JSON.parse(json), null, 2), ...outputs }
    const textarea = h("textarea", { class: "flex-1 w-full resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500", spellcheck: false })
    const status = h("span", { class: "text-xs text-gray-500 dark:text-gray-400" })
    const tabs = h("div", { class: "flex gap-1" })
    const apply = h("button", { type: "button", class: "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700", onclick: () => {
      try {
        this.setDocument(textarea.value)
        close()
      } catch (error) {
        status.textContent = error.message
        status.className = "text-xs text-red-600 dark:text-red-400"
      }
    } }, "Load this JSON")

    const show = (key) => {
      tab = key
      textarea.value = contents[key]
      // Loading JSON could replace locked parts, so a locked editor only shows it.
      const loadable = key === "json" && !this.lock
      textarea.readOnly = !loadable
      apply.classList.toggle("hidden", !loadable)
      status.className = "text-xs text-gray-500 dark:text-gray-400"
      status.textContent =
        key === "json" ? (this.lock ? "The document. Parts of it are locked, so it can't be loaded here." : "The document. Edit and load it, or paste one in.") : key === "html" && errors.length ? `${this.kit.errors}: ${errors.join("; ")}` : this.kit.notes?.[key] || ""
      tabs.replaceChildren(
        ...Object.keys(contents).map((name) =>
          h("button", { type: "button", class: `rounded-md px-3 py-1.5 text-xs font-medium ${name === tab ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`, onclick: () => show(name) }, name.toUpperCase())
        )
      )
    }

    const close = () => dialog.remove()
    const download = () => {
      const blob = new Blob([textarea.value], { type: tab === "json" ? "application/json" : tab === "html" ? "text/html" : "text/plain" })
      const link = h("a", { href: URL.createObjectURL(blob), download: `${this.kit.key}.${tab}` })
      link.click()
      URL.revokeObjectURL(link.href)
    }

    const dialog = h(
      "div",
      { class: "absolute inset-0 z-40 flex items-center justify-center bg-gray-900/40 dark:bg-black/60 p-6", onmousedown: (event) => event.target === dialog && close(), onkeydown: (event) => event.key === "Escape" && close() },
      h(
        "div",
        { class: "flex h-full max-h-[720px] w-full max-w-4xl flex-col gap-3 rounded-xl bg-white dark:bg-gray-800 p-4 shadow-xl" },
        h("div", { class: "flex items-center gap-3" }, tabs, status, h("button", { type: "button", class: "ml-auto " + TOOL, title: "Close", html: icon("close"), onclick: close })),
        textarea,
        h(
          "div",
          { class: "flex items-center justify-end gap-2" },
          h("button", { type: "button", class: "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700", onclick: () => navigator.clipboard?.writeText(textarea.value).then(() => (status.textContent = "Copied.")) }, "Copy"),
          h("button", { type: "button", class: "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700", onclick: download }, "Download"),
          apply
        )
      )
    )
    show(tab)
    this.root.append(dialog)
    textarea.focus()
  }
}
