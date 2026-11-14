require "application_system_test_case"

# A kit of the host's own: the demo's Note (test/dummy/app/javascript/kits/note.js),
# which brings TessEdit's blocks in with extendBlock.
class KitTest < ApplicationSystemTestCase
  setup do
    visit "/?kit=note"
    within_canvas("Note") { assert_text "Hello {{ name }}" }
  end

  test "the editor is the kit's, with its outputs in the inputs" do
    assert_selector ".tess-edit", text: "Note"
    eventually do
      assert_equal "note", document_json["type"]
      assert_includes output("html"), "<h1 style=\"margin:0 0 12px\">A note</h1>"
    end
    assert_equal "", output("mjml")
    assert_no_match(/tess-b/, output("html"))
    assert_no_selector "button[title='Mobile']"
  end

  test "it offers the kit's blocks only" do
    within(".tess-edit") do
      assert_selector "button", text: "Text"
      assert_selector "button", text: "Divider"
      assert_selector "button", text: "Content"
      assert_no_selector "button", text: "1 column"
      assert_no_selector "button", text: "Button"
      assert_no_selector "button", text: "Hero"
    end
  end

  test "text is edited on the canvas, and blocks are added from the palette" do
    within_canvas("Note") do
      find("div[class^='tess-']", text: "Hello {{ name }}").double_click
      find(".ProseMirror").send_keys(:end, ", welcome")
      find(".ProseMirror").send_keys(:escape)
      assert_no_selector ".ProseMirror"
    end
    eventually { assert_includes output("html"), "Hello {{ name }}, welcome" }

    within(".tess-edit") { click_on "Divider" }
    eventually { assert_includes output("html"), "<hr>" }
  end

  test "the kit's root has its own settings" do
    setting("Title").fill_in(with: "Shopping list")
    eventually { assert_includes output("html"), "<title>Shopping list</title>" }
  end

  test "a block's parts are each edited on the canvas, a plain one as one line" do
    within(".tess-edit") { click_on "Card" }
    within_canvas("Note") do
      find("strong[data-tess-edit-field='data.title']").double_click
      title = find("strong[data-tess-edit-field='data.title'][contenteditable]")
      title.send_keys(:end, " for you", :enter)
      assert_no_selector "[contenteditable]"

      find("[data-tess-edit-field='data.body']").double_click
      find(".ProseMirror").send_keys(:end, ", and more")
      find(".ProseMirror").send_keys(:escape)
      assert_no_selector ".ProseMirror"
    end
    eventually do
      assert_includes output("html"), "<strong>A card for you</strong>"
      assert_includes output("html"), "Its text, and more"
    end
    assert_equal "A card for you", setting("Title").value
  end

  test "the kit's root has a part edited on the canvas too" do
    within_canvas("Note") do
      find("h1", text: "A note").click
      find("h1[contenteditable]").send_keys(:end, " to self", :enter)
      assert_no_selector "[contenteditable]"
    end
    eventually { assert_includes output("html"), "<title>A note to self</title>" }
    assert_equal "A note to self", setting("Title").value
  end

  test "a field type of the host's edits its value" do
    within(".tess-edit") { click_on "Card" }
    within("[data-tess-edit-panel='inspect']") { click_on "5 stars" }
    eventually { assert_includes output("html"), "★★★★★" }
    within("[data-tess-edit-panel='inspect']") { assert_selector "button[title='5 stars'][aria-pressed='true']" }
  end
end
