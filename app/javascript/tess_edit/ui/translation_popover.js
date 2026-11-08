// What a translation key says in every language (core/translations.js), shown
// when the pointer is on it in the canvas, the text being edited or a field's
// hint: missing ones stand out, each can be edited in place, and the arrow
// opens where the host app keeps it.

import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const ACTION = "w-6 h-6 shrink-0 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"

export class TranslationPopover {
  constructor(editor) {
    this.editor = editor
    this.element = null
    this.key = null
    this.editing = null
    this.error = null
    this.timer = null
  }

  get translations() {
    return this.editor.translations
  }

  // rect: what it's for, in the page's viewport
  show(key, rect) {
    this.cancelHide()
    if (this.key === key && this.element) return
    if (this.editing) return
    this.key = key
    this.rect = rect
    this.error = null
    if (!this.element) {
      this.element = h("div", {
        class: "absolute z-50 w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 text-[13px] shadow-lg",
        role: "dialog",
        "aria-label": "Translations",
        "data-tess-edit-translations": "",
        onmouseenter: () => this.cancelHide(),
        onmouseleave: () => this.scheduleHide()
      })
      this.editor.root.append(this.element)
    }
    this.render()
    if (!this.translations.has(key)) this.translations.load([key])
  }

  // Lets the pointer move from what it's for into the popover
  scheduleHide(delay = 250) {
    this.cancelHide()
    this.timer = setTimeout(() => this.hide(), delay)
  }

  cancelHide() {
    clearTimeout(this.timer)
  }

  hide({ force = false } = {}) {
    if (this.editing && !force) return
    this.cancelHide()
    this.element?.remove()
    this.element = null
    this.key = null
    this.editing = null
  }

  // Again, when the translations change
  refresh() {
    if (this.element) this.render()
  }

  render() {
    const key = this.key
    const { locales } = this.translations
    const current = this.editor.translationLocale
    const rows = locales.map((locale) => {
      const entry = this.translations.get(key, locale)
      const value = this.translations.value(key, locale)
      const editing = this.editing === locale
      const text = editing
        ? this.input(locale, value)
        : h(
          "span",
          { class: `min-w-0 flex-1 truncate ${value === null ? "italic text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-200"}`, title: entry?.source ? `${value ?? ""}\n${entry.source}` : value || "" },
          value === null ? "missing" : value || "(empty)"
        )
      return h(
        "div",
        { class: `flex items-center gap-2 px-3 py-1 ${locale === current ? "bg-blue-50/60 dark:bg-blue-900/20" : ""}`, "data-locale": locale },
        h("span", { class: "w-12 shrink-0 font-semibold uppercase text-gray-900 dark:text-gray-100" }, locale),
        text,
        editing ? null : h("button", { type: "button", title: `Edit the ${locale.toUpperCase()} text`, class: ACTION, html: icon("edit", "w-3.5 h-3.5"), onclick: () => this.edit(locale) }),
        !editing && entry?.url ? h("a", { href: entry.url, target: "_blank", rel: "noopener", title: entry.source ? `Open ${entry.source}` : "Open where it's kept", class: ACTION, html: icon("external", "w-3.5 h-3.5") }) : null
      )
    })
    const empty = !locales.length
      ? h("p", { class: "px-3 py-1 text-xs text-gray-500 dark:text-gray-400" }, this.translations.error || (this.translations.loaded ? "No languages yet" : "Loading…"))
      : null
    // replaceChildren would turn a null into the text "null", so only pass real elements.
    this.element.replaceChildren(...[
      h("div", { class: "flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 px-3 pb-1.5 mb-1 text-xs text-gray-500 dark:text-gray-400" }, h("span", { html: icon("translate", "w-3.5 h-3.5") }), h("span", { class: "truncate font-mono" }, key)),
      ...rows,
      empty,
      this.error ? h("p", { class: "px-3 pt-1 text-xs text-red-600 dark:text-red-400", role: "alert" }, this.error) : null
    ].filter(Boolean))
    this.place()
  }

  input(locale, value) {
    const input = h("input", {
      type: "text",
      class: "min-w-0 flex-1 rounded border border-blue-500 bg-white dark:bg-gray-700 px-1.5 py-0.5 text-[13px] text-gray-900 dark:text-gray-100 outline-none",
      value: value ?? "",
      "aria-label": `${locale.toUpperCase()} text`,
      onkeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.stopPropagation()
          this.save(locale, input.value)
        } else if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          this.editing = null
          this.render()
        }
      }
    })
    setTimeout(() => input.focus())
    return h(
      "span",
      { class: "flex min-w-0 flex-1 items-center gap-1" },
      input,
      h("button", { type: "button", class: "shrink-0 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700", onclick: () => this.save(locale, input.value) }, "Save")
    )
  }

  edit(locale) {
    this.editing = locale
    this.error = null
    this.render()
  }

  async save(locale, value) {
    try {
      await this.translations.save(this.key, locale, value)
      this.editing = null
      this.error = null
    } catch (error) {
      this.error = error.message
    }
    this.refresh()
  }

  // Below the rect, or above it when there's no room, inside the editor.
  place() {
    const rect = this.rect
    const root = this.editor.root.getBoundingClientRect()
    const height = this.element.offsetHeight
    const below = rect.bottom - root.top + 4
    const top = below + height > root.height && rect.top - root.top - height - 4 > 0 ? rect.top - root.top - height - 4 : below
    const left = Math.max(4, Math.min(rect.left - root.left, root.width - this.element.offsetWidth - 4))
    Object.assign(this.element.style, { top: `${top}px`, left: `${left}px` })
  }
}
