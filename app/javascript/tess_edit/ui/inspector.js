// The Inspect panel: renders the selected block's fields from its
// definition (blocks/*.js, via core/registry.js) and writes changes back through the editor.

import { getBlock, label } from "tess_edit/core/registry"
import { find, getValue } from "tess_edit/core/document"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const INPUT = "w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-[13px] text-gray-900 shadow-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"

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
  }

  render() {
    const { doc, selectedId } = this.editor
    const hit = find(doc, selectedId) || { node: doc }
    const node = hit.node
    const definition = getBlock(node.type)

    const actions =
      node.type === "page"
        ? []
        : [
          ["parent", "Select parent", () => this.editor.selectParent()],
          ["copy", "Duplicate", () => this.editor.duplicate(node.id)],
          ["trash", "Delete", () => this.editor.remove(node.id)]
        ].map(([name, title, onclick]) =>
          h("button", { type: "button", title, class: "w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900", html: icon(name), onclick })
        )

    const header = h(
      "div",
      { class: "flex items-center gap-2 px-4 h-12 border-b border-gray-200 shrink-0" },
      h("span", { class: "text-gray-400", html: icon(definition.icon, "w-4 h-4") }),
      h("h2", { class: "font-semibold text-gray-900 truncate" }, node.type === "page" ? "General" : label(node)),
      h("div", { class: "ml-auto flex items-center gap-0.5" }, actions)
    )

    const groups = (definition.fields || []).map((group) => this.group(node, group))
    const hint = definition.hint ? h("p", { class: "mx-4 mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600" }, definition.hint) : null

    this.element.replaceChildren(header, h("div", { class: "flex-1 overflow-y-auto pb-6" }, hint, groups))
  }

  group(node, group) {
    const key = `${node.type}:${group.title}`
    const open = this.openGroups.has(key) ? this.openGroups.get(key) : !group.collapsed
    const details = h(
      "details",
      { class: "group/field border-b border-gray-100", open, ontoggle: (event) => this.openGroups.set(key, event.currentTarget.open) },
      h(
        "summary",
        { class: "flex items-center gap-1.5 px-4 py-2.5 cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 list-none [&::-webkit-details-marker]:hidden" },
        h("span", { html: icon("chevron", "w-3 h-3 transition-transform group-open/field:rotate-90") }),
        group.title
      ),
      h("div", { class: "px-4 pb-4 space-y-3" }, group.fields.map((field) => this.field(node, field)))
    )
    return details
  }

  field(node, field) {
    const value = getValue(node, field.key) ?? ""
    const set = (next, options = {}) => this.editor.setValue(node.id, field.key, next, options)
    const control = this.control(node, field, value, set)
    // A div, not a label: a label would forward clicks to the first button or color picker inside it.
    return h(
      "div",
      { class: "block" },
      h("span", { class: "mb-1 block text-xs font-medium text-gray-700" }, field.label),
      control,
      field.hint ? h("span", { class: "mt-1 block text-[11px] leading-snug text-gray-500" }, field.hint) : null
    )
  }

  control(node, field, value, set) {
    switch (field.type) {
      case "textarea":
      case "code":
        return h("textarea", {
          class: `${INPUT} ${field.type === "code" ? "font-mono text-xs" : ""} min-h-32`,
          rows: field.type === "code" ? 10 : 4,
          spellcheck: field.type !== "code",
          value,
          oninput: (event) => set(event.target.value)
        })

      case "size":
        return h("input", {
          type: "text",
          class: INPUT,
          value,
          placeholder: field.placeholder || "",
          oninput: (event) => set(withUnit(event.target.value)),
          onchange: (event) => (event.target.value = withUnit(event.target.value))
        })

      case "color":
        return this.color(value, set)

      case "select":
        return h(
          "select",
          { class: INPUT, onchange: (event) => set(event.target.value) },
          field.options.map((option) => {
            const optionValue = typeof option === "string" ? option : option.value
            const optionLabel = typeof option === "string" ? option || "Default" : option.label
            return h("option", { value: optionValue, selected: optionValue === value }, optionLabel)
          })
        )

      case "segmented":
        return h(
          "div",
          { class: "flex rounded-md border border-gray-300 overflow-hidden" },
          field.options.map((option) =>
            h(
              "button",
              {
                type: "button",
                title: value === option.value ? "Click again to use the default" : "",
                class: `flex-1 px-2 py-1 text-xs border-l first:border-l-0 border-gray-300 ${value === option.value ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`,
                onclick: (event) => {
                  event.preventDefault()
                  set(value === option.value ? "" : option.value)
                  this.render()
                }
              },
              option.label
            )
          )
        )

      case "toggle":
        return h(
          "span",
          { class: "flex items-center gap-2" },
          h("input", {
            type: "checkbox",
            class: "h-4 w-4 rounded border-gray-300 text-blue-600",
            checked: value === field.on,
            onchange: (event) => set(event.target.checked ? field.on : field.off)
          }),
          h("span", { class: "text-xs text-gray-600" }, value === field.on ? "On" : "Off")
        )

      case "spacing":
        return this.spacing(value, set)

      case "list":
        return this.list(node, field, Array.isArray(value) ? value : [], set)

      default:
        return h("input", { type: "text", class: INPUT, value, placeholder: field.placeholder || "", oninput: (event) => set(event.target.value) })
    }
  }

  color(value, set) {
    const text = h("input", {
      type: "text", class: `${INPUT} font-mono text-xs`, value, placeholder: "Default", oninput: (event) => {
        set(event.target.value)
        if (/^#[0-9a-f]{6}$/i.test(event.target.value)) swatch.value = event.target.value
      }
    })
    const swatch = h("input", {
      type: "color",
      class: "h-7 w-8 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5",
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
    const inputs = ["Top", "Right", "Bottom", "Left"].map((side, i) =>
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
        h("span", { class: "block text-center text-[10px] text-gray-400" }, side)
      )
    )
    return h("span", { class: "grid grid-cols-4 gap-1" }, inputs)
  }

  list(node, field, items, set) {
    const update = (next) => {
      set(next, { coalesce: false })
      this.render()
    }
    const rows = items.map((item, index) =>
      h(
        "div",
        { class: "rounded-md border border-gray-200 bg-gray-50 p-2 space-y-1.5" },
        field.item.map((part) =>
          part.type === "select"
            ? h(
              "select",
              { class: INPUT, onchange: (event) => update(items.map((it, i) => (i === index ? { ...it, [part.name]: event.target.value } : it))) },
              part.options.map((option) => h("option", { value: option, selected: option === item[part.name] }, option))
            )
            : h("input", {
              type: "text",
              class: INPUT,
              placeholder: part.label,
              value: item[part.name] ?? "",
              oninput: (event) => {
                items = items.map((it, i) => (i === index ? { ...it, [part.name]: event.target.value } : it))
                set(items)
              }
            })
        ),
        h(
          "div",
          { class: "flex justify-end gap-1" },
          h("button", {
            type: "button", title: "Move up", class: "w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30", disabled: index === 0, html: icon("up", "w-3.5 h-3.5"), onclick: () => {
              const next = [...items]
                ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
              update(next)
            }
          }),
          h("button", { type: "button", title: "Remove", class: "w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-red-600", html: icon("trash", "w-3.5 h-3.5"), onclick: () => update(items.filter((_, i) => i !== index)) })
        )
      )
    )
    return h(
      "div",
      { class: "space-y-2" },
      rows,
      h("button", { type: "button", class: "w-full rounded-md border border-dashed border-gray-300 py-1.5 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600", onclick: () => update([...items, { ...field.newItem }]) }, "Add")
    )
  }
}
