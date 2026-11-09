require "application_system_test_case"

class TranslationsTest < ApplicationSystemTestCase
  setup do
    TranslationsController.reset!
    visit "/?translations=1"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
  end

  test "the canvas shows a t filter's text in the language chosen, or its Liquid" do
    setting("Label").set("{{ '.greeting' | t }}")
    within_canvas { assert_selector ".tess-t", text: "Hello", exact_text: true }
    assert_selector "[data-tess-edit-panel='inspect'] [data-tess-key]", text: "EN: Hello"

    language.select("NL")
    within_canvas { assert_selector ".tess-t", text: "Hallo", exact_text: true }

    language.select("Keys")
    within_canvas { assert_selector ".tess-t", text: "{{ '.greeting' | t }}", exact_text: true }
  end

  test "a missing text shows the Liquid, marked" do
    setting("Label").set("{{ '.thanks' | t }}")
    within_canvas { assert_selector ".tess-t:not(.tess-t-missing)", text: "Thanks for your order!" }
    language.select("DE")
    within_canvas { assert_selector ".tess-t.tess-t-missing", text: "{{ '.thanks' | t }}" }
  end

  test "pointing at a translation lists every language, and edits one" do
    setting("Label").set("{{ '.thanks' | t }}")
    within_canvas { find(".tess-t", text: "Thanks for your order!").hover }

    within("[data-tess-edit-translations]") do
      assert_selector "[data-locale='en']", text: "Thanks for your order!"
      assert_selector "[data-locale='nl']", text: "Bedankt voor je bestelling!"
      assert_selector "[data-locale='de']", text: "missing"
      assert_no_text "null"
      within("[data-locale='de']") { find("button[title='Edit the DE text']").click }
      find("input[aria-label='DE text']").send_keys("Danke für Ihre Bestellung!", :enter)
      assert_selector "[data-locale='de']", text: "Danke für Ihre Bestellung!"
    end
    eventually { assert_equal "Danke für Ihre Bestellung!", TranslationsController.store.dig("de", ".thanks") }

    language.select("DE")
    within_canvas { assert_selector ".tess-t:not(.tess-t-missing)", text: "Danke für Ihre Bestellung!" }
  end

  test "a field's text becomes a translation" do
    label = setting("Label")
    field("Label").find("button[title^='Make translatable']").click
    make_translatable(".view_order")

    eventually { assert_equal "{{ '.view_order' | t }}", label.value }
    assert_equal "View your order", TranslationsController.store.dig("en", ".view_order")
    within_canvas { assert_selector ".tess-t", text: "View your order" }
    eventually { assert_equal "{{ '.view_order' | t }}", button_node.dig("data", "content") }
  end

  test "typing {{ ' suggests the keys, labelled with their text" do
    label = setting("Label")
    label.set("")
    label.send_keys("{{ '.gr")
    assert_selector "[role=listbox] [role=option]", text: "Hello"
    label.send_keys(:enter)
    assert_equal "{{ '.greeting' | t }}", label.value
    assert_no_selector "[role=listbox]"
  end

  test "selected text on the canvas becomes a translation, shown as its text" do
    within_canvas do
      find("td[class^='tess-']", text: "Thanks for your order,").double_click
      find(".ProseMirror").send_keys([select_all_key, "a"])
    end
    find(".tess-edit button[title^='Make translatable']").click
    within("[role=dialog][aria-label='Make translatable']") { assert_selector "[data-tess-edit-translation-text] span", text: "first_name" }
    make_translatable(".thanks_name")

    # Its variable becomes a placeholder, filled by the filter's argument
    eventually { assert_equal "Thanks for your order, %{first_name}!", TranslationsController.store.dig("en", ".thanks_name") }
    within_canvas do
      assert_selector ".ProseMirror .tess-t:not(.tess-t-missing)", text: "Thanks for your order, first_name!"
      assert_selector ".ProseMirror .tess-t .tess-t-arg", text: "first_name"
      # The caret goes into the Liquid with a click
      find(".ProseMirror .tess-t").click
      assert_selector ".ProseMirror .tess-t-raw", text: "{{ '.thanks_name' | t: first_name: customer.first_name }}"
    end
    within_canvas { find(".ProseMirror").send_keys(:escape) }
    within_canvas { assert_selector ".tess-t[data-tess-call]", text: "Thanks for your order, first_name!" }
  end

  test "a placeholder without an argument in the filter is marked" do
    TranslationsController.store["en"][".hi"] = "Hi %{name}"
    setting("Label").set("{{ '.hi' | t }}")
    within_canvas { assert_selector ".tess-t.tess-t-missing[title*='%{name}']", text: "Hi name" }
    setting("Label").set("{{ '.hi' | t: name: order.customer.name }}")
    within_canvas { assert_selector ".tess-t:not(.tess-t-missing)", text: "Hi name" }
  end

  test "Liquid a translation can't hold isn't made translatable" do
    setting("Label").set("Total {{ order.total | money }}")
    field("Label").find("button[title^='Make translatable']").click
    assert_text "can't go into a translation"
    assert_equal "Total {{ order.total | money }}", setting("Label").value
  end

  test "without a translationsUrl there's no language menu or translate button" do
    visit "/"
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_no_selector "select[aria-label='Show translations in']"
    assert_no_selector ".tess-edit button[title^='Make translatable']"
  end

  test "an existing key's text is only replaced when confirmed" do
    field("Label").find("button[title^='Make translatable']").click
    within("[role=dialog][aria-label='Make translatable']") do
      fill_in "Key", with: ".greeting"
      click_on "Save"
      assert_text "already says “Hello” in EN"
      click_on "Cancel"
    end
    assert_equal "Hello", TranslationsController.store.dig("en", ".greeting")
    assert_equal "View your order", setting("Label").value
  end

  private

  def make_translatable(key)
    within("[role=dialog][aria-label='Make translatable']") do
      fill_in "Key", with: key
      click_on "Save"
    end
    assert_no_selector "[role=dialog][aria-label='Make translatable']"
  end

  # The browser's: a Mac's own Chrome, or Linux's through Selenium
  def select_all_key
    (RUBY_PLATFORM.include?("darwin") && ENV["SELENIUM_URL"].blank?) ? :command : :control
  end

  def language
    find("select[aria-label='Show translations in']")
  end

  def field(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..")
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
