// The Inspect panel: renders the selected block's fields from its
// definition (blocks/*.js, via core/registry.js) and writes changes back through the editor.
//
// A "slot" field shows an element of the host's, rendered with the page:
//
//   <div data-tess-edit-target="slot" data-tess-edit-slot="trigger" hidden>…form fields…</div>
//   { key: "trigger", label: "When", type: "slot", slot: "trigger",
//     summary: (element) => "Account · created", open: (element) => false }
//
// Its values are the host's form fields, not part of the document. With a
// summary it shows collapsed to that, with a button to edit it, and
// open(element) opens it at first, e.g. when it has errors; without one it
// always shows. The element is never recreated, so the
// host's Stimulus controllers in it keep their state: it and its group stay
// in Inspect, hidden while another block is selected (see place in ui/dom.js).

import { t } from "tess_edit/core/i18n"
import { imageSource } from "tess_edit/core/media"
import { fieldType, getBlock, label } from "tess_edit/core/registry"
import { ALIGN, fontOptions } from "tess_edit/blocks/fields"
import { find, getValue } from "tess_edit/core/document"
import { translationCalls } from "tess_edit/core/translations"
import { liquidScope } from "tess_edit/core/liquid"
import { CELL, ROW, TABLE, addColumn, addRow, cellOf, columnCount, deleteColumn, deleteRow, position, rows, setColumn } from "tess_edit/core/table"
import { codeInput } from "tess_edit/ui/code_input"
import { FontPicker } from "tess_edit/ui/font_picker"
import { freeze, h, place } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"
import { inputAdapter, suggestIn } from "tess_edit/ui/variable_menu"

const INPUT = "w-full min-w-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-[13px] text-gray-900 dark:text-gray-100 shadow-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"

// "12" → "12px"; anything else is left alone.
export function withUnit(value) {
  const text = String(value ?? "").trim()
  return /^-?\d+(\.\d+)?$/.test(text) ? `${text}px` : text
}

export function parseSpacing(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ["", "", "", ""]
  const [top, right = top, bottom = top, left = right] = parts
  return [top, right, bottom, left]
}

export function formatSpacing([top, right, bottom, left]) {
  const values = [top, right, bottom, left].map((v) => withUnit(v) || "0px")
  if (![top, right, bottom, left].some((v) => String(v).trim())) return ""
  if (values.every((v) => v === values[0])) return values[0]
  if (values[0] === values[2] && values[1] === values[3]) return `${values[0]} ${values[1]}`
  return values.join(" ")
}

export class Inspector {
  constructor(editor, element) {
    this.editor = editor
    this.element = element
    this.openGroups = new Map()
    this.adapters = new Map()
    this.inputs = new Map()
    this.hints = []
    // Groups with a slot, and the slots, by key: kept, never rendered again
    this.keptGroups = new Map()
    this.slots = new Map()
    this.header = h("div", { class: "flex items-center gap-2 px-4 h-12 border-b border-gray-200 dark:border-gray-700 shrink-0" })
    this.body = h("div", { class: "flex-1 overflow-y-auto pb-6" })
    this.element.append(this.header, this.body)
  }

  // Before Inspect moves (see the editor's arrangePanels)
  freezeSlots() {
    this.slots.forEach(({ element }) => freeze(element))
  }

  // Again, when the translations or the editor's language change
  refreshTranslations() {
    this.hints.forEach((update) => update())
  }

  render() {
    const { doc, selectedId } = this.editor
    const hit = find(doc, selectedId) || { node: doc }
    const node = hit.node
    const definition = getBlock(node.type)
    this.editor.variableMenu?.close()
    this.adapters = new Map()
    this.inputs = new Map()
    this.hints = []

    const actions =
      !this.editor.isFree(node.id)
        ? []
        : [
          ["parent", t("Select parent"), () => this.editor.selectParent()],
          ["copy", t("Duplicate"), () => this.editor.duplicate(node.id)],
          ["trash", t("Delete"), () => this.editor.remove(node.id)]
        ].map(([name, title, onclick]) =>
          h("button", { type: "button", title, class: "w-7 h-7 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100", html: icon(name), onclick })
        )

    this.header.replaceChildren(
      h("span", { class: "text-gray-400 dark:text-gray-500", html: icon(definition.icon, "w-4 h-4") }),
      h("h2", { class: "font-semibold text-gray-900 dark:text-gray-100 truncate" }, label(node)),
      h("div", { class: "ml-auto flex items-center gap-0.5" }, actions)
    )

    // A group shows when one of its fields applies (see shows below)
    const groups = (definition.fields || []).filter((group) => group.fields.some((field) => this.shows(node, field))).map((group) => this.group(node, group))
    // A block in a table's cell, such as its Text, has the cell's table first
    const cell = ![CELL, ROW, TABLE].includes(node.type) && cellOf(doc, node.id)
    if (cell) groups.unshift(this.groupElement("table_cell:Table", { title: "Table" }, this.openGroups.get("table_cell:Table") ?? true, h("div", { class: "px-4 pb-4 space-y-3" }, this.table(cell))))
    const locked = this.editor.lock && node.id !== doc.id && !this.editor.isFree(node.id)
      ? h("p", { class: "mx-4 mt-3 flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" }, h("span", { html: icon("lock", "w-3.5 h-3.5") }), t("Part of the layout"))
      : null
    // A block's hint explains how to edit it, which a locked block can't be.
    const hint = definition.hint && !locked ? h("p", { class: "mx-4 mt-3 rounded-md bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-xs text-gray-600 dark:text-gray-300" }, t(definition.hint)) : null

    place(this.body, [locked, hint, ...groups].filter(Boolean), new Set([...this.keptGroups.values()].map((kept) => kept.details)))
  }

  // A field's visible(node, editor) shows it only when it applies; a slot
  // only when the host gave its element
  shows(node, field) {
    if (field.type === "slot" && !this.editor.slot(field.slot)) return false
    return !field.visible || field.visible(node, this.editor)
  }

  group(node, group) {
    const key = `${node.type}:${group.title}`
    const open = this.openGroups.has(key) ? this.openGroups.get(key) : !group.collapsed
    const fields = group.fields.filter((field) => this.shows(node, field)).map((field) => this.field(node, field))
    const kept = this.keptGroups.get(key) || (group.fields.some((field) => field.type === "slot") ? this.keepGroup(key, group) : null)
    if (kept) {
      kept.details.open = open
      place(kept.list, fields, new Set([...this.slots.values()].map((slot) => slot.wrapper)))
      return kept.details
    }
    return this.groupElement(key, group, open, h("div", { class: "px-4 pb-4 space-y-3" }, fields))
  }

  groupElement(key, group, open, list) {
    return h(
      "details",
      { class: "group/field border-b border-gray-100 dark:border-gray-700", open, ontoggle: (event) => this.openGroups.set(key, event.currentTarget.open) },
      h(
        "summary",
        { class: "flex items-center gap-1.5 px-4 py-2.5 cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 list-none [&::-webkit-details-marker]:hidden" },
        h("span", { html: icon("chevron", "w-3 h-3 transition-transform group-open/field:rotate-90") }),
        t(group.title)
      ),
      list
    )
  }

  keepGroup(key, group) {
    const list = h("div", { class: "px-4 pb-4 space-y-3" })
    const kept = { details: this.groupElement(key, group, !group.collapsed, list), list }
    this.keptGroups.set(key, kept)
    return kept
  }

  field(node, field) {
    if (field.type === "slot") return this.slot(field)

    const value = getValue(node, field.key) ?? ""
    const set = (next, options = {}) => this.editor.setValue(node.id, field.key, next, options)
    // A fieldset disables every input and button of a locked field at once.
    const editable = this.editor.canEditField(node.id, field.key)
    const control = editable
      ? this.control(node, field, value, set)
      : h("fieldset", { disabled: true, class: "opacity-60" }, this.control(node, field, value, set))
    const expand = field.type === "code" && editable
      ? h("button", { type: "button", title: t("Edit %{label} in a larger window", { label: t(field.label) }), class: "rounded px-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40", onclick: () => this.expand(node, field) }, t("Expand"))
      : null
    const adapter = editable && field.liquid && this.editor.variables?.enabled && this.adapters.get(field.key)
    const variables = adapter
      ? h("button", { type: "button", title: t("Insert a variable"), class: "whitespace-nowrap rounded px-1 font-mono text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40", onclick: (event) => this.editor.variableMenu.browse(adapter, event.currentTarget) }, "{ }")
      : null
    // Liquid in text can be translated
    const input = field.liquid === true && ["text", "textarea"].includes(field.type) && this.editor.translations?.enabled && this.inputs.get(field.key)
    const translate = input && editable
      ? h("button", { type: "button", title: t("Make translatable: keep the selected text, or all of it, as a translation"), class: "rounded px-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40", html: icon("translate", "w-3.5 h-3.5"), onclick: () => this.makeTranslatable(input) })
      : null
    const tools = expand || variables || translate ? h("span", { class: "absolute right-0 top-0 flex items-center gap-0.5" }, expand, variables, translate) : null
    // A hint can be a function of the value, kept up to date as it's typed: hint(value, node)
    const hint = field.hint ? h("span", { class: "mt-1 block text-[11px] leading-snug text-gray-500 dark:text-gray-400" }) : null
    const showHint = () => {
      const current = find(this.editor.doc, node.id)?.node || node
      hint.textContent = typeof field.hint === "function" ? field.hint(getValue(current, field.key) ?? "", current) : t(field.hint)
    }
    if (hint) showHint()
    // A div, not a label: a label would forward clicks to the first button or color picker inside it.
    return h(
      "div",
      { class: "relative block", oninput: typeof field.hint === "function" ? showHint : null },
      h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, t(field.label)),
      tools,
      control,
      input ? this.translationHint(input) : null,
      hint
    )
  }

  control(node, field, value, set) {
    // A host's own (registerFieldType in core/registry.js)
    const custom = fieldType(field.type)
    if (custom) return custom(node, field, getValue(node, field.key), set, this.editor)

    switch (field.type) {
      case "textarea":
        return this.variables(h("textarea", { class: `${INPUT} min-h-32`, rows: 4, value, oninput: (event) => set(event.target.value) }), node, field)

      case "code":
        return codeInput({ value, language: field.language, oninput: set, class: "h-60" })

      case "size":
        return h("input", {
          type: "text",
          class: INPUT,
          value,
          placeholder: t(field.placeholder) || "",
          oninput: (event) => set(withUnit(event.target.value)),
          onchange: (event) => (event.target.value = withUnit(event.target.value))
        })

      case "color":
        return this.color(value, set)

      case "select":
        return h(
          "select",
          { class: `${INPUT} pr-7`, onchange: (event) => set(event.target.value) },
          // options can depend on the editor's settings: options(editor)
          (typeof field.options === "function" ? field.options(this.editor) : field.options).map((option) => {
            const optionValue = typeof option === "string" ? option : option.value
            const optionLabel = typeof option === "string" ? option || t("Default") : t(option.label)
            return h("option", { value: optionValue, selected: optionValue === value }, optionLabel)
          })
        )

      case "font":
        return this.font(field, value, set)

      case "segmented":
        return h(
          "div",
          { class: "flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden" },
          field.options.map((option) =>
            h(
              "button",
              {
                type: "button",
                title: value === option.value ? t("Click again to use the default") : "",
                class: `flex-1 px-2 py-1 text-xs border-l first:border-l-0 border-gray-300 dark:border-gray-600 ${value === option.value ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"}`,
                onclick: (event) => {
                  event.preventDefault()
                  set(value === option.value ? "" : option.value)
                  this.render()
                }
              },
              t(option.label)
            )
          )
        )

      case "toggle": {
        const state = h("span", { class: "text-xs text-gray-600 dark:text-gray-300" }, t(value === field.on ? "On" : "Off"))
        return h(
          "span",
          { class: "flex items-center gap-2" },
          h("input", {
            type: "checkbox",
            class: "h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-blue-600 dark:text-blue-400",
            checked: value === field.on,
            onchange: (event) => {
              set(event.target.checked ? field.on : field.off)
              state.textContent = t(event.target.checked ? "On" : "Off")
            }
          }),
          state
        )
      }

      case "spacing":
        return this.spacing(value, set)

      case "list":
        return this.list(node, field, Array.isArray(value) ? value : [], set)

      case "table":
        return this.table(node)

      case "image":
        return this.image(node, field, value, set)

      default:
        return this.variables(h("input", { type: "text", class: INPUT, value, placeholder: t(field.placeholder) || "", oninput: (event) => set(event.target.value) }), node, field)
    }
  }

  // The host's element, collapsed to its summary until edited
  slot(field) {
    let slot = this.slots.get(field.slot)
    if (!slot) {
      const element = this.editor.slot(field.slot)
      const summary = h("span", { class: "min-w-0 flex-1 truncate text-[13px] text-gray-700 dark:text-gray-300" })
      const button = h("button", { type: "button", class: "ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40", "aria-expanded": "false", onclick: () => this.toggleSlot(slot) })
      const holder = h("div", { class: "pt-1" })
      slot = {
        field,
        element,
        summary,
        button,
        holder,
        open: !field.summary || Boolean(field.open?.(element)),
        wrapper: h("div", { class: "block" }, h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, t(field.label)), h("div", { class: "flex items-center gap-2" }, summary, button), holder)
      }
      // Its only move: it reconnects, with what was typed so far
      freeze(element)
      holder.append(element)
      element.hidden = false
      this.slots.set(field.slot, slot)
    }
    this.showSlot(slot)
    return slot.wrapper
  }

  toggleSlot(slot) {
    slot.open = !slot.open
    this.showSlot(slot)
  }

  showSlot(slot) {
    const { open, field, element, button, holder, summary } = slot
    holder.hidden = !open
    button.parentElement.hidden = !field.summary
    button.textContent = t(open ? "Done" : "Edit")
    button.setAttribute("aria-expanded", String(open))
    summary.hidden = open
    summary.textContent = open ? "" : field.summary?.(element) || ""
  }

  // Suggests the host's Liquid variables (editor.variables) while typing {{ in
  // a text field. A field's `liquid` also gives it a { } button to browse
  // them: true for Liquid in text, "expression" for an expression (an
  // Assign's), "condition" for a condition, with its operators, "collection"
  // for what a Loop goes over.
  variables(input, node, field) {
    this.inputs.set(field.key, input)
    if (!this.editor.variableMenu) return input
    const mode = ["expression", "condition", "collection"].includes(field.liquid) ? field.liquid : "output"
    const adapter = inputAdapter(input, { mode, scope: liquidScope(this.editor.doc, node.id) })
    suggestIn(this.editor.variableMenu, input, adapter)
    this.adapters.set(field.key, adapter)
    return input
  }

  // What the field's t filters say in the editor's language, each listing
  // every language while pointed at
  translationHint(input) {
    const hint = h("span", { class: "mt-1 flex flex-wrap gap-1 empty:hidden" })
    const update = () => {
      const { translations, translationLocale } = this.editor
      const calls = translationCalls(input.value)
      translations.load(calls.map((call) => call.key))
      hint.replaceChildren(
        ...calls.map((call) => {
          const locale = call.locale || translationLocale
          const value = locale ? translations.value(call.key, locale) : null
          const missing = translations.has(call.key) && (locale ? value === null : translations.missing(call.key).length > 0)
          const text = value !== null ? `${locale.toUpperCase()}: ${value}` : locale && translations.has(call.key) ? t("%{key} · no %{locale} text", { key: call.key, locale: locale.toUpperCase() }) : call.key
          const chip = h(
            "span",
            {
              class: `max-w-full truncate rounded px-1.5 py-0.5 text-[11px] ${missing ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300" : "bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"}`,
              "data-tess-key": call.key,
              onmouseenter: () => this.editor.translationPopover.show(call.key, chip.getBoundingClientRect()),
              onmouseleave: () => this.editor.translationPopover.scheduleHide()
            },
            text
          )
          return chip
        })
      )
    }
    input.addEventListener("input", update)
    this.hints.push(update)
    update()
    return hint
  }

  // Keeps the selected text, or the whole value, as a translation and puts
  // its t filter in its place
  async makeTranslatable(input) {
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    const whole = start === end
    const text = whole ? input.value : input.value.slice(start, end)
    if (!text.trim()) return this.editor.flash(t("Type the text to translate first."))
    const tag = await this.editor.makeTranslatable(text)
    if (!tag) return
    if (whole) input.value = tag
    else input.setRangeText(tag, start, end, "end")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  // An image URL, or with the host's images (editor.media, core/media.js) a
  // choice between one of those, a new upload, and a URL
  image(node, field, value, set) {
    const url = this.variables(h("input", { type: "text", class: INPUT, value, placeholder: t(field.placeholder) || "https://…", oninput: (event) => set(event.target.value) }), node, field)
    if (!this.editor.media.enabled) return url

    const source = imageSource(node, this.editor, field)
    const sources = this.control(node, { type: "segmented", options: [{ value: "upload", label: t("Uploaded") }, { value: "web", label: t("Web") }] }, source, (next) =>
      this.editor.setValue(node.id, field.source, next || source)
    )
    return h("div", { class: "space-y-1.5" }, sources, source === "upload" ? this.mediaPicker(node, field, getValue(node, field.image)) : url)
  }

  mediaPicker(node, field, value) {
    const { images, uploading, error } = this.editor.media
    const current = images.find((image) => image.id === value)
    const file = h("input", {
      type: "file",
      accept: "image/*",
      class: "hidden",
      onchange: (event) => {
        const chosen = event.target.files[0]
        if (chosen) this.editor.uploadImage(node.id, chosen, field)
      }
    })
    const select = h(
      "select",
      {
        class: `${INPUT} min-w-0 flex-1 pr-7`,
        onchange: (event) => {
          const image = images.find((option) => option.id === event.target.value)
          if (image) this.editor.chooseImage(node.id, image, field)
        }
      },
      h("option", { value: "" }, t(images.length ? "Choose an image" : "No images yet")),
      images.map((image) => h("option", { value: image.id, selected: image.id === value }, image.name))
    )
    return h(
      "div",
      {},
      h(
        "div",
        { class: "flex items-center gap-1.5" },
        select,
        h("button", { type: "button", class: "shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50", disabled: uploading, onclick: () => file.click() }, t(uploading ? "Uploading…" : "Upload")),
        file
      ),
      error ? h("p", { class: "mt-1 text-[11px] text-red-600 dark:text-red-400", role: "alert" }, error) : null,
      current ? h("img", { src: current.url, alt: "", class: "mt-2 max-h-24 rounded border border-gray-200 dark:border-gray-700" }) : null
    )
  }

  // A code field in a dialog over the editor, for more room. Changes apply as
  // you type, like in the field itself.
  expand(node, field) {
    const close = () => {
      dialog.remove()
      this.render()
    }
    const input = codeInput({ value: getValue(node, field.key) ?? "", language: field.language, oninput: (next) => this.editor.setValue(node.id, field.key, next), class: "h-full min-h-0 resize-none" })
    input.classList.add("flex-1", "min-h-0")
    const dialog = h(
      "div",
      {
        class: "absolute inset-0 z-40 flex items-center justify-center bg-gray-900/40 dark:bg-black/60 p-6",
        onmousedown: (event) => event.target === dialog && close(),
        // Escape closes the dialog, not anything behind it
        onkeydown: (event) => {
          if (event.key !== "Escape") return
          event.stopPropagation()
          close()
        }
      },
      h(
        "div",
        { role: "dialog", "aria-label": t(field.label), class: "flex h-full max-h-[800px] w-full max-w-5xl flex-col gap-3 rounded-xl bg-white dark:bg-gray-800 p-4 shadow-xl" },
        h(
          "div",
          { class: "flex items-center gap-3" },
          h("h3", { class: "text-sm font-semibold text-gray-900 dark:text-gray-100" }, label(node) === t(field.label) ? t(field.label) : `${label(node)} · ${t(field.label)}`),
          typeof field.hint === "string" ? h("span", { class: "text-xs text-gray-500 dark:text-gray-400" }, t(field.hint)) : null,
          h("button", { type: "button", title: t("Close"), class: "ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700", html: icon("close"), onclick: close })
        ),
        input
      )
    )
    this.editor.root.append(dialog)
    input.textarea.focus()
  }

  // The host's fonts (options.fonts) or common ones, each shown in itself (ui/font_picker.js)
  font(field, value, set) {
    const options = fontOptions(this.editor.options?.fonts, value, field.placeholder)
    return new FontPicker(this.editor, { options, value, input: INPUT, choose: set }).button
  }

  color(value, set) {
    const text = h("input", {
      type: "text", class: `${INPUT} font-mono text-xs`, value, placeholder: t("Default"), oninput: (event) => {
        set(event.target.value)
        if (/^#[0-9a-f]{6}$/i.test(event.target.value)) swatch.value = event.target.value
      }
    })
    const swatch = h("input", {
      type: "color",
      class: "h-7 w-8 shrink-0 cursor-pointer rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-0.5",
      value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff",
      oninput: (event) => {
        text.value = event.target.value
        set(event.target.value)
      }
    })
    return h("span", { class: "flex items-center gap-1.5" }, swatch, text)
  }

  spacing(value, set) {
    const values = parseSpacing(value)
    const inputs = [t("Top"), t("Right"), t("Bottom"), t("Left")].map((side, i) =>
      h(
        "span",
        { class: "block" },
        h("input", {
          type: "text",
          class: `${INPUT} text-center px-1`,
          value: values[i],
          title: side,
          placeholder: side[0],
          oninput: (event) => {
            values[i] = event.target.value
            set(formatSpacing(values))
          }
        }),
        h("span", { class: "block text-center text-[10px] text-gray-400 dark:text-gray-500" }, side)
      )
    )
    return h("span", { class: "grid grid-cols-4 gap-1" }, inputs)
  }

  // A Cell's table (a Row's, through its first cell): the cell's column's
  // width and alignment, and adding and deleting rows and columns
  // (core/table.js), each one undo step, selecting the cell it gives
  table(node) {
    const cellId = node.type === CELL ? node.id : node.children?.find((child) => child.type === CELL)?.id
    const at = cellId && position(this.editor.doc, cellId)
    if (!at) return h("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, t("Not in a table"))

    const change = (mutate) => {
      let next = null
      this.editor.commit((doc) => (next = mutate(doc, cellId)))
      if (next) this.editor.select(next.id)
    }
    const button = (label, mutate, disabled = false) =>
      h("button", { type: "button", class: "flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40", disabled, onclick: () => change(mutate) }, t(label))
    const line = (title, ...buttons) => h("div", { class: "space-y-1" }, h("span", { class: "block text-xs font-medium text-gray-700 dark:text-gray-300" }, t(title)), h("div", { class: "flex gap-1" }, ...buttons))
    const rowCount = rows(at.table).length
    const parts = [
      line("Row", button("Add above", (doc, id) => addRow(doc, id, "above")), button("Add below", (doc, id) => addRow(doc, id, "below")), button("Delete", deleteRow, rowCount < 2))
    ]
    if (node.type === CELL) {
      const column = at.table.data?.columns?.[at.column] || {}
      const setting = (key, value) => this.editor.commit((doc) => setColumn(doc, cellId, key, value), { coalesce: `${at.table.id}:column:${at.column}:${key}`, skipInspector: key === "width" })
      parts.push(
        line("Column", button("Add left", (doc, id) => addColumn(doc, id, "left")), button("Add right", (doc, id) => addColumn(doc, id, "right")), button("Delete", deleteColumn, columnCount(at.table) < 2)),
        h(
          "label",
          { class: "block" },
          h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, t("Column width")),
          h("input", { type: "text", class: INPUT, value: column.width || "", placeholder: t("Auto"), oninput: (event) => setting("width", event.target.value) })
        ),
        h(
          "div",
          { class: "block" },
          h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, t("Column align")),
          h(
            "div",
            { class: "flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden" },
            ALIGN.map((option) =>
              h(
                "button",
                {
                  type: "button",
                  class: `flex-1 px-2 py-1 text-xs border-l first:border-l-0 border-gray-300 dark:border-gray-600 ${column.align === option.value ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"}`,
                  onclick: () => setting("align", column.align === option.value ? "" : option.value)
                },
                t(option.label)
              )
            )
          )
        )
      )
    }
    return h("div", { class: "space-y-3" }, ...parts)
  }

  list(node, field, items, set) {
    const update = (next) => {
      set(next, { coalesce: false })
      this.render()
    }
    const rows = items.map((item, index) =>
      h(
        "div",
        { class: "rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-2 space-y-1.5" },
        field.item.map((part) =>
          part.type === "select"
            ? h(
              "select",
              { class: `${INPUT} pr-7`, onchange: (event) => update(items.map((it, i) => (i === index ? { ...it, [part.name]: event.target.value } : it))) },
              part.options.map((option) => h("option", { value: option, selected: option === item[part.name] }, option))
            )
            : this.variables(h("input", {
              type: "text",
              class: INPUT,
              placeholder: t(part.label),
              value: item[part.name] ?? "",
              oninput: (event) => {
                items = items.map((it, i) => (i === index ? { ...it, [part.name]: event.target.value } : it))
                set(items)
              }
            }), node, { key: `${field.key}.${index}.${part.name}` })
        ),
        h(
          "div",
          { class: "flex justify-end gap-1" },
          h("button", {
            type: "button", title: t("Move up"), class: "w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30", disabled: index === 0, html: icon("up", "w-3.5 h-3.5"), onclick: () => {
              const next = [...items]
                ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
              update(next)
            }
          }),
          h("button", { type: "button", title: t("Remove"), class: "w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-red-600 dark:hover:text-red-400", html: icon("trash", "w-3.5 h-3.5"), onclick: () => update(items.filter((_, i) => i !== index)) })
        )
      )
    )
    return h(
      "div",
      { class: "space-y-2" },
      rows,
      h("button", { type: "button", class: "w-full rounded-md border border-dashed border-gray-300 dark:border-gray-600 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400", onclick: () => update([...items, { ...field.newItem }]) }, t("Add"))
    )
  }
}
