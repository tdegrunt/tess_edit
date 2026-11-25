class DemoController < ApplicationController
  # ?locale=nl shows the editor in Dutch
  around_action(only: :show) { |_, action| I18n.with_locale(params[:locale].presence || I18n.default_locale, &action) }

  def show
  end

  # Echoes what the hidden inputs submit, to check the form integration.
  def create
    render json: {
      json_bytes: params[:json].to_s.bytesize,
      title: (JSON.parse(params[:json].to_s).dig("data", "title") if params[:json].present?),
      html_bytes: params[:html].to_s.bytesize,
      liquid_tags: params[:html].to_s.scan(/\{[{%].*?[}%]\}/).uniq,
      sender: params.values_at(:sender_team, :sender_name).compact
    }
  end
end
