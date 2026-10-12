#!/usr/bin/env node

/**
 * Skyhook Semantic Backlog Git Merge Driver
 * Usage: node skyhook-merge-driver.js %O %A %B
 * %O: Ancestor (base)
 * %A: Current (our branch)
 * %B: Other (their branch)
 */

import { BacklogMergeDriver } from '../lib/git/BacklogMergeDriver.js';

const [ancestor, current, other] = process.argv.slice(2);

if (!ancestor || !current || !other) {
  console.error('Usage: skyhook-merge-driver <ancestor-file> <current-file> <other-file>');
  process.exit(1);
}

try {
  BacklogMergeDriver.mergeFiles(ancestor, current, other);
  process.exit(0);
} catch (err) {
  console.error(`Skyhook Merge Driver Error: ${err.message}`);
  process.exit(1);
}
