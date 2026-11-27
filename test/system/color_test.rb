require "application_system_test_case"

class ColorTest < ApplicationSystemTestCase
  setup do
    visit "/"
    within_canvas { find("div", text: "ACME STORE", exact_text: true, match: :first).click }
    2.times { find(".tess-edit button[title='Select parent']").click }
    assert_selector ".tess-edit h2", text: "Section"
  end

  def section_node
    blocks_of(document_json).find { |node| node["type"] == "section" }
  end

  def blocks_of(node)
    [node] + Array(node["children"]).flat_map { |child| blocks_of(child) }
  end

  def background
    find("[data-tess-edit-panel='inspect'] span", text: "Background", exact_text: true).find(:xpath, "..")
  end

  def slide(percent)
    background.find("input[type='range']").execute_script("this.value = arguments[0]; this.dispatchEvent(new Event('input', { bubbles: true }))", percent)
  end

  test "a section's background gets an opacity, down to transparent, and back to its color" do
    background.find("input[type='text']").fill_in(with: "#2563eb")
    within(background) { assert_text "100%" }

    slide(50)

    eventually { assert_equal "rgba(37, 99, 235, 0.5)", section_node.dig("attributes", "background-color") }
    assert_equal "rgba(37, 99, 235, 0.5)", background.find("input[type='text']").value
    within(background) { assert_text "50%" }

    slide(0)
    eventually { assert_equal "rgba(37, 99, 235, 0)", section_node.dig("attributes", "background-color") }

    slide(100)
    eventually { assert_equal "#2563eb", section_node.dig("attributes", "background-color") }
  end

  test "a color it can't read, such as Liquid, has no opacity to slide" do
    background.find("input[type='text']").fill_in(with: "{{ brand.color }}")

    assert background.find("input[type='range']").disabled?
    background.find("input[type='text']").fill_in(with: "rgba(0, 0, 0, 0.25)")
    assert_not background.find("input[type='range']").disabled?
    within(background) { assert_text "25%" }
  end
end
