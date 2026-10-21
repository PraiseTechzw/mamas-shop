const SHEETS_API = 'https://sheets.googleapis.com/v4';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export type GoogleEvent = {
  idempotency_key: string;
  owner_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
  actor_id?: string;
};

async function googleRequest(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google API request failed (${response.status}): ${body?.error?.message ?? 'Unknown error'}`);
  return body;
}

export async function createSpreadsheet(accessToken: string, shopName: string, logoBytes: Uint8Array) {
  const name = shopName.trim() || "Mama's Shop";
  const created = await googleRequest(`${SHEETS_API}/spreadsheets`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: `${name} · Business Records` },
      sheets: ['Overview', 'Weekly Summary', 'Seller Summary', 'Sales', 'Stock', 'Products', 'Expenses', 'Payments', 'Customers', 'Events'].map((title, index) => ({ properties: { sheetId: index + 1, title, gridProperties: { frozenRowCount: title === 'Overview' ? 3 : 1 } } })),
    }),
  });
  const spreadsheetId = created.spreadsheetId as string;

  const boundary = `mamas-shop-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: `${name} Mama's Shop logo.png`, mimeType: 'image/png' });
  const start = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`);
  const end = new TextEncoder().encode(`\r\n--${boundary}--`);
  const multipart = new Uint8Array(start.length + logoBytes.length + end.length);
  multipart.set(start); multipart.set(logoBytes, start.length); multipart.set(end, start.length + logoBytes.length);
  const logoFile = await googleRequest(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, accessToken, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  const logoId = logoFile.id as string;
  await googleRequest(`${DRIVE_API}/files/${logoId}/permissions`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });

  const headers: Record<string, string[]> = {
    Sales: ['Record key', 'Date and time', 'Receipt', 'Product', 'Quantity', 'Unit price', 'Line total', 'Paid', 'Credit balance', 'Payment method', 'Customer', 'Seller', 'Location', 'Sale status', 'Customer ID', 'Seller ID'],
    Stock: ['Record key', 'Date and time', 'Movement', 'Product', 'Quantity / change', 'Unit cost', 'From location', 'To location', 'Reason', 'Product ID'],
    Products: ['Record key', 'Date and time', 'Action', 'Product', 'SKU', 'Category', 'Unit', 'Selling price', 'Unit cost', 'Reorder level', 'Opening quantity', 'Product ID'],
    Expenses: ['Record key', 'Date and time', 'Title', 'Category', 'Amount', 'Payment method', 'Note', 'Expense date', 'Expense ID'],
    Payments: ['Record key', 'Date and time', 'Type', 'Customer', 'Amount', 'Method', 'Note', 'Customer ID'],
    Customers: ['Record key', 'Date and time', 'Action', 'Customer', 'Phone', 'Customer ID'],
    Events: ['Event key', 'Date and time', 'Event type', 'Record ID', 'Recorded by user ID', 'Full event data'],
  };
  const values: Record<string, unknown[][]> = {
    Overview: [
      [`=IMAGE("https://drive.google.com/uc?export=view&id=${logoId}")`],
      [name],
      ['Live business ledger · Updated from Mama’s Shop'],
      ['Metric', 'This week', 'All time'],
      ['Sales total', '=SUMIFS(Sales!G:G,Sales!B:B,">="&TODAY()-WEEKDAY(TODAY(),2)+1)', '=SUM(Sales!G:G)'],
      ['Number of sales', '=COUNTUNIQUE(FILTER(Sales!C2:C,Sales!B2:B>=TODAY()-WEEKDAY(TODAY(),2)+1,Sales!C2:C<>""))', '=COUNTUNIQUE(FILTER(Sales!C2:C,Sales!C2:C<>""))'],
      ['Customer credit balance', '=SUM(Sales!I:I)-SUMIFS(Payments!E:E,Payments!C:C,"CUSTOMER REPAYMENT")', '=SUM(Sales!I:I)-SUMIFS(Payments!E:E,Payments!C:C,"CUSTOMER REPAYMENT")'],
      ['Stock movements', '=COUNTIFS(Stock!B:B,">="&TODAY()-WEEKDAY(TODAY(),2)+1)', '=COUNTA(Stock!A:A)-1'],
      ['Seller totals', '', 'See Seller Summary tab'],
      ['How to use', '', 'Open the other tabs for full history. Dates are kept in ISO format for sorting.'],
    ],
    'Weekly Summary': [
      ['Week starting', 'Sales total', 'Items sold'],
      ['=QUERY({ARRAYFORMULA(IF(Sales!B2:B<>"",Sales!B2:B-WEEKDAY(Sales!B2:B,2)+1,)),Sales!G2:G,Sales!E2:E},"select Col1,sum(Col2),sum(Col3) where Col1 is not null group by Col1 order by Col1 label Col1 \'\',sum(Col2) \'\',sum(Col3) \'\'",0)'],
    ],
    'Seller Summary': [
      ['Seller', 'All-time sales', '', 'Seller', 'This week sales'],
      ['=QUERY({Sales!L2:L,Sales!G2:G},"select Col1,sum(Col2) where Col1 is not null group by Col1 label Col1 \'\',sum(Col2) \'\'",0)', '', '', '=QUERY({Sales!L2:L,Sales!B2:B,Sales!G2:G},"select Col1,sum(Col3) where Col1 is not null and Col2 >= date \'"&TEXT(TODAY()-WEEKDAY(TODAY(),2)+1,"yyyy-mm-dd")&"\' group by Col1 label Col1 \'\',sum(Col3) \'\'",0)'],
    ],
    ...Object.fromEntries(Object.entries(headers).map(([sheet, header]) => [sheet, [header]])),
  };
  await googleRequest(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: Object.entries(values).map(([sheet, rows]) => ({ range: `${sheet}!A1`, values: rows })) }),
  });

  const spreadsheetInfo = await googleRequest(`${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, accessToken);
  const requests: unknown[] = [];
  for (const sheet of spreadsheetInfo.sheets as { properties: { sheetId: number; title: string } }[]) {
    const overview = sheet.properties.title === 'Overview';
    requests.push({ repeatCell: { range: { sheetId: sheet.properties.sheetId, startRowIndex: overview ? 3 : 0, endRowIndex: overview ? 4 : 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.36, green: 0.26, blue: 0.84 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy)' } });
    if (overview) {
      requests.push({ mergeCells: { range: { sheetId: sheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
      requests.push({ mergeCells: { range: { sheetId: sheet.properties.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
      requests.push({ mergeCells: { range: { sheetId: sheet.properties.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
      requests.push({ repeatCell: { range: { sheetId: sheet.properties.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.36, green: 0.26, blue: 0.84 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 20 }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat' } });
      requests.push({ updateDimensionProperties: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 78 }, fields: 'pixelSize' } });
      requests.push({ updateDimensionProperties: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } });
    }
    requests.push({ addBanding: { bandedRange: { range: { sheetId: sheet.properties.sheetId, startRowIndex: overview ? 4 : 1 }, rowProperties: { headerColor: { red: 0.36, green: 0.26, blue: 0.84 }, firstBandColor: { red: 1, green: 1, blue: 1 }, secondBandColor: { red: 0.96, green: 0.95, blue: 1 } } } } });
  }
  await googleRequest(`${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
  return { spreadsheetId, spreadsheetUrl: created.spreadsheetUrl as string };
}

function date(event: GoogleEvent) { return event.occurred_at || event.received_at; }
function str(value: unknown) { return value == null ? '' : String(value); }
function money(cents: unknown) { return typeof cents === 'number' ? cents / 100 : ''; }

export function eventRows(event: GoogleEvent, lookups: { customers: Map<string, string>; sellers: Map<string, string>; products: Map<string, string>; locations: Map<string, string> } = { customers: new Map(), sellers: new Map(), products: new Map(), locations: new Map() }) {
  const p = event.payload ?? {};
  const rowKey = event.idempotency_key;
  const when = date(event);
  const rows: Record<string, unknown[][]> = {
    Events: [[rowKey, when, event.operation, event.entity_id, event.actor_id ?? '', JSON.stringify(p)]],
  };
  if (event.operation === 'sale.create') {
    const items = Array.isArray(p.items) ? p.items as Record<string, unknown>[] : [];
    rows.Sales = items.map((item, index) => [
      `${rowKey}:${index + 1}`, when, str(p.receipt_number), str(item.name ?? item.product_name), item.quantity ?? '', money(item.unitPrice ?? item.unit_price_cents), money(item.lineTotal ?? item.line_total_cents), index === 0 ? money(p.paid_cents) : '', index === 0 ? money(p.balance_cents) : '', index === 0 ? str(p.payment_method) : '', str(p.customer_name ?? lookups.customers.get(str(p.customer_id))), str(p.seller_name ?? lookups.sellers.get(str(p.seller_id))), str(p.location_name ?? lookups.locations.get(str(p.location_id))), index === 0 ? str(p.status) : '', str(p.customer_id), str(p.seller_id),
      ]);
  }
  if (event.operation === 'product.create' || event.operation === 'product.update') {
    rows.Products = [[rowKey, when, event.operation.replace('product.', '').toUpperCase(), str(p.name), str(p.sku), str(p.category), str(p.unit), money(p.priceCents ?? p.price_cents), money(p.costCents ?? p.cost_cents), p.reorder ?? p.reorder_level ?? '', p.opening ?? '', str(p.id ?? event.entity_id)]];
    if (event.operation === 'product.create' && typeof p.opening === 'number' && p.opening > 0) rows.Stock = [[`${rowKey}:opening`, when, 'OPENING', str(p.name), p.opening, money(p.costCents ?? p.cost_cents), '', str(p.location_name), 'Opening stock', str(p.id ?? event.entity_id)]];
  }
  if (['stock.receive', 'stock.adjust', 'stock.transfer'].includes(event.operation)) {
    const movementQuantity = event.operation === 'stock.adjust' ? p.delta : p.quantity;
    rows.Stock = [[rowKey, when, event.operation.replace('stock.', '').toUpperCase(), str(p.product_name ?? lookups.products.get(str(p.product_id))), movementQuantity ?? '', money(p.unit_cost_cents), str(p.from_location_name ?? lookups.locations.get(str(p.from_location_id)) ?? p.from_location_id), str(p.to_location_name ?? p.location_name ?? lookups.locations.get(str(p.to_location_id ?? p.location_id)) ?? p.to_location_id ?? p.location_id), str(p.note), str(p.product_id)]];
  }
  if (event.operation === 'expense.create') rows.Expenses = [[rowKey, str(p.spentAt ?? p.spent_at ?? when), str(p.title), str(p.category), money(p.amountCents ?? p.amount_cents), str(p.method ?? p.payment_method), str(p.note), str(p.spentAt ?? p.spent_at ?? when), str(p.id ?? event.entity_id)]];
  if (event.operation === 'credit.repayment.create') {
    rows.Payments = [[rowKey, when, 'CUSTOMER REPAYMENT', str(p.customer_name ?? lookups.customers.get(str(p.customer_id))), money(p.amount_cents), str(p.method), str(p.note), str(p.customer_id)]];
  } else if (event.operation === 'change_owed.create' || event.operation === 'change_owed.settle') {
    rows.Payments = [[rowKey, when, event.operation === 'change_owed.create' ? 'CHANGE OWED' : 'CHANGE SETTLED', str(p.customer_name ?? lookups.customers.get(str(p.customer_id))), money(p.amount_cents), '', str(p.note), str(p.customer_id)]];
  }
  if (event.operation === 'customer.create' || event.operation === 'customer.update') {
    rows.Customers = [[rowKey, when, event.operation.replace('customer.', '').toUpperCase(), str(p.name), str(p.phone), str(p.id ?? event.entity_id)]];
  }
  return rows;
}

export async function appendUniqueRows(accessToken: string, spreadsheetId: string, sheet: string, rows: unknown[][]) {
  if (!rows.length) return;
  const existing = await googleRequest(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${sheet}!A:A`, accessToken);
  const keys = new Set(((existing.values ?? []) as unknown[][]).flat().map(String));
  const fresh = rows.filter((row) => !keys.has(String(row[0])));
  if (!fresh.length) return;
  await googleRequest(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${sheet}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: fresh }),
  });
}
