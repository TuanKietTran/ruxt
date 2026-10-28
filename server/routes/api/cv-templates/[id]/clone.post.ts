import { requireCvOwner } from "../../../../utils/cv-owner";

/** A clone must not read another account's ownerless template or persist a new ownerless record. */
export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   throw createError({ statusCode: 404, statusMessage: "Clone templates in browser storage" });
});
