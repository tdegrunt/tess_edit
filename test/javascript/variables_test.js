import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { Variables, completion, liquidToken, loopScope, resolve } from "tess_edit/core/variables"

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
    { name: "product", label: "Product", type: "object", collection: false, children: true },
    { name: "quantity", label: "Quantity", type: "integer", collection: false, children: false }
  ],
  "order.order_lines.product": [{ name: "name", label: "Name", type: "string", collection: false, children: false }]
}

function variables() {
  const requests = []
  const fetch = async (url) => {
    const path = url.searchParams.get("path") || ""
    requests.push(path)
    if (!(path in LEVELS)) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => ({ path, variables: LEVELS[path] }) }
  }
  const result = new Variables("/liquidum/variables?roots=signed", { fetch })
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
  assert.deepEqual(names(await v.options("order.order_lines.first")), ["product", "quantity"])
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
  assert.deepEqual(names(await v.options("", scope)), ["line", "order"])
  assert.deepEqual(names(await v.options("line", scope)), ["product", "quantity"])
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
