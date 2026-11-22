import { test } from "node:test"
import assert from "node:assert/strict"
import { accepted, createDocument, createFromPalette, createNode, find, insert } from "tess_edit/core/document"
import { extendBlock, getBlock, paletteItems, registerBlock, registerKit } from "tess_edit/core/registry"
import { addColumn, addRow, cellOf, columnCount, deleteColumn, deleteRow, nextCell, position, rowGroups, rows, setColumn, setColumnAt, span, tableOf, wrapRow } from "tess_edit/core/table"
import { toMjml } from "tess_edit/export/mjml"

// A kit of HTML documents that takes the table in, as the host's PDF kit does
registerKit({ key: "paper", name: "Paper", root: "paper", canvas: async () => ({ html: "", errors: [] }), outputs: async () => ({ outputs: {}, errors: [] }) })
registerBlock({ type: "paper", name: "Paper", icon: "", roles: [], accepts: ["body"], kits: ["paper"], render: { html: () => "" } })
for (const type of ["section", "column", "text", "image", "loop", "condition", "assign", "table", "table_row", "table_cell"]) extendBlock(type, { kits: ["paper"] })

const text = (cell) => cell.children[0].data.content.content[0].content?.[0]?.text || ""

function paper() {
  const doc = createDocument("paper")
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const table = insert(doc, section.children[0].id, 0, createFromPalette("table"))
  return { doc, table }
}

test("a table is the email's, and a kit's that takes it in", () => {
  assert.deepEqual(getBlock("table").kits, ["email", "paper"])
  assert.ok(paletteItems("email").some((item) => item.key === "table"))
  assert.ok(paletteItems("paper").some((item) => item.key === "table"))
})

test("in an email an mj-table of HTML, its styles inline, its Loops' rows between Liquid tags", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const table = insert(doc, section.children[0].id, 0, createFromPalette("table"))
  const [heading, first, second] = rows(table)
  table.data.columns[2].width = "60px"
  table.data.stripe = "#f9fafb"
  const loop = insert(doc, table.id, 1, createNode("loop", { data: { variable: "line", collection: "order.lines" } }))
  table.children.splice(2, 1)
  insert(doc, loop.id, 0, first)
  first.children[0].children[0].data.content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{ line.name }}" }] }] }
  first.children[2].children.push(createNode("image", { attributes: { src: "https://example.com/a.png" } }))
  second.data.lineAbove = "3px"
  second.children[0].data.colspan = "2"
  second.children.splice(1, 1)

  const mjml = toMjml(doc)
  assert.match(mjml, /<mj-table padding="10px 25px"><colgroup><col><col><col style="width:60px"><\/colgroup><thead><tr><th style="border:1px solid #d1d5db;padding:6px 8px;text-align:left;vertical-align:top;background-color:#f3f4f6;font-weight:bold">/)
  assert.match(mjml, /<tbody>\{% for line in order\.lines %\}\n\s*<tr><td style="[^"]*"><div style="padding:0px"><p[^>]*>\{\{ line\.name \}\}<\/p><\/div><\/td>/)
  assert.match(mjml, /<img src="https:\/\/example\.com\/a\.png" alt="" style="display:block;max-width:100%;height:auto;border:0"><\/div><\/td><\/tr>\n\s*\{% endfor %\}/)
  assert.match(mjml, /<td colspan="2" style="border:1px solid #d1d5db;border-top-width:3px;[^"]*background-color:#f9fafb">/)

  const editor = toMjml(doc, { editor: true })
  assert.doesNotMatch(editor, /\{%/)
  assert.match(editor, new RegExp(`<mj-table padding="10px 25px" css-class="tess-${table.id}">`))
  assert.match(editor, new RegExp(`<tr class="tess-${first.id}"><td class="tess-${first.children[0].id}"`))
})

test("the palette's table: a heading row and two rows of three cells, each with a Text", () => {
  const { table } = paper()
  const all = rows(table)
  assert.equal(all.length, 3)
  assert.equal(all[0].data.heading, "heading")
  assert.ok(all.every((row) => row.children.length === 3 && row.children.every((cell) => cell.type === "table_cell" && cell.children[0].type === "text")))
  assert.equal(text(all[0].children[0]), "Heading")
  assert.equal(columnCount(table), 3)
  assert.equal(table.data.columns.length, 3)
})

test("rows go in a table, cells in a row, content in a cell; Loop, Condition and Assign between rows", () => {
  const { doc, table } = paper()
  const row = rows(table)[0]
  const cell = row.children[0]
  assert.deepEqual(accepted(doc, table.id).sort(), ["assign", "condition", "loop", "table_row"])
  assert.deepEqual(accepted(doc, row.id), ["table_cell"])
  assert.ok(accepted(doc, cell.id).includes("text"))
  assert.ok(accepted(doc, cell.id).includes("table"))
  assert.ok(!accepted(doc, cell.id).includes("table_row"))

  const loop = insert(doc, table.id, 1, createNode("loop", { data: { variable: "line", collection: "lines" } }))
  assert.deepEqual(accepted(doc, loop.id).sort(), ["assign", "condition", "loop", "table_row"])
})

test("a table's rows are also those in its Loops and Conditions, in order, but not a table's in a cell", () => {
  const { doc, table } = paper()
  const [heading, first, second] = rows(table)
  const condition = insert(doc, table.id, 1, createNode("condition"))
  const loop = insert(doc, condition.id, 0, createNode("loop"))
  const repeated = insert(doc, loop.id, 0, createNode("table_row"))
  insert(doc, heading.children[0].id, 1, createFromPalette("table"))
  assert.deepEqual(rows(table).map((row) => row.id), [heading.id, repeated.id, first.id, second.id])
  assert.equal(tableOf(doc, repeated.id).id, table.id)
})

test("adding a row above or below a cell's, in its Loop when it's in one, of as many cells as columns", () => {
  const { doc, table } = paper()
  const loop = insert(doc, table.id, 1, createNode("loop"))
  const row = insert(doc, loop.id, 0, rows(table)[1])
  table.children.splice(2, 1)
  const cell = row.children[1]

  const below = addRow(doc, cell.id, "below")
  assert.equal(find(doc, below.id).parent.id, loop.children[1].id)
  assert.equal(loop.children[1].children.length, 3)
  assert.equal(loop.children[1].children.indexOf(below), 1)

  const above = addRow(doc, cell.id, "above")
  assert.equal(loop.children[0].children.includes(above), true)
  assert.equal(loop.children[1].id, row.id)
})

test("adding a column left or right in every row, widening a cell that spans the place", () => {
  const { doc, table } = paper()
  const [heading, first, second] = rows(table)
  heading.children[0].data.colspan = "2"
  heading.children.splice(1, 1)
  const cell = first.children[0]

  const added = addColumn(doc, cell.id, "right")
  assert.equal(first.children.indexOf(added), 1)
  assert.equal(span(heading.children[0]), 3)
  assert.equal(second.children.length, 4)
  assert.equal(table.data.columns.length, 4)

  const left = addColumn(doc, cell.id, "left")
  assert.equal(first.children.indexOf(left), 0)
  assert.equal(heading.children.length, 3)
  assert.equal(heading.children.indexOf(heading.children.find((c) => span(c) === 3)), 1)
  assert.equal(columnCount(table), 5)
})

test("deleting a row selects the one after it, or before; never the last row", () => {
  const { doc, table } = paper()
  const [heading, first, second] = rows(table)
  assert.equal(deleteRow(doc, first.children[2].id).id, second.children[2].id)
  assert.equal(deleteRow(doc, second.children[0].id).id, heading.children[0].id)
  assert.equal(deleteRow(doc, heading.children[0].id), null)
  assert.equal(rows(table).length, 1)
})

test("deleting a column in every row, narrowing a cell that spans it; never the last column", () => {
  const { doc, table } = paper()
  const [heading, first] = rows(table)
  heading.children[1].data.colspan = "2"
  heading.children.splice(2, 1)
  setColumn(doc, first.children[1].id, "width", "20pt")

  const next = deleteColumn(doc, first.children[1].id)
  assert.equal(next.id, first.children[1].id)
  assert.equal(first.children.length, 2)
  assert.equal(heading.children.length, 2)
  assert.equal(span(heading.children[1]), 1)
  assert.deepEqual(table.data.columns.map((column) => column.width), ["", ""])

  deleteColumn(doc, first.children[0].id)
  assert.equal(deleteColumn(doc, first.children[0].id), null)
  assert.equal(columnCount(table), 1)
})

test("a cell's position, the next cell and the cell a block is in", () => {
  const { doc, table } = paper()
  const [heading, first] = rows(table)
  const at = position(doc, first.children[2].id)
  assert.equal(at.table.id, table.id)
  assert.equal(at.column, 2)
  assert.equal(nextCell(doc, heading.children[2].id).id, first.children[0].id)
  assert.equal(nextCell(doc, first.children[0].id, { backwards: true }).id, heading.children[2].id)
  assert.equal(cellOf(doc, first.children[1].children[0].id).id, first.children[1].id)
  assert.equal(cellOf(doc, table.id), null)
})

test("an Assign sets a variable for what follows it, nothing on the canvas", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  insert(doc, section.children[0].id, 0, createNode("assign", { data: { variable: "lines", expression: 'order.lines | where: "kind", "product"' } }))
  assert.match(toMjml(doc), /<mj-raw>\{% assign lines = order\.lines \| where: "kind", "product" %\}<\/mj-raw>/)
  assert.doesNotMatch(toMjml(doc, { editor: true }), /assign/)
  assert.equal(getBlock("assign").label({ data: { variable: "lines", expression: "order.lines" } }), "lines = order.lines")
})

test("a table's lines around every cell, or only under each row", () => {
  const doc = createDocument()
  const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
  const table = insert(doc, section.children[0].id, 0, createFromPalette("table"))
  assert.match(toMjml(doc), /<td style="border:1px solid #d1d5db;/)
  table.data.borders = "rows"
  const mjml = toMjml(doc)
  assert.match(mjml, /<td style="border-bottom:1px solid #d1d5db;/)
  assert.doesNotMatch(mjml, /style="border:/)
})

test("a row is wrapped in a Loop in its place, which the canvas marks with its rows", () => {
  const { doc, table } = paper()
  const second = table.children[1]
  const loop = wrapRow(doc, second.children[0].id, "loop")
  assert.equal(loop.type, "loop")
  assert.equal(table.children[1], loop)
  assert.deepEqual(loop.children, [second])
  assert.equal(rows(table).length, 3)

  const condition = wrapRow(doc, second.children[0].id, "condition")
  assert.deepEqual(loop.children, [condition])
  assert.deepEqual(rowGroups(table).map(({ node, depth }) => [node.type, depth]), [["loop", 0], ["condition", 1]])
})

test("a column's width is set by its index, as dragging its border does", () => {
  const { doc, table } = paper()
  setColumnAt(doc, table.id, 1, "width", "80pt")
  assert.deepEqual(table.data.columns.map((column) => column.width), ["", "80pt", ""])
  setColumnAt(doc, table.id, 5, "width", "1pt")
  assert.equal(table.data.columns.length, 3)
})
