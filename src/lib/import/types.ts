export type ImportFileType = "csv" | "excel" | "pdf";

export interface MappingConfig {
  fileType: ImportFileType;
  /** Header names to use, only for csv/excel. */
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  currencyColumn?: string;
  foreignAmountColumn?: string;
  /** Some UAE bank statements print the FX markup/fee as its own column. */
  feeColumn?: string;
  /** Mortgage statements: principal/interest split, if the bank prints it. */
  principalColumn?: string;
  interestColumn?: string;
  /**
   * PDF only: a regex with named groups matched against each extracted line,
   * e.g. `^(?<date>\d{2}/\d{2}/\d{4})\s+(?<description>.+?)\s+(?<amount>-?[\d,]+\.\d{2})\s*(?<currency>[A-Z]{3})?$`
   */
  lineRegex?: string;
  /** date-fns format string, e.g. "dd/MM/yyyy". */
  dateFormat: string;
  /** csv only; auto-detected but editable. */
  delimiter?: string;
  /** Rows to skip before the header row (csv/excel) or before data starts (pdf). */
  skipRows: number;
  amountSign: "spend_positive" | "spend_negative";
}

export interface ParsedRow {
  rowIndex: number;
  raw: string;
  date: string | null; // ISO yyyy-MM-dd once parsed, else null
  description: string;
  amountAED: number | null;
  amountOriginal: number | null;
  currencyOriginal: string;
  fxFee: number | null;
  principalPortion: number | null;
  interestPortion: number | null;
  error?: string;
}

export interface ParseFileResult {
  fileType: ImportFileType;
  /** Header row for csv/excel; ["Line"] for pdf. */
  headers: string[];
  /** Raw rows including any leading junk rows the user will skip via skipRows. */
  rows: string[][];
}
