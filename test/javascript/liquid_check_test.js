import { test } from "node:test"
import assert from "node:assert/strict"
import { checkLiquid, checkStructure, liquidParts } from "tess_edit/core/liquid_check"
import { Variables } from "tess_edit/core/variables"

globalThis.window ||= { location: { href: "https://www.example.com/editor" } }

// The host: an order with lines, each with a kind that's product or shipping
const LEVELS = {
  "": [{ name: "order", label: "Order", type: "object", collection: false, children: true }],
  order: [
    { name: "number", label: "Order number", type: "string", collection: false, children: false },
    { name: "paid?", label: "Paid", type: "boolean", collection: false, children: false },
    { name: "lines", label: "Lines", type: "object", collection: true, children: true }
  ],
  "order.lines": [
    { name: "kind", label: "Kind", type: "string", collection: false, children: false, values: [{ value: "product", label: "Product" }, { value: "shipping", label: "Shipping" }] },
    { name: "product", label: "Product", type: "object", collection: false, children: true }
  ],
  "order.lines.product": [{ name: "name", label: "Name", type: "string", collection: false, children: false }]
}
const FILTERS = [
  { name: "where", label: "", arguments: [{ name: "property", kind: "property" }, { name: "value", kind: "value" }], keeps: "collection" },
  { name: "first", label: "", arguments: [], keeps: "item" },
  { name: "t", label: "", arguments: [{ name: "key", kind: "key" }] },
  { name: "money", label: "", arguments: [] },
  { name: "date", label: "", arguments: [{ name: "format", kind: "format", optional: false }] },
  { name: "truncate", label: "", arguments: [{ name: "length", kind: "any", optional: true }, { name: "ellipsis", kind: "any", optional: true }] }
]
const TAGS = ["assign", "capture", "case", "comment", "for", "if", "raw", "unless", "increment"].map((name) => ({ name, block: ["capture", "case", "comment", "for", "if", "raw", "unless"].includes(name) }))
  .concat([{ name: "signature_field", block: true }])

function host({ urls = true } = {}) {
  const fetch = async (url) => {
    if (url.pathname === "/filters") return { ok: true, status: 200, json: async () => ({ filters: FILTERS }) }
    if (url.pathname === "/tags") return { ok: true, status: 200, json: async () => ({ tags: TAGS }) }
    const path = url.searchParams.get("path") || ""
    if (!(path in LEVELS)) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => ({ path, variables: LEVELS[path] }) }
  }
  return new Variables(urls ? "/variables" : null, { fetch, filtersUrl: urls ? "/filters" : null, tagsUrl: urls ? "/tags" : null })
}

// Each problem as the text it's on and its message
async function check(text, options = {}) {
  const problems = await checkLiquid(text, { variables: host(), ...options })
  return problems.map((problem) => [text.slice(problem.start, problem.end), problem.message])
}

test("a text's tags, nothing in raw or a comment", () => {
  assert.deepEqual(liquidParts("a {{ x }} {%- if y -%}{% raw %}{% if %}{% endraw %}").map((part) => [part.kind, part.name, part.inner]), [
    ["output", null, " x "],
    ["tag", "if", " if y "],
    ["tag", "raw", " raw "],
    ["tag", "endraw", " endraw "]
  ])
})

test("blocks left open, closed without being opened, and tags where they can't be", () => {
  const messages = (text) => checkStructure(text).map((problem) => [text.slice(problem.start, problem.end), problem.message])
  assert.deepEqual(messages("{% if a %}{% for x in y %}{% endfor %}{% endif %}"), [])
  assert.deepEqual(messages("{% if a %}x"), [["{% if a %}", "{% if %} isn't closed"]])
  assert.deepEqual(messages("x{% endif %}"), [["{% endif %}", "{% endif %} without {% if %}"]])
  // An inner block closed by its outer one's end
  assert.deepEqual(messages("{% for x in y %}{% if a %}{% endfor %}"), [["{% if a %}", "{% if %} isn't closed"]])
  assert.deepEqual(messages("{% else %}"), [["{% else %}", "{% else %} can only be inside {% if %}, {% unless %}, {% case %}, {% for %}"]])
  assert.deepEqual(messages("{% case a %}{% when 1 %}{% else %}{% endcase %}{% when 2 %}"), [["{% when 2 %}", "{% when %} can only be inside {% case %}"]])
  assert.deepEqual(messages("{% break %}{% for x in y %}{% if a %}{% break %}{% endif %}{% endfor %}"), [["{% break %}", "{% break %} can only be inside {% for %}"]])
  // A host's block, when it says it's one
  assert.deepEqual(checkStructure("{% signature_field a %}", { blocks: ["signature_field"] }).length, 1)
  assert.deepEqual(messages("{% signature_field a %}"), [])
})

test("variables that aren't there, the first name that isn't", async () => {
  assert.deepEqual(await check("{{ order.number }} {{ order.lines.first.product.name }} {{ order.lines.size }}"), [])
  assert.deepEqual(await check("{{ ordr.number }}"), [["ordr", "There's no variable ordr"]])
  assert.deepEqual(await check("{{ order.numbr | upcase }}"), [["numbr", "order has no numbr"], ["upcase", "There's no filter upcase"]])
  assert.deepEqual(await check("{{ order.lines.first.prodct.name }}"), [["prodct", "order.lines.first has no prodct"]])
  // Not past a value, whose variables aren't known
  assert.deepEqual(await check("{{ order.number.whatever }}"), [])
  // A name ending in ?, with or without it
  assert.deepEqual(await check("{%if order.paid?%}{% endif %}{{ order.paid }}{{ order.number? }}"), [])
  // Nor what's quoted, numbers, words, named arguments
  assert.deepEqual(await check(`{{ "ordr.x" | t: name: order.number }} {% if order.number == blank and 1.5 > 1 %}{% endif %}`), [])
})

test("the variables of the blocks around it, and the text's own", async () => {
  const scope = [{ variable: "line", collection: "order.lines" }]
  assert.deepEqual(await check("{{ line.product.name }} {{ forloop.index }}", { scope }), [])
  assert.deepEqual(await check("{{ line.prodct }}", { scope }), [["prodct", "line has no prodct"]])
  assert.deepEqual(await check("{{ forloop.index }}"), [["forloop", "There's no variable forloop"]])
  assert.deepEqual(await check('{% assign kinds = order.lines | where: "kind", "product" %}{% for l in kinds %}{{ l.product.name }}{{ l.prodct }}{% endfor %}{{ l.kind }}'), [
    ["prodct", "l has no prodct"],
    ["l", "There's no variable l"]
  ])
  assert.deepEqual(await check("{% capture note %}Hi{% endcapture %}{{ note }} {% increment n %}{{ n }}"), [])
})

test("filters and tags that aren't there, a filter given too many arguments", async () => {
  assert.deepEqual(await check('{{ order.lines | where: "kind", "product", "x" | first }}'), [["where", "where takes 2 arguments, not 3"]])
  assert.deepEqual(await check("{% iff order.number %}"), [["{% iff order.number %}", "There's no tag iff"]])
  // Liquid's own parts of blocks, and the host's tags with what they take
  assert.deepEqual(await check("{% if order.number %}{% else %}{% endif %}{% signature_field signature sponsor:1 %}{% endsignature_field %}"), [])
})

test("a compared value the variable can't have, also after {% when %}", async () => {
  const scope = [{ variable: "line", collection: "order.lines" }]
  assert.deepEqual(await check('{% if line.kind == "shiping" or line.kind != "product" %}{% endif %}', { scope }), [['"shiping"', 'line.kind is never "shiping"']])
  assert.deepEqual(await check('{% case line.kind %}{% when "product", "x" %}{% endcase %}', { scope }), [['"x"', 'line.kind is never "x"']])
})

test("an expression, a condition, a collection: one expression, no tags", async () => {
  assert.deepEqual(await check('order.lines | where: "kind", "product"', { mode: "expression" }), [])
  assert.deepEqual(await check("order.lins | first", { mode: "expression" }), [["lins", "order has no lins"]])
  assert.deepEqual(await check('order.number and order.lines.first.kind == "x"', { mode: "condition" }), [['"x"', 'order.lines.first.kind is never "x"']])
  assert.deepEqual(await check("order.lines reversed limit: 2", { mode: "collection" }), [])
  assert.deepEqual(await check("(1..order.lines.size)", { mode: "collection" }), [])
})

test("without the host's endpoints only the structure", async () => {
  assert.deepEqual((await checkLiquid("{{ ordr | nope }}{% iff %}{% if %}", { variables: host({ urls: false }) })).map((problem) => problem.message), ["{% if %} isn't closed"])
  assert.deepEqual((await checkLiquid("{% if %}")).length, 1)
})

test("a document's Liquid: its fields in their mode, its rich texts, and other text with Liquid", async () => {
  const { createDocument, createNode, insert } = await import("tess_edit/core/document")
  const { liquidTexts, richText, LiquidChecker } = await import("tess_edit/core/liquid_check")
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createNode("section"))
  const column = section.children[0] || insert(doc, section.id, 0, createNode("column"))
  const loop = insert(doc, column.id, 0, createNode("loop", { data: { variable: "line", collection: "order.lins" } }))
  const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{% if line.kind == \"x\" %}" }] }, { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "{% endif %}" }] }] }
  const text = insert(doc, loop.id, 0, createNode("text", { data: { content } }))
  assert.equal(richText(content), '{% if line.kind == "x" %}\na￼{% endif %}')

  const texts = liquidTexts(doc)
  assert.deepEqual(texts.map((entry) => [entry.id, entry.key, entry.mode]), [[loop.id, "data.collection", "collection"], [text.id, "data.content", "output"]])
  assert.deepEqual(texts[1].scope, [{ variable: "line", collection: "order.lins" }])

  const checker = new LiquidChecker({ doc, variables: host() })
  await checker.check()
  assert.deepEqual(checker.field(loop.id, "data.collection").problems.map((problem) => problem.message), ["order has no lins"])
  assert.equal(checker.problems(text.id).length, 0)
})

test("a filter without an argument it needs, when the host says which can be left out", async () => {
  assert.deepEqual(await check("{{ order.number | date }} {{ order.number | date: }}"), [["date", "date needs 1 argument"], ["date", "date needs 1 argument"]])
  assert.deepEqual(await check("{{ order.number | date: '%Y' | truncate }} {{ order.number | truncate: 5, '…' }}"), [])
  assert.deepEqual(await check("{{ order.number | truncate: 1, 2, 3 }}"), [["truncate", "truncate takes 2 arguments, not 3"]])
  // Not when it doesn't say (where's here)
  assert.deepEqual(await check("{{ order.lines | where }}"), [])
})
