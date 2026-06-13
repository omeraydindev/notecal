import type { MathInstance } from './types';

let _math: MathInstance | null = null;

export async function initMath(): Promise<MathInstance> {
  if (_math) return _math;
  const {
    create,
    evaluateDependencies,
    unitDependencies,
    createUnitDependencies,
    toDependencies,
    toBestDependencies,
    formatDependencies,
    numberDependencies,
    booleanDependencies,
    stringDependencies,
    // arithmetic
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    unaryMinusDependencies,
    modDependencies,
    // math functions
    sqrtDependencies,
    ceilDependencies,
    floorDependencies,
    expDependencies,
    logDependencies,
    log10Dependencies,
    roundDependencies,
    signDependencies,
    // trig
    sinDependencies,
    cosDependencies,
    tanDependencies,
    asinDependencies,
    acosDependencies,
    atanDependencies,
    // stats
    sumDependencies,
    meanDependencies,
    medianDependencies,
    minDependencies,
    maxDependencies,
    modeDependencies,
    // combinatorics
    factorialDependencies,
    randomDependencies,
    // comparison
    smallerEqDependencies,
    largerEqDependencies,
    unequalDependencies,
    // logical
    andDependencies,
    orDependencies,
    notDependencies,
    // constants
    piDependencies,
    eDependencies,
    tauDependencies,
    InfinityDependencies,
  } = await import('mathjs');

  _math = create({
    evaluateDependencies,
    unitDependencies,
    createUnitDependencies,
    toDependencies,
    toBestDependencies,
    formatDependencies,
    numberDependencies,
    booleanDependencies,
    stringDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    unaryMinusDependencies,
    modDependencies,
    sqrtDependencies,
    ceilDependencies,
    floorDependencies,
    expDependencies,
    logDependencies,
    log10Dependencies,
    roundDependencies,
    signDependencies,
    sinDependencies,
    cosDependencies,
    tanDependencies,
    asinDependencies,
    acosDependencies,
    atanDependencies,
    sumDependencies,
    meanDependencies,
    medianDependencies,
    minDependencies,
    maxDependencies,
    modeDependencies,
    factorialDependencies,
    randomDependencies,
    smallerEqDependencies,
    largerEqDependencies,
    unequalDependencies,
    andDependencies,
    orDependencies,
    notDependencies,
    piDependencies,
    eDependencies,
    tauDependencies,
    InfinityDependencies,
  }) as unknown as MathInstance;

  return _math;
}

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
