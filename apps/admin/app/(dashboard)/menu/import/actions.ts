"use server";

import { importMenu, previewMenuImport } from "@namitiszunk/core/menu";
import { menuImportInputSchema } from "@namitiszunk/validators";

import { runMenuAction } from "../run-menu-action";

/** What the file would do; nothing is written. The import re-reads the file, never this result. */
export async function previewMenuImportAction(input: unknown) {
  return runMenuAction(menuImportInputSchema, input, ({ csv }, c) =>
    previewMenuImport(c.actor, c.venueId, csv),
  );
}

export async function importMenuAction(input: unknown) {
  return runMenuAction(menuImportInputSchema, input, ({ csv }, c) =>
    importMenu(c.actor, c.venueId, csv),
  );
}
