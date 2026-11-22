import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { expressionParts, liquidContext, liquidScope, quoted, splitOutside, textScope } from "tess_edit/core/liquid"

const kind = (before, mode) => liquidContext(before, mode)?.kind ?? null

test("a variable in {{ }} and {% %}, and in an expression", () => {
  assert.deepEqual(liquidContext("Hello {{ order.cus"), { kind: "variable", start: 9, path: "order.cus", tag: "{{" })
  assert.deepEqual(liquidContext("Hello {{"), { kind: "variable", start: 8, path: "", tag: "{{" })
  assert.deepEqual(liquidContext("{%- if order."), { kind: "variable", start: 7, path: "order.", tag: "{%" })
  assert.deepEqual(liquidContext("order.total > 100 and customer.v", "expression"), { kind: "variable", start: 22, path: "customer.v", tag: null })
  assert.equal(kind("Hello order"), null)
  assert.equal(kind("{{ a }} and b"), null)
})

test("a filter after a |, what it's on", () => {
  assert.deepEqual(liquidContext("{{ order.placed_at | da"), { kind: "filter", start: 21, partial: "da", input: "order.placed_at", tag: "{{" })
  assert.deepEqual(liquidContext("{{ order.placed_at |"), { kind: "filter", start: 20, partial: "", input: "order.placed_at", tag: "{{" })
  assert.deepEqual(liquidContext('lines | where: "party", "account" | so', "expression"), { kind: "filter", start: 36, partial: "so", input: 'lines | where: "party", "account"', tag: null })
  // A | in a string isn't one
  assert.equal(kind('{{ "a | b" | up'), "filter")
  assert.equal(liquidContext('{{ "a | b" | up').input, '"a | b"')
})

test("a filter's arguments, quoted or not, and those before them", () => {
  assert.deepEqual(liquidContext('{{ contract.lines | where: "pa'), { kind: "argument", filter: "where", index: 0, args: [], start: 27, partial: "pa", quote: '"', input: "contract.lines", tag: "{{" })
  assert.deepEqual(liquidContext("{{ contract.lines | where: "), { kind: "argument", filter: "where", index: 0, args: [], start: 27, partial: "", quote: null, input: "contract.lines", tag: "{{" })
  const second = liquidContext(`contract.lines | where: "party", 'sp`, "expression")
  assert.deepEqual([second.index, second.args, second.partial, second.quote, second.start], [1, ["party"], "sp", "'", 33])
  // A comma in a quoted argument isn't one
  assert.deepEqual(liquidContext('{{ x | replace: "a, b", "').args, ["a, b"])
  // An unquoted argument can be a variable
  assert.deepEqual(liquidContext("{{ total | plus: order.nu"), { kind: "argument", filter: "plus", index: 0, args: [], start: 17, partial: "order.nu", quote: null, input: "total", tag: "{{" })
})

test("a value compared with a variable", () => {
  assert.deepEqual(liquidContext('{% if line.party == "sp'), { kind: "value", of: "line.party", start: 20, partial: "sp", quote: '"', tag: "{%" })
  assert.deepEqual(liquidContext("line.party != ", "expression"), { kind: "value", of: "line.party", start: 14, partial: "", quote: null, tag: null })
  assert.equal(kind('{% if line.party > "sp'), null)
})

test("nothing in a string that's no argument or value", () => {
  assert.equal(kind('{{ "or'), null)
  assert.equal(kind("{{ 'hello' }} {{ 'or"), null)
})

test("an expression's path and its filters", () => {
  assert.deepEqual(expressionParts('contract.lines | where: "party", "account" | sort'), { path: "contract.lines", filters: ["where", "sort"] })
  assert.deepEqual(expressionParts("assign x = order.lines | first"), { path: "order.lines", filters: ["first"] })
  assert.deepEqual(expressionParts("line in lines"), { path: "lines", filters: [] })
  assert.equal(expressionParts('"text" | upcase'), null)
  assert.deepEqual(splitOutside('a | b: "c | d"', "|"), ["a ", ' b: "c | d"'])
})

test("a block has its Loops' variables and the Assigns before it, nearest first", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createNode("section"))
  const column = section.children[0] || insert(doc, section.id, 0, createNode("column"))
  insert(doc, column.id, 0, createNode("assign", { data: { variable: "lines", expression: "order.order_lines" } }))
  const loop = insert(doc, column.id, 1, createNode("loop", { data: { variable: "line", collection: "lines" } }))
  insert(doc, loop.id, 0, createNode("assign", { data: { variable: "kinds", expression: 'line.tags | where: "kind", "x"' } }))
  const text = insert(doc, loop.id, 1, createNode("text"))
  insert(doc, column.id, 2, createNode("assign", { data: { variable: "later", expression: "order.number" } }))

  assert.deepEqual(liquidScope(doc, text.id), [
    { variable: "kinds", expression: 'line.tags | where: "kind", "x"' },
    { variable: "line", collection: "lines" },
    { variable: "lines", expression: "order.order_lines" }
  ])
  assert.deepEqual(liquidScope(doc, loop.id), [{ variable: "lines", expression: "order.order_lines" }])
})

test("a text's own assigns and open loops before the caret", () => {
  assert.deepEqual(textScope('{% assign lines = order.lines | where: "a", "b" %}{% for line in lines %}{{ line.'), [
    { variable: "line", collection: "lines" },
    { variable: "lines", expression: 'order.lines | where: "a", "b"' }
  ])
  assert.deepEqual(textScope("{% for line in lines %}{{ line.name }}{% endfor %} {{ "), [])
})

test("a quoted value takes the closing quote that's there", () => {
  assert.deepEqual(quoted("party", { quote: "'", after: "' %}" }), { text: "'party'", through: 1 })
  assert.deepEqual(quoted("party", { after: " %}" }), { text: '"party"', through: 0 })
})
