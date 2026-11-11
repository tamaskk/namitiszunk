"use client";

import type { ImportProblem, MenuImportPlan } from "@namitiszunk/core/menu";
import { formatHuf } from "@namitiszunk/i18n/format";
import {
  Badge,
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { useValidationText } from "../use-menu-action";
import { importMenuAction, previewMenuImportAction } from "./actions";

// Same limit as menuImportInputSchema; checked here first so a huge file never leaves the browser.
const MAX_CHARS = 200_000;

const importErrors = [
  "missingColumns",
  "empty",
  "tooManyRows",
  "malformedRow",
  "unknownAllergen",
  "invalidYesNo",
  "vipConflict",
  "vipMismatch",
  "duplicateInFile",
  "import_has_errors",
] as const;
type ImportErrorKey = (typeof importErrors)[number];

type State =
  | { step: "idle" }
  | { step: "fileError"; message: string }
  | { step: "preview"; csv: string; plan: MenuImportPlan }
  | { step: "done"; created: number };

/** Upload → preview with every problem → import, only from a problem-free file. */
export function ImportForm() {
  const t = useTranslations("admin.menuImport");
  const validationText = useValidationText();
  const fileId = useId();
  const [state, setState] = useState<State>({ step: "idle" });
  const [pending, startTransition] = useTransition();

  function errorText(key: string, value?: string) {
    if (key.startsWith("validation.")) return validationText(key);
    return importErrors.includes(key as ImportErrorKey)
      ? t(`errors.${key as ImportErrorKey}`, { value: value ?? "" })
      : t("errors.generic");
  }

  async function readFile(file: File) {
    let csv: string;
    try {
      // Hungarian Excel's plain "CSV" is Windows-1250; a strict decode catches it instead of garbling accents.
      csv = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      setState({ step: "fileError", message: t("notUtf8") });
      return;
    }
    if (csv.length > MAX_CHARS) {
      setState({ step: "fileError", message: t("tooLarge") });
      return;
    }
    setState({ step: "idle" });
    startTransition(async () => {
      const result = await previewMenuImportAction({ csv });
      setState(
        "error" in result
          ? { step: "fileError", message: errorText(result.error.code) }
          : { step: "preview", csv, plan: result.data },
      );
    });
  }

  function runImport(csv: string) {
    startTransition(async () => {
      const result = await importMenuAction({ csv });
      setState(
        "error" in result
          ? { step: "fileError", message: errorText(result.error.code) }
          : { step: "done", created: result.data.created },
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="secondary" asChild className="self-start">
        <a href="/menu-sablon.csv" download>
          <Download aria-hidden />
          {t("template")}
        </a>
      </Button>

      <div className="grid gap-2">
        <Label htmlFor={fileId}>{t("file")}</Label>
        <Input
          id={fileId}
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          aria-describedby={`${fileId}-hint`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
          className="py-3"
        />
        <p id={`${fileId}-hint`} className="text-small text-text-muted">
          {t("fileHint")}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {pending && state.step !== "preview" && (
          <p role="status" className="text-body text-text-muted">
            {t("checking")}
          </p>
        )}
        {!pending && state.step === "fileError" && (
          <p role="alert" className="text-body text-danger">
            {state.message}
          </p>
        )}
        {!pending && state.step === "done" && (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-body text-success">
              {t("done", { created: state.created })}
            </p>
            <Button asChild className="self-start">
              <Link href="/menu">{t("back")}</Link>
            </Button>
          </div>
        )}
        {state.step === "preview" && (
          <Preview
            plan={state.plan}
            errorText={errorText}
            importing={pending}
            onImport={() => runImport(state.csv)}
          />
        )}
      </div>
    </div>
  );
}

function Preview({
  plan,
  errorText,
  importing,
  onImport,
}: {
  plan: MenuImportPlan;
  errorText: (key: string, value?: string) => string;
  importing: boolean;
  onImport: () => void;
}) {
  const t = useTranslations("admin.menuImport");
  const created = plan.rows.filter((row) => row.status === "new").length;
  const where = ({ line, column }: ImportProblem) => {
    const place = line === null ? t("wholeFile") : t("lineLabel", { line });
    return column ? `${place}, „${column}”:` : `${place}:`;
  };

  if (plan.problems.length > 0) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="problems">
        {/* Only the count is announced; the list is read on demand. */}
        <div role="alert">
          <h2 id="problems" className="text-h3 text-danger">
            {t("problemsTitle", { count: plan.problemCount })}
          </h2>
        </div>
        <ul className="flex flex-col gap-2">
          {plan.problems.map((problem, index) => (
            <li
              key={index}
              className="rounded-lg border border-danger bg-surface p-3 text-small"
            >
              <span className="font-medium">{where(problem)}</span>{" "}
              {errorText(problem.key, problem.value)}
            </li>
          ))}
        </ul>
        {plan.problemCount > plan.problems.length && (
          <p className="text-small text-text-muted">
            {t("moreProblems", {
              count: plan.problemCount - plan.problems.length,
            })}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <p role="status" className="text-body">
        {t("summary", {
          created,
          skipped: plan.rows.length - created,
          categories: plan.newCategories.length,
        })}
      </p>
      <Table label={t("previewLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colName")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead className="text-right">{t("colPrice")}</TableHead>
            <TableHead>{t("colCategory")}</TableHead>
            <TableHead>{t("colLine")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.rows.map((row) => (
            <TableRow key={row.line}>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                {row.status === "new" ? (
                  <Badge status="new">{t("statusNew")}</Badge>
                ) : (
                  <Badge status="neutral">{t("statusDuplicate")}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHuf(row.priceHuf)}
              </TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell className="tabular-nums">{row.line}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {created === 0 ? (
        <p className="text-body text-text-muted">{t("nothingNew")}</p>
      ) : (
        <Button className="self-start" loading={importing} onClick={onImport}>
          {t("import")}
        </Button>
      )}
    </section>
  );
}
