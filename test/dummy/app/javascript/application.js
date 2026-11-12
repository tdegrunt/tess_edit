import "controllers"
import { application } from "controllers/application"
import { registerTessEdit } from "tess_edit"
import "kits/note"
import "snippets"
import "slots"

registerTessEdit(application)
