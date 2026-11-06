import { ALIGN, background, border, padding } from "tess_edit/blocks/fields"

const section = (createNode, widths) =>
  createNode("section", { children: widths.map((width) => createNode("column", { attributes: width ? { width } : {} })) })

const layouts = [
  ["section-1", "1 column", "cols-1", [null]],
  ["section-2", "2 columns", "cols-2", ["50%", "50%"]],
  ["section-3", "3 columns", "cols-3", ["33.33%", "33.33%", "33.33%"]],
  ["section-4", "4 columns", "cols-4", ["25%", "25%", "25%", "25%"]],
  ["section-1-2", "1 : 2", "cols-12", ["33.33%", "66.67%"]],
  ["section-2-1", "2 : 1", "cols-21", ["66.67%", "33.33%"]]
]

export default {
  type: "section",
  name: "Section",
  icon: "section",
  roles: ["body"],
  accepts: ["column"],
  horizontal: true,
  defaults: () => ({ attributes: { padding: "20px 0px" } }),
  fields: [
    {
      title: "Section",
      fields: [
        background,
        { key: "attributes.background-url", label: "Background image", type: "text" },
        { key: "attributes.full-width", label: "Full width", type: "toggle", on: "full-width", off: "" },
        { key: "attributes.direction", label: "Column order", type: "segmented", options: [{ value: "ltr", label: "Left to right" }, { value: "rtl", label: "Right to left" }] },
        { key: "attributes.text-align", label: "Align", type: "segmented", options: ALIGN },
        padding
      ]
    },
    border
  ],
  palette: layouts.map(([key, label, icon, widths]) => ({ key, label, icon, category: "layout", create: ({ createNode }) => section(createNode, widths) })),
  render: { mjml: (node, { container }) => container("mj-section", node) }
}
