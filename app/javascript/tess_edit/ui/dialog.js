// Asks for a text in a dialog in the editor, not window.prompt, which some
// browsers (Electron) don't have: a link's URL, a translation key.
//
// Resolves to the text, or null when cancelled; with `remove`, a Remove
// button resolves to "". `check(value)` may say what's wrong with it (a
// string), or ask to confirm it ({ confirm, label }: saving again confirms).

import { h } from "tess_edit/ui/dom"

const BUTTON = "rounded-md px-3 py-1.5 text-xs font-medium"

export function askText(root, { title, label, value = "", hint = null, body = null, remove = false, check = async () => null }) {
  return new Promise((resolve) => {
    let confirmed = null
    const input = h("input", {
      type: "text",
      value,
      "aria-label": label,
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
    const close = (result) => {
      dialog.remove()
      resolve(result)
    }

    async function submit() {
      const text = input.value.trim()
      if (confirmed !== text) {
        save.disabled = true
        const problem = await check(text)
        save.disabled = false
        if (typeof problem === "string") {
          message.textContent = problem
          return
        }
        if (problem?.confirm) {
          confirmed = text
          message.textContent = problem.confirm
          save.textContent = problem.label
          return
        }
      }
      close(text)
    }

    const dialog = h(
      "div",
      {
        class: "absolute inset-0 z-40 flex items-center justify-center bg-gray-900/40 dark:bg-black/60 p-6",
        role: "dialog",
        "aria-label": title,
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
        ...[
          h("h2", { class: "font-semibold text-gray-900 dark:text-gray-100" }, title),
          body,
          h(
            "label",
            { class: "block" },
            h("span", { class: "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" }, label),
            input,
            hint ? h("span", { class: "mt-1 block text-[11px] text-gray-500 dark:text-gray-400" }, hint) : null
          ),
          message,
          h(
            "div",
            { class: "flex gap-2" },
            remove ? h("button", { type: "button", class: `${BUTTON} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30`, onclick: () => close("") }, "Remove") : null,
            h("span", { class: "flex-1" }),
            h("button", { type: "button", class: `${BUTTON} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700`, onclick: () => close(null) }, "Cancel"),
            save
          )
        ].filter(Boolean)
      )
    )
    root.append(dialog)
    input.focus()
    input.select()
  })
}
