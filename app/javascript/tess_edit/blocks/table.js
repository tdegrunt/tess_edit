// A table: Table › Row › Cell › content, as Section › Column › content, so
// a cell holds any block (Text, Image, …). Rows can be in a Loop or a
// Condition in the table, which take rows there ("inherit"): a Loop around a
// Row prints it for each item, with the item's values in its cells.
//
// The table's columns are data.columns ({ width, align } each), set from a
// selected cell, whose Table group also adds and deletes rows and columns
// (core/table.js, the "table" field in ui/inspector.js).
//
// A kit takes them in with extendBlock and its own render hooks. The table's
// HTML, with its rows and cells, is export/table.js's tableHtml, which an
// email's mj-table and a note's <table> both use; a row and a cell render
// nothing of their own there.

import { ALIGN, VERTICAL_ALIGN, background, padding } from "tess_edit/blocks/fields"
import { plainText } from "tess_edit/blocks/text"
import { newTable } from "tess_edit/core/table"

const tableActions = { key: "data", label: "", type: "table" }

export const table = {
  type: "table",
  name: "Table",
  icon: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 10v9M15 10v9"/>',
  category: "layout",
  // Content, as Text is
  roles: ["content"],
  accepts: ["row"],
  defaults: () => ({ attributes: { padding: "10px 25px" }, data: { columns: [], borderColor: "#d1d5db", borderWidth: "1px", cellPadding: "6px 8px", headingBackground: "#f3f4f6" } }),
  palette: [{ key: "table", label: "Table", category: "layout", create: () => newTable(3, 3, { headings: ["Heading", "Heading", "Heading"] }) }],
  fields: [
    {
      title: "Table",
      fields: [
        { key: "attributes.width", label: "Width", type: "size", placeholder: "100%" },
        { key: "data.borders", label: "Lines", type: "segmented", options: [{ value: "", label: "All" }, { value: "rows", label: "Between rows" }], hint: "Lines around every cell, or only under each row." },
        { key: "data.borderColor", label: "Border color", type: "color" },
        { key: "data.borderWidth", label: "Border width", type: "size", placeholder: "1px", hint: "0 for no borders." },
        { key: "data.cellPadding", label: "Cell padding", type: "spacing" },
        { key: "data.stripe", label: "Every other row", type: "color", hint: "A background for every other row, from the second." },
        padding
      ]
    },
    {
      title: "Heading rows",
      fields: [
        { key: "data.headingBackground", label: "Background", type: "color" },
        { key: "data.headingColor", label: "Text color", type: "color" },
        { key: "data.headingWeight", label: "Font weight", type: "select", options: ["", "400", "500", "600", "700"] }
      ]
    }
  ],
  hint: "Rows of cells. Select a cell to add rows and columns. Put rows in a Loop to repeat them for each item."
}

export const tableRow = {
  type: "table_row",
  name: "Row",
  icon: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M9 9v6M15 9v6"/>',
  roles: ["row"],
  accepts: ["cell"],
  horizontal: true,
  palette: [],
  defaults: () => ({ attributes: {}, data: {} }),
  fields: [
    { title: "Table", fields: [tableActions] },
    {
      title: "Row",
      fields: [
        { key: "data.heading", label: "Heading row", type: "toggle", on: "heading", off: "", hint: "In the heading rows' style. Heading rows at the top repeat on every page." },
        background,
        { key: "data.lineAbove", label: "Line above", type: "size", hint: "A heavier line above the row, e.g. 3pt above a total." }
      ]
    }
  ],
  label: (node) => (node.data.heading ? "Heading row" : "Row")
}

export const tableCell = {
  type: "table_cell",
  name: "Cell",
  icon: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 10h8M8 14h5"/>',
  roles: ["cell"],
  accepts: ["content"],
  palette: [],
  defaults: () => ({ attributes: {}, data: {} }),
  fields: [
    { title: "Table", fields: [tableActions] },
    {
      title: "Cell",
      fields: [
        { key: "attributes.text-align", label: "Align", type: "segmented", options: ALIGN },
        { key: "attributes.vertical-align", label: "Vertical align", type: "segmented", options: VERTICAL_ALIGN },
        background,
        { key: "attributes.color", label: "Text color", type: "color" },
        { ...padding, hint: "Instead of the table's cell padding." },
        { key: "data.colspan", label: "Spans columns", type: "text", placeholder: "1", hint: "How many columns the cell takes, merging it with the cells to its right." }
      ]
    }
  ],
  label(node) {
    const text = (node.children || []).map((child) => plainText(child.data?.content)).join(" ").trim()
    return text ? `Cell · ${text.slice(0, 32)}` : "Cell"
  }
}
