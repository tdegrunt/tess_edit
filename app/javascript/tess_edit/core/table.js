// Tables (blocks/table.js): a Table holds Rows, a Row holds Cells, a Cell
// holds content. Between a Table and its Rows there can be Loops and
// Conditions (and Assigns), which take rows there: a Loop around a Row
// prints it for each item. So a table's rows are its Rows wherever they are
// under it, in order (rows).
//
// Its columns are the Table's data.columns, each { width, align }; a Cell
// spanning columns has data.colspan. Adding or deleting a column does it in
// every Row, inside Loops and Conditions too, and in data.columns.
//
// Like core/document.js these change the document they're given in place;
// the editor calls them in a commit (ui/inspector.js, the Cell's Table
// field), and selects the cell they return.

import { createNode, find, insert, remove, walk } from "tess_edit/core/document"

export const TABLE = "table"
export const ROW = "table_row"
export const CELL = "table_cell"

const EMPTY_TEXT = { type: "doc", content: [{ type: "paragraph" }] }

// A Cell with an empty Text, which has the table's padding
export function newCell(text = null) {
  const content = text ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } : EMPTY_TEXT
  return createNode(CELL, { children: [createNode("text", { attributes: { padding: "0px" }, data: { content } })] })
}

export function newRow(count, { heading = false, texts = [] } = {}) {
  return createNode(ROW, { data: heading ? { heading: "heading" } : {}, children: Array.from({ length: count }, (_, i) => newCell(texts[i] || null)) })
}

// A table of `columns` columns and `rows` rows, the first a heading row
export function newTable(columns = 3, rows = 3, { headings = [] } = {}) {
  return createNode(TABLE, {
    data: { columns: Array.from({ length: columns }, () => ({ width: "", align: "" })) },
    children: Array.from({ length: rows }, (_, i) => newRow(columns, i === 0 ? { heading: true, texts: headings } : {}))
  })
}

// The Table a block is in, or is
export function tableOf(doc, id) {
  let table = null
  let found = false
  const visit = (node, tables) => {
    if (found) return
    const inside = node.type === TABLE ? [...tables, node] : tables
    if (node.id === id) {
      table = inside.at(-1) || null
      found = true
      return
    }
    for (const child of node.children || []) visit(child, inside)
  }
  visit(doc, [])
  return table
}

// The Table's Rows in order, also those in its Loops and Conditions, not
// those of a table in a cell
export function rows(table) {
  const found = []
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.type === ROW) found.push(child)
      else if (child.type !== TABLE && child.type !== CELL) visit(child)
    }
  }
  visit(table)
  return found
}

export function span(cell) {
  const value = parseInt(cell?.data?.colspan, 10)
  return value > 1 ? value : 1
}

export function columnCount(table) {
  const widest = Math.max(0, ...rows(table).map((row) => row.children.reduce((sum, cell) => sum + span(cell), 0)))
  return Math.max(table.data?.columns?.length || 0, widest)
}

// The columns a Row's cells start at: [{ cell, index, start }]
function starts(row) {
  let start = 0
  return row.children.map((cell, index) => {
    const entry = { cell, index, start }
    start += span(cell)
    return entry
  })
}

// Where a Cell is: its table, row, the column it starts at
export function position(doc, cellId) {
  const hit = find(doc, cellId)
  if (!hit || hit.node.type !== CELL || hit.parent?.type !== ROW) return null
  const table = tableOf(doc, cellId)
  if (!table) return null
  const row = hit.parent
  const { start } = starts(row)[hit.index]
  return { table, row, cell: hit.node, column: start }
}

// The cell in `row` that covers `column`, or the last one when the row is short
function covering(row, column) {
  const entries = starts(row)
  return entries.find(({ cell, start }) => start <= column && column < start + span(cell)) || entries.at(-1) || null
}

function columns(table) {
  table.data ||= {}
  const count = columnCount(table)
  const list = Array.isArray(table.data.columns) ? table.data.columns : []
  table.data.columns = Array.from({ length: count }, (_, i) => list[i] || { width: "", align: "" })
  return table.data.columns
}

// Adds a row above or below the cell's, of as many cells as there are
// columns; returns its cell in the same column
export function addRow(doc, cellId, where = "below") {
  const at = position(doc, cellId)
  if (!at) return null
  const hit = find(doc, at.row.id)
  const row = newRow(columnCount(at.table))
  insert(doc, hit.parent.id, hit.index + (where === "above" ? 0 : 1), row)
  return covering(row, at.column)?.cell || null
}

// Adds a column left or right of the cell's, in every row; a cell spanning
// the place gets wider instead. Returns the new cell in the cell's row.
export function addColumn(doc, cellId, where = "right") {
  const at = position(doc, cellId)
  if (!at) return null
  const column = where === "left" ? at.column : at.column + span(at.cell)
  // Its columns as they are, before the rows have one more
  const list = columns(at.table)
  let added = null
  for (const row of rows(at.table)) {
    const entries = starts(row)
    const across = entries.find(({ cell, start }) => start < column && column < start + span(cell))
    if (across) {
      across.cell.data.colspan = String(span(across.cell) + 1)
      continue
    }
    const before = entries.find(({ start }) => start >= column)
    const cell = newCell()
    row.children.splice(before ? before.index : row.children.length, 0, cell)
    if (row === at.row) added = cell
  }
  list.splice(column, 0, { width: "", align: "" })
  return added
}

// Deletes the cell's row; returns the cell to select next, in the row after
// it or else before it, or null when it was the table's last row
export function deleteRow(doc, cellId) {
  const at = position(doc, cellId)
  if (!at) return null
  const all = rows(at.table)
  if (all.length < 2) return null
  const index = all.indexOf(at.row)
  const next = all[index + 1] || all[index - 1]
  remove(doc, at.row.id)
  return covering(next, at.column)?.cell || null
}

// Deletes the cell's column in every row: a cell spanning it gets narrower.
// Returns the cell to select next, or null when it was the last column.
export function deleteColumn(doc, cellId) {
  const at = position(doc, cellId)
  if (!at || columnCount(at.table) < 2) return null
  const column = at.column
  const list = columns(at.table)
  for (const row of rows(at.table)) {
    const target = covering(row, column)
    if (!target || target.start + span(target.cell) <= column) continue
    if (span(target.cell) > 1) target.cell.data.colspan = span(target.cell) === 2 ? "" : String(span(target.cell) - 1)
    else row.children.splice(target.index, 1)
  }
  list.splice(column, 1)
  return covering(at.row, Math.min(column, columnCount(at.table) - 1))?.cell || null
}

// The cell after (or before) this one, row by row
export function nextCell(doc, cellId, { backwards = false } = {}) {
  const table = tableOf(doc, cellId)
  if (!table) return null
  const cells = rows(table).flatMap((row) => row.children)
  const index = cells.findIndex((cell) => cell.id === cellId)
  if (index < 0) return null
  return cells[index + (backwards ? -1 : 1)] || null
}

// The cell a block is in, if any: the nearest Cell around it
export function cellOf(doc, id) {
  let cell = null
  let found = false
  const visit = (node, cells) => {
    if (found) return
    const inside = node.type === CELL ? [...cells, node] : cells
    if (node.id === id) {
      cell = inside.at(-1) || null
      found = true
      return
    }
    for (const child of node.children || []) visit(child, inside)
  }
  visit(doc, [])
  return cell
}

// Whether a document has a table, for a kit that wants to know
export function hasTable(doc) {
  let found = false
  walk(doc, (node) => {
    if (found) return false
    if (node.type === TABLE) found = true
  })
  return found
}

// Sets the width or align of the cell's column
export function setColumn(doc, cellId, key, value) {
  const at = position(doc, cellId)
  if (!at) return
  setColumnAt(doc, at.table.id, at.column, key, value)
}

// Sets the width or align of a table's column by its index, as dragging its
// border on the canvas does
export function setColumnAt(doc, tableId, column, key, value) {
  const table = find(doc, tableId)?.node
  if (table?.type !== TABLE) return
  const list = columns(table)
  if (column < 0 || column >= list.length) return
  list[column] = { ...list[column], [key]: value }
}

// Wraps the cell's row in a new Loop or Condition (`type`), in the row's
// place; returns it
export function wrapRow(doc, cellId, type) {
  const at = position(doc, cellId)
  if (!at) return null
  const hit = find(doc, at.row.id)
  remove(doc, at.row.id)
  return insert(doc, hit.parent.id, hit.index, createNode(type, { children: [at.row] }))
}

// The Loops and Conditions among a table's rows, each with the rows it holds,
// for the canvas to mark them: [{ node, depth }], outer ones first
export function rowGroups(table) {
  const found = []
  const visit = (node, depth) => {
    for (const child of node.children || []) {
      if (child.type === ROW || child.type === TABLE || child.type === CELL) continue
      if (rows(child).length) found.push({ node: child, depth })
      visit(child, depth + 1)
    }
  }
  visit(table, 0)
  return found
}
