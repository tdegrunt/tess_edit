// Kits: what the editor makes. Besides the email, a host app registers its
// own; the demo app's Note kit (test/dummy/app/javascript/kits/note.js) is
// one, bringing TessEdit's blocks in with extendBlock.

import { test } from "node:test"
import assert from "node:assert/strict"
import { accepted, contentNode, createDocument, createFromPalette, createNode, duplicate, insert, misfit, normalize, renumber, withContent } from "tess_edit/core/document"
import { extendBlock, getBlock, getKit, kitOf, paletteItems, paletteSources, registerBlock, registerKit, registerPaletteSource } from "tess_edit/core/registry"
import { starterDocument } from "tess_edit/core/starter"
import { toMjml } from "tess_edit/export/mjml"
import { toNoteHtml } from "../dummy/app/javascript/kits/note.js"

test("documents belong to the kit of their root block", () => {
  assert.equal(kitOf(createDocument()).key, "email")
  assert.equal(kitOf(createDocument("note")).key, "note")
  assert.equal(createDocument("note").type, "note")
  assert.throws(() => createDocument("fax"), /Unknown kit/)
})

test("a kit only offers its own blocks", () => {
  const email = paletteItems("email").map((item) => item.type)
  const note = paletteItems("note").map((item) => item.type)
  for (const type of ["text", "image", "divider", "loop", "condition", "content"]) assert.ok(email.includes(type) && note.includes(type), type)
  for (const type of ["section", "hero", "button", "social"]) assert.ok(email.includes(type) && !note.includes(type), type)
  const doc = createDocument("note")
  assert.deepEqual(accepted(doc, doc.id).sort(), ["condition", "content", "divider", "image", "loop", "text"])
})

test("extendBlock adds a kit, render hooks and fields to a block, and keeps the rest", () => {
  const text = getBlock("text")
  assert.deepEqual(text.kits, ["email", "note"])
  assert.equal(typeof text.render.mjml, "function")
  assert.equal(typeof text.render.note, "function")
  assert.equal(text.richText, "data.content")

  registerBlock({ type: "stamp", name: "Stamp", roles: ["content"], fields: [{ title: "Stamp", fields: [] }], render: { mjml: () => "<mj-text>stamp</mj-text>" } })
  extendBlock("stamp", { kits: ["note", "note"], render: { note: () => "<b>stamp</b>" }, fields: [{ title: "On a note", fields: [] }] })
  const stamp = getBlock("stamp")
  assert.deepEqual(stamp.kits, ["email", "note"])
  assert.deepEqual(stamp.fields.map((group) => group.title), ["Stamp", "On a note"])
  assert.equal(stamp.render.mjml(), "<mj-text>stamp</mj-text>")
  assert.throws(() => extendBlock("nothing", {}), /No block nothing/)
})

test("extendBlock adds fields to a group with the same title, and puts a new group before another", () => {
  registerBlock({ type: "badge", name: "Badge", roles: ["content"], fields: [{ title: "Badge", fields: [{ key: "data.a" }] }, { title: "Style", fields: [] }], render: { mjml: () => "" } })
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
  assert.match(html, /<h1 style="margin:0 0 12px">A note<\/h1>/)
  assert.match(html, /<p style="margin:0">Hello \{\{ name \}\}<\/p>/)
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
  assert.throws(() => normalize(note, { kit: "email" }), /for the Note editor, not the Email one/)
  assert.throws(() => normalize(JSON.stringify(starterDocument()), { kit: "note" }), /for the Email editor/)
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
  assert.equal(getKit("label").errors, "The Label could not be rendered")
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
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const column = section.children[0].id
  assert.equal(misfit(createNode("text"), accepted(doc, column)), null)
  assert.equal(misfit(createFromPalette("section-1"), accepted(doc, column)), "section")
  const loop = createNode("loop", { children: [createFromPalette("section-1")] })
  assert.equal(misfit(loop, accepted(doc, column)), "section")
  assert.equal(misfit(loop, accepted(doc, doc.id)), null)
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
  const layout = createDocument()
  const section = insert(layout, layout.id, 0, createFromPalette("section-1"))
  insert(layout, layout.id, 1, createNode("content", { children: [createFromPalette("section-1")] }))
  const own = [createFromPalette("section-2")]
  const doc = withContent(layout, own)
  assert.deepEqual(contentNode(doc).children, own)
  assert.equal(contentNode(layout).children[0].children.length, 1, "the layout stays as it is")
  assert.equal(doc.children[0].id, section.id)
  assert.match(toMjml(doc), /<mj-raw><!-- tess-edit:content --><\/mj-raw>\n\s*<mj-section/)
  assert.throws(() => withContent(createDocument(), own), /no Content block/)
})
