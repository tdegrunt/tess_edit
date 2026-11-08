# The demo's translations (the editor's translationsUrl, see
# core/translations.js), kept in memory: a host app keeps them its own way,
# e.g. in locale files or its database.
class TranslationsController < ApplicationController
  LOCALES = %w[en nl de].freeze
  SAMPLE = {
    "en" => {".greeting" => "Hello", ".thanks" => "Thanks for your order!"},
    "nl" => {".greeting" => "Hallo", ".thanks" => "Bedankt voor je bestelling!"},
    "de" => {".greeting" => "Hallo"}
  }.freeze

  class << self
    def store
      @store ||= SAMPLE.deep_dup
    end

    def reset!
      @store = nil
    end
  end

  def index
    suggestions = store.values.flat_map(&:keys).uniq.sort
    keys = params[:keys].to_s.split(",") | suggestions
    render json: {locales: LOCALES, translations: keys.index_with { |key| translation(key) }, suggestions: suggestions}
  end

  def update
    key, locale, value = params.require(:key), params.require(:locale), params[:value].to_s
    return render(json: {errors: ["#{locale} is not one of the languages"]}, status: :unprocessable_entity) unless LOCALES.include?(locale)
    return render(json: {errors: ["The text can't be empty"]}, status: :unprocessable_entity) if value.blank?

    store[locale][key] = value
    render json: {key: key, translation: translation(key)}
  end

  private

  def store
    self.class.store
  end

  def translation(key)
    LOCALES.index_with do |locale|
      value = store[locale][key]
      value && {value: value, source: "The demo's #{locale.upcase} translations", url: translations_path(locale: locale)}
    end
  end
end
