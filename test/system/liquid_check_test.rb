require "application_system_test_case"

# What's wrong with the Liquid, checked against the demo's variables, filters
# and tags (/?variables=1, VariablesController)
class LiquidCheckTest < ApplicationSystemTestCase
  setup do
    visit "/?variables=1"
    within_canvas { canvas_block("View your order").click }
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
    within_canvas { canvas_block("× {{ line.name }}").click }
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
      canvas_block("We've received order").double_click
      find(".ProseMirror").send_keys(:end, " {% if order.numbr %}")
      assert_selector ".ProseMirror .tess-liquid-error", text: "numbr", exact_text: true
      assert_equal "order has no numbr\n{% if %} isn't closed", find(".ProseMirror .tess-liquid-error", text: "numbr", exact_text: true)["title"]
      assert_selector ".ProseMirror .tess-liquid-error[title=\"{% if %} isn't closed\"]", text: "{% if order."
    end
  end

  test "in an HTML block its Liquid is completed and checked, Enter and Tab choosing before they indent" do
    execute_script(<<~JS)
      const editor = document.querySelector("[data-controller='tess-edit']").tessEdit
      const doc = editor.getDocument()
      doc.children.push({ id: "bhtml", type: "raw", attributes: {}, data: { html: "<p>Hand-written</p>" }, children: [] })
      editor.setDocument(doc)
    JS
    within_canvas { find("p", text: "Hand-written").click }
    html = find("[data-tess-edit-panel='inspect'] textarea")
    html.send_keys(:end, "<p>{{ order.nu")
    assert_selector "[role=listbox] [role=option] span", text: "number", exact_text: true
    html.send_keys(:enter)
    assert_equal "<p>Hand-written</p><p>{{ order.number }}", html.value

    html.send_keys("{% if order.numbr %}")
    within(field("HTML")) do
      assert_selector ".tess-liquid-problems", text: "order has no numbr"
      assert_selector ".tess-liquid-problems", text: "{% if %} isn't closed"
    end
  end

  test "a filter without an argument it needs" do
    setting("Link").set("{{ order.placed_at | date }}")
    within(field("Link")) { assert_selector ".tess-liquid-problems", text: "date needs 1 argument" }
  end

  private

  def field(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..")
  end
end
