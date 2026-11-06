export default {
  type: "condition",
  name: "Condition",
  icon: "condition",
  category: "liquid",
  roles: ["body", "content"],
  accepts: "inherit",
  defaults: () => ({ data: { expression: "customer.vip" } }),
  fields: [{ title: "Condition", fields: [{ key: "data.expression", label: "Show when", type: "text", hint: "A Liquid condition, e.g. order.total > 100." }] }],
  hint: "Shows its blocks only when the condition is true: {% if expression %}.",
  label: (node) => `If ${node.data.expression || "…"}`,
  render: {
    mjml: (node, { liquid }) => liquid(node, `{% if ${node.data.expression || "true"} %}`, "{% endif %}")
  }
}
