import { background, border, padding } from "tess_edit/blocks/fields"

export default {
  type: "wrapper",
  name: "Wrapper",
  icon: "wrapper",
  category: "layout",
  roles: ["wrapper"],
  accepts: ["body"],
  defaults: () => ({ attributes: { padding: "20px 0px", "background-color": "#ffffff" } }),
  fields: [
    { title: "Wrapper", fields: [background, { key: "attributes.background-url", label: "Background image", type: "text" }, { key: "attributes.full-width", label: "Full width", type: "toggle", on: "full-width", off: "" }, padding] },
    border
  ],
  palette: [
    {
      key: "wrapper",
      label: "Wrapper",
      create: ({ createNode }) => createNode("wrapper", { children: [createNode("section", { children: [createNode("column")] })] })
    }
  ],
  render: { mjml: (node, { container }) => container("mj-wrapper", node) }
}
