import { align, padding } from "tess_edit/blocks/fields"

export default {
  type: "divider",
  name: "Divider",
  icon: "divider",
  category: "content",
  roles: ["content"],
  defaults: () => ({ attributes: { "border-color": "#e5e7eb", "border-width": "1px", padding: "10px 25px" } }),
  fields: [
    {
      title: "Divider",
      fields: [
        { key: "attributes.border-color", label: "Color", type: "color" },
        { key: "attributes.border-width", label: "Thickness", type: "size" },
        { key: "attributes.border-style", label: "Style", type: "segmented", options: [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }] },
        { key: "attributes.width", label: "Width", type: "text", placeholder: "100%" },
        align,
        padding
      ]
    }
  ],
  render: { mjml: (node, { element }) => element("mj-divider", node) }
}
