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

  test "a hint counts what's typed, and the canvas shows it with the editor's options" do
    assert_text "18 / 160"
    setting("Text").set("Back soon")
    assert_text "9 / 160"
    within_canvas("Memo") { assert_text "Ada: Back soon" }
  end
end
