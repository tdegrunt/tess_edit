// Kits: what the editor makes. TessEdit has none of its own: a host app
// registers one, as the demo app's Note kit (test/dummy/app/javascript/kits/note.js)
// is, bringing TessEdit's blocks in with extendBlock.

import { test } from "node:test"
import assert from "node:assert/strict"
import { t } from "tess_edit/core/i18n"
import { accepted, contentNode, createDocument, createFromPalette, createNode, duplicate, insert, misfit, normalize, renumber, withContent } from "tess_edit/core/document"
import { extendBlock, getBlock, getKit, kitOf, paletteItems, paletteSources, registerBlock, registerKit, registerPaletteSource } from "tess_edit/core/registry"
import { toNoteHtml, unclosedTags } from "../dummy/app/javascript/kits/note.js"
import "../dummy/app/javascript/kits/memo.js"

const paragraph = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

test("documents belong to the kit of their root block", () => {
  assert.equal(kitOf(createDocument("note")).key, "note")
  assert.equal(kitOf(createDocument("memo")).key, "memo")
  assert.equal(kitOf({ type: "email" }), undefined)
  assert.throws(() => createDocument(), /Unknown kit/)
  assert.equal(createDocument("note").type, "note")
  assert.throws(() => createDocument("fax"), /Unknown kit/)
})

test("a kit only offers its own blocks", () => {
  const note = paletteItems("note").map((item) => item.type)
  for (const type of ["section", "column", "text", "image", "button", "divider", "spacer", "raw", "loop", "condition", "content", "table", "card"]) assert.ok(note.includes(type), type)
  assert.deepEqual(paletteItems("memo"), [])
  registerBlock({ type: "sticker", name: "Sticker", category: "content", roles: ["content"] })
  assert.ok(!paletteItems("note").some((item) => item.type === "sticker"), "a block of no kit")
  const doc = createDocument("note")
  assert.deepEqual(accepted(doc, doc.id).sort(), ["assign", "button", "card", "condition", "content", "divider", "image", "loop", "raw", "section", "spacer", "table", "text"])
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  assert.deepEqual(accepted(doc, section.id), ["column"])
})

test("extendBlock adds a kit, render hooks and fields to a block, and keeps the rest", () => {
  const text = getBlock("text")
  assert.deepEqual(text.kits, ["note"])
  assert.deepEqual(Object.keys(text.render), ["note"])
  assert.equal(text.richText, "data.content")

  registerBlock({ type: "stamp", name: "Stamp", roles: ["content"], kits: ["memo"], fields: [{ title: "Stamp", fields: [] }], render: { memo: () => "stamp" } })
  extendBlock("stamp", { kits: ["note", "note"], render: { note: () => "<b>stamp</b>" }, fields: [{ title: "On a note", fields: [] }] })
  const stamp = getBlock("stamp")
  assert.deepEqual(stamp.kits, ["memo", "note"])
  assert.deepEqual(stamp.fields.map((group) => group.title), ["Stamp", "On a note"])
  assert.equal(stamp.render.memo(), "stamp")
  assert.throws(() => extendBlock("nothing", {}), /No block nothing/)
})

test("extendBlock adds fields to a group with the same title, and puts a new group before another", () => {
  registerBlock({ type: "badge", name: "Badge", roles: ["content"], fields: [{ title: "Badge", fields: [{ key: "data.a" }] }, { title: "Style", fields: [] }] })
  extendBlock("badge", { fields: [{ title: "Badge", fields: [{ key: "data.b" }] }, { title: "When", before: "Badge", fields: [{ key: "data.c" }] }] })
  const badge = getBlock("badge")
  assert.deepEqual(badge.fields.map((group) => group.title), ["When", "Badge", "Style"])
  assert.deepEqual(badge.fields[1].fields.map((field) => field.key), ["data.a", "data.b"])
  assert.equal("before" in badge.fields[0], false)
})

test("a kit's output comes from the hooks it added", async () => {
  const doc = getKit("note").starter()
  doc.children.push(createNode("condition", { data: { expression: "vip" }, children: [createNode("divider")] }))
  const html = (await getKit("note").outputs(doc)).outputs.html
  assert.match(html, /<h1 style="margin:0 0 12px">Order \{\{ order\.number \}\}<\/h1>/)
  assert.match(html, /<p style="margin:0">Here's what you ordered:<\/p>/)
  assert.match(html, /<a href="\{\{ order\.url \}\}" style="[^"]*">View your order<\/a>/)
  assert.match(html, /\{% for line in order\.lines %\}/)
  assert.match(html, /\{% if vip %\}\n<div style="padding:8px 0"><hr><\/div>\n\{% endif %\}/)
  assert.doesNotMatch(html, /tess-b/)

  const canvas = (await getKit("note").canvas(doc, { editor: true })).html
  assert.match(canvas, new RegExp(`<body class="tess-${doc.id}"`))
  assert.doesNotMatch(canvas, /\{% if/)
  assert.match(toNoteHtml(createDocument("note"), { editor: true }), /class="tessph-b/)
})

test("normalize checks the kit when given one", () => {
  const note = JSON.stringify(getKit("note").starter())
  assert.equal(normalize(note, { kit: "note" }).type, "note")
  assert.throws(() => normalize(note, { kit: "memo" }), /for the Note editor, not the Memo one/)
  assert.throws(() => normalize(note, { kit: "fax" }), /for the Note editor, not the fax one/)
  assert.throws(() => normalize(JSON.stringify(getKit("memo").starter()), { kit: "note" }), /for the Memo editor/)
})

test("a host can register its own kit and blocks for it", async () => {
  registerKit({
    key: "label",
    name: "Label",
    root: "label",
    starter: () => createDocument("label"),
    canvas: async (doc) => ({ html: getBlock(doc.type).render.label(doc), errors: [] }),
    outputs: async (doc) => ({ outputs: { html: getBlock(doc.type).render.label(doc) }, errors: [] })
  })
  registerBlock({ type: "label", name: "Label", kits: ["label"], accepts: ["content"], render: { label: (node) => `<main>${node.children.map((child) => getBlock(child.type).render.label(child)).join("")}</main>` } })
  registerBlock({ type: "barcode", name: "Barcode", kits: ["label"], roles: ["content"], category: "content", render: { label: () => "<svg></svg>" } })
  assert.equal(t(getKit("label").errors, { name: "Label" }), "The Label could not be rendered")
  const doc = createDocument("label")
  assert.deepEqual(accepted(doc, doc.id), ["barcode"])
  insert(doc, doc.id, 0, createFromPalette("barcode"))
  assert.equal((await getKit("label").outputs(doc)).outputs.html, "<main><svg></svg></main>")
  assert.throws(() => registerKit({ key: "x", name: "X", root: "x" }), /canvas/)
})

test("a copy can know the block it is a copy of", () => {
  const section = createFromPalette("section-1")
  const copy = renumber(section, { origin: true })
  assert.equal(copy.origin, section.id)
  assert.equal(copy.children[0].origin, section.children[0].id)
  assert.notEqual(copy.id, section.id)
  assert.equal(renumber(copy).origin, undefined, "a plain copy is new content")
})

test("a node fits where its type goes, and an inheriting container where its children go", () => {
  const doc = createDocument("note")
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const column = section.children[0].id
  assert.equal(misfit(createNode("text"), accepted(doc, column)), null)
  assert.equal(misfit(createFromPalette("section-1"), accepted(doc, column)), "section")
  const loop = createNode("loop", { children: [createFromPalette("section-1")] })
  assert.equal(misfit(loop, accepted(doc, column)), "section")
  assert.equal(misfit(loop, accepted(doc, doc.id)), null)
  assert.equal(misfit(createNode("column"), accepted(doc, doc.id)), "column")
})

test("a palette source needs its items and what a tile creates", () => {
  registerPaletteSource({ key: "stamps", label: "Stamps", items: async () => [{ key: "a", label: "A", type: "text" }], create: async () => createNode("text") })
  assert.ok(paletteSources().some((source) => source.key === "stamps"))
  assert.throws(() => registerPaletteSource({ key: "x", label: "X", items: async () => [] }), /create/)
  assert.throws(() => registerPaletteSource({ label: "X" }), /key and a label/)
})

test("duplicating a copied block makes new content, without an origin", () => {
  const doc = createDocument("note")
  const text = insert(doc, doc.id, 0, { ...createNode("text"), origin: "bsource" })
  const copy = duplicate(doc, text.id)
  assert.equal(copy.origin, undefined)
  assert.equal(text.origin, "bsource")
})

test("a unique block, such as Content, can be added once and still be moved", () => {
  registerBlock({ type: "seal", name: "Seal", roles: ["content"], kits: ["note"], unique: true, render: { note: () => "" } })
  const doc = createDocument("note")
  for (const type of ["content", "seal"]) {
    assert.ok(accepted(doc, doc.id).includes(type), type)
    insert(doc, doc.id, 0, createNode(type))
    assert.ok(!accepted(doc, doc.id).includes(type), type)
    assert.ok(accepted(doc, doc.id, { moving: true }).includes(type), type)
  }
})

test("a layout takes a document's own blocks in its Content block", () => {
  const layout = createDocument("note")
  const section = insert(layout, layout.id, 0, createFromPalette("section-1"))
  insert(layout, layout.id, 1, createNode("content", { children: [createFromPalette("section-1")] }))
  const own = [createFromPalette("section-2")]
  const doc = withContent(layout, own)
  assert.deepEqual(contentNode(doc).children, own)
  assert.equal(contentNode(layout).children[0].children.length, 1, "the layout stays as it is")
  assert.equal(doc.children[0].id, section.id)
  assert.match(toNoteHtml(doc), /<!-- tess-edit:content -->\n<div style="display:flex/)
  assert.doesNotMatch(toNoteHtml(doc, { editor: true }), /tess-edit:content/)
  assert.throws(() => withContent(createDocument("note"), own), /no Content block/)
})

test("a block marks its inline parts in the editor only", () => {
  const doc = createDocument("note")
  const card = insert(doc, doc.id, 0, createFromPalette("card"))
  const editor = toNoteHtml(doc, { editor: true })
  assert.match(editor, new RegExp(`<div class="tess-${card.id}"[^>]*><strong data-tess-edit-field="data.title">A card</strong>`))
  assert.match(editor, /<div data-tess-edit-field="data.body"><p[^>]*>Its text<\/p><\/div>/)
  assert.doesNotMatch(toNoteHtml(doc), /data-tess-edit-field/)
})

test("the note's canvas says when an HTML block's HTML has a tag that isn't closed, and keeps the last canvas", async () => {
  assert.deepEqual(unclosedTags("<div><p>Hi<br></p><img src=x></div>"), [])
  assert.deepEqual(unclosedTags("<div>not closed"), ["div"])
  const doc = createDocument("note")
  insert(doc, doc.id, 0, createNode("raw", { data: { html: "<section><b>Bold</b>" } }))
  const canvas = await getKit("note").canvas(doc, { editor: true })
  assert.equal(canvas.html, null)
  assert.deepEqual(canvas.errors, ["<section> isn't closed in an HTML block"])
  const { outputs, errors } = await getKit("note").outputs(doc)
  assert.equal(outputs.html, "")
  assert.equal(errors.length, 1)

  doc.children[0].data.html = "<p>Closed</p>"
  assert.match((await getKit("note").outputs(doc)).outputs.html, /<\/h1>\n<p>Closed<\/p>/)
  assert.match((await getKit("note").canvas(doc, { editor: true })).html, new RegExp(`<div class="tess-${doc.children[0].id}"><p>Closed</p></div>`))
})

test("TessEdit's shared blocks render through the note's hooks: sections and columns, buttons and spacers", () => {
  const doc = createDocument("note")
  const section = insert(doc, doc.id, 0, createFromPalette("section-2"))
  section.attributes["background-url"] = "https://example.com/a.png"
  insert(doc, section.children[0].id, 0, createNode("button", { attributes: { href: "{{ order.url }}" }, data: { content: "Go" } }))
  insert(doc, section.children[1].id, 0, createNode("spacer", { attributes: { height: "12px" } }))
  const html = toNoteHtml(doc)
  assert.match(html, /<div style="display:flex;gap:12px;padding:20px 0px;background-image:url\('https:\/\/example\.com\/a\.png'\);background-size:cover"><div style="flex:0 0 50%;min-width:0">/)
  assert.match(html, /<a href="\{\{ order\.url \}\}" style="display:inline-block;[^"]*">Go<\/a>/)
  assert.match(html, /<div style="height:12px"><\/div>/)
})

test("a block of the note's own in a table cell goes through its cellBlock", () => {
  const doc = createDocument("note")
  const table = insert(doc, doc.id, 0, createFromPalette("table"))
  const cell = table.children[1].children[0]
  insert(doc, cell.id, 0, createFromPalette("card"))
  insert(doc, cell.id, 1, createNode("button", { data: { content: "Buy" } }))
  const html = toNoteHtml(doc)
  assert.match(html, /<td[^>]*><div style="margin:8px 0;[^"]*"><strong>A card<\/strong>/)
  assert.match(html, /<div style="padding:10px 25px"><a href="#" style="display:inline-block;[^"]*">Buy<\/a><\/div>/, "TessEdit's own button, rendered by the table")
})
