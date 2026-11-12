require "application_system_test_case"

# The demo's sender fields at /?slots=1: the page's own form fields, shown
# in the root's Inspect by a slot field (app/javascript/slots.js).
class SlotsTest < ApplicationSystemTestCase
  setup do
    visit "/?slots=1"
    within_canvas { assert_text "View your order" }
  end

  test "a slot shows the page's element in the root's Inspect, open while it has no name" do
    within_inspect do
      assert_selector "summary", text: "SENDER"
      assert_button "Done"
      fill_in "Name", with: "Ada"
      select "Support", from: "sender_team"
      click_on "Done"
      assert_no_field "Name"
      assert_text "Support · Ada"
    end
  end

  test "the element is kept, with its values, while another block is selected" do
    page.execute_script("document.querySelector('[data-tess-edit-slot]').marker = 'kept'")
    within_inspect { fill_in "Name", with: "Ada" }

    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
    assert_selector "[data-tess-edit-slot]", visible: :hidden

    find("[title='Select parent']").click until has_selector?(".tess-edit h2", text: "Email", wait: 0.2)
    within_inspect { assert_field "Name", with: "Ada" }
    assert_equal "kept", page.evaluate_script("document.querySelector('[data-tess-edit-slot]').marker")
  end

  test "its values survive the panels moving, and submit with the form" do
    within_inspect do
      fill_in "Name", with: "Ada"
      select "Support", from: "sender_team"
    end
    find("[title='All panels on the left']").click
    click_on "Inspect"
    within_inspect do
      assert_field "Name", with: "Ada"
      assert_select "sender_team", selected: "Support"
    end

    click_on "Submit form"
    assert_text "sender"
    assert_equal %w[support Ada], JSON.parse(page.text)["sender"]
  end

  test "without the page's element the group doesn't show" do
    visit "/"
    within_canvas { assert_text "View your order" }
    within_inspect { assert_no_selector "summary", text: "SENDER" }
  end

  private

  def within_inspect(&)
    within("[data-tess-edit-panel='inspect']", &)
  end
end
