require "test_helper"

class TessEdit::TranslationsHelperTest < ActionView::TestCase
  test "gives the editor its words in the page's language, as JSON in a script" do
    I18n.with_locale(:nl) { render inline: "<%= tess_edit_translations %>" }

    script = css_select("script[type='application/json'][data-tess-edit-target='translations']").first
    words = JSON.parse(script.text)
    assert_equal "Ruimte", words["Padding"]
    assert_equal "%{label} in een groter venster bewerken", words["Edit %{label} in a larger window"]
    # Not on: and off:, which YAML reads as true and false
    assert_equal ["Aan", "Uit"], words.values_at("On", "Off")
    assert_equal I18n.t("tess_edit.editor", locale: :en).size, words.size
  end

  test "adds the words of the scopes given, their English where there's no translation" do
    I18n.backend.store_translations(:en, kit: {editor: {stamp: "Stamp", ink: "Ink </script>"}})
    I18n.backend.store_translations(:nl, kit: {editor: {stamp: "Stempel"}})

    I18n.with_locale(:nl) { render inline: "<%= tess_edit_translations 'kit.editor' %>" }

    assert_not_includes rendered, "</script>\""
    words = JSON.parse(css_select("script").first.text)
    assert_equal "Stempel", words["Stamp"]
    assert_equal "Ink </script>", words["Ink </script>"]
    assert_equal "Ruimte", words["Padding"]
  end
end
