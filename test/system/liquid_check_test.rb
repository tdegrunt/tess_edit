require "application_system_test_case"

# What's wrong with the Liquid, checked against the demo's variables, filters
# and tags (/?variables=1, VariablesController)
class LiquidCheckTest < ApplicationSystemTestCase
  setup do
    visit "/?variables=1"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
  end

  test "under a field what's wrong with its Liquid, until it's put right" do
    link = setting("Link")
    link.set("{{ ordr.number }}{% if order.number %}")
    within(field("Link")) do
      assert_selector ".tess-liquid-problems", text: "There's no variable ordr"
      assert_selector ".tess-liquid-problems", text: "{% if %} isn't closed"
    end
    assert_equal "true", link["aria-invalid"]

    link.set("{{ order.number }}")
    within(field("Link")) { assert_no_selector ".tess-liquid-problems", visible: true }
    assert_nil setting("Link")["aria-invalid"]
  end

  test "a filter given too many arguments, a value a variable can't have" do
    link = setting("Link")
    link.set('{{ order.order_lines | where: "kind", "product", "x" | first }}{% for line in order.order_lines %}{% if line.kind == "shiping" %}{% endif %}{% endfor %}')
    within(field("Link")) do
      assert_selector ".tess-liquid-problems", text: "where takes 2 arguments, not 3"
      assert_selector ".tess-liquid-problems", text: 'line.kind is never "shiping"'
    end
  end

  test "a Loop's collection, and the mark in Layers" do
    within_canvas { find("td[class^='tess-']", text: "× {{ line.name }}").click }
    find(".tess-edit button[title='Select parent']").click
    collection = setting("Collection")
    collection.set("order.ordr_lines")
    within(field("Collection")) { assert_selector ".tess-liquid-problems", text: "order has no ordr_lines" }

    click_on "Layers"
    assert_selector "[role=treeitem] .tess-liquid-mark[title='order has no ordr_lines']"
    collection.set("order.order_lines")
    assert_no_selector "[role=treeitem] .tess-liquid-mark[title='order has no ordr_lines']"
  end

  test "in text on the canvas a wavy line under what's wrong, the reason on hover" do
    within_canvas do
      find("td[class^='tess-']", text: "We've received order").double_click
      find(".ProseMirror").send_keys(:end, " {% if order.numbr %}")
      assert_selector ".ProseMirror .tess-liquid-error", text: "numbr", exact_text: true
      assert_equal "order has no numbr\n{% if %} isn't closed", find(".ProseMirror .tess-liquid-error", text: "numbr", exact_text: true)["title"]
      assert_selector ".ProseMirror .tess-liquid-error[title=\"{% if %} isn't closed\"]", text: "{% if order."
    end
  end

  private

  def field(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..")
  end
end
