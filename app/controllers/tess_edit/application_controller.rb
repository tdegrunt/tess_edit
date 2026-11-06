module TessEdit
  class ApplicationController < TessEdit.parent_controller.constantize
    protect_from_forgery with: :exception
  end
end
