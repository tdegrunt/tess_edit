import { test } from "node:test"
import assert from "node:assert/strict"
import { createNode, insert } from "tess_edit/core/document"
import { registerBlock, registerKit } from "tess_edit/core/registry"
import { freeChild, isFreeLayout, number, snap } from "tess_edit/ui/free_layout"

registerKit({ key: "sticker", name: "Sticker", root: "sticker", starter: () => createNode("sticker"), canvas: async () => ({ html: "" }), outputs: async () => ({ outputs: {} }) })
const render = { html: () => "" }
registerBlock({ type: "sticker", name: "Sticker", kits: ["sticker"], accepts: ["spot"], layout: "free", render })
registerBlock({ type: "group", name: "Group", kits: ["sticker"], roles: ["spot"], accepts: ["dot"], render })
registerBlock({ type: "dot", name: "Dot", kits: ["sticker"], roles: ["spot", "dot"], resize: { width: "data.size", height: "data.size" }, render })

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
