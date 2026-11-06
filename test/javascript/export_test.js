import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { createFromPalette } from "tess_edit/core/document"
import { starterDocument } from "tess_edit/core/starter"
import { escapeAttribute, escapeText, richTextToHtml } from "tess_edit/export/richtext"
import { toMjml } from "tess_edit/export/mjml"
import { formatSpacing, parseSpacing, withUnit } from "tess_edit/ui/inspector"

const paragraph = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

test("text escaping leaves Liquid alone", () => {
  assert.equal(escapeText('a < b & {{ "x" | upcase }} {% if a > b %}'), 'a &lt; b &amp; {{ "x" | upcase }} {% if a > b %}')
  assert.equal(escapeAttribute('{{ "x" }}"'), "{{ 'x' }}&quot;")
  assert.equal(escapeAttribute("a&amp;b"), "a&amp;b")
})

test("rich text to HTML", () => {
  const html = richTextToHtml({
    type: "doc",
    content: [
      { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Hi ", marks: [{ type: "bold" }] }, { type: "text", text: "there", marks: [{ type: "link", attrs: { href: "{{ url }}" } }, { type: "italic" }] }] },
      { type: "paragraph" },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] }
    ]
  })
  assert.match(html, /<p style="margin:0;text-align:center"><strong>Hi <\/strong><a href="\{\{ url \}\}" style="color:inherit;"><em>there<\/em><\/a><\/p>/)
  assert.match(html, /<p style="margin:0"><br><\/p>/)
  assert.match(html, /<ul[^>]*><li>one<\/li><\/ul>/)
})

test("loops and conditions become Liquid in mj-raw", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const loop = insert(doc, section.children[0].id, 0, createNode("loop", { data: { variable: "line", collection: "order.lines" } }))
  insert(doc, loop.id, 0, createNode("text", { data: { content: paragraph("{{ line.name }}") } }))
  const condition = insert(doc, doc.id, 1, createNode("condition", { data: { expression: "order.total > 100" } }))
  insert(doc, condition.id, 0, createFromPalette("section-1"))

  const mjml = toMjml(doc)
  assert.match(mjml, /<mj-raw>\{% for line in order\.lines %\}<\/mj-raw>/)
  assert.match(mjml, /<mj-raw>\{% if order\.total > 100 %\}<\/mj-raw>/)
  assert.doesNotMatch(mjml, /tess-/)
})

test("editor MJML marks blocks and shows placeholders, without Liquid tags", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-2"))
  const loop = insert(doc, doc.id, 1, createNode("loop"))
  const mjml = toMjml(doc, { editor: true })
  assert.match(mjml, new RegExp(`css-class="tess-${section.id}"`))
  assert.match(mjml, new RegExp(`css-class="tessph-${section.children[0].id}"`))
  assert.match(mjml, new RegExp(`css-class="tessph-${loop.id}"`))
  assert.doesNotMatch(mjml, /\{%/)
})

test("editor MJML keeps a block's own css-class after its marker", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  section.attributes["css-class"] = "outer"
  assert.match(toMjml(doc, { editor: true }), new RegExp(`css-class="tess-${section.id} outer"`))
  assert.match(toMjml(doc), /css-class="outer"/)
})

test("spacing and unit helpers", () => {
  assert.deepEqual(parseSpacing("10px 25px"), ["10px", "25px", "10px", "25px"])
  assert.deepEqual(parseSpacing("1px 2px 3px"), ["1px", "2px", "3px", "2px"])
  assert.equal(formatSpacing(["10", "25", "10", "25"]), "10px 25px")
  assert.equal(formatSpacing(["4px", "4px", "4px", "4px"]), "4px")
  assert.equal(formatSpacing(["1", "", "", ""]), "1px 0px 0px 0px")
  assert.equal(formatSpacing(["", "", "", ""]), "")
  assert.equal(withUnit("12"), "12px")
  assert.equal(withUnit("50%"), "50%")
})
