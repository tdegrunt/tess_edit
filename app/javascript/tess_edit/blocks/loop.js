const forTag = (node) => `{% for ${node.data.variable || "item"} in ${node.data.collection || "items"} %}`

export default {
  type: "loop",
  name: "Loop",
  icon: "loop",
  category: "liquid",
  roles: ["body", "content"],
  accepts: "inherit",
  defaults: () => ({ data: { variable: "item", collection: "items" } }),
  fields: [
    {
      title: "Loop",
      fields: [
        { key: "data.variable", label: "Variable", type: "text", hint: "The name each item gets, e.g. line." },
        { key: "data.collection", label: "Collection", type: "text", liquid: "collection", hint: "What to loop over, e.g. invoice.lines." }
      ]
    }
  ],
  hint: "Repeats its blocks for each item: {% for variable in collection %}.",
  label: (node) => `For ${node.data.variable || "item"} in ${node.data.collection || "…"}`,
  render: {
    mjml: (node, { liquid }) => liquid(node, forTag(node), "{% endfor %}")
  }
}
