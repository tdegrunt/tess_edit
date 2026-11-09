require "application_system_test_case"

# Tiles from a palette source: the demo's snippets (test/dummy/app/javascript/snippets.js),
# inserted as a copy that knows where it came from. And the blocks a host allows.
class SnippetsTest < ApplicationSystemTestCase
  def find_node(id, node = document_json, parent = nil)
    return [node, parent] if node["id"] == id
    node["children"].each do |child|
      found = find_node(id, child, node)
      return found if found
    end
    nil
  end

  def copy_of(origin)
    walk = ->(node) { (node["origin"] == origin) ? node : node["children"].lazy.map(&walk).find(&:itself) }
    walk.call(document_json)
  end

  setup do
    visit "/?snippets=1"
    within_canvas { assert_text "ACME STORE" }
  end

  test "a snippet goes after the selected block as a copy that knows where it came from" do
    within_canvas { find("td[class^='tess-']", text: "ACME STORE").click }
    within("[data-tess-edit-source='snippets']") { click_on "Greeting" }

    copy = nil
    eventually { assert(copy = copy_of("bgreet1")) }
    assert_not_equal "bgreet1", copy["id"]
    assert_equal "column", find_node(copy["id"])[1]["type"]
    within_canvas { assert_text "Dear {{ customer.name }}," }
  end

  test "a snippet goes where it fits" do
    within_canvas { find("td[class^='tess-']", text: "ACME STORE").click }
    within("[data-tess-edit-source='snippets']") { click_on "Footer" }

    copy = nil
    eventually { assert(copy = copy_of("bfoot1")) }
    assert_equal "email", find_node(copy["id"])[1]["type"], "a section doesn't go in a column"
    assert_equal "bfoot3", copy.dig("children", 0, "children", 0, "origin")
  end

  test "a duplicated copy is new content" do
    within_canvas { find("td[class^='tess-']", text: "ACME STORE").click }
    within("[data-tess-edit-source='snippets']") { click_on "Greeting" }
    within_canvas { find("td[class^='tess-']", text: "Dear {{ customer.name }},").click }
    find("[data-tess-edit-panel='inspect'] [title='Duplicate']").click

    eventually { assert_equal 2, blocks.count { |type, label| type == "text" && label == "Dear {{ customer.name }}," } }
    assert copy_of("bgreet1")
  end

  test "without the source's settings there are no snippets" do
    visit "/"
    within_canvas { assert_text "ACME STORE" }
    assert_no_selector "[data-tess-edit-source='snippets']"
  end

  test "the host can limit the blocks on offer" do
    visit "/?blocks=text,image"
    within(".tess-edit") do
      assert_selector "button", text: "Text"
      assert_selector "button", text: "Image"
      assert_no_selector "button", text: "Divider"
      assert_no_selector "button", text: "Content"
    end
  end
end
