// The variable picker: suggestions while typing Liquid ({{ order.… ), and a
// menu to browse the variables from a field's { } button or the text
// toolbar. It works on an "adapter" for the place being typed in:
//
//   before()                 the text before the caret (in the line or paragraph)
//   after()                  the text after it
//   replace(start, end, text) replaces part of before() + after(), by offsets in it
//   rect()                   where to show the menu, in the page's viewport
//   mode                     "output" (Liquid in text: {{ … }}), "expression" (a
//                            Condition) or "collection" (a Loop's collection)
//   scope                    the loop variables there (core/variables.js loopScope)
//
// See inputAdapter below and TextEditing for Tiptap's. With the host's
// translations it also suggests their keys while typing {{ '. What it
// suggests depends on what's being written (core/liquid.js liquidContext): a
// variable; after a |, the host's filters; a filter's argument, a property of
// the collection's items ("party") or a value it can have ("sponsor"); and
// after == or !=, the values of the variable compared.

import { expressionParts, liquidContext, quoted, textScope } from "tess_edit/core/liquid"
import { keyCompletion, keyToken } from "tess_edit/core/translations"
import { completion } from "tess_edit/core/variables"
import { t } from "tess_edit/core/i18n"
import { h } from "tess_edit/ui/dom"

const ITEM = "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]"

export class VariableMenu {
  constructor(editor) {
    this.editor = editor
    this.element = null
    this.request = 0
    this.onOutside = (event) => {
      if (this.element && !this.element.contains(event.target) && event.target !== this.anchor) this.close()
    }
  }

  get open() {
    return Boolean(this.element)
  }

  // Shows the variables for the path being typed, or closes when there's none.
  suggest(adapter) {
    const suggesting = this.suggesting(adapter)
    this.pending = suggesting
    suggesting.finally(() => this.pending === suggesting && (this.pending = null))
    return suggesting
  }

  async suggesting(adapter) {
    const before = adapter.before()
    const key = this.editor.translations?.enabled && adapter.mode === "output" && keyToken(before)
    if (key) return this.suggestKeys(adapter, key)
    if (!this.editor.variables?.enabled) return this.close()
    const context = liquidContext(before, adapter.mode === "output" ? "output" : "expression")
    if (!context) return this.close()
    const scope = [...textScope(before), ...(adapter.scope || [])]
    const request = ++this.request
    let found
    try {
      found = await this.options(context, scope)
    } catch (error) {
      found = null
    }
    if (request !== this.request) return
    if (!found?.items.length) return this.close()
    this.show({ adapter, browse: false, items: found.items, index: 0, choose: found.choose })
  }

  // What fits a context, those starting with what's typed first, then those
  // whose label has it: { items, choose }
  async options(context, scope) {
    const variables = this.editor.variables
    if (context.kind === "variable") return this.variableOptions(context, context.path, scope)
    if (context.kind === "filter") {
      const filters = [...(await variables.filters()).values()]
      const items = ranked(filters.map((filter) => ({ name: filter.name, label: filter.label, hint: signature(filter), filter })), context.partial)
      if (items.length === 1 && items[0].name === context.partial && !items[0].filter.arguments?.length) return null
      return {
        items,
        choose: async (item) => {
          const adapter = this.state.adapter
          const more = item.filter.arguments?.length > 0
          adapter.replace(context.start, adapter.before().length, more ? `${item.name}: ` : item.name)
          more ? await this.suggest(adapter) : this.close()
        }
      }
    }
    if (context.kind === "argument") {
      const filter = (await variables.filters()).get(context.filter)
      const kind = filter?.arguments?.[context.index]?.kind
      const more = filter?.arguments?.length > context.index + 1
      if (kind === "property" || kind === "value") {
        const elements = await this.elements(context.input, scope)
        if (!elements) return null
        const choices = kind === "property"
          ? elements.map((variable) => ({ value: variable.name, label: variable.label }))
          : elements.find((variable) => variable.name === context.args[context.index - 1])?.values || []
        return this.quotedOptions(context, choices, more)
      }
      return context.quote ? null : this.variableOptions(context, context.partial, scope)
    }
    if (context.kind === "value") {
      const variable = await variables.lookup(context.of, scope)
      return this.quotedOptions(context, variable?.values || [], false)
    }
    return null
  }

  // The variables for a path being typed, from `context.start`
  async variableOptions(context, path, scope) {
    const dot = path.lastIndexOf(".")
    const parent = dot < 0 ? "" : path.slice(0, dot)
    const partial = path.slice(dot + 1)
    const start = context.start + dot + 1
    const items = ranked(await this.editor.variables.options(parent, scope), partial)
    if (items.length === 1 && items[0].name.toLowerCase() === partial.toLowerCase() && !items[0].children) return null
    return { items, choose: (item) => this.complete(this.state.adapter, context, start, item) }
  }

  // The variables of a collection's items, for a filter on it: in
  // `lines | where: "`, those of each line
  async elements(input, scope) {
    const parts = expressionParts(input)
    if (!parts) return null
    const [entry] = await this.editor.variables.resolveScope([{ variable: "\u0000", expression: input }])
    if (!entry?.path) return null
    const collection = await this.editor.variables.lookup(entry.path, scope)
    if (!collection?.collection) return null
    return this.editor.variables.options(`${entry.path}.first`, scope)
  }

  // Values in quotes ({ value, label }), then a comma for the next argument
  quotedOptions(context, choices, more) {
    const items = ranked(choices.map((choice) => ({ name: `"${choice.value}"`, value: choice.value, label: choice.label })), context.partial, (item) => item.value)
    if (!items.length || (items.length === 1 && items[0].value === context.partial)) return null
    return {
      items,
      choose: async (item) => {
        const adapter = this.state.adapter
        const before = adapter.before()
        const { text, through } = quoted(item.value, { quote: context.quote, after: adapter.after() })
        adapter.replace(context.start, before.length + through, more ? `${text}, ` : text)
        more ? await this.suggest(adapter) : this.close()
      }
    }
  }

  // The translation keys with what's typed, those that start with it first,
  // labelled with their text in the editor's language
  suggestKeys(adapter, token) {
    const translations = this.editor.translations
    const locale = this.editor.translationLocale || translations.locales[0]
    const partial = token.partial.toLowerCase()
    const keys = translations.suggestions.filter((key) => key.toLowerCase().includes(partial))
    const sorted = [...keys.filter((key) => key.toLowerCase().startsWith(partial)), ...keys.filter((key) => !key.toLowerCase().startsWith(partial))]
    if (!sorted.length || (sorted.length === 1 && sorted[0] === token.partial)) return this.close()
    this.request++
    const items = sorted.slice(0, 50).map((key) => ({ name: key, label: (locale && translations.value(key, locale)) || key }))
    this.show({
      adapter,
      browse: false,
      items,
      index: 0,
      choose: (item) => {
        adapter.replace(token.start, adapter.before().length, keyCompletion(item.name, token.quote, adapter.after()))
        this.close()
      }
    })
  }

  async complete(adapter, token, start, item) {
    if (!adapter) return
    const before = adapter.before()
    const { text, more } = completion(item, { tag: token.tag, before: before.slice(0, start), after: adapter.after(), collection: adapter.mode === "collection" })
    adapter.replace(start, before.length, text)
    more ? await this.suggest(adapter) : this.close()
  }

  // A menu to browse the variables from `anchor` (a button), inserting the
  // chosen one at the caret.
  async browse(adapter, anchor, path = "") {
    this.anchor = anchor
    const request = ++this.request
    let items
    let error = null
    try {
      items = await this.editor.variables.options(path, adapter.scope)
    } catch (failure) {
      items = []
      error = failure.message
    }
    if (request !== this.request) return
    this.show({
      adapter,
      browse: true,
      path,
      items,
      error,
      index: -1,
      choose: (item) => {
        const full = path ? `${path}.${item.name}` : item.name
        const drill = item.children && !(adapter.mode === "collection" && item.collection)
        if (drill) return this.browse(adapter, anchor, full)
        this.close()
        adapter.insert(adapter.mode === "output" ? `{{ ${full} }}` : full)
      }
    })
  }

  // Arrow keys, Enter and Tab choose, Escape closes. True when it took the key.
  key(event) {
    if (this.state?.browse) return false
    if ((event.key === "Enter" || (event.key === "Tab" && this.open)) && this.pending) {
      // The menu doesn't show yet what the last keys lead to: choose from that
      // once it's there. Enter doesn't submit a form in the meantime.
      this.pending.then(() => this.state && !this.state.browse && this.state.choose(this.state.items[this.state.index]))
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    if (!this.open) return false
    const { items } = this.state
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      this.state.index = (this.state.index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length
      this.render()
    } else if (event.key === "Enter" || event.key === "Tab") {
      this.state.choose(items[this.state.index])
    } else if (event.key === "Escape") {
      this.close()
    } else {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  show(state) {
    this.state = state
    if (!this.element) {
      this.element = h("div", {
        class: "absolute z-50 w-72 max-h-72 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg",
        role: "listbox",
        "aria-label": t("Variables"),
        // Keep the focus (and caret) in the field being typed in
        onmousedown: (event) => event.preventDefault(),
        onkeydown: (event) => event.key === "Escape" && this.close()
      })
      this.editor.root.append(this.element)
      document.addEventListener("mousedown", this.onOutside, true)
    }
    this.render()
  }

  render() {
    const { adapter, browse, path, items, index, error, choose } = this.state
    const header = browse
      ? h(
        "div",
        { class: "flex items-center gap-1 border-b border-gray-100 dark:border-gray-700 px-2.5 pb-1.5 pt-0.5 text-xs text-gray-500 dark:text-gray-400" },
        path
          ? h("button", { type: "button", class: "rounded px-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40", onclick: () => this.browse(adapter, this.anchor, path.split(".").slice(0, -1).join(".")) }, "‹ Back")
          : null,
        h("span", { class: "truncate font-mono" }, path || t("Variables"))
      )
      : null
    const rows = items.map((item, i) =>
      h(
        "button",
        {
          type: "button",
          role: "option",
          "aria-selected": i === index ? "true" : "false",
          class: `${ITEM} ${i === index ? "bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200" : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"}`,
          title: item.hint || "",
          onclick: () => choose(item)
        },
        h("span", { class: "min-w-0 flex-1 truncate" }, t(item.label) || item.name),
        h("span", { class: "shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400" }, item.name),
        item.children && !(adapter.mode === "collection" && item.collection) ? h("span", { class: "shrink-0 text-gray-400 dark:text-gray-500" }, "›") : null
      )
    )
    const empty = !items.length ? h("p", { class: "px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400" }, error || t("No variables here")) : null
    this.element.replaceChildren(...[header, ...rows, empty].filter(Boolean))
    this.place(browse ? this.anchor.getBoundingClientRect() : adapter.rect())
    this.element.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" })
  }

  // Below the rect, or above it when there's no room, inside the editor.
  place(rect) {
    const root = this.editor.root.getBoundingClientRect()
    const height = this.element.offsetHeight
    const below = rect.bottom - root.top + 4
    const top = below + height > root.height && rect.top - root.top - height - 4 > 0 ? rect.top - root.top - height - 4 : below
    const left = Math.max(4, Math.min(rect.left - root.left, root.width - this.element.offsetWidth - 4))
    Object.assign(this.element.style, { top: `${top}px`, left: `${left}px` })
  }

  close() {
    this.request++
    this.element?.remove()
    this.element = null
    this.state = null
    this.anchor = null
    document.removeEventListener("mousedown", this.onOutside, true)
  }
}

// An adapter for an input or textarea; replacing text fires its input event,
// so the field saves it as if typed.
export function inputAdapter(input, { mode = "output", scope = [] } = {}) {
  const fire = () => input.dispatchEvent(new Event("input", { bubbles: true }))
  return {
    mode,
    scope,
    before: () => input.value.slice(0, input.selectionStart ?? input.value.length),
    after: () => input.value.slice(input.selectionEnd ?? input.value.length),
    replace(start, end, text) {
      input.setRangeText(text, start, end, "end")
      fire()
    },
    insert(text) {
      input.focus()
      const start = input.selectionStart ?? input.value.length
      input.setRangeText(text, start, input.selectionEnd ?? start, "end")
      fire()
    },
    rect: () => input.getBoundingClientRect()
  }
}

// Suggestions while typing in an input or textarea
export function suggestIn(menu, input, adapter) {
  input.addEventListener("input", (event) => event.isTrusted && menu.suggest(adapter))
  input.addEventListener("keydown", (event) => menu.key(event))
  input.addEventListener("blur", () => !menu.state?.browse && menu.close())
}

// Those whose name (or `name(item)`) starts with what's typed, then those
// whose label has it
function ranked(items, partial, name = (item) => item.name) {
  const typed = (partial || "").toLowerCase()
  const named = items.filter((item) => name(item).toLowerCase().startsWith(typed))
  return [...named, ...items.filter((item) => !named.includes(item) && item.label?.toLowerCase().includes(typed))]
}

// A filter as it's written: date: format
function signature(filter) {
  const args = (filter.arguments || []).map((argument) => argument.name)
  return args.length ? `${filter.name}: ${args.join(", ")}` : filter.name
}
