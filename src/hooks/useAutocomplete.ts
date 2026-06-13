import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { mathAtom } from '../store';
import type { MathScope } from '../types';

import { currencyCodes } from '../evalUtils';

const INTERNAL_KEY = /^(ref|_L\d+)$/;

// Common everyday units worth autocompleting
const COMMON_UNITS = new Set([
  // length
  'm', 'cm', 'mm', 'km', 'inch', 'in', 'ft', 'foot', 'yard', 'yd', 'mile', 'mi',
  // mass
  'kg', 'g', 'mg', 'lb', 'lbs', 'oz', 'ton', 'tonne',
  // volume
  'l', 'L', 'liter', 'litre', 'ml', 'mL', 'gallon', 'gal', 'quart', 'qt', 'cup', 'floz',
  // time
  's', 'sec', 'second', 'min', 'minute', 'h', 'hr', 'hour', 'day', 'week', 'month', 'year',
  // temperature
  'degC', 'degF', 'K', 'celsius', 'fahrenheit', 'kelvin',
]);
const MATHJS_NAMES = new Set([
  // constants
  'pi', 'e', 'tau', 'Infinity',
  // arithmetic
  'abs', 'ceil', 'exp', 'floor', 'log', 'log10', 'mod', 'pow', 'round', 'sign', 'sqrt',
  // trigonometry
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  // statistics
  'sum', 'mean', 'median', 'min', 'max', 'mode',
  // combinatorics
  'factorial',
  // units
  'to', 'toBest',
  // logical
  'and', 'or', 'not',
]);
const CONST_VALUES = new Set(['true', 'false']);

export function useAutocomplete(scopeRef: React.MutableRefObject<MathScope>) {
  const math = useAtomValue(mathAtom);

  const completionSource = useMemo(() => {
    return function noteCalCompletion(ctx: CompletionContext): CompletionResult | null {
      const word = ctx.matchBefore(/[a-zA-Z_]\w*/);
      if (!word && !ctx.explicit) return null;

      const options: Completion[] = [];
      const scope = scopeRef.current || {};
      const seen = new Set<string>();

      for (const key of Object.keys(scope)) {
        if (INTERNAL_KEY.test(key) || seen.has(key)) continue;
        seen.add(key);
        const val = scope[key];
        let detail: string | undefined;
        if (typeof val === 'number') {
          detail = String(val);
        } else if (val !== null && typeof val === 'object' && typeof (val as Record<string, unknown>).toString === 'function') {
          detail = String(val);
        }
        options.push({ label: key, type: 'variable', detail });
      }

      // Mathjs functions and constants (whitelist from embeddedDocs)
      if (math) {
        for (const name of MATHJS_NAMES) {
          if (name in (math as unknown as Record<string, unknown>)) {
            options.push({ label: name, type: 'function' });
          }
        }

        for (const name of CONST_VALUES) {
          options.push({ label: name, type: 'constant' });
        }

        // Common units + currencies (skip mathjs's full Unit.UNITS — too many)
        const units = math.Unit?.UNITS;
        const addedUnits = new Set<string>();
        for (const name of COMMON_UNITS) {
          if (units && name in units) {
            addedUnits.add(name);
            options.push({ label: name, type: 'unit', icon: 'unit' } as Completion);
          }
        }
        for (const name of currencyCodes) {
          if (!addedUnits.has(name)) {
            options.push({ label: name, type: 'unit', icon: 'currency' } as Completion);
          }
        }
      }

      if (options.length === 0) return null;

      return {
        from: word ? word.from : ctx.pos,
        options,
        validFor: /^[a-zA-Z_]\w*$/,
      };
    };
  }, [scopeRef, math]);

  return completionSource;
}
