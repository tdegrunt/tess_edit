class DemoController < ApplicationController
  def show
  end

  # Echoes what the hidden inputs submit, to check the form integration.
  def create
    render json: {
      json_bytes: params[:json].to_s.bytesize,
      mjml_bytes: params[:mjml].to_s.bytesize,
      html_bytes: params[:html].to_s.bytesize,
      liquid_tags: params[:html].to_s.scan(/\{[{%].*?[}%]\}/).uniq,
      sender: params.values_at(:sender_team, :sender_name).compact
    }
  end
end
