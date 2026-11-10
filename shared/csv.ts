export interface CsvRecord {
  cells: string[];
  /** The record exactly as it appears in the source, including embedded newlines. */
  text: string;
  /** 1-based line on which the record starts. */
  line: number;
}

export interface CsvProblem {
  line: number;
  message: string;
}

/**
 * RFC 4180 CSV: comma-separated, double-quoted fields may contain commas,
 * newlines and doubled quotes. Unquoted fields are trimmed; quoted fields are
 * kept exactly. Blank lines are skipped. Malformed input is parsed leniently
 * and reported in `problems` rather than silently reshaped.
 */
export function parseCsv(input: string): { records: CsvRecord[]; problems: CsvProblem[] } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  const problems: CsvProblem[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let afterQuote = false;
  let line = 1;
  let recordStart = 0;
  let recordLine = 1;

  const endField = () => {
    cells.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
    afterQuote = false;
  };
  const endRecord = (end: number) => {
    endField();
    const raw = text.slice(recordStart, end);
    if (raw.trim()) records.push({ cells, text: raw, line: recordLine });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const end = i;
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord(end);
      line++;
      recordStart = i + 1;
      recordLine = line;
      continue;
    }
    if (afterQuote) {
      if (ch === " " || ch === "\t") continue;
      problems.push({ line, message: "Text after a closing quote" });
      afterQuote = false;
      field += ch;
      continue;
    }
    if (ch === '"' && !wasQuoted && !field.trim()) {
      quoted = true;
      wasQuoted = true;
      field = "";
      continue;
    }
    if (ch === '"') problems.push({ line, message: "Quote inside an unquoted field" });
    field += ch;
  }
  if (quoted) problems.push({ line: recordLine, message: "Quoted field is never closed" });
  if (recordStart < text.length || cells.length) endRecord(text.length);
  return { records, problems };
}
