require "application_system_test_case"

# The demo layout at /?lock=1: a header, the demo Content block and a footer,
# with only the Content block's insides and the subject and preview text open.
class LockedEditorTest < ApplicationSystemTestCase
  setup do
    visit "/?lock=1"
    within_canvas { assert_text "ACME STORE" }
  end

  test "a layout block can be selected but not changed" do
    within_canvas { find("td[class^='tess-']", text: "ACME STORE").click }

    assert_selector "[data-tess-edit-panel='inspect']", text: "Part of the layout"
    assert_no_selector "[data-tess-edit-panel='inspect'] [title='Delete']"
    assert setting("Height").disabled?
    within_canvas do
      assert_selector ".tess-label", text: "· Layout"
      assert_no_selector "[data-tool='delete']"
      assert_no_selector ".tess-plus"
    end

    find("body").send_keys(:delete)
    within_canvas do
      find("td[class^='tess-']", text: "ACME STORE").double_click
      assert_no_selector ".ProseMirror"
      assert_text "ACME STORE"
    end
  end

  test "the content can be edited, deleted and added to" do
    within_canvas { find("td[class^='tess-']", text: "this part is the template's own content").click }
    assert_no_text "Part of the layout"
    assert_not setting("Height").disabled?

    within_canvas do
      find("td[class^='tess-']", text: "this part is the template's own content").double_click
      find(".ProseMirror").send_keys(:end, " Edited.")
      find(".ProseMirror").send_keys(:escape)
      assert_text "Edited."
    end

    click_on "Spacer"
    eventually { assert_includes types_in("blcontent"), "spacer" }
    find(".tess-edit [title='Delete']", match: :first).click
    eventually { assert_not_includes types_in("blcontent"), "spacer" }
  end

  test "a tile clicked with a layout block selected goes into the content block" do
    within_canvas { find("td[class^='tess-']", text: "ACME STORE").click }
    click_on "2 columns"

    eventually do
      content = node("blcontent")
      assert_equal ["section", "section"], content["children"].map { |child| child["type"] }
      assert_equal 2, content["children"].last["children"].size
    end
    assert_equal %w[section content section], document_json["children"].map { |child| child["type"] }
  end

  test "of the root only the subject and preview text can change" do
    click_on "Inspect"
    assert_selector ".tess-edit h2", text: "Root"
    assert_not setting("Subject").disabled?
    assert_not setting("Preview text").disabled?
    assert setting("Width").disabled?

    setting("Subject").fill_in(with: "Order {{ order.number }} shipped")
    eventually { assert_equal "Order {{ order.number }} shipped", document_json.dig("data", "subject") }
  end

  test "layout rows in Layers are locked and can't be dragged" do
    click_on "Layers"
    header = find("[role=treeitem]", text: "ACME STORE")
    assert header.has_selector?("[title='Part of the layout']")
    assert_not_equal "true", header[:draggable]
    assert_equal "true", find("[role=treeitem]", text: "Hi {{ customer")[:draggable]
    content = find("[role=treeitem]", text: "Template content")
    assert_not_equal "true", content[:draggable]
    assert content.has_no_selector?("[title='Part of the layout']")
  end

  test "the code dialog shows the JSON but doesn't load it" do
    click_on "Code"
    assert find(".tess-edit textarea").readonly?
    assert_no_button "Load this JSON"
  end

  private

  def node(id, from = document_json)
    return from if from["id"] == id
    from["children"].each do |child|
      found = node(id, child)
      return found if found
    end
    nil
  end

  def types_in(id)
    blocks(node(id)).map(&:first)
  end
end
