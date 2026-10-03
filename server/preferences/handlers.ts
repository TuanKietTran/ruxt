import { createHandler, useMediator } from "@core/cqrs";
import {
   normalizeUserPreferences,
   parseUserPreferencesPatch,
   projectUserPreferences,
   type UserPreferencesRepository,
   type UserPreferencesView,
} from "#shared/preferences";

export interface GetUserPreferencesInput {
   userId: string;
}

export interface SetUserPreferencesInput {
   userId: string;
   preferences: unknown;
}

export interface UserPreferencesHandlerDependencies {
   now(): Date;
}

const defaults: UserPreferencesHandlerDependencies = { now: () => new Date() };

export function createGetUserPreferencesHandler(repo: UserPreferencesRepository) {
   return createHandler<GetUserPreferencesInput, UserPreferencesView>(
      "GetUserPreferences",
      async ({ userId }) => {
         if (!userId?.trim()) return { success: false, error: "User id is required" };
         return { success: true, data: projectUserPreferences(await repo.get(userId)) };
      },
   );
}

/** Merge a validated partial update into the owner's stored preferences. */
export function createSetUserPreferencesHandler(
   repo: UserPreferencesRepository,
   dependencies: UserPreferencesHandlerDependencies = defaults,
) {
   return createHandler<SetUserPreferencesInput, UserPreferencesView>(
      "SetUserPreferences",
      async ({ userId, preferences }) => {
         if (!userId?.trim()) return { success: false, error: "User id is required" };
         const parsed = parseUserPreferencesPatch(preferences);
         if (!parsed.ok) return { success: false, error: parsed.error };

         const current = await repo.get(userId);
         const record = {
            ownerId: userId,
            preferences: normalizeUserPreferences({ ...current?.preferences, ...parsed.patch }),
            updatedAt: dependencies.now().toISOString(),
         };
         await repo.save(record);
         return { success: true, data: projectUserPreferences(record) };
      },
   );
}

export function getUserPreferencesQuery(input: GetUserPreferencesInput) {
   return { _type: "query" as const, requestName: "GetUserPreferences", payload: input };
}

export function setUserPreferencesCommand(input: SetUserPreferencesInput) {
   return { _type: "command" as const, requestName: "SetUserPreferences", payload: input };
}

export function registerUserPreferencesHandlers(repo: UserPreferencesRepository) {
   useMediator().registerQuery(createGetUserPreferencesHandler(repo));
   useMediator().registerCommand(createSetUserPreferencesHandler(repo));
}
