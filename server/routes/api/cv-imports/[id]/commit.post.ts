import { requireCvOwner } from "../../../../utils/cv-owner";

/** Imported CVs are committed to browser storage, not to the retired shared document store. */
export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   throw createError({ statusCode: 404, statusMessage: "Create the imported CV in browser storage" });
});
