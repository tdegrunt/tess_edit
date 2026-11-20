// The editor's own words (its labels, titles, hints and messages) in the
// language of the page it's on. They're written in English everywhere, and
// that English is the key: the host gives what each says in its language as
// JSON in the editor, rendered by the tess_edit_translations helper from its
// locale files (config/locales/*.yml), with its own and its kits' words too:
//
//   <div data-controller="tess-edit">
//     <%= tess_edit_translations "nuntius.editor" %>
//
//   <script type="application/json" data-tess-edit-target="translations">
//     { "Preview text": "Voorbeeldtekst", "Edit %{label} in a larger window": "%{label} in een groter venster bewerken", … }
//   </script>
//
// A block's or kit's definitions keep their English (a group's title is how
// another one says where it goes: before: "Message"); the editor translates
// them where it shows them. Without a text in the JSON it shows the English.
// One language for the page, so one set of words for all its editors.

let words = {}

export function setTranslations(translations) {
  words = translations || {}
}

// A text in the page's language, its %{name}s filled from values:
//
//   t("Edit %{label} in a larger window", { label: t(field.label) })
export function t(text, values = {}) {
  if (typeof text !== "string" || !text) return text
  const translated = Object.hasOwn(words, text) ? words[text] : text
  return translated.replace(/%\{(\w+)\}/g, (placeholder, name) => (Object.hasOwn(values, name) ? String(values[name]) : placeholder))
}
