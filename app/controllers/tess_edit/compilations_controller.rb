module TessEdit
  # POST /tess_edit/compile with { compiler: "mjml", source: "..." }: the HTML a kit
  # shows on its canvas and stores in its html input, made by a compiler the
  # host registered (TessEdit.register_compiler).
  class CompilationsController < ApplicationController
    def create
      return render(json: {html: nil, errors: ["No compiler #{params[:compiler]}"]}, status: :not_found) unless TessEdit.compiler?(params[:compiler])

      result = TessEdit.compile(params[:compiler], params.require(:source))
      render json: {html: result.html, errors: result.errors}, status: result.errors.empty? ? :ok : :unprocessable_content
    end
  end
end
