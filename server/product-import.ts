import * as xlsx from "xlsx";
import { insertProductSchema, type InsertProduct } from "@shared/schema";

type CellValue = string | number | boolean | Date | null | undefined;
type ImportRow = CellValue[];

export type ProductImportError = {
  row: number;
  message: string;
};

export type ParsedProductImportItem = {
  rowNumber: number;
  quantity: number;
  supplierPrice: number;
  markupPercent: number;
  finalPrice: number;
  product: InsertProduct;
};

export type ParsedProductImport = {
  totalRows: number;
  markupPercent: number;
  items: ParsedProductImportItem[];
  errors: ProductImportError[];
  fatalError?: string;
};

const DEFAULT_CATEGORY = "Поставка";
export const DEFAULT_IMPORT_MARKUP_PERCENT = 30;

const REQUIRED_FIELDS = ["name", "quantity", "supplierPrice", "imageUrl"] as const;

const HEADER_ALIASES = {
  name: ["название", "наименование", "товар", "name", "product"],
  quantity: ["количество", "остаток", "кол-во", "qty", "quantity", "stock"],
  supplierPrice: [
    "закупочная цена",
    "изначальная цена",
    "цена поставщика",
    "себестоимость",
    "cost",
    "base price",
    "supplier price",
  ],
  imageUrl: [
    "ссылка на фото",
    "фото",
    "фотография",
    "изображение",
    "image",
    "image url",
    "image_url",
    "photo",
    "photo url",
  ],
  category: ["категория", "раздел", "category"],
  description: ["описание", "description"],
  markupPercent: ["наценка", "наценка %", "наценка, %", "markup", "markup percent"],
} as const;

type ImportField = keyof typeof HEADER_ALIASES;
type HeaderMap = Partial<Record<ImportField, number>>;

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
    field,
    new Set(aliases.map(normalizeHeader)),
  ]),
) as Record<ImportField, Set<string>>;

export function normalizeProductName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function parseMarkupPercent(value: unknown, fallback = DEFAULT_IMPORT_MARKUP_PERCENT) {
  const parsed = parseNumber(value);
  if (parsed === null || parsed < 0 || parsed > 1000) {
    return fallback;
  }

  return parsed;
}

export function buildProductImportTemplateBuffer() {
  const workbook = xlsx.utils.book_new();

  workbook.Props = {
    Title: "Шаблон импорта товаров",
    Subject: "Поставка товаров для каталога",
    Author: "FoodDash",
    Company: "FoodDash",
    CreatedDate: new Date(),
  };

  const supplyRows: Array<Array<string | number>> = [
    ["Название", "Количество", "Закупочная цена", "Ссылка на фото", "Категория", "Описание", "Наценка, %"],
    [
      "Капучино 250 мл",
      24,
      95,
      "https://example.com/images/cappuccino.jpg",
      "Напитки",
      "Кофейный напиток с молочной пеной",
      "",
    ],
    [
      "Сэндвич с курицей",
      18,
      180,
      "https://example.com/images/chicken-sandwich.jpg",
      "Сэндвичи",
      "Сэндвич с курицей, сыром и соусом",
      35,
    ],
    [
      "Салат овощной",
      12,
      140,
      "https://example.com/images/vegetable-salad.jpg",
      "Салаты",
      "Свежие овощи и зелень",
      "",
    ],
  ];

  const supplySheet = xlsx.utils.aoa_to_sheet(supplyRows);
  supplySheet["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 48 },
    { wch: 18 },
    { wch: 36 },
    { wch: 12 },
  ];
  supplySheet["!autofilter"] = { ref: `A1:G${supplyRows.length}` };
  applyNumberFormat(supplySheet, "B2:B200", "0");
  applyNumberFormat(supplySheet, "C2:C200", '#,##0.00 "₽"');
  applyNumberFormat(supplySheet, "G2:G200", "0.0");
  xlsx.utils.book_append_sheet(workbook, supplySheet, "Поставка");

  const helpRows = [
    ["Шаблон импорта товаров"],
    ["Обязательные колонки", "Название, Количество, Закупочная цена, Ссылка на фото"],
    ["Автонаценка", "Если колонка \"Наценка, %\" пуста, применяется процент из формы импорта."],
    ["Повтор товара", "Если название уже есть в каталоге, остаток увеличится, а цена и данные обновятся."],
    ["Категория", `Если категория не указана, будет использовано значение "${DEFAULT_CATEGORY}".`],
  ];
  const helpSheet = xlsx.utils.aoa_to_sheet(helpRows);
  helpSheet["!cols"] = [{ wch: 22 }, { wch: 84 }];
  xlsx.utils.book_append_sheet(workbook, helpSheet, "Подсказки");

  return xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    cellStyles: false,
  }) as Buffer;
}

export function parseProductImportWorkbook(buffer: Buffer, markupInput: unknown): ParsedProductImport {
  const markupPercent = parseMarkupPercent(markupInput);
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return {
      totalRows: 0,
      markupPercent,
      items: [],
      errors: [],
      fatalError: "В Excel-файле нет листов",
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<ImportRow>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });

  const headerIndex = rows.findIndex((row) => {
    const map = buildHeaderMap(row);
    return Boolean(map.name !== undefined && map.quantity !== undefined && map.supplierPrice !== undefined);
  });

  if (headerIndex === -1) {
    return {
      totalRows: 0,
      markupPercent,
      items: [],
      errors: [],
      fatalError: "Не найдены колонки: Название, Количество, Закупочная цена",
    };
  }

  const headers = buildHeaderMap(rows[headerIndex]);
  const missing = REQUIRED_FIELDS.filter((field) => headers[field] === undefined);

  if (missing.length > 0) {
    return {
      totalRows: 0,
      markupPercent,
      items: [],
      errors: [],
      fatalError: `Не найдены обязательные колонки: ${missing.map(fieldLabel).join(", ")}`,
    };
  }

  const errors: ProductImportError[] = [];
  const items: ParsedProductImportItem[] = [];
  let totalRows = 0;

  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (!rowHasData(row)) {
      return;
    }

    totalRows += 1;
    const rowNumber = headerIndex + index + 2;
    const result = parseProductRow(row, headers, rowNumber, markupPercent);

    if ("error" in result) {
      errors.push(result.error);
      return;
    }

    items.push(result.item);
  });

  return {
    totalRows,
    markupPercent,
    items,
    errors,
  };
}

function parseProductRow(
  row: ImportRow,
  headers: HeaderMap,
  rowNumber: number,
  defaultMarkupPercent: number,
): { item: ParsedProductImportItem } | { error: ProductImportError } {
  const messages: string[] = [];
  const name = getText(row, headers.name);
  const quantity = parseNumber(getCell(row, headers.quantity));
  const supplierPrice = parseNumber(getCell(row, headers.supplierPrice));
  const imageUrl = getText(row, headers.imageUrl);
  const category = getText(row, headers.category) || DEFAULT_CATEGORY;
  const description = getText(row, headers.description);
  const rowMarkupValue = getCell(row, headers.markupPercent);
  const rowMarkup = isBlank(rowMarkupValue) ? defaultMarkupPercent : parseNumber(rowMarkupValue);

  if (!name) messages.push("Название товара обязательно");
  if (quantity === null || quantity <= 0 || !Number.isInteger(quantity)) {
    messages.push("Количество должно быть целым числом больше 0");
  }
  if (supplierPrice === null || supplierPrice <= 0) {
    messages.push("Закупочная цена должна быть больше 0");
  }
  if (!imageUrl) {
    messages.push("Ссылка на фото обязательна");
  } else if (!isImageUrl(imageUrl)) {
    messages.push("Ссылка на фото должна начинаться с http://, https:// или /uploads/");
  }
  if (rowMarkup === null || rowMarkup < 0 || rowMarkup > 1000) {
    messages.push("Наценка должна быть числом от 0 до 1000");
  }

  if (messages.length > 0 || quantity === null || supplierPrice === null || rowMarkup === null) {
    return {
      error: {
        row: rowNumber,
        message: messages.join("; "),
      },
    };
  }

  const finalPrice = roundMoney(supplierPrice * (1 + rowMarkup / 100));
  const parsed = insertProductSchema.safeParse({
    name,
    description,
    price: finalPrice.toFixed(2),
    stock: quantity,
    category,
    imageUrl,
    marketplaceStatus: {},
  });

  if (!parsed.success) {
    return {
      error: {
        row: rowNumber,
        message: "Некорректные данные товара",
      },
    };
  }

  return {
    item: {
      rowNumber,
      quantity,
      supplierPrice,
      markupPercent: rowMarkup,
      finalPrice,
      product: parsed.data,
    },
  };
}

function applyNumberFormat(sheet: xlsx.WorkSheet, range: string, format: string) {
  const decoded = xlsx.utils.decode_range(range);

  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const ref = xlsx.utils.encode_cell({ r: row, c: col });
      const cell = sheet[ref];

      if (cell) {
        cell.z = format;
      }
    }
  }
}

function buildHeaderMap(row: ImportRow): HeaderMap {
  const map: HeaderMap = {};

  row.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return;

    for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
      if (map[field] === undefined && NORMALIZED_ALIASES[field].has(normalized)) {
        map[field] = index;
        break;
      }
    }
  });

  return map;
}

function normalizeHeader(value: CellValue) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[%.,:;()]/g, "")
    .replace(/\s+/g, " ");
}

function getCell(row: ImportRow, index: number | undefined) {
  if (index === undefined) return null;
  return row[index] ?? null;
}

function getText(row: ImportRow, index: number | undefined) {
  const value = getCell(row, index);
  return String(value ?? "").trim();
}

function isBlank(value: CellValue) {
  return value === null || value === undefined || String(value).trim() === "";
}

function rowHasData(row: ImportRow) {
  return row.some((value) => !isBlank(value));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/[₽рР][уУ]?[бБ]?\.?/g, "")
    .replace(/%/g, "")
    .replace(/\s+/g, "");

  if (!raw) return null;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = raw.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isImageUrl(value: string) {
  return /^https?:\/\/\S+/i.test(value) || value.startsWith("/uploads/");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fieldLabel(field: (typeof REQUIRED_FIELDS)[number]) {
  switch (field) {
    case "name":
      return "Название";
    case "quantity":
      return "Количество";
    case "supplierPrice":
      return "Закупочная цена";
    case "imageUrl":
      return "Ссылка на фото";
    default:
      return field;
  }
}
