// Asks for the key to keep a text under (the editor's makeTranslatable),
// showing the text as it's saved, its placeholders apart.
//
// Resolves to the key, or null when cancelled. `existing(key)` resolves to
// what the key already says in the language, if anything: the dialog then
// asks to replace it.

import { textParts, validKey } from "tess_edit/core/translations"
import { askText } from "tess_edit/ui/dialog"
import { h } from "tess_edit/ui/dom"

export function askTranslationKey(root, { text, locale, suggested, existing }) {
  return askText(root, {
    title: "Make translatable",
    label: "Key",
    value: suggested,
    hint: "A key starting with a dot belongs to this template.",
    body: h(
      "div",
      { class: "rounded-md bg-gray-50 dark:bg-gray-700/50 px-3 py-2" },
      h("span", { class: "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, `${locale.toUpperCase()} text`),
      h("span", { class: "block", "data-tess-edit-translation-text": "" }, textParts(text).map((part) => part.text ?? h("span", { class: "rounded bg-blue-100 dark:bg-blue-900/50 px-1 text-[12px] text-blue-800 dark:text-blue-200" }, part.placeholder)))
    ),
    check: async (key) => {
      if (!validKey(key)) return "A key is made of letters, digits, _ and -, separated by dots, e.g. .order.thanks"
      const current = await existing(key)
      return current !== null && current !== text ? { confirm: `${key} already says “${current}” in ${locale.toUpperCase()}.`, label: "Replace" } : null
    }
  }).then((key) => key || null)
}
