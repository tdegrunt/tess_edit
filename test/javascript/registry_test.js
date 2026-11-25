import { test } from "node:test"
import assert from "node:assert/strict"
import { accepted, createDocument, createFromPalette, insert, itemType, normalize } from "tess_edit/core/document"
import { categories, extendBlock, fieldType, getBlock, getKit, inlinePart, inlineParts, isContainer, kitOf, paletteItems, registerBlock, registerCategory, registerFieldType, registerKit } from "tess_edit/core/registry"
import { renderPage } from "./page_kit.js"

registerCategory({ key: "shop", label: "Shop", order: 40 })
registerBlock({
  type: "product",
  name: "Product",
  icon: '<rect x="4" y="4" width="16" height="16"/>',
  category: "shop",
  roles: ["content"],
  defaults: () => ({ attributes: { padding: "10px 25px" }, data: { sku: "ABC-1", title: "A product" } }),
  fields: [{ title: "Product", fields: [{ key: "data.sku", label: "SKU", type: "text" }] }],
  label: (node) => `Product · ${node.data.sku}`,
  kits: ["page"],
  render: {
    page: (node, { editor } = {}) => `<p${editor ? ` class="tess-${node.id}"` : ""}><strong>${node.data.title}</strong> {{ products['${node.data.sku}'].price | money }}</p>`
  }
})

test("a registered block gets a palette tile in its category", () => {
  assert.ok(categories().some((category) => category.key === "shop"))
  const tile = paletteItems().find((item) => item.key === "product")
  assert.equal(tile.category, "shop")
  assert.equal(tile.type, "product")
  assert.equal(itemType("product"), "product")
  assert.equal(isContainer("product"), false)
  assert.equal(getBlock("product").name, "Product")
})

test("its roles decide where it may go, including inside Liquid blocks", () => {
  const doc = createDocument("page")
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const column = section.children[0]
  const loop = insert(doc, column.id, 0, createFromPalette("loop"))
  assert.ok(accepted(doc, column.id).includes("product"))
  assert.ok(accepted(doc, loop.id).includes("product"))
  assert.ok(!accepted(doc, doc.id).includes("product"))
  assert.ok(!accepted(doc, section.id).includes("product"))
})

test("it renders through its own hook, in the editor and on export", async () => {
  const doc = createDocument("page")
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const product = insert(doc, section.children[0].id, 0, createFromPalette("product"))
  const hook = getBlock("product").render.page
  assert.equal(hook(product), "<p><strong>A product</strong> {{ products['ABC-1'].price | money }}</p>")
  assert.equal(hook(product, { editor: true }), `<p class="tess-${product.id}"><strong>A product</strong> {{ products['ABC-1'].price | money }}</p>`)
  assert.match((await getKit("page").outputs(doc)).outputs.html, /<column><product><\/product><\/column>/)
  assert.equal(normalize(JSON.stringify(doc)).children[0].children[0].children[0].type, "product")
})

test("registerBlock checks the definition", () => {
  assert.throws(() => registerBlock({ type: "x", name: "X", roles: ["content"], kits: ["page"] }), /render hook for its kits, e\.g\. render\.page/)
  assert.throws(() => registerBlock({ type: "x", name: "X", kits: ["page"], render: { page: () => "" } }), /roles/)
  assert.throws(() => registerBlock({ name: "X" }), /type/)
})

test("a block's inline parts, with richText as the shorthand of one", () => {
  registerBlock({ type: "question", name: "Question", roles: ["content"], inline: [{ key: "data.label", plain: true }, { key: "data.description" }] })
  assert.deepEqual(inlineParts("question").map((part) => part.key), ["data.label", "data.description"])
  assert.equal(inlinePart("question", "data.label").plain, true)
  assert.deepEqual(inlineParts("text"), [{ key: "data.content" }])
  assert.deepEqual(inlineParts("divider"), [])
  assert.throws(() => registerBlock({ type: "x", name: "X", roles: ["content"], inline: [{ plain: true }] }), /key/)
})

test("an inline part of each item of a list, with a * in its key", () => {
  registerBlock({ type: "choice", name: "Choice", roles: ["content"], inline: [{ key: "data.label", plain: true }, { key: "data.options.*.label", plain: true }] })
  assert.deepEqual(inlinePart("choice", "data.options.12.label"), { key: "data.options.12.label", plain: true })
  assert.equal(inlinePart("choice", "data.options.x.label"), undefined)
  assert.equal(inlinePart("choice", "data.options.1.value"), undefined)
  assert.equal(inlinePart("choice", "data.label").key, "data.label")
})

test("a host registers a field type of its own, not one of TessEdit's", () => {
  const render = (node, field, value) => ({ value })
  registerFieldType("rules", render)
  assert.equal(fieldType("rules"), render)
  assert.equal(fieldType("text"), undefined)
  assert.throws(() => registerFieldType("text", render), /TessEdit's own/)
  assert.throws(() => registerFieldType("rules"), /render/)
  assert.throws(() => registerFieldType("", render), /name/)
})

test("a block is part of no kit until a kit takes it in, and needs no render hook till then", () => {
  const badge = registerBlock({ type: "badge", name: "Badge", roles: ["content"], category: "content" })
  assert.deepEqual(badge.kits, [])
  assert.deepEqual(badge.render, {})
  assert.ok(paletteItems().some((item) => item.key === "badge"))
  assert.ok(!paletteItems("page").some((item) => item.key === "badge"))
  for (const type of ["section", "column", "content", "text", "image", "button", "divider", "spacer", "raw", "loop", "condition", "assign", "table", "table_row", "table_cell"]) {
    assert.deepEqual(getBlock(type).kits, ["page"], type)
  }

  extendBlock("badge", { kits: ["page"], render: { page: renderPage } })
  assert.ok(paletteItems("page").some((item) => item.key === "badge"))
})

test("a kit orders its tiles by its palette, the others after them in registration order", () => {
  registerKit({ key: "poster", name: "Poster", root: "poster", palette: ["divider", "heading", "text"], canvas: async () => ({ html: "", errors: [] }), outputs: async () => ({ outputs: {}, errors: [] }) })
  registerBlock({ type: "poster", name: "Poster", kits: ["poster"], accepts: ["content"], render: { poster: () => "" } })
  for (const type of ["text", "image", "button", "divider"]) extendBlock(type, { kits: ["poster"], render: { poster: () => "" } })
  assert.deepEqual(paletteItems("poster").map((item) => item.key), ["divider", "heading", "text", "image", "button"])
  // Without a palette, registration order
  assert.deepEqual(paletteItems("page").map((item) => item.key).slice(0, 3), ["section-1", "section-2", "section-3"])
})

test("a kit's aliases are its root's earlier types: a document with one is the kit's", () => {
  assert.equal(kitOf({ type: "sheet" }).key, "page")
  assert.equal(kitOf({ type: "page" }).key, "page")
  assert.equal(kitOf({ type: "email" }), undefined)
  assert.deepEqual(getKit("poster").aliases, [])
  assert.equal(normalize({ type: "sheet", children: [] }).type, "page")
})
