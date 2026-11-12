// A kit of its root alone, as a host app has for a text message: no Blocks
// or Layers panels, a field whose hint counts what's typed, and a canvas
// that previews it with the editor's options (?kit=memo). The tests use it
// (test/system/kit_test.rb).

import { registerBlock, registerKit } from "tess_edit/core/registry"
import { createDocument } from "tess_edit/core/document"
import { escapeText } from "tess_edit/export/richtext"

const preview = (doc, options = {}) =>
  `<!doctype html><html><body class="tess-${doc.id}" style="margin:0;padding:32px;font-family:system-ui,sans-serif;background:#f3f4f6"><p style="max-width:280px;padding:10px 14px;border-radius:16px;background:#fff">${escapeText(options.from || "Memo")}: ${escapeText(doc.data.text)}</p><a data-tess-open href="/?kit=note">Open a note</a></body></html>`

registerKit({
  key: "memo",
  name: "Memo",
  root: "memo",
  blocks: false,
  starter: () => {
    const doc = createDocument("memo")
    doc.data.text = "Back at {{ time }}"
    return doc
  },
  canvas: async (doc, { options }) => ({ html: preview(doc, options), errors: [] }),
  outputs: async (doc) => ({ outputs: {}, errors: [] }),
  errors: "The memo could not be shown"
})

registerBlock({
  type: "memo",
  name: "Memo",
  icon: "root",
  kits: ["memo"],
  defaults: () => ({ data: { text: "" } }),
  fields: [{ title: "Memo", fields: [{ key: "data.text", label: "Text", type: "textarea", liquid: true, hint: (value) => `${value.length} / 160` }] }],
  render: { memo: () => "" }
})
