// A table (blocks/table.js) as HTML, for a kit whose tables are HTML: the
// email's mj-table, which MJML copies as it is, so a cell's blocks are HTML
// too, not MJML. Its styles are inline, as mail clients need: borders,
// padding and heading rows on each cell.
//
//   tableHtml(node, { editor, richText, escapeText, escapeAttribute })
//   // → "<colgroup>…</colgroup><thead>…</thead><tbody>…</tbody>"
//
// A cell's blocks are rendered here (cellBlock): Text, Image, Button,
// Divider, Spacer, Loop, Condition, Assign and tables; others show nothing.
// With editor, every element has its tess-<id> class, an empty container a
// placeholder that fits there, and Liquid tags are left out, so a Loop's
// rows show once.

import { t } from "tess_edit/core/i18n"
import { span } from "tess_edit/core/table"

const ROW = "table_row"
const PLACEHOLDER = "padding:12px;text-align:center;color:#94a3b8;font-size:13px;font-family:system-ui,sans-serif"

function style(declarations) {
  const css = Object.entries(declarations)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => `${name}:${value}`)
    .join(";")
  return css ? ` style="${css.replace(/"/g, "&quot;")}"` : ""
}

const classes = (node, ctx) => (ctx.editor ? ` class="tess-${node.id}"` : "")

// The table's rows, also in its Loops and Conditions, for the column count
function rowsOf(node) {
  return (node.children || []).flatMap((child) => (child.type === ROW ? [child] : ["table", "table_cell"].includes(child.type) ? [] : rowsOf(child)))
}

function columnsOf(table) {
  const list = Array.isArray(table.data?.columns) ? table.data.columns : []
  const widest = Math.max(0, ...rowsOf(table).map((row) => (row.children || []).reduce((sum, cell) => sum + span(cell), 0)))
  return Array.from({ length: Math.max(list.length, widest) }, (_, i) => list[i] || {})
}

export function tableHtml(table, ctx) {
  const d = table.data || {}
  const columns = columnsOf(table)
  const line = `${d.borderWidth || "1px"} solid ${d.borderColor || "#d1d5db"}`
  const look = {
    // Around every cell, or only under each row
    border: d.borders === "rows" ? { "border-bottom": line } : { border: line },
    lineAbove: (width) => (d.borders === "rows" ? { "border-top": `${width} solid ${d.borderColor || "#d1d5db"}` } : { "border-top-width": width }),
    padding: d.cellPadding || "6px 8px",
    heading: { "background-color": d.headingBackground, color: d.headingColor, "font-weight": d.headingWeight || "bold" },
    stripe: d.stripe,
    columns
  }
  const kids = table.children || []
  const heading = []
  for (const kid of kids) {
    if (kid.type !== ROW || !kid.data?.heading) break
    heading.push(kid)
  }
  const state = { body: 0 }
  const head = heading.map((row) => rowHtml(row, ctx, look, null))
  let body = kids.slice(heading.length).map((kid) => between(kid, ctx, look, state))
  if (!kids.length && ctx.editor) body = [placeholderRow(table, columns.length)]
  const widths = columns.some((column) => column.width) ? `<colgroup>${columns.map((column) => `<col${style({ width: column.width })}>`).join("")}</colgroup>` : ""
  return [widths, head.length ? `<thead>${head.join("")}</thead>` : "", `<tbody>${body.join("\n")}</tbody>`].join("")
}

function placeholderRow(node, count) {
  return `<tr><td class="tessph-${node.id}" colspan="${Math.max(count, 1)}" style="${PLACEHOLDER}">${t("Drop a row here")}</td></tr>`
}

// What is between a table's rows: a Row, or a Loop, Condition or Assign
function between(node, ctx, look, state) {
  if (node.type === ROW) return rowHtml(node, ctx, look, state)
  const inner = () => {
    if (!(node.children || []).length && ctx.editor) return [placeholderRow(node, look.columns.length)]
    return node.children.map((child) => between(child, ctx, look, state))
  }
  const [open, close] = liquidTags(node)
  if (open === null) return ""
  if (ctx.editor) return node.type === "assign" ? "" : inner().join("\n")
  return node.type === "assign" ? open : [open, ...inner(), close].join("\n")
}

function liquidTags(node) {
  const d = node.data || {}
  if (node.type === "loop") return [`{% for ${d.variable || "item"} in ${d.collection || "items"} %}`, "{% endfor %}"]
  if (node.type === "condition") return [`{% if ${d.expression || "true"} %}`, "{% endif %}"]
  if (node.type === "assign") return [`{% assign ${d.variable || "value"} = ${d.expression || "nil"} %}`, ""]
  return [null, null]
}

function rowHtml(row, ctx, look, state) {
  const heading = !!row.data?.heading
  // Stripes on every other body row; a Loop's row counts once, as it can't
  // know how many it will be
  const striped = state && !heading && look.stripe && state.body++ % 2 === 1
  let start = 0
  const cells = (row.children || []).map((cell) => {
    const column = look.columns[start] || {}
    start += span(cell)
    return cellHtml(cell, ctx, look, { row, column, heading, striped })
  })
  if (!cells.length && ctx.editor) cells.push(`<td class="tessph-${row.id}" style="${PLACEHOLDER}">${t("Drop a cell here")}</td>`)
  return `<tr${classes(row, ctx)}>${cells.join("")}</tr>`
}

function cellHtml(cell, ctx, look, { row, column, heading, striped }) {
  const a = cell.attributes || {}
  const tag = heading ? "th" : "td"
  const declarations = {
    ...look.border,
    ...(row.data?.lineAbove ? look.lineAbove(row.data.lineAbove) : {}),
    padding: a.padding || look.padding,
    "text-align": a["text-align"] || column.align || "left",
    "vertical-align": a["vertical-align"] || "top",
    ...(heading ? look.heading : {}),
    "background-color": a["background-color"] || row.attributes?.["background-color"] || (heading ? look.heading["background-color"] : striped ? look.stripe : undefined),
    color: a.color || (heading ? look.heading.color : undefined)
  }
  const colspan = span(cell) > 1 ? ` colspan="${span(cell)}"` : ""
  const kids = cell.children || []
  const inner = !kids.length && ctx.editor ? `<div class="tessph-${cell.id}" style="${PLACEHOLDER}">${t("Drop content here")}</div>` : kids.map((child) => cellBlock(child, ctx)).join("")
  return `<${tag}${classes(cell, ctx)}${colspan}${style(declarations)}>${inner}</${tag}>`
}

// A block in a cell, as HTML
export function cellBlock(node, ctx) {
  const a = node.attributes || {}
  const d = node.data || {}
  const children = () => {
    if (!(node.children || []).length && ctx.editor) return `<div class="tessph-${node.id}" style="${PLACEHOLDER}">${t("Drop content here")}</div>`
    return node.children.map((child) => cellBlock(child, ctx)).join("")
  }
  switch (node.type) {
    case "text":
      return `<div${classes(node, ctx)}${style({ padding: a.padding, "text-align": a.align, color: a.color, "font-family": a["font-family"], "font-size": a["font-size"], "font-weight": a["font-weight"], "line-height": a["line-height"], "background-color": a["container-background-color"] })}>${ctx.richText(d.content)}</div>`
    case "image": {
      const image = `<img src="${ctx.escapeAttribute(a.src || "")}" alt="${ctx.escapeAttribute(a.alt || "")}"${style({ display: "block", width: a.width, "max-width": "100%", height: "auto", border: "0" })}>`
      const linked = a.href ? `<a href="${ctx.escapeAttribute(a.href)}">${image}</a>` : image
      return `<div${classes(node, ctx)}${style({ padding: a.padding, "text-align": a.align })}>${linked}</div>`
    }
    case "button":
      return `<div${classes(node, ctx)}${style({ padding: a.padding, "text-align": a.align })}><a href="${ctx.escapeAttribute(a.href || "#")}"${style({ display: "inline-block", "background-color": a["background-color"] || "#414141", color: a.color || "#ffffff", padding: a["inner-padding"] || "10px 25px", "border-radius": a["border-radius"] || "3px", "font-size": a["font-size"], "font-weight": a["font-weight"], "text-decoration": "none" })}>${ctx.escapeText(d.content || "")}</a></div>`
    case "divider":
      return `<div${classes(node, ctx)}${style({ padding: a.padding })}><div${style({ "border-top": `${a["border-width"] || "1px"} ${a["border-style"] || "solid"} ${a["border-color"] || "#000000"}` })}></div></div>`
    case "spacer":
      return `<div${classes(node, ctx)}${style({ height: a.height || "20px" })}></div>`
    case "table":
      return `<div${classes(node, ctx)}${style({ padding: a.padding })}><table${style({ width: a.width || "100%", "border-collapse": "collapse" })}>${tableHtml(node, ctx)}</table></div>`
    case "loop":
    case "condition":
    case "assign": {
      const [open, close] = liquidTags(node)
      if (node.type === "assign") return ctx.editor ? "" : open
      return ctx.editor ? children() : `${open}${children()}${close}`
    }
    default:
      return ""
  }
}
