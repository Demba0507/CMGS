/** Monetary values are integer FCFA amounts. Rates are basis points: 0.01% = 1 bp. */
export interface FinancialLine { quantity: number; salePrice: number; purchasePrice: number; initialSupplierPrice?: number }
export interface FinancialSummary { salesAmount: number; purchaseAmount: number; supplierSavings: number; grossMargin: number; supplierCommission: number; deliveryFees: number; serviceFees: number; cmgsEarnings: number }
export function calculateLine(line: FinancialLine) {
  const quantity = Math.max(0, Math.trunc(line.quantity));
  const salesAmount = line.salePrice * quantity;
  const purchaseAmount = line.purchasePrice * quantity;
  const supplierSavings = Math.max(0, (line.initialSupplierPrice ?? line.purchasePrice) - line.purchasePrice) * quantity;
  return { salesAmount, purchaseAmount, supplierSavings, grossMargin: salesAmount - purchaseAmount };
}
export function calculateSupplierCommission(purchaseAmount: number, rateBasisPoints = 1): number {
  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0 || rateBasisPoints <= 0) return 0;
  return Math.floor((purchaseAmount * rateBasisPoints) / 10_000);
}
export function calculateSummary(lines: FinancialLine[], deliveryFees = 0, serviceFees = 0, commissionRateBasisPoints = 1): FinancialSummary {
  const totals = lines.reduce((summary, line) => { const calculated = calculateLine(line); return { salesAmount: summary.salesAmount + calculated.salesAmount, purchaseAmount: summary.purchaseAmount + calculated.purchaseAmount, supplierSavings: summary.supplierSavings + calculated.supplierSavings, grossMargin: summary.grossMargin + calculated.grossMargin }; }, { salesAmount: 0, purchaseAmount: 0, supplierSavings: 0, grossMargin: 0 });
  const supplierCommission = calculateSupplierCommission(totals.purchaseAmount, commissionRateBasisPoints);
  return { ...totals, supplierCommission, deliveryFees, serviceFees, cmgsEarnings: totals.grossMargin + supplierCommission + serviceFees };
}
