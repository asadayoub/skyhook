import test from 'node:test';
import assert from 'node:assert';
import { SymbolLineageTracker } from '../lib/tracer/SymbolLineageTracker.js';

test('SymbolLineageTracker: computes AST fingerprints and similarity scores', () => {
  const symbolA = {
    file: 'src/auth/legacy_login.js',
    symbolName: 'loginUser',
    symbolType: 'function',
    context: 'async function loginUser(username, password) { return verifyToken(username, password); }'
  };

  const symbolB = {
    file: 'src/auth/AuthService.js',
    symbolName: 'authenticateUser',
    symbolType: 'function',
    context: 'async function authenticateUser(username, password) { return verifyToken(username, password); }'
  };

  const symbolC = {
    file: 'src/database/schema.js',
    symbolName: 'createUserTable',
    symbolType: 'function',
    context: 'function createUserTable(tableName) { db.execute("CREATE TABLE"); }'
  };

  const fpA = SymbolLineageTracker.computeASTFingerprint(symbolA);
  assert.ok(fpA);
  assert.strictEqual(fpA.name, 'loginUser');
  assert.strictEqual(fpA.paramCount, 2);
  assert.ok(fpA.tokens.includes('verifytoken'));

  // Calculate similarity: loginUser vs authenticateUser (high structural affinity)
  const simAB = SymbolLineageTracker.calculateSimilarity(symbolA, symbolB);
  assert.ok(simAB >= 0.50, `Expected similarity >= 0.50, got ${simAB}`);

  // Calculate similarity: loginUser vs createUserTable (low affinity)
  const simAC = SymbolLineageTracker.calculateSimilarity(symbolA, symbolC);
  assert.ok(simAB > simAC, `Expected ${simAB} > ${simAC}`);
});

test('SymbolLineageTracker: finds refactored matches across candidates', () => {
  const originalSymbol = {
    file: 'src/payment.js',
    symbolName: 'processPayment',
    symbolType: 'function',
    line: 10,
    context: 'function processPayment(accountId, amount, currency) { return chargeGateway(accountId, amount); }'
  };

  const candidateA = {
    file: 'src/payment_v2.js',
    symbolName: 'executeTransaction',
    symbolType: 'function',
    line: 25,
    context: 'function executeTransaction(accountId, amount, currency) { return chargeGateway(accountId, amount); }'
  };

  const candidateB = {
    file: 'src/logger.js',
    symbolName: 'logError',
    symbolType: 'function',
    line: 5,
    context: 'function logError(message) {}'
  };

  const match = SymbolLineageTracker.findRefactoredMatch(originalSymbol, [candidateA, candidateB], 0.60);
  assert.ok(match);
  assert.strictEqual(match.symbol.symbolName, 'executeTransaction');
  assert.strictEqual(match.reason, 'renamed');
  assert.ok(match.similarity >= 60);
});

test('SymbolLineageTracker: detects broken lineage and suggests recoveries', () => {
  const requirements = [
    { id: 'REQ-AUTH-01', title: 'User authentication with login tokens' }
  ];

  const allSymbols = [
    {
      file: 'src/auth/service.js',
      symbolName: 'authenticateLoginToken',
      symbolType: 'function',
      line: 42,
      traced: false,
      context: 'function authenticateLoginToken(credentials) {}'
    }
  ];

  const broken = SymbolLineageTracker.detectBrokenLineage(allSymbols, requirements);
  assert.strictEqual(broken.length, 1);
  assert.strictEqual(broken[0].requirementId, 'REQ-AUTH-01');
  assert.ok(broken[0].suggestedSymbols.length > 0);
  assert.strictEqual(broken[0].suggestedSymbols[0].symbolName, 'authenticateLoginToken');
});
