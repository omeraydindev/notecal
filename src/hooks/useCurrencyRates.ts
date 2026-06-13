import { useState, useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { mathAtom } from '../store';
import { currencyCodes } from '../evalUtils';

export function useCurrencyRates(): boolean {
  const math = useAtomValue(mathAtom);
  const fetchedRef = useRef(false);
  const [currencyLoaded, setCurrencyLoaded] = useState(false);

  useEffect(() => {
    if (!math || fetchedRef.current) return;

    fetchedRef.current = true;

    const fetchCurrencyRates = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();

        if (data && data.rates) {
          const rates = { USD: 1, ...data.rates };

          math.createUnit('usd', { aliases: ['USD'] });
          currencyCodes.add('usd');
          for (const code of Object.keys(rates)) {
            if (code === 'USD') continue;
            const lower = code.toLowerCase();
            try {
              math.createUnit(lower, { definition: `${1 / rates[code]} usd`, aliases: [code] });
              currencyCodes.add(lower);
            } catch {
              // unit already exists
            }
          }

          setCurrencyLoaded(true);
        }
      } catch (error) {
        console.error('Failed to fetch currency rates:', error);
      }
    };

    fetchCurrencyRates();
  }, [math]);

  return currencyLoaded;
}
