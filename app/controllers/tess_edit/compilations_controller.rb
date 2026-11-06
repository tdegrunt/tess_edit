module TessEdit
  # POST /tess_edit/compile with { mjml: "..." }: the HTML the editor shows on
  # its canvas and stores in its html input.
  class CompilationsController < ApplicationController
    def create
      result = TessEdit.compile(params.require(:mjml))
      render json: {html: result.html, errors: result.errors}, status: result.errors.empty? ? :ok : :unprocessable_content
    end
  end
end
