import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { createFromPalette } from "tess_edit/core/document"
import { registerBlock } from "tess_edit/core/registry"
import { canEditField, canFill, isFree, parseLock } from "tess_edit/core/lock"

registerBlock({ type: "content", name: "Content", roles: ["body", "content"], accepts: "inherit", render: { mjml: (node, { children }) => children(node).join("\n") } })

// A layout: a header section, the content block holding a section, and a footer.
function layout() {
  const doc = createDocument()
  const header = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const content = insert(doc, doc.id, 1, createNode("content"))
  const body = insert(doc, content.id, 0, createFromPalette("section-1"))
  const text = insert(doc, body.children[0].id, 0, createFromPalette("text"))
  return { doc, header, content, body, text }
}

const lock = parseLock('{"except": ["content"], "fields": ["data.subject"]}')

test("without a lock everything can change", () => {
  const { doc, header } = layout()
  assert.equal(parseLock(""), null)
  assert.ok(isFree(doc, null, header.id))
  assert.ok(canFill(doc, null, header.id))
  assert.ok(canEditField(doc, null, doc.id, "attributes.width"))
})

test("only what is inside the excepted blocks is free", () => {
  const { doc, header, content, body, text } = layout()
  assert.ok(!isFree(doc, lock, header.id))
  assert.ok(!isFree(doc, lock, header.children[0].id))
  assert.ok(!isFree(doc, lock, content.id), "the content block itself stays put")
  assert.ok(isFree(doc, lock, body.id))
  assert.ok(isFree(doc, lock, text.id))
})

test("blocks can only be added inside the excepted blocks", () => {
  const { doc, header, content, body } = layout()
  assert.ok(!canFill(doc, lock, doc.id))
  assert.ok(!canFill(doc, lock, header.children[0].id))
  assert.ok(canFill(doc, lock, content.id))
  assert.ok(canFill(doc, lock, body.children[0].id))
})

test("of the root only the listed fields can change", () => {
  const { doc, header, text } = layout()
  assert.ok(canEditField(doc, lock, doc.id, "data.subject"))
  assert.ok(!canEditField(doc, lock, doc.id, "attributes.width"))
  assert.ok(!canEditField(doc, lock, header.id, "data.subject"))
  assert.ok(canEditField(doc, lock, text.id, "attributes.padding"))
})
