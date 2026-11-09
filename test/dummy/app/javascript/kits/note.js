// A kit registered by the demo app the way a host app adds its own: a note,
// a card of HTML with a title. It has its own root block and renders
// TessEdit's Text, Image, Divider, Loop, Condition and Content blocks
// through render.note hooks it adds with extendBlock. The tests use it to
// check the kit API (test/javascript/kits_test.js, test/system/kit_test.rb).

import { extendBlock, registerBlock, registerKit } from "tess_edit/core/registry"
import { createDocument, createNode } from "tess_edit/core/document"
import { escapeAttribute, escapeText, richTextToHtml } from "tess_edit/export/richtext"
import { CONTENT_END, CONTENT_START } from "tess_edit/blocks/content"

// Renders a note's blocks through their render.note hooks. In the editor,
// every block gets its tess-<id> class and an empty container a placeholder,
// as the canvas needs.
export function toNoteHtml(doc, { editor = false } = {}) {
  const ctx = {
    editor,
    escapeText,
    escapeAttribute,
    richText: richTextToHtml,
    classes: (node) => (editor ? ` class="tess-${node.id}"` : ""),
    children: (node) => {
      if (!node.children.length && editor) return [`<div class="tessph-${node.id}" style="padding:12px;color:#94a3b8;text-align:center">Drop content here</div>`]
      return node.children.map(render)
    }
  }
  const render = (node) => ctx.hooks(node.type)(node, ctx)
  ctx.hooks = (type) => blocks[type] || ((node) => ctx.children(node).join("\n"))
  return render(doc)
}

const blocks = {
  note: (node, { classes, children, escapeText }) =>
    `<!doctype html>\n<html>\n<head><meta charset="utf-8"><title>${escapeText(node.data.title)}</title></head>\n<body${classes(node)} style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:${node.data.color || "#fef9c3"}">\n<h1 style="margin:0 0 12px">${escapeText(node.data.title)}</h1>\n${children(node).join("\n")}\n</body>\n</html>`,
  text: (node, { classes, richText }) => `<div${classes(node)} style="padding:4px 0"><div>${richText(node.data.content)}</div></div>`,
  image: (node, { classes, escapeAttribute }) => `<div${classes(node)}><img src="${escapeAttribute(node.attributes.src)}" alt="" style="max-width:100%"></div>`,
  divider: (node, { classes }) => `<div${classes(node)} style="padding:8px 0"><hr></div>`,
  loop: (node, { editor, children }) => (editor ? children(node).join("\n") : [`{% for ${node.data.variable} in ${node.data.collection} %}`, ...children(node), "{% endfor %}"].join("\n")),
  condition: (node, { editor, children }) => (editor ? children(node).join("\n") : [`{% if ${node.data.expression} %}`, ...children(node), "{% endif %}"].join("\n")),
  content: (node, { editor, children }) => (editor ? children(node).join("\n") : [CONTENT_START, ...children(node), CONTENT_END].join("\n"))
}

registerKit({
  key: "note",
  name: "Note",
  root: "note",
  starter: () => {
    const doc = createDocument("note")
    doc.data.title = "A note"
    doc.children = [createNode("text", { data: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello {{ name }}" }] }] } } })]
    return doc
  },
  previewTitle: "Preview the note",
  canvas: async (doc, { editor }) => ({ html: toNoteHtml(doc, { editor }), errors: [] }),
  outputs: async (doc) => ({ outputs: { html: toNoteHtml(doc) }, errors: [] }),
  notes: { html: "The note, with Liquid left in place." },
  errors: "The note could not be rendered"
})

registerBlock({
  type: "note",
  name: "Note",
  icon: "root",
  kits: ["note"],
  accepts: ["content", "body"],
  defaults: () => ({ data: { title: "", color: "#fef9c3" } }),
  fields: [{ title: "Note", fields: [{ key: "data.title", label: "Title", type: "text" }, { key: "data.color", label: "Color", type: "color" }] }],
  render: { note: blocks.note }
})

for (const type of ["text", "image", "divider", "loop", "condition", "content"]) {
  extendBlock(type, { kits: ["note"], render: { note: blocks[type] } })
}
