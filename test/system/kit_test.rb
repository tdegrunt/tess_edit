require "application_system_test_case"

# A kit of the host's own: the demo's Note (test/dummy/app/javascript/kits/note.js),
# which brings TessEdit's blocks in with extendBlock and has blocks of its own.
class KitTest < ApplicationSystemTestCase
  setup do
    visit "/?kit=note"
    within_canvas { assert_text "Thanks for your order" }
  end

  test "the editor is the kit's, with its outputs in the inputs" do
    assert_selector ".tess-edit", text: "Note"
    eventually do
      assert_equal "note", document_json["type"]
      assert_includes output("html"), "<h1 style=\"margin:0 0 12px\">Order {{ order.number }}</h1>"
    end
    assert_no_match(/tess-b/, output("html"))
    assert_no_selector "button[title='Mobile']"
  end

  test "the page without a kit is the demo's Note" do
    visit "/"
    within_canvas { assert_text "Thanks for your order" }
    assert_selector "[data-controller='tess-edit'][data-tess-edit-kit-value='note']"
  end

  test "a panel of the kit's own is a tab after Layers, filled by the kit, and the canvas knows it's open" do
    panel = find("[data-tess-edit-panel='outline']", visible: :all)
    assert_not panel.visible?

    within(".tess-edit") { click_on "Outline" }
    assert_selector "[data-tess-edit-panel='outline']", text: /\A\d+ blocks\z/
    blocks = find("[data-tess-edit-panel='outline']").text.to_i
    within_canvas { assert_selector "body[data-panel='outline']" }

    within(".tess-edit") { click_on "Blocks" }
    within(".tess-edit") { click_on "Divider" }
    within(".tess-edit") { click_on "Outline" }
    assert_selector "[data-tess-edit-panel='outline']", text: "#{blocks + 1} blocks"

    within(".tess-edit") { click_on "Layers" }
    within_canvas { assert_no_selector "body[data-panel]" }
  end

  test "it offers TessEdit's blocks it took in, and its own" do
    within(".tess-edit") do
      ["2 columns", "Column", "Text", "Image", "Button", "Divider", "Spacer", "HTML", "Content", "Table", "Loop", "Card"].each do |tile|
        assert_selector "button", text: tile
      end
    end
  end

  test "text is edited on the canvas, and blocks are added from the palette" do
    within_canvas do
      canvas_block("Here's what you ordered").double_click
      find(".ProseMirror").send_keys(:end, " Enjoy")
      find(".ProseMirror").send_keys(:escape)
      assert_no_selector ".ProseMirror"
    end
    eventually { assert_includes output("html"), "Here's what you ordered: Enjoy" }

    within(".tess-edit") { click_on "Divider" }
    eventually { assert_equal 2, output("html").scan("<hr>").size }
  end

  test "a form submitted right after a change sends it" do
    setting("Title").fill_in(with: "Sent at once")
    click_on "Submit form"
    assert_text "title"
    assert_equal "Sent at once", JSON.parse(page.text)["title"]
  end

  test "the kit's root has its own settings" do
    setting("Title").fill_in(with: "Shopping list")
    eventually { assert_includes output("html"), "<title>Shopping list</title>" }
  end

  test "a block's parts are each edited on the canvas, a plain one as one line" do
    within(".tess-edit") { click_on "Card" }
    within_canvas do
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
    within_canvas do
      find("h1", text: "Order {{ order.number }}").click
      find("h1[contenteditable]").send_keys(:end, " to collect", :enter)
      assert_no_selector "[contenteditable]"
    end
    eventually { assert_includes output("html"), "<title>Order {{ order.number }} to collect</title>" }
    assert_equal "Order {{ order.number }} to collect", setting("Title").value
  end

  test "a field type of the host's edits its value" do
    within(".tess-edit") { click_on "Card" }
    within("[data-tess-edit-panel='inspect']") { click_on "5 stars" }
    eventually { assert_includes output("html"), "★★★★★" }
    within("[data-tess-edit-panel='inspect']") { assert_selector "button[title='5 stars'][aria-pressed='true']" }
  end

  test "a block of the kit's own in a table cell" do
    within(".tess-edit") { click_on "Table" }
    within_canvas { first("table > tbody > tr[class^='tess-'] > td").click }
    within(".tess-edit") { click_on "Card" }
    within_canvas { assert_selector "table td strong", text: "A card" }
    eventually { assert_match(%r{<td[^>]*><div[^>]*><p[^>]*><br></p></div><div style="margin:8px 0;[^"]*"><strong>A card</strong>}, output("html")) }
  end
end
