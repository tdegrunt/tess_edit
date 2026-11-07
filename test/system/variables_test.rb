require "application_system_test_case"

class VariablesTest < ApplicationSystemTestCase
  setup do
    visit "/?variables=1"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
  end

  test "typing {{ in a field suggests the variables, one level at a time" do
    link = setting("Link")
    link.set("")
    link.send_keys("{{ or")
    assert_option "order"
    assert_equal ["order"], option_names

    link.send_keys(:enter)
    assert_equal "{{ order.", link.value
    assert_option "number"

    link.send_keys("nu", :enter)
    assert_equal "{{ order.number }}", link.value
    assert_no_selector "[role=listbox]"
    eventually { assert_equal "{{ order.number }}", button_node.dig("attributes", "href") }
  end

  test "Enter before the suggestions arrive chooses from them, and doesn't submit the form" do
    link = setting("Link")
    link.set("")
    link.send_keys("{{ order.cu", :enter)
    eventually { assert_equal "{{ order.customer.", link.value }
    assert_option "email"
    link.send_keys("em", :enter)
    assert_equal "{{ order.customer.email }}", link.value
    assert_current_path "/?variables=1"
  end

  test "a collection offers its first and last item and its size" do
    link = setting("Link")
    link.set("")
    link.send_keys("{{ order.order_lines.")
    assert_option "size"
    assert_equal %w[first last size], option_names

    link.send_keys(:enter)
    assert_equal "{{ order.order_lines.first.", link.value
    assert_option "quantity"
    assert_equal %w[product quantity], option_names
  end

  test "arrow keys choose, Escape closes" do
    label = setting("Label")
    label.set("")
    label.send_keys("{{ order.")
    assert_option "total"
    label.send_keys(:down, :enter)
    assert_equal "{{ order.number }}", label.value

    label.send_keys(" {{ shop")
    assert_selector "[role=option]"
    label.send_keys(:escape)
    assert_no_selector "[role=listbox]"
  end

  test "the { } button browses the variables and inserts one" do
    field("Link").click_on("{ }")
    within("[role=listbox]") { click_on "Order" }
    within("[role=listbox]") { click_on "Ordered by" }
    within("[role=listbox]") { click_on "Logo" }

    assert_equal "{{ order.url }}{{ order.customer.logo_url }}", setting("Link").value
    assert_no_selector "[role=listbox]"
  end

  test "a Loop's collection ends at a collection, and its blocks can use its variable" do
    within_canvas { find("td[class^='tess-']", text: "× {{ line.name }}").click }
    find(".tess-edit button[title='Select parent']").click
    assert_selector ".tess-edit h2", text: "For line in order.lines"
    collection = setting("Collection")
    collection.set("")
    collection.send_keys("order.ord")
    assert_option "order_lines"
    collection.send_keys(:enter)
    assert_equal "order.order_lines", collection.value
    assert_no_selector "[role=listbox]"

    within_canvas do
      find("td[class^='tess-']", text: "× {{ line.name }}").double_click
      find(".ProseMirror").send_keys(:end, " {{ line.")
    end
    assert_option "quantity"
    assert_equal %w[product quantity], option_names
    within_canvas { find(".ProseMirror").send_keys("pro", :enter) }
    assert_option "price"
    within_canvas { find(".ProseMirror").send_keys("na", :enter) }
    within_canvas { assert_text "{{ line.product.name }}" }
  end

  test "typing {{ in text on the canvas suggests the variables" do
    within_canvas do
      find("td[class^='tess-']", text: "We've received order").double_click
      find(".ProseMirror").send_keys(:end, " {{ order.cu")
    end
    assert_option "customer"
    assert_equal ["customer"], option_names

    within_canvas { find(".ProseMirror").send_keys(:enter) }
    assert_option "logo_url"
    within_canvas { find(".ProseMirror").send_keys("em", :enter) }
    within_canvas { assert_text "{{ order.customer.email }}" }
  end

  test "the text toolbar's { } button inserts a variable" do
    within_canvas do
      find("td[class^='tess-']", text: "We've received order").double_click
      find(".ProseMirror").send_keys(:end, " Shop at ")
    end
    find(".tess-edit button[title='Insert a variable']").click
    within("[role=listbox]") { click_on "Shop" }
    within_canvas { assert_text "Shop at {{ shop_url }}" }
  end

  test "without a variablesUrl there are no suggestions or buttons" do
    visit "/"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    setting("Link").send_keys(" {{ or")
    assert_no_selector "[role=listbox]"
    assert_no_selector ".tess-edit button[title='Insert a variable']"
  end

  private

  # Waits for an option with this variable name in the menu
  def assert_option(name)
    assert_selector "[role=listbox] [role=option] span", text: name, exact_text: true
  end

  def options
    all("[role=listbox] [role=option]", minimum: 1)
  end

  def option_names
    options.map { |option| option.all("span")[1].text }
  end

  def field(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..")
  end

  def button_node(node = document_json)
    return node if node["type"] == "button"
    Array(node["children"]).lazy.map { |child| button_node(child) }.find(&:itself)
  end
end
