import { useState, useEffect, useRef, type RefObject } from 'react';
import type { MathScope } from '../types';

export function useCurrencyRates(text: string, scopeRef: RefObject<MathScope>): boolean {
  const currencyRates = useRef<Record<string, number>>({});
  const availableCurrencies = useRef<string[]>([]);
  const currencyFetchTriggered = useRef(false);
  const [currencyLoaded, setCurrencyLoaded] = useState(false);

  useEffect(() => {
    if (currencyFetchTriggered.current) return;

    const currencyPattern = /\b[a-z]{3}_to_[a-z]{3}\(\)/;
    if (!currencyPattern.test(text)) return;

    currencyFetchTriggered.current = true;

    const fetchCurrencyRates = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();

        if (data && data.rates) {
          const rates = { USD: 1, ...data.rates };
          const currencies = Object.keys(rates);

          currencyRates.current = rates;
          availableCurrencies.current = currencies;

          const currencyFunctions: Record<string, () => number> = {};

          for (const from of currencies) {
            for (const to of currencies) {
              if (from !== to) {
                const fnName = `${from.toLowerCase()}_to_${to.toLowerCase()}`;
                currencyFunctions[fnName] = () => {
                  const fromRate = rates[from];
                  const toRate = rates[to];
                  return toRate / fromRate;
                };
              }
            }
          }

          Object.assign(scopeRef.current, currencyFunctions);
          setCurrencyLoaded(true);
        }
      } catch (error) {
        console.error('Failed to fetch currency rates:', error);
      }
    };

    fetchCurrencyRates();
  }, [text, scopeRef]);

  return currencyLoaded;
}
