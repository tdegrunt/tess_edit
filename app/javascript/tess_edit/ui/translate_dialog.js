// Asks for the key to keep a text under (the editor's makeTranslatable),
// showing the text as it's saved, its placeholders apart. A dialog in the
// editor, not window.prompt, which some browsers (Electron) don't have.
//
// Resolves to the key, or null when cancelled. `existing(key)` resolves to
// what the key already says in the language, if anything: the dialog then
// asks to replace it.

import { textParts, validKey } from "tess_edit/core/translations"
import { h } from "tess_edit/ui/dom"

const BUTTON = "rounded-md px-3 py-1.5 text-xs font-medium"

export function askTranslationKey(root, { text, locale, suggested, existing }) {
  return new Promise((resolve) => {
    let confirmed = null
    const input = h("input", {
      type: "text",
      value: suggested,
      "aria-label": "Key",
      class: "w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 font-mono text-[13px] text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
      oninput: () => {
        confirmed = null
        message.textContent = ""
        save.textContent = "Save"
      },
      onkeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          submit()
        }
      }
    })
    const message = h("p", { class: "min-h-4 text-xs text-red-600 dark:text-red-400", role: "alert" })
    const save = h("button", { type: "button", class: `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`, onclick: () => submit() }, "Save")
    const close = (key) => {
      dialog.remove()
      resolve(key)
    }

    async function submit() {
      const key = input.value.trim()
      if (!validKey(key)) {
        message.textContent = "A key is made of letters, digits, _ and -, separated by dots, e.g. .order.thanks"
        return
      }
      if (confirmed !== key) {
        save.disabled = true
        const current = await existing(key)
        save.disabled = false
        if (current !== null && current !== text) {
          confirmed = key
          message.textContent = `${key} already says “${current}” in ${locale.toUpperCase()}.`
          save.textContent = "Replace"
          return
        }
      }
      close(key)
    }

    const dialog = h(
      "div",
      {
        class: "absolute inset-0 z-40 flex items-center justify-center bg-gray-900/40 dark:bg-black/60 p-6",
        role: "dialog",
        "aria-label": "Make translatable",
        onmousedown: (event) => event.target === dialog && close(null),
        onkeydown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            close(null)
          }
        }
      },
      h(
        "div",
        { class: "flex w-full max-w-md flex-col gap-3 rounded-xl bg-white dark:bg-gray-800 p-4 text-sm text-gray-800 dark:text-gray-200 shadow-xl" },
        h("h2", { class: "font-semibold text-gray-900 dark:text-gray-100" }, "Make translatable"),
        h(
          "div",
          { class: "rounded-md bg-gray-50 dark:bg-gray-700/50 px-3 py-2" },
          h("span", { class: "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, `${locale.toUpperCase()} text`),
          h("span", { class: "block", "data-tess-edit-translation-text": "" }, textParts(text).map((part) => part.text ?? h("span", { class: "rounded bg-blue-100 dark:bg-blue-900/50 px-1 text-[12px] text-blue-800 dark:text-blue-200" }, part.placeholder)))
        ),
        h(
          "label",
          { class: "block" },
          h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, "Key"),
          input,
          h("span", { class: "mt-1 block text-[11px] text-gray-500 dark:text-gray-400" }, "A key starting with a dot belongs to this template.")
        ),
        message,
        h(
          "div",
          { class: "flex justify-end gap-2" },
          h("button", { type: "button", class: `${BUTTON} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700`, onclick: () => close(null) }, "Cancel"),
          save
        )
      )
    )
    root.append(dialog)
    input.focus()
    input.select()
  })
}
