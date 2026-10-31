/** Semantic comparison only. No source observations are manufactured here. */
export type Difference = { path: string; reason: string; expected?: unknown; actual?: unknown };
export type Comparison = { status: 'PASS' | 'FAIL'; differences: Difference[] };

/** Preserve property presence, primitive types, array order, and empty/null/zero. */
export function compareValues(expected: unknown, actual: unknown): Comparison {
  const differences: Difference[] = [];
  function walk(left: unknown, right: unknown, path: string): void {
    if (differences.length >= 50) return;
    if (Object.is(left, right)) return;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      differences.push({ path, reason: 'value or type differs', expected: left, actual: right });
      return;
    }
    if (Array.isArray(left) !== Array.isArray(right)) {
      differences.push({ path, reason: 'container type differs', expected: left, actual: right });
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) differences.push({ path: `${path}.length`, reason: 'array length differs', expected: left.length, actual: right.length });
      for (let i = 0; i < Math.min(left.length, right.length); i++) walk(left[i], right[i], `${path}[${i}]`);
      return;
    }
    const l = left as Record<string, unknown>;
    const r = right as Record<string, unknown>;
    for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const next = `${path}[${JSON.stringify(key)}]`;
      const hasL = Object.hasOwn(l, key);
      const hasR = Object.hasOwn(r, key);
      if (!hasL || !hasR) differences.push({ path: next, reason: hasL ? 'property missing in actual' : 'unexpected actual property', ...(hasL ? { expected: l[key] } : {}), ...(hasR ? { actual: r[key] } : {}) });
      else walk(l[key], r[key], next);
      if (differences.length >= 50) break;
    }
  }
  walk(expected, actual, '$');
  return { status: differences.length ? 'FAIL' : 'PASS', differences };
}

/** Validate the comparison representation without coercing or omitting values. */
export function isCanonicalAnswers(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const refs = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.field !== 'string' || !row.field || refs.has(row.field)) return false;
    refs.add(row.field);
    if (Object.keys(row).some(key => key !== 'field' && key !== 'answer')) return false;
    const answer = row.answer;
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
    if (answer.presence === 'missing' || answer.presence === 'null') {
      if (Object.keys(answer).length !== 1) return false;
    } else if (answer.presence === 'value') {
      if (Object.keys(answer).sort().join(',') !== 'presence,value,valueType') return false;
      if (!['string', 'number', 'boolean'].includes(answer.valueType) || typeof answer.value !== answer.valueType) return false;
      if (answer.valueType === 'number' && !Number.isFinite(answer.value)) return false;
    } else return false;
  }
  return true;
}
