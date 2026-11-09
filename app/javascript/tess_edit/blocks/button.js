import { align, border, padding, typography } from "tess_edit/blocks/fields"

export default {
  type: "button",
  name: "Button",
  icon: "button",
  category: "content",
  roles: ["content"],
  defaults: () => ({
    attributes: { href: "#", "background-color": "#2563eb", color: "#ffffff", "border-radius": "6px", "inner-padding": "12px 24px", padding: "10px 25px", "font-weight": "600" },
    data: { content: "Click here" }
  }),
  fields: [
    {
      title: "Button",
      fields: [
        { key: "data.content", label: "Label", type: "text", liquid: true },
        { key: "attributes.href", label: "Link", type: "text", liquid: true },
        { key: "attributes.target", label: "Open in", type: "segmented", options: [{ value: "_blank", label: "New tab" }, { value: "_self", label: "Same tab" }] },
        { key: "attributes.background-color", label: "Button color", type: "color" },
        { key: "attributes.width", label: "Width", type: "size", placeholder: "Auto" },
        align,
        { key: "attributes.inner-padding", label: "Inner padding", type: "spacing" },
        padding
      ]
    },
    typography(),
    border
  ],
  label: (node) => `Button · ${node.data.content || ""}`,
  render: {
    mjml: (node, { element, escapeText }) => element("mj-button", node, escapeText(node.data.content))
  }
}
