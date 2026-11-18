require "application_system_test_case"

# A kit of its root alone: the demo's Memo (test/dummy/app/javascript/kits/memo.js).
class KitWithoutBlocksTest < ApplicationSystemTestCase
  setup do
    visit "/?kit=memo"
    within_canvas("Memo") { assert_text "Ada: Back at {{ time }}" }
  end

  test "it has Inspect only, without panels to arrange" do
    assert_selector ".tess-edit aside", count: 1
    assert_selector ".tess-edit main + aside [data-tess-edit-panel='inspect']"
    assert_no_button "Blocks"
    assert_no_button "Layers"
    assert_no_selector "[title='All panels on the left']"
  end

  test "a phone-width editor has Inspect in a sheet below the canvas" do
    original = page.current_window.size
    page.current_window.resize_to(400, original[1])

    assert_no_selector ".tess-edit aside"
    find("[title='Show panels']").click
    assert_selector ".tess-edit main + aside [data-tess-edit-panel='inspect']"
    find(".tess-edit aside [title='Hide panels']").click
    assert_no_selector ".tess-edit aside"
  ensure
    page.current_window.resize_to(*original) if original
  end

  test "a hint counts what's typed, and the canvas shows it with the editor's options" do
    assert_text "18 / 160"
    setting("Text").set("Back soon")
    assert_text "9 / 160"
    within_canvas("Memo") { assert_text "Ada: Back soon" }
  end

  test "a link the kit marks opens in a new tab" do
    new_tab = window_opened_by { within_canvas("Memo") { click_on "Open a note" } }
    within_window(new_tab) { assert_current_path "/?kit=note" }
    assert_current_path "/?kit=memo"
  end
end
