import { describe, expect, it } from "vitest";

import { cardAge, rushSummary } from "./summary";

describe("rushSummary", () => {
  it("adds up identical items from New and In progress, options in any order", () => {
    const orders = [
      {
        status: "new",
        items: [
          { name: "Cerveza", options: [], quantity: 2 },
          { name: "Gin tonic", options: ["Bombay", "Uborka"], quantity: 1 },
        ],
      },
      {
        status: "preparing",
        items: [
          { name: "Cerveza", options: [], quantity: 10 },
          { name: "Gin tonic", options: ["Uborka", "Bombay"], quantity: 2 },
          { name: "Gin tonic", options: ["Hendrick's"], quantity: 1 },
        ],
      },
      {
        status: "ready",
        items: [{ name: "Cerveza", options: [], quantity: 5 }],
      },
    ];

    const summary = rushSummary(orders);

    expect(summary).toEqual([
      { name: "Cerveza", options: [], quantity: 12 },
      { name: "Gin tonic", options: ["Bombay", "Uborka"], quantity: 3 },
      { name: "Gin tonic", options: ["Hendrick's"], quantity: 1 },
    ]);
  });

  it("is empty when nothing waits", () => {
    const summary = rushSummary([
      { status: "ready", items: [{ name: "Víz", options: [], quantity: 1 }] },
    ]);

    expect(summary).toEqual([]);
  });
});

describe("cardAge", () => {
  const since = new Date("2026-11-11T22:00:00Z");
  const at = (minutes: number) => new Date(since.getTime() + minutes * 60_000);

  it("is green under 5 minutes, yellow from 5 to 10 and red over 10", () => {
    const ages = [0, 4.9, 5, 10, 10.1].map((m) => cardAge(since, at(m)));

    expect(ages).toEqual(["fresh", "fresh", "waiting", "waiting", "late"]);
  });
});
