// The Blocks panel: draggable tiles, grouped by category. Clicking a tile adds
// it after the selected block (or at the end of the document) when that is
// allowed. The tiles of the host's palette sources (core/registry.js) follow,
// a list per source, to drag or click in the same way.

import { categories, getBlock } from "tess_edit/core/registry"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

export function renderBlocksPanel(editor, element) {
  const items = editor.paletteItems()
  const groups = categories().filter((category) => items.some((item) => item.category === category.key)).map((category) =>
    h(
      "section",
      { class: "px-3 pt-3" },
      h("h3", { class: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, category.label),
      h(
        "div",
        { class: "grid grid-cols-3 gap-1.5" },
        items
          .filter((item) => item.category === category.key)
          .map((item) =>
            h(
              "button",
              {
                type: "button",
                draggable: true,
                title: `Drag onto the canvas, or click to add`,
                class: `flex flex-col items-center justify-center gap-1 h-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm cursor-grab active:cursor-grabbing ${category.key === "liquid" ? "text-amber-700 dark:text-amber-400" : ""}`,
                ondragstart: (event) => {
                  event.dataTransfer.effectAllowed = "copy"
                  event.dataTransfer.setData("text/plain", item.key)
                  editor.startDrag({ kind: "new", key: item.key, type: item.type })
                },
                ondragend: () => editor.endDrag(),
                onclick: () => editor.addFromPalette(item.key)
              },
              h("span", { html: icon(item.icon, "w-5 h-5") }),
              h("span", { class: "text-[11px] leading-none" }, item.label)
            )
          )
      )
    )
  )
  element.replaceChildren(...groups, ...sourceSections(editor), h("p", { class: "px-3 py-4 text-xs text-gray-500 dark:text-gray-400" }, "Drag blocks onto the canvas or into the Layers tree. Liquid blocks wrap other blocks in {% for %} or {% if %}."))
}

const SEARCH_FROM = 8

function sourceSections(editor) {
  return [...editor.sources.values()].map(({ source, items, error }) => {
    const rows = h("div", { class: "space-y-1" })
    const show = (query = "") => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean)
      const matches = items.filter((item) => words.every((word) => `${item.label} ${item.key} ${item.description || ""}`.toLowerCase().includes(word)))
      rows.replaceChildren(
        ...matches.map((item) =>
          h(
            "button",
            {
              type: "button",
              draggable: true,
              title: item.description || "Drag onto the canvas, or click to add",
              "data-tess-edit-source-item": item.key,
              class: "flex w-full items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-left text-[13px] text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing",
              ondragstart: (event) => {
                event.dataTransfer.effectAllowed = "copy"
                event.dataTransfer.setData("text/plain", item.key)
                editor.startDrag({ kind: "source", source, item, type: item.type })
              },
              ondragend: () => editor.endDrag(),
              onclick: () => editor.insertFromSource(source, item)
            },
            h("span", { class: "text-gray-400 dark:text-gray-500", html: icon(item.icon || source.icon || getBlock(item.type)?.icon) }),
            h("span", { class: "min-w-0 flex-1 truncate" }, item.label || item.key),
            item.version ? h("span", { class: "text-[11px] text-gray-400 dark:text-gray-500" }, `v${item.version}`) : null
          )
        ),
        ...(matches.length ? [] : [h("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, items.length ? "Nothing matches." : "There's nothing here yet.")])
      )
    }
    show()
    const search = items.length >= SEARCH_FROM ? h("input", { type: "search", placeholder: `Find in ${source.label}`, class: "mb-2 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-[13px]", oninput: (event) => show(event.target.value) }) : null
    return h(
      "section",
      { class: "px-3 pt-3", "data-tess-edit-source": source.key },
      h("h3", { class: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, source.label),
      error ? h("p", { class: "text-xs text-red-600 dark:text-red-400" }, error) : null,
      search,
      rows
    )
  })
}
