// A kit registered by the demo app the way a host app adds its own: a note,
// a card of HTML with a title. TessEdit has no kit of its own, so the demo
// and the tests use this one (test/javascript/kits_test.js, test/system/*).
//
// It has its own root block and takes in TessEdit's blocks (Section, Column,
// Text, Image, Button, Divider, Spacer, HTML, Loop, Condition, Assign,
// Content and Table) through render.note hooks it adds with extendBlock. It
// has a Card block of its own with a title and text edited on the canvas
// (inline parts, as the note's title is) and stars picked with a field type
// of its own. Its canvas says when an HTML block's HTML has a tag that isn't
// closed, the way a kit reports what it can't render.

import { extendBlock, registerBlock, registerFieldType, registerKit } from "tess_edit/core/registry"
import { createDocument, createNode } from "tess_edit/core/document"
import { escapeAttribute, escapeText, richTextToHtml } from "tess_edit/export/richtext"
import { CONTENT_END, CONTENT_START } from "tess_edit/blocks/content"
import { tableHtml } from "tess_edit/export/table"

// An inline style of the declarations that have a value
const css = (declarations) => {
  const text = Object.entries(declarations)
    .filter(([, value]) => value)
    .map(([property, value]) => `${property}:${value}`)
    .join(";")
  return text ? ` style="${escapeAttribute(text)}"` : ""
}

// A block's text styles, from its attributes
const typography = (a) => ({ color: a.color, "font-family": a["font-family"], "font-size": a["font-size"], "font-weight": a["font-weight"], "line-height": a["line-height"], "text-align": a.align })

// Renders a note's blocks through their render.note hooks. In the editor,
// every block gets its tess-<id> class and an empty container a placeholder,
// as the canvas needs.
export function toNoteHtml(doc, { editor = false } = {}) {
  const ctx = {
    editor,
    css,
    escapeText,
    escapeAttribute,
    richText: richTextToHtml,
    classes: (node) => (editor ? ` class="tess-${node.id}"` : ""),
    // Marks an inline part, in the editor
    part: (key) => (editor ? ` data-tess-edit-field="${key}"` : ""),
    children: (node) => {
      if (!node.children.length && editor) return [`<div class="tessph-${node.id}" style="padding:12px;color:#94a3b8;text-align:center">Drop content here</div>`]
      return node.children.map(render)
    },
    // A block of the note's own in a table cell, which TessEdit's table doesn't know
    cellBlock: (node) => render(node)
  }
  const render = (node) => (blocks[node.type] || ((node) => ctx.children(node).join("\n")))(node, ctx)
  return render(doc)
}

const blocks = {
  note: (node, { classes, part, children, escapeText }) =>
    `<!doctype html>\n<html>\n<head><meta charset="utf-8"><title>${escapeText(node.data.title)}</title></head>\n<body${classes(node)} style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:${node.data.color || "#fef9c3"}">\n<h1${part("data.title")} style="margin:0 0 12px">${escapeText(node.data.title)}</h1>\n${children(node).join("\n")}\n</body>\n</html>`,
  section: (node, { classes, children }) => {
    const a = node.attributes
    const image = a["background-url"] && `url('${a["background-url"]}')`
    return `<div${classes(node)}${css({ display: "flex", gap: "12px", "flex-direction": a.direction === "rtl" ? "row-reverse" : null, padding: a.padding, "background-color": a["background-color"], "background-image": image, "background-size": image && "cover", "text-align": a["text-align"], "border-radius": a["border-radius"] })}>${children(node).join("\n")}</div>`
  },
  column: (node, { classes, children }) => {
    const a = node.attributes
    return `<div${classes(node)}${css({ flex: a.width ? `0 0 ${a.width}` : "1", "min-width": "0", padding: a.padding, "background-color": a["background-color"] })}>${children(node).join("\n")}</div>`
  },
  text: (node, { classes, richText }) => `<div${classes(node)}${css({ padding: "4px 0", ...typography(node.attributes) })}><div>${richText(node.data.content)}</div></div>`,
  image: (node, { classes, escapeAttribute }) => `<div${classes(node)}${css({ "text-align": node.attributes.align })}><img src="${escapeAttribute(node.attributes.src)}" alt="" style="max-width:100%"></div>`,
  button: (node, { classes, escapeText, escapeAttribute }) => {
    const a = node.attributes
    return `<div${classes(node)}${css({ padding: "8px 0", "text-align": a.align })}><a href="${escapeAttribute(a.href || "#")}"${css({ display: "inline-block", padding: a["inner-padding"], "border-radius": a["border-radius"], "background-color": a["background-color"], "text-decoration": "none", ...typography(a), "text-align": null })}>${escapeText(node.data.content)}</a></div>`
  },
  card: (node, { classes, part, escapeText, richText }) =>
    `<div${classes(node)} style="margin:8px 0;padding:12px;border-radius:8px;background:#fff"><strong${part("data.title")}>${escapeText(node.data.title)}</strong> <span>${"★".repeat(node.data.stars || 0)}</span><div${part("data.body")}>${richText(node.data.body)}</div></div>`,
  divider: (node, { classes }) => `<div${classes(node)} style="padding:8px 0"><hr></div>`,
  spacer: (node, { classes }) => `<div${classes(node)}${css({ height: node.attributes.height || "24px" })}></div>`,
  // As it is; in the editor in a block of its own, to select it by
  raw: (node, { editor, classes }) => (editor ? `<div${classes(node)}>${node.data.html || ""}</div>` : node.data.html || ""),
  loop: (node, { editor, children }) => (editor ? children(node).join("\n") : [`{% for ${node.data.variable} in ${node.data.collection} %}`, ...children(node), "{% endfor %}"].join("\n")),
  condition: (node, { editor, children }) => (editor ? children(node).join("\n") : [`{% if ${node.data.expression} %}`, ...children(node), "{% endif %}"].join("\n")),
  content: (node, { editor, children }) => (editor ? children(node).join("\n") : [CONTENT_START, ...children(node), CONTENT_END].join("\n")),
  // TessEdit's HTML of a table, its rows and cells in it
  table: (node, ctx) => `<div${ctx.classes(node)} style="padding:4px 0"><table style="width:100%;border-collapse:collapse;background:#fff">${tableHtml(node, ctx)}</table></div>`,
  table_row: () => "",
  table_cell: () => "",
  assign: (node, { editor }) => (editor ? "" : `{% assign ${node.data.variable} = ${node.data.expression} %}`)
}

// The tags in a note's HTML blocks that aren't closed
const VOID = new Set(["area", "br", "col", "hr", "img", "input", "link", "meta", "source", "wbr"])

export function unclosedTags(html) {
  const open = []
  for (const [, slash, name, selfClosing] of html.matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*?(\/?)>/gi)) {
    const tag = name.toLowerCase()
    if (VOID.has(tag) || selfClosing) continue
    if (!slash) open.push(tag)
    else if (open.at(-1) === tag) open.pop()
  }
  return open
}

function problems(doc) {
  const errors = []
  const walk = (node) => {
    if (node.type === "raw") unclosedTags(node.data.html || "").forEach((tag) => errors.push(`<${tag}> isn't closed in an HTML block`))
    node.children.forEach(walk)
  }
  walk(doc)
  return errors
}

const paragraph = (...content) => ({ type: "paragraph", content })
const text = (value, marks) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value })
const rich = (...content) => ({ type: "doc", content })
const textNode = (attributes, ...paragraphs) => createNode("text", { attributes, data: { content: rich(...paragraphs) } })
const section = (attributes, ...columns) => createNode("section", { attributes, children: columns })
const column = (attributes, ...children) => createNode("column", { attributes, children })

// An order's note, with a block of most kinds
function starter() {
  const doc = createDocument("note")
  doc.data.title = "Order {{ order.number }}"
  doc.children = [
    section({ padding: "0px 0px 8px" }, column({}, textNode({ "font-size": "20px", "font-weight": "700" }, paragraph(text("ACME STORE"))))),
    textNode({ "font-size": "24px", "font-weight": "700" }, paragraph(text("Thanks for your order, {{ customer.first_name }}!"))),
    textNode({}, paragraph(text("We've received order "), text("{{ order.number }}", [{ type: "bold" }]), text(" and will let you know when it ships.")), paragraph(text("Here's what you ordered:"))),
    createNode("loop", { data: { variable: "line", collection: "order.lines" }, children: [textNode({}, paragraph(text("{{ line.quantity }} × {{ line.name }} — {{ line.total | money }}")))] }),
    createNode("divider"),
    createNode("button", { attributes: { href: "{{ order.url }}" }, data: { content: "View your order" } }),
    createNode("condition", {
      data: { expression: "customer.orders_count == 1" },
      children: [
        section(
          { padding: "16px 0px 0px" },
          column({ width: "50%" }, createNode("image", { attributes: { src: "https://placehold.co/600x400/dbeafe/1e3a8a.png?text=Welcome" } })),
          column({}, textNode({}, paragraph(text("Welcome!", [{ type: "bold" }])), paragraph(text("This is your first order. Here's 10% off the next one with code WELCOME10."))))
        )
      ]
    }),
    textNode({ "font-size": "12px", color: "#6b7280" }, paragraph(text("ACME Store · Main Street 1 · Amsterdam")), paragraph(text("Unsubscribe", [{ type: "link", attrs: { href: "{{ unsubscribe_url }}" } }])))
  ]
  return doc
}

// The Outline panel: the note's blocks counted, again on every change
function outlinePanel(element, editor) {
  const count = (node) => (node.children || []).reduce((sum, child) => sum + 1 + count(child), 0)
  const show = () => (element.textContent = `${count(editor.doc)} blocks`)
  show()
  editor.element.addEventListener("tess-edit:change", show)
}

registerKit({
  key: "note",
  name: "Note",
  root: "note",
  starter,
  previewTitle: "Preview the note",
  // A panel of its own: how many blocks the note has, kept up to date; the
  // canvas marks its body while it is open
  panels: [{ key: "outline", label: "Outline", render: outlinePanel }],
  canvas: async (doc, { editor, panel }) => {
    const errors = problems(doc)
    const html = errors.length ? null : toNoteHtml(doc, { editor })
    return { html: html && panel ? html.replace("<body", `<body data-panel="${panel}"`) : html, errors }
  },
  outputs: async (doc) => {
    const errors = problems(doc)
    return { outputs: { html: errors.length ? "" : toNoteHtml(doc) }, errors }
  },
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
  fields: [{ title: "Note", fields: [{ key: "data.title", label: "Title", type: "text", liquid: true }, { key: "data.color", label: "Color", type: "color" }] }],
  inline: [{ key: "data.title", plain: true }],
  render: { note: blocks.note }
})

for (const type of ["section", "column", "text", "image", "button", "divider", "spacer", "raw", "loop", "condition", "assign", "content", "table", "table_row", "table_cell"]) {
  extendBlock(type, { kits: ["note"], render: { note: blocks[type] } })
}

// One to five stars, as buttons
registerFieldType("stars", (node, field, value, set) => {
  const element = document.createElement("div")
  const show = (stars) =>
    element.querySelectorAll("button").forEach((button, index) => {
      button.textContent = index < stars ? "★" : "☆"
      button.setAttribute("aria-pressed", String(index + 1 === stars))
    })
  for (let stars = 1; stars <= 5; stars++) {
    const button = Object.assign(document.createElement("button"), { type: "button", title: `${stars} stars`, className: "px-0.5 text-lg text-amber-500" })
    button.addEventListener("click", () => {
      set(stars)
      show(stars)
    })
    element.append(button)
  }
  show(value || 0)
  return element
})

registerBlock({
  type: "card",
  name: "Card",
  icon: "text",
  category: "content",
  kits: ["note"],
  roles: ["content"],
  defaults: () => ({ data: { title: "A card", stars: 3, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Its text" }] }] } } }),
  fields: [{ title: "Card", fields: [{ key: "data.title", label: "Title", type: "text" }, { key: "data.stars", label: "Stars", type: "stars" }] }],
  inline: [{ key: "data.title", plain: true }, { key: "data.body" }],
  label: (node) => `Card · ${node.data.title}`,
  render: { note: blocks.card }
})
