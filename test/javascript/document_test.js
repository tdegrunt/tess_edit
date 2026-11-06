import { test } from "node:test"
import assert from "node:assert/strict"
import { accepted, canInsert, createDocument, createNode, duplicate, find, insert, move, normalize, remove, setValue } from "tess_edit/core/document"
import { createFromPalette } from "tess_edit/core/document"
import { History } from "tess_edit/core/history"

function sample() {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-2"))
  const [left, right] = section.children
  const text = insert(doc, left.id, 0, createNode("text"))
  const button = insert(doc, left.id, 1, createNode("button"))
  return { doc, section, left, right, text, button }
}

test("what each container accepts", () => {
  const { doc, section, left } = sample()
  assert.ok(canInsert(doc, doc.id, "section"))
  assert.ok(!canInsert(doc, doc.id, "text"))
  assert.deepEqual(accepted(doc, section.id), ["column"])
  assert.ok(canInsert(doc, left.id, "text"))
  assert.ok(!canInsert(doc, left.id, "section"))
})

test("loops and conditions accept what their context accepts, never columns", () => {
  const { doc, left } = sample()
  const loop = insert(doc, left.id, 0, createNode("loop"))
  assert.ok(canInsert(doc, loop.id, "text"))
  assert.ok(!canInsert(doc, loop.id, "section"))

  const condition = insert(doc, doc.id, 0, createNode("condition"))
  assert.ok(canInsert(doc, condition.id, "section"))
  assert.ok(!canInsert(doc, condition.id, "text"))
  assert.ok(!canInsert(doc, condition.id, "column"))
})

test("move within a parent counts the index before the move", () => {
  const { doc, left, text, button } = sample()
  assert.ok(move(doc, text.id, left.id, 2))
  assert.deepEqual(left.children.map((n) => n.id), [button.id, text.id])
})

test("move to another parent, but never into itself", () => {
  const { doc, section, left, right, text } = sample()
  assert.ok(move(doc, text.id, right.id, 0))
  assert.equal(find(doc, text.id).parent.id, right.id)
  assert.equal(move(doc, section.id, left.id, 0), false)
})

test("duplicate gives every copied node a new id", () => {
  const { doc, section } = sample()
  const copy = duplicate(doc, section.id)
  assert.equal(doc.children.length, 2)
  assert.notEqual(copy.id, section.id)
  assert.notEqual(copy.children[0].id, section.children[0].id)
})

test("remove and setValue", () => {
  const { doc, left, text } = sample()
  setValue(doc, text.id, "attributes.color", "#ff0000")
  assert.equal(text.attributes.color, "#ff0000")
  setValue(doc, text.id, "attributes.color", "")
  assert.ok(!("color" in text.attributes))
  remove(doc, text.id)
  assert.equal(left.children.length, 1)
})

test("normalize accepts JSON and rejects unknown blocks", () => {
  const { doc } = sample()
  assert.deepEqual(normalize(JSON.stringify(doc)), doc)
  assert.throws(() => normalize({ type: "page", children: [{ type: "carousel" }] }), /Unknown block type/)
  assert.throws(() => normalize({ type: "section" }), /root must be a page/)
})

test("history coalesces changes with the same key", () => {
  const history = new History()
  history.record("a", "field")
  history.record("b", "field")
  history.record("c", "other")
  assert.equal(history.undo("d"), "c")
  assert.equal(history.undo("c"), "a")
  assert.equal(history.undo("a"), null)
  assert.equal(history.redo("a"), "c")
})
