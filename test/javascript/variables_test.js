import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { FORLOOP_MEMBERS, Variables, completion, liquidToken, loopScope, resolve } from "tess_edit/core/variables"

globalThis.window ||= { location: { href: "https://www.example.com/editor" } }

// What Liquidum's VariablesController answers for an order template
const LEVELS = {
  "": [{ name: "order", label: "Order", type: "object", collection: false, children: true }],
  order: [
    { name: "customer", label: "Ordered by", type: "object", collection: false, children: true },
    { name: "number", label: "Order number", type: "string", collection: false, children: false },
    { name: "order_lines", label: "Order lines", type: "object", collection: true, children: true }
  ],
  "order.customer": [{ name: "name", label: "Name", type: "string", collection: false, children: false }],
  "order.order_lines": [
    { name: "kind", label: "Kind", type: "string", collection: false, children: false, values: [{ value: "product", label: "Product" }, { value: "shipping", label: "Shipping" }] },
    { name: "product", label: "Product", type: "object", collection: false, children: true },
    { name: "quantity", label: "Quantity", type: "integer", collection: false, children: false }
  ],
  "order.order_lines.product": [{ name: "name", label: "Name", type: "string", collection: false, children: false }]
}

// What Liquidum's FiltersController answers, in part
const FILTERS = [
  { name: "where", label: "Those whose property has the value", arguments: [{ name: "property", kind: "property" }, { name: "value", kind: "value" }], keeps: "collection" },
  { name: "first", label: "The first item", arguments: [], keeps: "item" },
  { name: "size", label: "Number of items", arguments: [] },
  { name: "money", label: "As money", arguments: [] }
]

// What Liquidum's TagsController answers, in part
const TAGS = [
  { name: "if", label: "If a condition holds", syntax: "if condition", block: true },
  { name: "assign", label: "Gives a variable a value", syntax: "assign name = value", block: false }
]

function variables({ filters = false } = {}) {
  const requests = []
  const fetch = async (url) => {
    if (url.pathname === "/liquidum/filters") return { ok: true, status: 200, json: async () => ({ filters: FILTERS }) }
    if (url.pathname === "/liquidum/tags") return { ok: true, status: 200, json: async () => ({ tags: TAGS }) }
    const path = url.searchParams.get("path") || ""
    requests.push(path)
    if (!(path in LEVELS)) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => ({ path, variables: LEVELS[path] }) }
  }
  const result = new Variables("/liquidum/variables?roots=signed", { fetch, filtersUrl: filters ? "/liquidum/filters" : null, tagsUrl: filters ? "/liquidum/tags" : null })
  result.requests = requests
  return result
}

const names = (list) => list.map((variable) => variable.name)

test("without a url there are no variables", () => {
  assert.equal(new Variables(undefined).enabled, false)
  assert.equal(new Variables("/variables").enabled, true)
})

test("the roots, then the variables of a path", async () => {
  const v = variables()
  assert.deepEqual(names(await v.options("")), ["order"])
  assert.deepEqual(names(await v.options("order")), ["customer", "number", "order_lines"])
  assert.deepEqual(names(await v.options("order.customer")), ["name"])
})

test("keeps the roots it is given in the url, and asks for each level once", async () => {
  const v = variables()
  let url
  v.fetch = async (asked) => ((url = asked), { ok: true, status: 200, json: async () => ({ variables: [] }) })
  await v.at("order.customer")
  assert.equal(url.searchParams.get("roots"), "signed")
  assert.equal(url.searchParams.get("path"), "order.customer")

  const counted = variables()
  await counted.options("order.customer")
  await counted.options("order.customer")
  assert.equal(counted.requests.filter((path) => path === "order.customer").length, 1)
})

test("a collection has first, last and size, and first goes into its elements", async () => {
  const v = variables()
  assert.deepEqual(names(await v.options("order.order_lines")), ["first", "last", "size"])
  assert.deepEqual(names(await v.options("order.order_lines.first")), ["kind", "product", "quantity"])
  assert.deepEqual(names(await v.options("order.order_lines.last.product")), ["name"])
})

test("a value or an unknown name has no variables", async () => {
  const v = variables()
  assert.deepEqual(await v.options("order.number"), [])
  assert.deepEqual(await v.options("order.nope"), [])
  assert.deepEqual(await v.options("invoice"), [])
})

test("in a loop its variable is a root, with the elements' variables", async () => {
  const v = variables()
  const scope = [{ variable: "line", collection: "order.order_lines" }]
  assert.deepEqual(names(await v.options("", scope)), ["line", "forloop", "order"])
  assert.deepEqual(names(await v.options("line", scope)), ["kind", "product", "quantity"])
  assert.deepEqual(names(await v.options("line.product", scope)), ["name"])
})

test("loop variables resolve to their collection, inner loops through outer ones", () => {
  const scope = [{ variable: "x", collection: "line.product" }, { variable: "line", collection: "order.order_lines" }]
  assert.equal(resolve(["line", "product"], scope), "order.order_lines.product")
  assert.equal(resolve(["x", "name"], scope), "order.order_lines.product.name")
  assert.equal(resolve(["order", "order_lines", "first", "product"]), "order.order_lines.product")
  assert.equal(resolve(["order", "order_lines", "0", "product"]), "order.order_lines.product")
})

test("a block's loop variables are those of its Loop blocks, the innermost first", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createNode("section"))
  const outer = insert(doc, section.id, 0, createNode("loop", { data: { variable: "line", collection: "order.order_lines" } }))
  const column = insert(doc, outer.id, 0, createNode("column"))
  const inner = insert(doc, column.id, 0, createNode("loop", { data: { variable: "tag", collection: "line.tags" } }))
  const text = insert(doc, inner.id, 0, createNode("text"))
  assert.deepEqual(loopScope(doc, text.id), [{ variable: "tag", collection: "line.tags" }, { variable: "line", collection: "order.order_lines" }])
  assert.deepEqual(loopScope(doc, section.id), [])
})

test("the path being written inside {{ … }} and {% … %}", () => {
  assert.deepEqual(liquidToken("Hello {{ order.cus"), { start: 9, path: "order.cus", tag: "{{" })
  assert.deepEqual(liquidToken("Hello {{"), { start: 8, path: "", tag: "{{" })
  assert.deepEqual(liquidToken("{% if order."), { start: 6, path: "order.", tag: "{%" })
  assert.deepEqual(liquidToken("{{ total | plus: order.nu"), { start: 17, path: "order.nu", tag: "{{" })
})

test("no path outside a tag, after a filter's |, or in a string", () => {
  assert.equal(liquidToken("Hello order"), null)
  assert.equal(liquidToken("{{ a }} and b"), null)
  assert.equal(liquidToken("{{ placed_at | da"), null)
  assert.equal(liquidToken("{{ 'or"), null)
})

test("in an expression, the path at the caret without a tag", () => {
  assert.deepEqual(liquidToken("order.order_li", "expression"), { start: 0, path: "order.order_li", tag: null })
  assert.deepEqual(liquidToken("order.total > 100 and customer.v", "expression"), { start: 22, path: "customer.v", tag: null })
})

test("choosing a variable goes on with its variables, or ends the tag", () => {
  const customer = { name: "customer", children: true }
  const number = { name: "number", children: false }
  const lines = { name: "order_lines", children: true, collection: true }
  assert.deepEqual(completion(customer, { tag: "{{", before: "{{ " }), { text: "customer.", more: true })
  assert.deepEqual(completion(number, { tag: "{{", before: "{{ order." }), { text: "number }}", more: false })
  assert.deepEqual(completion(number, { tag: "{{", before: "{{ ", after: " }} more" }), { text: "number", more: false })
  assert.deepEqual(completion(number, { tag: "{{", before: "{{ ", after: " | upcase }}" }), { text: "number", more: false })
  assert.deepEqual(completion(number, { tag: "{%", before: "{% if " }), { text: "number", more: false })
  assert.deepEqual(completion(lines, { tag: "{{", before: "{{ order." }), { text: "order_lines.", more: true })
})

test("a space after {{ when there is none, and a Loop's collection ends at a collection", () => {
  assert.deepEqual(completion({ name: "order", children: false }, { tag: "{{", before: "{{" }), { text: " order }}", more: false })
  const lines = { name: "order_lines", children: true, collection: true }
  assert.deepEqual(completion(lines, { collection: true }), { text: "order_lines", more: false })
  assert.deepEqual(completion(lines, {}), { text: "order_lines.", more: true })
})

test("the host's filters, by name; none without a filtersUrl", async () => {
  assert.deepEqual([...(await variables({ filters: true }).filters()).keys()], ["where", "first", "size", "money"])
  assert.equal((await variables().filters()).size, 0)
})

test("an Assign is a variable: a collection through filters that keep one, an item through first", async () => {
  const v = variables({ filters: true })
  const scope = [
    { variable: "product", expression: "order.order_lines | first | money" },
    { variable: "line", expression: "shipping | first" },
    { variable: "shipping", expression: 'order.order_lines | where: "kind", "shipping"' },
    { variable: "buyer", expression: "order.customer" }
  ]
  assert.deepEqual(await v.resolveScope(scope), [
    { variable: "line", collection: "shipping" },
    { variable: "shipping", path: "order.order_lines" },
    { variable: "buyer", path: "order.customer" }
  ])
  const roots = await v.options("", scope)
  assert.deepEqual(names(roots), ["line", "shipping", "buyer", "forloop", "order"])
  assert.equal(roots.find((root) => root.name === "shipping").collection, true)
  assert.deepEqual(names(await v.options("shipping", scope)), ["first", "last", "size"])
  assert.deepEqual(names(await v.options("line", scope)), ["kind", "product", "quantity"])
  assert.deepEqual(names(await v.options("buyer", scope)), ["name"])
  assert.deepEqual(names(await v.options("shipping.first.product", scope)), ["name"])
})

test("without the host's filters, Liquid's own that keep a collection still do", async () => {
  const v = variables()
  assert.deepEqual(await v.resolveScope([{ variable: "lines", expression: 'order.order_lines | where: "kind", "product" | sort' }]), [{ variable: "lines", path: "order.order_lines" }])
  assert.deepEqual(await v.resolveScope([{ variable: "n", expression: "order.order_lines | size" }]), [])
})

test("a variable's values, through a loop or an Assign", async () => {
  const v = variables({ filters: true })
  const scope = [{ variable: "line", collection: "lines" }, { variable: "lines", expression: "order.order_lines" }]
  assert.deepEqual((await v.lookup("line.kind", scope)).values.map((value) => value.value), ["product", "shipping"])
  assert.equal((await v.lookup("order.number", scope)).values, undefined)
  assert.equal(await v.lookup("", scope), null)
})

test("the host's tags, by name; none without a tagsUrl", async () => {
  const tags = await variables({ filters: true }).tags()
  assert.deepEqual([...tags.keys()], ["if", "assign"])
  assert.equal(tags.get("if").block, true)
  assert.equal((await variables().tags()).size, 0)
})

test("forloop is a root only in a loop, with Liquid's members", async () => {
  const v = variables()
  assert.deepEqual(names(await v.options("")), ["order"])
  const scope = [{ variable: "line", collection: "order.order_lines" }]
  assert.deepEqual(names(await v.options("forloop", scope)), names(FORLOOP_MEMBERS))
  assert.equal((await v.lookup("forloop.index", scope)).type, "integer")
})

test("a capture's variable is a text", async () => {
  const v = variables()
  const scope = [{ variable: "greeting", captured: true }]
  assert.deepEqual(names(await v.options("", scope)), ["greeting", "order"])
  assert.deepEqual(await v.options("greeting", scope), [])
  assert.equal((await v.lookup("greeting", scope)).type, "string")
})
