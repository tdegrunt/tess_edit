require "application_system_test_case"

class TranslatedEditorTest < ApplicationSystemTestCase
  test "the editor speaks the page's language" do
    visit "/?locale=nl"
    within_frame(find("iframe[title='E-mail-canvas']")) { assert_text "Thanks for your order" }

    assert_selector "button", text: "Blokken"
    assert_selector "button", text: "Lagen"
    assert_selector "[data-tess-edit-panel='inspect'] summary", text: "BERICHT"
    assert setting("Voorbeeldtekst")
    assert_selector "[data-tess-edit-panel='inspect'] summary", text: "LAYOUT"
    assert_selector "[data-tess-edit-panel='inspect'] span", text: "Breekpunt"
    assert_selector "button[title='Ongedaan maken (⌘Z)']"

    within_frame(find("iframe[title='E-mail-canvas']")) { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Knop · View your order"
    assert_selector "[data-tess-edit-panel='inspect'] summary", text: "TYPOGRAFIE"
  end
end
