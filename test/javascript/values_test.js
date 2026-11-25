import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { Values, expressionsIn, normalizeExpression, valueCalls } from "tess_edit/core/values"
import "./page_kit.js"

test("finds the output tags that aren't t filters, with their expressions as written", () => {
  const text = "Hi {{ contract.account.name }}, {{ '.greeting' | t }} {{-contract.starts_on | date: '%-d %B'-}} {% if x %}"
  const calls = valueCalls(text)
  assert.deepEqual(calls.map((call) => call.expression), ["contract.account.name", "contract.starts_on | date: '%-d %B'"])
  assert.equal(text.slice(calls[0].start, calls[0].end), "{{ contract.account.name }}")
  assert.equal(calls[1].text, "{{-contract.starts_on | date: '%-d %B'-}}")
  assert.deepEqual(valueCalls("{{ '.only' | t }}"), [])
  assert.deepEqual(valueCalls(null), [])
  assert.deepEqual(valueCalls("no Liquid"), [])
})

test("an expression is its text, its whitespace one space", () => {
  assert.equal(normalizeExpression("  contract.starts_on   |  date "), "contract.starts_on | date")
  assert.deepEqual(valueCalls("{{contract.name}}").map((call) => call.expression), ["contract.name"])
})

test("collects the expressions in a document's texts and settings", () => {
  const doc = createDocument("page")
  doc.data.subject = "{{ contract.description }}"
  const section = createNode("section")
  insert(doc, doc.id, 0, section)
  const column = createNode("column")
  insert(doc, section.id, 0, column)
  const text = createNode("text")
  text.data.content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{ contract.account.name }} and {{ '.x' | t }} {{ contract.description }}" }] }] }
  insert(doc, column.id, 0, text)
  assert.deepEqual([...expressionsIn(doc)].sort(), ["contract.account.name", "contract.description"])
})

test("values by expression, the empty ones as empty, and who listens hears of a change only", () => {
  const values = new Values()
  assert.equal(values.enabled, false)
  let heard = 0
  values.subscribe(() => heard++)

  assert.equal(values.set({ "contract.account.name": "sv COFA", "contract.description": "", "contract.ends_on": null, count: 3 }), true)
  assert.equal(values.enabled, true)
  assert.equal(values.value("contract.account.name"), "sv COFA")
  assert.equal(values.value("  contract.account.name "), "sv COFA")
  assert.equal(values.value("count"), "3")
  assert.equal(values.value("contract.description"), null, "an empty value shows its Liquid")
  assert.equal(values.empty("contract.description"), true, "in red, as empty for now")
  assert.equal(values.value("contract.ends_on"), null)
  assert.equal(values.empty("contract.ends_on"), false, "null is no value known")
  assert.equal(heard, 1)

  assert.equal(values.set({ "contract.account.name": "sv COFA", "contract.description": "", count: "3" }), false)
  assert.equal(heard, 1)
  assert.equal(values.set({ "contract.account.name": "sv COFA", count: "3" }), true, "no longer empty")
  assert.equal(heard, 2)
  assert.equal(values.set({ "contract.description": "" }), true)
  assert.equal(values.enabled, true, "empty values alone are values too")
  assert.equal(heard, 3)
  values.set({})
  assert.equal(values.enabled, false)
  assert.equal(heard, 4)
})
