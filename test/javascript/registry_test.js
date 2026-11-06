import { test } from "node:test"
import assert from "node:assert/strict"
import { accepted, createDocument, createFromPalette, insert, itemType, normalize } from "tess_edit/core/document"
import { categories, getBlock, isContainer, paletteItems, registerBlock, registerCategory } from "tess_edit/core/registry"
import { toMjml } from "tess_edit/export/mjml"

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
  render: {
    mjml: (node, { element, escapeText }) => element("mj-text", node, `<strong>${escapeText(node.data.title)}</strong> {{ products['${node.data.sku}'].price | money }}`)
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
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const column = section.children[0]
  const loop = insert(doc, column.id, 0, createFromPalette("loop"))
  assert.ok(accepted(doc, column.id).includes("product"))
  assert.ok(accepted(doc, loop.id).includes("product"))
  assert.ok(!accepted(doc, doc.id).includes("product"))
  assert.ok(!accepted(doc, section.id).includes("product"))
})

test("it renders through its own hook, in the editor and on export", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const product = insert(doc, section.children[0].id, 0, createFromPalette("product"))
  const mjml = toMjml(doc)
  assert.match(mjml, /<mj-text padding="10px 25px"><strong>A product<\/strong> \{\{ products\['ABC-1'\]\.price \| money \}\}<\/mj-text>/)
  assert.match(toMjml(doc, { editor: true }), new RegExp(`css-class="tess-${product.id}"`))
  assert.equal(normalize(JSON.stringify(doc)).children[0].children[0].children[0].type, "product")
})

test("registerBlock checks the definition", () => {
  assert.throws(() => registerBlock({ type: "x", name: "X", roles: ["content"] }), /render\.mjml/)
  assert.throws(() => registerBlock({ type: "x", name: "X", render: { mjml: () => "" } }), /roles/)
  assert.throws(() => registerBlock({ name: "X" }), /type/)
})
