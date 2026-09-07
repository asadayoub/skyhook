import test from 'node:test';
import { execSync } from 'child_process';
import wtfnode from 'wtfnode';

// We can't easily hook node --test. But wait, I can just install wtfnode and require it in a test.
