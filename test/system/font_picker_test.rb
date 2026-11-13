require "application_system_test_case"

class FontPickerTest < ApplicationSystemTestCase
  setup do
    visit "/"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
  end

  test "a font field lists the fonts, each in itself, and finds one by its name" do
    font_field.find("button[aria-haspopup='listbox']").click
    within("[role=listbox][aria-label='Fonts']") do
      assert_selector "[role=option]", text: "Inherit"
      assert_equal "Georgia, serif", find("[role=option]", text: "Georgia").evaluate_script("this.style.fontFamily").delete('"')
    end

    find("input[placeholder='Search fonts']").send_keys("cour", :enter)
    assert_no_selector "[role=listbox][aria-label='Fonts']"
    assert_selector "button[aria-haspopup='listbox']", text: "Courier New"
    eventually { assert_equal "'Courier New', Courier, monospace", button_node.dig("attributes", "font-family") }

    font_field.find("button[aria-haspopup='listbox']").click
    find("[role=option]", text: "Inherit").click
    eventually { assert_nil button_node.dig("attributes", "font-family").presence }
  end

  private

  def font_field
    find("[data-tess-edit-panel='inspect'] span", text: "Font family", exact_text: true).find(:xpath, "..")
  end

  def button_node(node = document_json)
    return node if node["type"] == "button"
    node["children"].each do |child|
      found = button_node(child)
      return found if found
    end
    nil
  end
end
