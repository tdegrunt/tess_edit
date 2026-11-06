// The Blocks panel: draggable tiles, grouped by category. Clicking a tile adds
// it after the selected block (or at the end of the page) when that is allowed.

import { categories, paletteItems } from "tess_edit/core/registry"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

export function renderBlocksPanel(editor, element) {
  const items = paletteItems()
  const groups = categories().map((category) =>
    h(
      "section",
      { class: "px-3 pt-3" },
      h("h3", { class: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500" }, category.label),
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
                class: `flex flex-col items-center justify-center gap-1 h-16 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm cursor-grab active:cursor-grabbing ${category.key === "liquid" ? "text-amber-700" : ""}`,
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
  element.replaceChildren(...groups, h("p", { class: "px-3 py-4 text-xs text-gray-500" }, "Drag blocks onto the canvas or into the Layers tree. Liquid blocks wrap other blocks in {% for %} or {% if %}."))
}
