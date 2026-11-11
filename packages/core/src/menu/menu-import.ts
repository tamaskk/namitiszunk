import "server-only";

import { Category, Item } from "@namitiszunk/db";
import { messages } from "@namitiszunk/i18n";
import {
  allergenCodes,
  itemInputSchema,
  nameSchema,
  type ItemInput,
} from "@namitiszunk/validators";
import type { ClientSession } from "mongoose";
import Papa from "papaparse";

import { type Actor, requirePermission } from "../auth/permissions";
import { AppError } from "../errors";
import { inTransaction, nextSortOrder, recordChange } from "./admin-menu";

/** The template's columns, in order (fejlesztesi-terv.md, 52.). */
export const IMPORT_COLUMNS = [
  "kategoria",
  "nev",
  "nev_en",
  "leiras",
  "leiras_en",
  "ar",
  "afa",
  "alkohol",
  "allergenek",
  "csak_vip",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
const REQUIRED_COLUMNS: ImportColumn[] = ["kategoria", "nev", "ar", "afa"];
export const IMPORT_MAX_ROWS = 500;
// A file with thousands of bad cells must not send megabytes back or freeze the page.
const PREVIEW_MAX_PROBLEMS = 100;
const PREVIEW_MAX_VALUE = 100;

/**
 * One reason the file cannot be imported. `key` is a `validation.*` message key, or a code under
 * `admin.menuImport.errors`; `line` is the file line (the header is line 1), null for the whole file.
 */
export type ImportProblem = {
  line: number | null;
  column: ImportColumn | null;
  key: string;
  value?: string;
};

export type MenuImportPlan = {
  /** The first PREVIEW_MAX_PROBLEMS problems; `problemCount` has them all. */
  problems: ImportProblem[];
  problemCount: number;
  rows: {
    line: number;
    category: string;
    name: string;
    priceHuf: number;
    /** "duplicate": the category already has a live item with this name, so the row is skipped. */
    status: "new" | "duplicate";
  }[];
  newCategories: { name: string; vipOnly: boolean }[];
};

type ParsedRow = {
  line: number;
  category: string;
  vipOnly: boolean | null;
  item: Omit<ItemInput, "categoryId">;
};

// Placeholder for the schema check; the real category id is known only when importing.
const ANY_ID = "0".repeat(24);

const fieldColumn: Partial<Record<keyof ItemInput, ImportColumn>> = {
  name: "nev",
  nameEn: "nev_en",
  description: "leiras",
  descriptionEn: "leiras_en",
  priceHuf: "ar",
  vatRate: "afa",
  alcoholPercent: "alkohol",
  allergens: "allergenek",
};

const fold = (value: string) => value.trim().toLocaleLowerCase("hu");

// Clubs write allergens the way they read them: the hu or en label, or the code.
const allergenByLabel = new Map<string, (typeof allergenCodes)[number]>(
  allergenCodes.flatMap((code) => [
    [code, code],
    [fold(messages.hu.admin.menu.allergenNames[code]), code],
    [fold(messages.en.admin.menu.allergenNames[code]), code],
  ]),
);

const yes = new Set(["igen", "i", "yes", "y", "1", "x", "true"]);
const no = new Set(["nem", "n", "no", "0", "false"]);

/** "2 500 Ft" → 2500; anything that is not a whole number → NaN, which the schema reports. */
function parseHuf(cell: string): number {
  const digits = cell.replace(/[\s\u00a0]/g, "").replace(/ft$/i, "");
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

/** "10,5", "27%" → a number; hex, exponents or words → NaN, which the schema reports. */
function parseDecimal(cell: string): number | undefined {
  const value = cell.trim().replace(/\s*%$/, "");
  if (value === "") return undefined;
  return /^\d+([.,]\d+)?$/.test(value)
    ? Number(value.replace(",", "."))
    : Number.NaN;
}

/** Headers as a club types them: case, spaces and accents do not matter ("Ár" = "ar"). */
function normalizeHeader(header: string): string {
  return fold(header).normalize("NFD").replace(/\p{M}/gu, "");
}

/** Reads the CSV without touching the database: per-row items and the problems found so far. */
export function parseMenuCsv(csv: string): {
  rows: ParsedRow[];
  problems: ImportProblem[];
} {
  const text = csv.replace(/^\uFEFF/, "");
  // Rows with the file line they start on: a skipped blank line or a quoted line break inside a
  // cell would shift a plain row index, and the owner fixes the file by these numbers.
  const records: { cells: string[]; line: number }[] = [];
  let cursor = 0;
  let line = 1;
  Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    // A Hungarian Excel saves with semicolons, everything else with commas.
    delimitersToGuess: [";", ","],
    step: (result) => {
      // The row starts at its first non-blank character after the previous row.
      while (cursor < text.length && /\s/.test(text[cursor]!)) {
        if (text[cursor] === "\n") line++;
        cursor++;
      }
      records.push({ cells: result.data, line });
      for (; cursor < result.meta.cursor; cursor++)
        if (text[cursor] === "\n") line++;
    },
  });
  const problems: ImportProblem[] = [];
  const headers = (records.shift()?.cells ?? []).map(normalizeHeader);
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [
        {
          line: 1,
          column: null,
          key: "missingColumns",
          value: missing.join(", "),
        },
      ],
    };
  }
  if (records.length === 0)
    return { rows: [], problems: [{ line: null, column: null, key: "empty" }] };
  if (records.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      problems: [
        {
          line: null,
          column: null,
          key: "tooManyRows",
          value: String(IMPORT_MAX_ROWS),
        },
      ],
    };
  }

  const rows = records.map(({ cells, line }): ParsedRow => {
    if (cells.length !== headers.length)
      problems.push({ line, column: null, key: "malformedRow" });
    const cell = (column: ImportColumn) =>
      (cells[headers.indexOf(column)] ?? "").trim();
    const text = (column: ImportColumn) => cell(column) || undefined;

    const category = cell("kategoria");
    const categoryCheck = nameSchema.safeParse(category);
    if (!categoryCheck.success) {
      problems.push({
        line,
        column: "kategoria",
        key: categoryCheck.error.issues[0]!.message,
      });
    }

    const allergens: (typeof allergenCodes)[number][] = [];
    for (const label of cell("allergenek").split(/[,;]/)) {
      if (!label.trim()) continue;
      const code = allergenByLabel.get(fold(label));
      if (code) {
        if (!allergens.includes(code)) allergens.push(code);
      } else {
        problems.push({
          line,
          column: "allergenek",
          key: "unknownAllergen",
          value: label.trim(),
        });
      }
    }

    const vipCell = fold(cell("csak_vip"));
    let vipOnly: boolean | null = null;
    if (yes.has(vipCell)) vipOnly = true;
    else if (no.has(vipCell)) vipOnly = false;
    else if (vipCell !== "") {
      problems.push({
        line,
        column: "csak_vip",
        key: "invalidYesNo",
        value: cell("csak_vip"),
      });
    }

    const item = {
      name: cell("nev"),
      nameEn: text("nev_en"),
      description: text("leiras"),
      descriptionEn: text("leiras_en"),
      priceHuf: parseHuf(cell("ar")),
      vatRate: parseDecimal(cell("afa")) as ItemInput["vatRate"],
      alcoholPercent: parseDecimal(cell("alkohol")),
      allergens,
    };
    const check = itemInputSchema.safeParse({ ...item, categoryId: ANY_ID });
    if (!check.success) {
      for (const issue of check.error.issues) {
        const field = issue.path[0] as keyof ItemInput;
        problems.push({
          line,
          column: fieldColumn[field] ?? null,
          key: issue.message,
        });
      }
    }
    return { line, category, vipOnly, item };
  });

  return { rows, problems };
}

/** The parse plus everything that depends on the venue's current menu: categories, VIP flags, duplicates. */
async function planImport(
  venueId: string,
  csv: string,
  session: ClientSession | null,
): Promise<Omit<MenuImportPlan, "problemCount"> & { parsed: ParsedRow[] }> {
  const { rows, problems } = parseMenuCsv(csv);
  // One after the other: a transaction's session takes no parallel operations.
  const categories = await Category.find(
    { venueId, archivedAt: null },
    { name: 1, vipOnly: 1 },
  )
    .session(session)
    .lean();
  const items = await Item.find(
    { venueId, archivedAt: null },
    { categoryId: 1, name: 1 },
  )
    .session(session)
    .lean();
  const existing = new Map(categories.map((c) => [fold(c.name), c]));
  const liveNames = new Set(
    items.map((item) => `${String(item.categoryId)}\n${fold(item.name)}`),
  );

  // The VIP flag belongs to the category: every row of one category must agree, and with the
  // category already on the menu. An empty cell takes the category's flag (new: not VIP).
  const fileVip = new Map<string, { value: boolean; line: number }>();
  for (const row of rows) {
    if (row.vipOnly === null) continue;
    const key = fold(row.category);
    const first = fileVip.get(key);
    const current = existing.get(key);
    if (current && (current.vipOnly ?? false) !== row.vipOnly) {
      problems.push({
        line: row.line,
        column: "csak_vip",
        key: "vipConflict",
        value: current.name,
      });
    } else if (first && first.value !== row.vipOnly) {
      problems.push({
        line: row.line,
        column: "csak_vip",
        key: "vipMismatch",
        value: String(first.line),
      });
    } else if (!first) {
      fileVip.set(key, { value: row.vipOnly, line: row.line });
    }
  }

  const seen = new Set<string>();
  const newCategories: MenuImportPlan["newCategories"] = [];
  const planned = rows.map((row) => {
    const key = fold(row.category);
    const current = existing.get(key);
    if (!current && !newCategories.some((c) => fold(c.name) === key)) {
      newCategories.push({
        name: row.category,
        vipOnly: fileVip.get(key)?.value ?? false,
      });
    }
    const fileKey = `${key}\n${fold(row.item.name)}`;
    if (seen.has(fileKey)) {
      problems.push({
        line: row.line,
        column: "nev",
        key: "duplicateInFile",
        value: row.item.name,
      });
    }
    seen.add(fileKey);
    const duplicate =
      current !== undefined &&
      liveNames.has(`${String(current._id)}\n${fold(row.item.name)}`);
    return {
      line: row.line,
      category: current?.name ?? row.category,
      name: row.item.name,
      priceHuf: row.item.priceHuf,
      status: duplicate ? ("duplicate" as const) : ("new" as const),
    };
  });

  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { problems, rows: planned, newCategories, parsed: rows };
}

/** The preview: what the import would do, and every problem that blocks it. Nothing is written. */
export async function previewMenuImport(
  actor: Actor,
  venueId: string,
  csv: string,
): Promise<MenuImportPlan> {
  requirePermission(actor, "menu.edit", { venueId });
  const plan = await planImport(venueId, csv, null);
  return {
    problems: plan.problems.slice(0, PREVIEW_MAX_PROBLEMS).map((problem) => ({
      ...problem,
      value: problem.value?.slice(0, PREVIEW_MAX_VALUE),
    })),
    problemCount: plan.problems.length,
    rows: plan.rows,
    newCategories: plan.newCategories,
  };
}

/**
 * Imports a problem-free file in one transaction: missing categories first, then the new items at
 * the end of their category. Existing items are never overwritten; a same-name item is skipped.
 */
export async function importMenu(
  actor: Actor,
  venueId: string,
  csv: string,
): Promise<{ created: number; skipped: number; categoriesCreated: number }> {
  requirePermission(actor, "menu.edit", { venueId });
  return inTransaction(async (session) => {
    const plan = await planImport(venueId, csv, session);
    if (plan.problems.length > 0) throw new AppError(400, "import_has_errors");

    const categoryIds = new Map<string, { id: string; vipOnly: boolean }>();
    for (const c of await Category.find(
      { venueId, archivedAt: null },
      { name: 1, vipOnly: 1 },
    )
      .session(session)
      .lean()) {
      categoryIds.set(fold(c.name), {
        id: String(c._id),
        vipOnly: c.vipOnly ?? false,
      });
    }
    // Every row already on the menu: nothing to write, no audit, and the guests' cache stays.
    if (
      plan.newCategories.length === 0 &&
      plan.rows.every((row) => row.status === "duplicate")
    )
      return { created: 0, skipped: plan.rows.length, categoriesCreated: 0 };
    let categorySort = await nextSortOrder(
      Category,
      { venueId, archivedAt: null },
      session,
    );
    for (const category of plan.newCategories) {
      const [created] = await Category.create(
        [{ venueId, ...category, sortOrder: categorySort++ }],
        { session },
      );
      categoryIds.set(fold(category.name), {
        id: String(created!._id),
        vipOnly: category.vipOnly,
      });
    }

    const nextSort = new Map<string, number>();
    const docs = [];
    for (const [index, row] of plan.parsed.entries()) {
      if (plan.rows[index]!.status === "duplicate") continue;
      const category = categoryIds.get(fold(row.category))!;
      const sortOrder =
        nextSort.get(category.id) ??
        (await nextSortOrder(
          Item,
          { venueId, categoryId: category.id, archivedAt: null },
          session,
        ));
      nextSort.set(category.id, sortOrder + 1);
      docs.push({
        ...row.item,
        venueId,
        categoryId: category.id,
        vipOnly: category.vipOnly,
        isAvailable: true,
        barIds: [],
        modifierGroups: [],
        sortOrder,
      });
    }
    if (docs.length > 0) await Item.insertMany(docs, { session });

    const result = {
      created: docs.length,
      skipped: plan.rows.length - docs.length,
      categoriesCreated: plan.newCategories.length,
    };
    await recordChange(session, actor, venueId, {
      action: "menu.imported",
      type: "venue",
      id: venueId,
      after: result,
    });
    return result;
  });
}
