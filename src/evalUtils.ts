import type { MathDisplayObject, Result } from './types';

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
