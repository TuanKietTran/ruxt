import { requireCvOwner } from "../../../utils/cv-owner";

/** Private templates stay browser-local until an owner-aware cloud template contract exists. */
export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   throw createError({ statusCode: 403, statusMessage: "Save private templates in browser storage; server saves and overrides are disabled" });
});
