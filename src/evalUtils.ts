import type { MathScope, MathDisplayObject, Result, MathInstance } from './types';

export const isMathDisplayObject = (value: unknown): value is MathDisplayObject => (
  typeof value === 'object'
  && value !== null
  && ('isUnit' in value || 'isComplex' in value || 'isFraction' in value)
);

export const formatNumber = (num: number) => {
  if (typeof num !== 'number' || isNaN(num)) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
};

export const resolveLineReferences = (expr: string, currentIdx: number, results: Result[]): string => {
  return expr.replace(/(?<!\w)\$(-?\d+)\b/g, (match, numStr) => {
    const target = parseInt(numStr, 10);
    let targetIdx: number;
    if (target > 0) {
      targetIdx = target - 1;
    } else if (target < 0) {
      targetIdx = currentIdx + target;
    } else {
      return match;
    }
    if (targetIdx >= 0 && targetIdx < currentIdx && results[targetIdx]?.value != null) {
      return String(results[targetIdx].value);
    }
    return match;
  });
};

export const stripComments = (expr: string, isInBlockComment = false) => {
  let result = '';
  let index = 0;

  while (index < expr.length) {
    if (isInBlockComment) {
      const blockEnd = expr.indexOf('*/', index);
      if (blockEnd === -1) return { expr: result.trim(), isInBlockComment: true };
      index = blockEnd + 2;
      isInBlockComment = false;
      continue;
    }

    if (expr.startsWith('//', index)) break;

    if (expr.startsWith('/*', index)) {
      isInBlockComment = true;
      index += 2;
      continue;
    }

    result += expr[index];
    index += 1;
  }

  return { expr: result.trim(), isInBlockComment };
};

const preprocessExpr = (expr: string, currentIdx?: number, results?: Result[]): string | null => {
  const { expr: uncommentedExpr } = stripComments(expr);
  if (!uncommentedExpr) return null;

  let processedExpr = uncommentedExpr;

  if (currentIdx !== undefined && results) {
    processedExpr = resolveLineReferences(processedExpr, currentIdx, results);
  }

  processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)([kmb])\b/gi, (_match, num, suffix) => {
    const multipliers: { [key: string]: number } = { k: 1e3, m: 1e6, b: 1e9 };
    return `(${num} * ${multipliers[suffix.toLowerCase()]})`;
  });

  if (processedExpr.includes('$')) return null;

  return processedExpr;
};

export const evaluateSingle = (
  expr: string,
  scope: MathScope,
  math: MathInstance,
  currentIdx?: number,
  results?: Result[],
): { text: string; value: number | null } => {
  const processedExpr = preprocessExpr(expr, currentIdx, results);
  if (!processedExpr) return { text: '', value: null };

  try {
    const res = math.evaluate(processedExpr, scope);

    if (res === undefined || res === null || typeof res === 'function') {
      return { text: '', value: null };
    }

    if (typeof res === 'number') {
      return { text: formatNumber(res), value: res };
    }

    if (isMathDisplayObject(res)) {
      return { text: res.toString(), value: null };
    }

    return { text: '', value: null };
  } catch {
    return { text: '', value: null };
  }
};

export const processLines = (lines: string[], scope: MathScope, math: MathInstance): Result[] => {
  let isInBlockComment = false;
  const results: Result[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const strippedLine = stripComments(lines[idx], isInBlockComment);
    isInBlockComment = strippedLine.isInBlockComment;

    if (!strippedLine.expr) {
      results.push({ text: '', value: null });
      continue;
    }

    const evaluated = evaluateSingle(strippedLine.expr, scope, math, idx, results);
    results.push(evaluated);
  }

  return results;
};
