# The demo's variables (the editor's variablesUrl, see core/variables.js): an
# order template's, one level at a time, as Liquidum's VariablesController
# describes a host app's drops.
class VariablesController < ApplicationController
  def self.variable(name, label, type = "string", collection: false, children: false, hint: nil)
    {name: name, label: label, type: type, hint: hint, collection: collection, children: children}.compact
  end

  LEVELS = {
    "" => [
      variable("order", "Order", "object", children: true),
      variable("shop_url", "Shop", hint: "The shop's home page")
    ],
    "order" => [
      variable("customer", "Ordered by", "object", children: true),
      variable("number", "Order number"),
      variable("order_lines", "Order lines", "object", collection: true, children: true),
      variable("placed_at", "Placed at", "datetime"),
      variable("total", "Total", "money", hint: "Including VAT")
    ],
    "order.customer" => [
      variable("email", "Email"),
      variable("logo_url", "Logo", hint: "The customer's company logo"),
      variable("name", "Name")
    ],
    "order.order_lines" => [
      variable("product", "Product", "object", children: true),
      variable("quantity", "Quantity", "integer")
    ],
    "order.order_lines.product" => [
      variable("name", "Name"),
      variable("price", "Price", "money")
    ]
  }.freeze

  def index
    path = params[:path].to_s
    return head(:not_found) unless LEVELS.key?(path)

    render json: {path: path, variables: LEVELS[path]}
  end
end
