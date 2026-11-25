// A minimal kit for the tests of TessEdit's generic behaviour: a page whose
// root takes sections and other "body" blocks only, as an email's does, so
// content goes in a section's columns. It takes in all of TessEdit's blocks
// registered so far; each renders as a tag of its type around its children,
// with its tess-<id> class in the editor. The demo's Note kit
// (test/dummy/app/javascript/kits/note.js) is a fuller example.
import { blockTypes, extendBlock, registerBlock, registerKit } from "tess_edit/core/registry"

export const renderPage = (node, { editor = false } = {}) => `<${node.type}${editor ? ` class="tess-${node.id}"` : ""}>${node.children.map((child) => renderPage(child, { editor })).join("")}</${node.type}>`

registerKit({
  key: "page",
  name: "Page",
  root: "page",
  // Its root's type before it was "page"
  aliases: ["sheet"],
  canvas: async (doc, { editor } = {}) => ({ html: renderPage(doc, { editor }), errors: [] }),
  outputs: async (doc) => ({ outputs: { html: renderPage(doc) }, errors: [] })
})

for (const type of blockTypes()) extendBlock(type, { kits: ["page"], render: { page: renderPage } })
registerBlock({ type: "page", name: "Page", kits: ["page"], accepts: ["body"], render: { page: renderPage } })
