import type { StemProblem } from '../types'

const jsHeader = (fn: string, signature: string) => `/**\n * ${signature}\n */\nfunction ${fn}`

export const STEM_PROBLEMS: StemProblem[] = [
  {
    id: 'STEM-101',
    title: 'Maximum Projectile Height',
    slug: 'maximum-projectile-height',
    difficulty: 'Easy',
    topic: 'Physics',
    acceptance: 74.2,
    tags: ['Math', 'Simulation'],
    description:
      'Given launch speed v (m/s) and launch angle theta in degrees, return the maximum vertical height reached by a projectile in meters assuming no air resistance and g = 9.8.',
    examples: [
      {
        input: 'v = 20, theta = 30',
        output: '5.102',
        explanation: 'h = v^2 * sin^2(theta) / (2 * g), rounded to 3 decimals.',
      },
    ],
    constraints: ['1 <= v <= 300', '0 <= theta <= 90'],
    functionName: 'maxHeight',
    numericTolerance: 0.01,
    starterCode: {
      javascript: `${jsHeader('maxHeight', '@param {number} v\n * @param {number} thetaDegrees\n * @return {number}')}(v, thetaDegrees) {\n  // TODO\n  return 0\n}`,
      python: `def max_height(v: float, theta_degrees: float) -> float:\n    # TODO\n    return 0.0\n`,
      cpp: `double maxHeight(double v, double thetaDegrees) {\n    // TODO\n    return 0.0;\n}`,
      java: `class Solution {\n    public double maxHeight(double v, double thetaDegrees) {\n        // TODO\n        return 0.0;\n    }\n}`,
    },
    editorial: [
      'Convert degrees to radians: r = theta * PI / 180.',
      'Use h = v^2 * sin(r)^2 / (2 * 9.8).',
      'Round to 3 decimals for stable grading.',
    ],
    testCases: [
      { inputLabel: 'v=20, theta=30', args: [20, 30], expected: 5.102 },
      { inputLabel: 'v=10, theta=45', args: [10, 45], expected: 2.551 },
      { inputLabel: 'v=50, theta=10', args: [50, 10], expected: 3.841, hidden: true },
      { inputLabel: 'v=80, theta=90', args: [80, 90], expected: 326.531, hidden: true },
    ],
  },
  {
    id: 'STEM-202',
    title: 'Equivalent Circuit Resistance',
    slug: 'equivalent-circuit-resistance',
    difficulty: 'Medium',
    topic: 'Electrical Engineering',
    acceptance: 61.9,
    tags: ['Array', 'Math'],
    description:
      'You are given two arrays: series resistors and parallel resistors (all in ohms). Total equivalent resistance = sum(series) + equivalent(parallel). If parallel array is empty, treat parallel contribution as 0.',
    examples: [
      {
        input: 'series = [2, 3], parallel = [6, 3]',
        output: '7',
        explanation: 'Parallel eq = 1 / (1/6 + 1/3) = 2, total = 5 + 2 = 7.',
      },
    ],
    constraints: ['All resistor values are > 0', 'Array lengths up to 1000'],
    functionName: 'equivalentResistance',
    numericTolerance: 0.01,
    starterCode: {
      javascript: `${jsHeader('equivalentResistance', '@param {number[]} series\n * @param {number[]} parallel\n * @return {number}')}(series, parallel) {\n  // TODO\n  return 0\n}`,
      python: `from typing import List\n\ndef equivalent_resistance(series: List[float], parallel: List[float]) -> float:\n    # TODO\n    return 0.0\n`,
      cpp: `double equivalentResistance(const vector<double>& series, const vector<double>& parallel) {\n    // TODO\n    return 0.0;\n}`,
      java: `class Solution {\n    public double equivalentResistance(double[] series, double[] parallel) {\n        // TODO\n        return 0.0;\n    }\n}`,
    },
    editorial: [
      'Compute series sum directly.',
      'For parallel, compute reciprocal sum S = sum(1/r).',
      'Equivalent parallel = 1 / S (or 0 if no parallel components).',
    ],
    testCases: [
      { inputLabel: 'series=[2,3], parallel=[6,3]', args: [[2, 3], [6, 3]], expected: 7 },
      { inputLabel: 'series=[10], parallel=[]', args: [[10], []], expected: 10 },
      { inputLabel: 'series=[1,1,1], parallel=[2,2]', args: [[1, 1, 1], [2, 2]], expected: 4, hidden: true },
      { inputLabel: 'series=[4], parallel=[12,6,4]', args: [[4], [12, 6, 4]], expected: 6, hidden: true },
    ],
  },
  {
    id: 'STEM-307',
    title: 'Population After N Years',
    slug: 'population-after-n-years',
    difficulty: 'Easy',
    topic: 'Biology',
    acceptance: 79.1,
    tags: ['Math', 'Loop'],
    description:
      'Given initial population p0, growth rate percent r, and integer years n, apply yearly multiplicative growth: p = p * (1 + r/100). Return floor(p) after n years.',
    examples: [
      {
        input: 'p0 = 1000, r = 5, n = 3',
        output: '1157',
        explanation: '1000 -> 1050 -> 1102.5 -> 1157.625, floor to 1157.',
      },
    ],
    constraints: ['1 <= p0 <= 10^9', '0 <= r <= 100', '0 <= n <= 1000'],
    functionName: 'populationAfterYears',
    starterCode: {
      javascript: `${jsHeader('populationAfterYears', '@param {number} p0\n * @param {number} ratePercent\n * @param {number} years\n * @return {number}')}(p0, ratePercent, years) {\n  // TODO\n  return 0\n}`,
      python: `def population_after_years(p0: int, rate_percent: float, years: int) -> int:\n    # TODO\n    return 0\n`,
      cpp: `long long populationAfterYears(long long p0, double ratePercent, int years) {\n    // TODO\n    return 0;\n}`,
      java: `class Solution {\n    public long populationAfterYears(long p0, double ratePercent, int years) {\n        // TODO\n        return 0L;\n    }\n}`,
    },
    editorial: [
      'Iterate years times.',
      'Multiply by growth factor each iteration.',
      'Use Math.floor on the final value.',
    ],
    testCases: [
      { inputLabel: 'p0=1000,r=5,n=3', args: [1000, 5, 3], expected: 1157 },
      { inputLabel: 'p0=50,r=10,n=0', args: [50, 10, 0], expected: 50 },
      { inputLabel: 'p0=400,r=7,n=5', args: [400, 7, 5], expected: 561, hidden: true },
      { inputLabel: 'p0=100,r=50,n=2', args: [100, 50, 2], expected: 225, hidden: true },
    ],
  },
  {
    id: 'STEM-410',
    title: 'Moving Average Sensor Smoothing',
    slug: 'moving-average-sensor-smoothing',
    difficulty: 'Medium',
    topic: 'Signal Processing',
    acceptance: 58.6,
    tags: ['Array', 'Sliding Window'],
    description:
      'Given sensor readings nums and window size k, return an array of moving averages for each contiguous window of length k. Round each average to 2 decimals.',
    examples: [
      {
        input: 'nums = [1, 2, 3, 4], k = 2',
        output: '[1.5, 2.5, 3.5]',
        explanation: 'Average every adjacent pair.',
      },
    ],
    constraints: ['1 <= nums.length <= 10^5', '1 <= k <= nums.length'],
    functionName: 'movingAverage',
    numericTolerance: 0.01,
    starterCode: {
      javascript: `${jsHeader('movingAverage', '@param {number[]} nums\n * @param {number} k\n * @return {number[]}')}(nums, k) {\n  // TODO\n  return []\n}`,
      python: `from typing import List\n\ndef moving_average(nums: List[float], k: int) -> List[float]:\n    # TODO\n    return []\n`,
      cpp: `vector<double> movingAverage(const vector<double>& nums, int k) {\n    // TODO\n    return {};\n}`,
      java: `class Solution {\n    public double[] movingAverage(double[] nums, int k) {\n        // TODO\n        return new double[0];\n    }\n}`,
    },
    editorial: [
      'Use a sliding window sum to get O(n).',
      'For each full window, average = sum / k.',
      'Round each value to 2 decimals before storing.',
    ],
    testCases: [
      { inputLabel: 'nums=[1,2,3,4], k=2', args: [[1, 2, 3, 4], 2], expected: [1.5, 2.5, 3.5] },
      { inputLabel: 'nums=[5,5,5], k=3', args: [[5, 5, 5], 3], expected: [5] },
      { inputLabel: 'nums=[2,4,6,8,10], k=3', args: [[2, 4, 6, 8, 10], 3], expected: [4, 6, 8], hidden: true },
      { inputLabel: 'nums=[1,2,2,1], k=2', args: [[1, 2, 2, 1], 2], expected: [1.5, 2, 1.5], hidden: true },
    ],
  },
  {
    id: 'STEM-512',
    title: 'Longest GC Streak',
    slug: 'longest-gc-streak',
    difficulty: 'Easy',
    topic: 'Bioinformatics',
    acceptance: 82.7,
    tags: ['String'],
    description:
      "Given a DNA string of characters A,C,G,T, return the length of the longest contiguous substring containing only G or C.",
    examples: [
      {
        input: 'dna = "ATGCCCTAA"',
        output: '4',
        explanation: 'Longest run is "GCCC".',
      },
    ],
    constraints: ['1 <= dna.length <= 2 * 10^5'],
    functionName: 'longestGCStreak',
    starterCode: {
      javascript: `${jsHeader('longestGCStreak', '@param {string} dna\n * @return {number}')}(dna) {\n  // TODO\n  return 0\n}`,
      python: `def longest_gc_streak(dna: str) -> int:\n    # TODO\n    return 0\n`,
      cpp: `int longestGCStreak(const string& dna) {\n    // TODO\n    return 0;\n}`,
      java: `class Solution {\n    public int longestGCStreak(String dna) {\n        // TODO\n        return 0;\n    }\n}`,
    },
    editorial: [
      'Track current run length and best run length.',
      'If character is G or C, increment current.',
      'Otherwise reset current run to zero.',
    ],
    testCases: [
      { inputLabel: 'dna="ATGCCCTAA"', args: ['ATGCCCTAA'], expected: 4 },
      { inputLabel: 'dna="AAAA"', args: ['AAAA'], expected: 0 },
      { inputLabel: 'dna="GCGCGT"', args: ['GCGCGT'], expected: 5, hidden: true },
      { inputLabel: 'dna="TTTTG"', args: ['TTTTG'], expected: 1, hidden: true },
    ],
  },
  {
    id: 'STEM-623',
    title: 'Signal Path in Lab Grid',
    slug: 'signal-path-in-lab-grid',
    difficulty: 'Hard',
    topic: 'Robotics',
    acceptance: 44.3,
    tags: ['Graph', 'BFS'],
    description:
      "Given a grid where 'S' is start, 'E' is end, '#' is blocked, and '.' is open, return the shortest path length from S to E using 4-directional movement. Return -1 if unreachable.",
    examples: [
      {
        input: 'grid = ["S..", ".#.", "..E"]',
        output: '4',
        explanation: 'One shortest route uses 4 moves.',
      },
    ],
    constraints: ['1 <= rows, cols <= 100'],
    functionName: 'shortestSignalPath',
    starterCode: {
      javascript: `${jsHeader('shortestSignalPath', '@param {string[]} grid\n * @return {number}')}(grid) {\n  // TODO\n  return -1\n}`,
      python: `from typing import List\n\ndef shortest_signal_path(grid: List[str]) -> int:\n    # TODO\n    return -1\n`,
      cpp: `int shortestSignalPath(const vector<string>& grid) {\n    // TODO\n    return -1;\n}`,
      java: `class Solution {\n    public int shortestSignalPath(String[] grid) {\n        // TODO\n        return -1;\n    }\n}`,
    },
    editorial: [
      'Locate S and E first.',
      'Run BFS from S over valid cells.',
      'Distance when first reaching E is the shortest path.',
    ],
    testCases: [
      { inputLabel: 'grid=["S..",".#.","..E"]', args: [['S..', '.#.', '..E']], expected: 4 },
      { inputLabel: 'grid=["S#E"]', args: [['S#E']], expected: -1 },
      { inputLabel: 'grid=["S.E"]', args: [['S.E']], expected: 2, hidden: true },
      { inputLabel: 'grid=["S..#","##.#","...E"]', args: [['S..#', '##.#', '...E']], expected: 5, hidden: true },
    ],
  },
]

export const DEFAULT_LANGUAGE = 'javascript' as const
