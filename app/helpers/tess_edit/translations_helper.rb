module TessEdit
  # The editor's words in the page's language (I18n.locale), as JSON in the
  # editor for it to say them in (app/javascript/tess_edit/core/i18n.js): its
  # own (tess_edit.editor in config/locales) and those of the scopes given,
  # the host's kits' and blocks', whose keys say the English the editor shows
  # in their en.yml. A text without a translation says its English.
  #
  #   <div data-controller="tess-edit">
  #     <%= tess_edit_translations "nuntius.editor" %>
  module TranslationsHelper
    def tess_edit_translations(*scopes)
      words = ["tess_edit.editor", *scopes].each_with_object({}) do |scope, words|
        english = I18n.t(scope, locale: :en, default: {})
        next unless english.is_a?(Hash)

        english.each do |key, text|
          words[text] = I18n.t(key, scope: scope, default: text) if text.is_a?(String)
        end
      end
      tag.script(ERB::Util.json_escape(words.to_json).html_safe, type: "application/json", data: {tess_edit_target: "translations"})
    end
  end
end
