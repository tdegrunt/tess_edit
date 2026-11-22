# The demo's variables (the editor's variablesUrl, see core/variables.js): an
# order template's, one level at a time, as Liquidum's VariablesController
# describes a host app's drops.
class VariablesController < ApplicationController
  def self.variable(name, label, type = "string", collection: false, children: false, hint: nil, values: nil)
    {name: name, label: label, type: type, hint: hint, collection: collection, children: children, values: values}.compact
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
      variable("kind", "Kind", values: [{value: "product", label: "Product"}, {value: "shipping", label: "Shipping"}]),
      variable("product", "Product", "object", children: true),
      variable("quantity", "Quantity", "integer")
    ],
    "order.order_lines.product" => [
      variable("name", "Name"),
      variable("price", "Price", "money")
    ]
  }.freeze

  # The filters (the editor's filtersUrl), some of them, as Liquidum's FiltersController gives them
  # The app's own date formats, as Liquidum gives them from date.formats and time.formats
  FORMATS = [{value: "%e %B %Y", label: "Date, long"}, {value: "%d-%m-%Y", label: "Date, default"}].freeze

  FILTERS = [
    {name: "date", label: "Date in a format", arguments: [{name: "format", kind: "format", values: FORMATS}]},
    {name: "first", label: "The first item", arguments: [], keeps: "item"},
    {name: "localize", label: "In a language", arguments: [{name: "locale", kind: "locale", values: [{value: "en", label: "en"}, {value: "nl", label: "nl"}]}, {name: "format", kind: "format"}]},
    {name: "money", label: "As money", arguments: []},
    {name: "sort", label: "Sorted", arguments: [{name: "property", kind: "property"}], keeps: "collection"},
    {name: "upcase", label: "In capitals", arguments: []},
    {name: "where", label: "Those whose property has the value", arguments: [{name: "property", kind: "property"}, {name: "value", kind: "value"}], keeps: "collection"}
  ].freeze

  def filters
    render json: {filters: FILTERS}
  end

  # The tags (the editor's tagsUrl), as Liquidum's TagsController gives them
  TAGS = [
    {name: "assign", label: "Sets a variable", syntax: "assign variable = value", block: false},
    {name: "case", label: "One of several, by a variable's value", syntax: "case variable", block: true},
    {name: "comment", label: "Not shown", syntax: "comment", block: true},
    {name: "for", label: "For each item", syntax: "for item in collection", block: true},
    {name: "if", label: "Only when a condition holds", syntax: "if condition", block: true},
    {name: "unless", label: "Only when a condition doesn't hold", syntax: "unless condition", block: true}
  ].freeze

  def tags
    render json: {tags: TAGS}
  end

  def index
    path = params[:path].to_s
    return head(:not_found) unless LEVELS.key?(path)

    render json: {path: path, variables: LEVELS[path]}
  end
end
