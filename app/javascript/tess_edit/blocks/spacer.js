export default {
  type: "spacer",
  name: "Spacer",
  icon: "spacer",
  category: "content",
  roles: ["content"],
  defaults: () => ({ attributes: { height: "24px" } }),
  fields: [{ title: "Spacer", fields: [{ key: "attributes.height", label: "Height", type: "size" }, { key: "attributes.container-background-color", label: "Background", type: "color" }] }],
  render: {
    mjml: (node, { element }) => element("mj-spacer", node)
  }
}
