export type CostInputs = {
  comparable: boolean; monthlyResponses: number; baselineMonthly: number; baselineLimit: number;
  baselineLaborHours: number; setupHours: number; hourlyRate: number; maintenanceHours: number;
  hardwareMonthly: number; powerStorageMonthly: number; amortizationMonths: number;
};
export type CostResult =
  | { status: 'INVALID' | 'NOT_COMPARABLE'; reasons: string[] }
  | { status: 'ESTIMATE'; baselineMonthlyTotal: number; localRecurring: number; setupCost: number;
      firstMonth: number; amortizedMonthly: number; firstMonthSaving: number; monthlySaving: number;
      reductionPercent: number | null; periodBaseline: number; periodLocal: number; periodSaving: number };

/** User-supplied scenario, never a price quote or measured customer saving. All amounts share one currency. */
export function calculateCosts(input: CostInputs): CostResult {
  const keys: Array<Exclude<keyof CostInputs, 'comparable'>> = [
    'monthlyResponses', 'baselineMonthly', 'baselineLimit', 'baselineLaborHours', 'setupHours',
    'hourlyRate', 'maintenanceHours', 'hardwareMonthly', 'powerStorageMonthly', 'amortizationMonths',
  ];
  if (!input || typeof input !== 'object' || typeof input.comparable !== 'boolean') return { status: 'INVALID', reasons: ['Supply a complete cost scenario.'] };
  const invalid = keys.filter(key => !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 1_000_000);
  const integers = (['monthlyResponses', 'baselineLimit', 'amortizationMonths'] as const)
    .filter(key => !Number.isInteger(input[key]) || input[key] < 1);
  if (invalid.length || integers.length) return { status: 'INVALID', reasons: [
    ...invalid.map(key => `${key}: enter a finite amount from 0 to 1,000,000.`),
    ...integers.map(key => `${key}: enter a positive whole number.`),
  ] };
  const reasons: string[] = [];
  if (!input.comparable) reasons.push('Confirm a supported, attended, single-device workflow with no hosted collection or integrations.');
  if (input.monthlyResponses > input.baselineLimit) reasons.push('The quoted source plan does not cover the requested monthly responses. Enter a suitable plan and price.');
  if (reasons.length) return { status: 'NOT_COMPARABLE', reasons };
  const baselineMonthlyTotal = input.baselineMonthly + input.baselineLaborHours * input.hourlyRate;
  const setupCost = input.setupHours * input.hourlyRate;
  const localRecurring = input.maintenanceHours * input.hourlyRate + input.hardwareMonthly + input.powerStorageMonthly;
  const firstMonth = setupCost + localRecurring;
  const amortizedMonthly = localRecurring + setupCost / input.amortizationMonths;
  const monthlySaving = baselineMonthlyTotal - amortizedMonthly;
  const periodBaseline = baselineMonthlyTotal * input.amortizationMonths;
  const periodLocal = localRecurring * input.amortizationMonths + setupCost;
  return { status: 'ESTIMATE', baselineMonthlyTotal, localRecurring, setupCost, firstMonth, amortizedMonthly,
    firstMonthSaving: baselineMonthlyTotal - firstMonth, monthlySaving,
    reductionPercent: baselineMonthlyTotal === 0 ? null : monthlySaving / baselineMonthlyTotal * 100,
    periodBaseline, periodLocal, periodSaving: periodBaseline - periodLocal };
}
