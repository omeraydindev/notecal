import { create, all } from 'mathjs';

export const math = create(all);

export const TABS_STORAGE_KEY = 'notecal-tabs';

export const INITIAL_TEXT = `// Welcome to NoteCal!
// Type anywhere, math gets calculated automatically on the right.

income = 5k
rent = 1.2k
groceries = 150 * 4
utilities = 200
subscriptions = 15 + 10 + 12.50

total = rent + groceries + utilities + subscriptions

// You can use variables and shorthands (k, m, b):
savings = 0.20 * income
bonus = 1.5m

// And complex math functions:
sqrt(144) + 2^3
sin(45 deg)
`;
