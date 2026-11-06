import { VERTICAL_ALIGN, background, border, padding } from "tess_edit/blocks/fields"

export default {
  type: "column",
  name: "Column",
  icon: "column",
  category: "layout",
  roles: ["column"],
  accepts: ["content"],
  defaults: () => ({ attributes: {} }),
  fields: [
    {
      title: "Column",
      fields: [
        { key: "attributes.width", label: "Width", type: "text", placeholder: "Auto", hint: "In px or %, e.g. 50%." },
        { key: "attributes.vertical-align", label: "Vertical align", type: "segmented", options: VERTICAL_ALIGN },
        background,
        padding
      ]
    },
    border
  ],
  render: { mjml: (node, { container }) => container("mj-column", node) }
}
