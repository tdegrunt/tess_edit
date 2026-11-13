// A font field's control: a button with the font in it, and a list to choose
// from, each font shown in itself, with a search box for long lists. A
// native select can't show its options in their own fonts (macOS draws it
// in the select's font). Fonts are shown as they scroll into view, so a long
// list only loads those seen; the host's page has to have the fonts (e.g. as
// @font-face rules, which load when used).

import { h } from "tess_edit/ui/dom"

const ITEM = "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[15px]"

export class FontPicker {
  // options: [{ value, label }], the first one none (the placeholder);
  // choose(value) when one is chosen
  constructor(editor, { options, value, input, choose }) {
    this.editor = editor
    this.options = options
    this.value = value || ""
    this.choose = choose
    this.button = h("button", { type: "button", class: `${input} flex items-center justify-between gap-2 text-left`, "aria-haspopup": "listbox", onclick: () => (this.element ? this.close() : this.open()) })
    this.onOutside = (event) => {
      if (this.element && !this.element.contains(event.target) && !this.button.contains(event.target)) this.close()
    }
    this.label()
  }

  // The chosen font's name, in it
  label() {
    const option = this.options.find((option) => option.value === this.value) || this.options[0]
    this.button.replaceChildren(
      h("span", { class: "min-w-0 flex-1 truncate", style: fontStyle(option.value) }, option.label),
      h("span", { class: "shrink-0 text-gray-400 dark:text-gray-500", "aria-hidden": "true" }, "▾")
    )
  }

  open() {
    this.query = ""
    this.search = h("input", {
      type: "search",
      placeholder: "Search fonts",
      class: "w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-[13px] text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500",
      oninput: (event) => {
        this.query = event.target.value
        this.index = 0
        this.render()
      },
      onkeydown: (event) => this.key(event)
    })
    this.list = h("div", { class: "max-h-72 overflow-y-auto py-1", role: "listbox", "aria-label": "Fonts" })
    this.element = h("div", { class: "absolute z-50 w-72 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg" }, h("div", { class: "p-1.5 border-b border-gray-100 dark:border-gray-700" }, this.search), this.list)
    this.editor.root.append(this.element)
    this.observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && show(entry.target)), { root: this.list })
    document.addEventListener("mousedown", this.onOutside, true)
    this.index = Math.max(0, this.matches().findIndex((option) => option.value === this.value))
    this.render()
    this.place()
    this.search.focus()
  }

  matches() {
    const query = this.query.trim().toLowerCase()
    return query ? this.options.filter((option, i) => i > 0 && option.label.toLowerCase().includes(query)) : this.options
  }

  render() {
    const matches = this.matches()
    this.observer.disconnect()
    const rows = matches.map((option, i) => {
      const chosen = option.value === this.value
      const row = h(
        "button",
        {
          type: "button",
          role: "option",
          "aria-selected": chosen ? "true" : "false",
          "data-font": option.value,
          class: `${ITEM} ${i === this.index ? "bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200" : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"}`,
          onclick: () => this.pick(option)
        },
        h("span", { class: "w-3 shrink-0 text-[11px]" }, chosen ? "✓" : ""),
        h("span", { class: "min-w-0 flex-1 truncate" }, option.label)
      )
      this.observer.observe(row)
      return row
    })
    const empty = matches.length ? null : h("p", { class: "px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400" }, "No fonts with that name")
    this.list.replaceChildren(...rows, ...(empty ? [empty] : []))
    rows[this.index]?.scrollIntoView({ block: "nearest" })
  }

  key(event) {
    const matches = this.matches()
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
      this.index = (this.index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length
      this.render()
    } else if (event.key === "Enter") {
      if (matches[this.index]) this.pick(matches[this.index])
    } else if (event.key === "Escape") {
      this.close()
      this.button.focus()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  pick(option) {
    this.value = option.value
    this.label()
    this.close()
    this.choose(option.value)
  }

  // Below the button, or above it when there's no room, inside the editor
  place() {
    const root = this.editor.root.getBoundingClientRect()
    const rect = this.button.getBoundingClientRect()
    const height = this.element.offsetHeight
    const below = rect.bottom - root.top + 4
    const top = below + height > root.height && rect.top - root.top - height - 4 > 0 ? rect.top - root.top - height - 4 : below
    const left = Math.max(4, Math.min(rect.left - root.left, root.width - this.element.offsetWidth - 4))
    Object.assign(this.element.style, { top: `${top}px`, left: `${left}px` })
  }

  close() {
    this.observer?.disconnect()
    this.element?.remove()
    this.element = null
    document.removeEventListener("mousedown", this.onOutside, true)
  }
}

// A row's font, once it shows
function show(row) {
  if (row.dataset.font) row.style.fontFamily = row.dataset.font
}

function fontStyle(value) {
  return value ? `font-family: ${value}` : ""
}
