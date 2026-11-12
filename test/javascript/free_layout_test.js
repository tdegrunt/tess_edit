import { test } from "node:test"
import assert from "node:assert/strict"
import { createNode, insert } from "tess_edit/core/document"
import { registerBlock, registerKit } from "tess_edit/core/registry"
import { freeChild, isFreeLayout, number, onGrid, resizeOf, sizeOf, snap } from "tess_edit/ui/free_layout"

registerKit({ key: "sticker", name: "Sticker", root: "sticker", starter: () => createNode("sticker"), canvas: async () => ({ html: "" }), outputs: async () => ({ outputs: {} }) })
const render = { html: () => "" }
registerBlock({ type: "sticker", name: "Sticker", kits: ["sticker"], accepts: ["spot"], layout: "free", render })
registerBlock({ type: "group", name: "Group", kits: ["sticker"], roles: ["spot"], accepts: ["dot"], render })
registerBlock({ type: "band", name: "Band", kits: ["sticker"], roles: ["spot"], accepts: ["dot"], layout: "free", resizeChildren: { width: "data.width" }, render })
registerBlock({ type: "dot", name: "Dot", kits: ["sticker"], roles: ["spot", "dot"], resize: { width: "data.size", height: "data.size" }, render })
registerBlock({ type: "strip", name: "Strip", kits: ["sticker"], roles: ["spot"], accepts: ["dot", "spot"], layout: "free", resizeChildren: (node) => (node.type === "group" ? { width: "attributes.width", unit: "mm" } : { width: "data.width" }), render })

function sticker() {
  const doc = createNode("sticker")
  const dot = insert(doc, doc.id, 0, createNode("dot", { data: { x: 10, y: 20 } }))
  const group = insert(doc, doc.id, 1, createNode("group"))
  const inner = insert(doc, group.id, 0, createNode("dot"))
  return { doc, dot, group, inner }
}

test("a free layout is the container's, by its definition", () => {
  const { doc, group } = sticker()
  assert.ok(isFreeLayout(doc))
  assert.ok(!isFreeLayout(group))
})

test("the block that moves is the free container's child holding the node", () => {
  const { doc, dot, group, inner } = sticker()
  assert.equal(freeChild(doc, dot.id).node.id, dot.id)
  assert.equal(freeChild(doc, inner.id).node.id, group.id)
  assert.equal(freeChild(doc, doc.id), null)
})

test("edges snap to the nearest candidate within a few pixels", () => {
  assert.deepEqual(snap([100, 150], [103, 200]), { offset: 3, at: 103 })
  assert.deepEqual(snap([100, 150], [148, 110]), { offset: -2, at: 148 })
  assert.equal(snap([100], [120]), null)
})

test("positions typed as text are numbers", () => {
  assert.equal(number("12"), 12)
  assert.equal(number(""), 0)
  assert.equal(number(undefined), 0)
})

test("positions snap to the nearest point on the grid, or stay without one", () => {
  assert.equal(onGrid(12, 5), 10)
  assert.equal(onGrid(13, 5), 15)
  assert.equal(onGrid(-3, 5), -5)
  assert.equal(onGrid(13, 0), 13)
})

test("a block resizes by its own keys, or its free container's for all of its children", () => {
  const { doc, dot } = sticker()
  const band = insert(doc, doc.id, 2, createNode("band"))
  const inBand = insert(doc, band.id, 0, createNode("dot"))
  const plain = insert(doc, band.id, 1, createNode("group"))
  assert.deepEqual(resizeOf(freeChild(doc, dot.id)), { width: "data.size", height: "data.size" })
  assert.deepEqual(resizeOf(freeChild(doc, plain.id)), { width: "data.width" })
  assert.deepEqual(resizeOf(freeChild(doc, inBand.id)), { width: "data.size", height: "data.size" })
})

test("a free container can size each child by its type", () => {
  const { doc } = sticker()
  const strip = insert(doc, doc.id, 2, createNode("strip"))
  const group = insert(doc, strip.id, 0, createNode("group"))
  const dot = insert(doc, strip.id, 1, createNode("dot"))
  assert.deepEqual(resizeOf(freeChild(doc, group.id)), { width: "attributes.width", unit: "mm" })
  assert.deepEqual(resizeOf(freeChild(doc, dot.id)), { width: "data.size", height: "data.size" })
})

test("a size in a unit reads as its number, and as not set in another unit", () => {
  assert.equal(sizeOf("52mm", "mm"), 52)
  assert.equal(sizeOf(" 52.5 mm", "mm"), 52.5)
  assert.equal(sizeOf("200px", "mm"), 0)
  assert.equal(sizeOf("100%", "mm"), 0)
  assert.equal(sizeOf(undefined, "mm"), 0)
  assert.equal(sizeOf("12"), 12)
  assert.equal(sizeOf(12), 12)
})
