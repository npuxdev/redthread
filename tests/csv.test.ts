import { describe, expect, it } from "vitest";

import { parseCsv } from "../shared/csv";
import { recordRows, validateCitations } from "../server/lib/engine/citations";
import { parseRecords, reconcile } from "../server/lib/engine/records";

const MULTILINE = 'id,memo,amount\nINV-1,"Paid by wire,\nconfirmed by phone",100\nINV-2,"Said ""pending""",\n';

describe("parseCsv", () => {
  it("keeps commas, newlines and doubled quotes inside quoted fields", () => {
    const { records, problems } = parseCsv(MULTILINE);
    expect(problems).toEqual([]);
    expect(records.map((r) => r.cells)).toEqual([
      ["id", "memo", "amount"],
      ["INV-1", "Paid by wire,\nconfirmed by phone", "100"],
      ["INV-2", 'Said "pending"', ""],
    ]);
    expect(records[1]!.text).toBe('INV-1,"Paid by wire,\nconfirmed by phone",100');
    expect(records.map((r) => r.line)).toEqual([1, 2, 4]);
  });

  it("handles CRLF, a byte-order mark and blank lines", () => {
    const { records } = parseCsv('\uFEFFa,b\r\n\r\n1,2\r\n');
    expect(records.map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty values and trims only unquoted fields", () => {
    expect(parseCsv('a,b,c\n , " x ",\n').records[1]!.cells).toEqual(["", " x ", ""]);
  });

  it("reports malformed records instead of silently reshaping them", () => {
    expect(parseCsv('a,b\n"open,1\n').problems).toEqual([{ line: 2, message: "Quoted field is never closed" }]);
    expect(parseCsv('a,b\n"x"y,1\n').problems).toEqual([{ line: 2, message: "Text after a closing quote" }]);
    expect(parseCsv('a,b\nx"y,1\n').problems).toEqual([{ line: 2, message: "Quote inside an unquoted field" }]);
  });
});

describe("records built on the CSV parser", () => {
  const source = { id: "s1", kind: "records" as const, content: MULTILINE };

  it("parses multiline rows as one record each, with empty and missing values", () => {
    const { fields, rows, problems } = parseRecords(source);
    expect(fields).toEqual(["id", "memo", "amount"]);
    expect(rows).toEqual([
      { id: "INV-1", memo: "Paid by wire,\nconfirmed by phone", amount: "100" },
      { id: "INV-2", memo: 'Said "pending"', amount: "" },
    ]);
    expect(problems).toEqual([]);
    expect(parseRecords({ content: "a,b,c\n1,2\n" }).rows).toEqual([{ a: "1", b: "2", c: null }]);
  });

  it("flags rows whose width differs from the header", () => {
    expect(parseRecords({ content: "a,b\n1,2,3\n4\n" }).problems).toEqual([
      { line: 2, message: "Row 0 has 3 values for 2 columns" },
      { line: 3, message: "Row 1 has 1 values for 2 columns" },
    ]);
  });

  it("row citations address the same rows the reconciliation sees", () => {
    expect(recordRows(source)).toHaveLength(2);
    const sources = new Map([["s1", source]]);
    expect(validateCitations([{ sourceId: "s1", row: 1 }], sources)).toEqual([]);
    expect(validateCitations([{ sourceId: "s1", row: 2 }], sources)).toHaveLength(1);
    expect(validateCitations([{ sourceId: "s1", quote: "INV-1,\"Paid by wire, confirmed by phone\",100" }], sources)).toEqual([]);
  });

  it("reconciles keys from rows containing embedded newlines", () => {
    const other = { id: "s2", kind: "records" as const, content: "ref,total\nINV-2,0\nINV-1,100\n" };
    const r = reconcile(
      [
        { sourceId: "s1", keyField: "id" },
        { sourceId: "s2", keyField: "ref" },
      ],
      new Map([
        ["s1", source],
        ["s2", other],
      ]),
    );
    expect(r.sides.map((s) => s.rowCount)).toEqual([2, 2]);
    expect(r.stats).toEqual({ match: 2, partial: 0, near: 0, manual: 0 });
  });
});
