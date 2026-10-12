import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SpecContractParser } from '../lib/parsers/SpecContractParser.js';
import { parseFile, ParserRegistry } from '../lib/parsers/index.js';

test('SpecContractParser correctly identifies OpenAPI, Swagger, Protobuf, and GraphQL files', () => {
  const parser = new SpecContractParser();

  // Protobuf & GraphQL
  assert.strictEqual(parser.canHandle('service.proto'), true);
  assert.strictEqual(parser.canHandle('schema.graphql'), true);
  assert.strictEqual(parser.canHandle('types.gql'), true);

  // Filename heuristics
  assert.strictEqual(parser.canHandle('openapi.json'), true);
  assert.strictEqual(parser.canHandle('swagger.yaml'), true);
  assert.strictEqual(parser.canHandle('api-spec.yml'), true);

  // Content sniffing for arbitrary JSON/YAML
  assert.strictEqual(parser.canHandle('contracts/api.json', '{\n  "openapi": "3.0.0",\n  "paths": {}\n}'), true);
  assert.strictEqual(parser.canHandle('config/api.yaml', 'openapi: 3.0.0\npaths:\n'), true);

  // Non-spec files are not handled by spec parser
  assert.strictEqual(parser.canHandle('package.json', '{\n  "name": "foo"\n}'), false);
  assert.strictEqual(parser.canHandle('index.js', 'console.log("hi");'), false);
});

test('SpecContractParser extracts OpenAPI JSON endpoints with contract-endpoint and derived-contract metadata', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-spec-json-'));
  const filePath = path.join(tmpDir, 'openapi.json');

  const openapiContent = JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Auth Service API", version: "1.0.0" },
    paths: {
      "/api/v1/auth/login": {
        post: {
          summary: "Authenticate user",
          description: "@skyhook-implements REQ-AUTH-001",
          operationId: "loginUser",
          responses: {
            "200": { description: "Success" }
          }
        }
      }
    }
  }, null, 2);

  fs.writeFileSync(filePath, openapiContent, 'utf-8');

  try {
    const parser = new SpecContractParser();
    const symbols = await parser.parse(filePath, tmpDir);

    assert.strictEqual(symbols.length, 1);
    const sym = symbols[0];
    assert.strictEqual(sym.symbolName, 'POST /api/v1/auth/login');
    assert.strictEqual(sym.symbolType, 'contract-endpoint');
    assert.strictEqual(sym.requirementId, 'REQ-AUTH-001');
    assert.strictEqual(sym.traced, true);
    assert.strictEqual(sym.metadata.artifactKind, 'derived-contract');
    assert.strictEqual(sym.metadata.specType, 'openapi');
    assert.notStrictEqual(sym.symbolName, 'UnknownSymbol');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SpecContractParser extracts OpenAPI YAML schemas with contract-schema', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-spec-yaml-'));
  const filePath = path.join(tmpDir, 'swagger.yaml');

  const yamlContent = `
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0
components:
  schemas:
    UserDTO:
      type: object
      description: "@skyhook-implements REQ-USER-002"
      properties:
        id:
          type: string
        email:
          type: string
`;

  fs.writeFileSync(filePath, yamlContent, 'utf-8');

  try {
    const parser = new SpecContractParser();
    const symbols = await parser.parse(filePath, tmpDir);

    assert.strictEqual(symbols.length, 1);
    const sym = symbols[0];
    assert.strictEqual(sym.symbolName, 'UserDTO');
    assert.strictEqual(sym.symbolType, 'contract-schema');
    assert.strictEqual(sym.requirementId, 'REQ-USER-002');
    assert.strictEqual(sym.metadata.artifactKind, 'derived-contract');
    assert.notStrictEqual(sym.symbolName, 'UnknownSymbol');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SpecContractParser extracts Protobuf RPC methods and GraphQL types', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-spec-proto-'));
  const protoPath = path.join(tmpDir, 'auth.proto');
  const gqlPath = path.join(tmpDir, 'schema.graphql');

  const protoContent = `
syntax = "proto3";
package auth;

service AuthService {
  // @skyhook-implements REQ-AUTH-003
  rpc Authenticate (AuthRequest) returns (AuthResponse);
}
`;

  const gqlContent = `
# @skyhook-implements REQ-GRAPH-004
type Account {
  id: ID!
  email: String!
}
`;

  fs.writeFileSync(protoPath, protoContent, 'utf-8');
  fs.writeFileSync(gqlPath, gqlContent, 'utf-8');

  try {
    const parser = new SpecContractParser();

    // 1. Protobuf
    const protoSymbols = await parser.parse(protoPath, tmpDir);
    assert.strictEqual(protoSymbols.length, 1);
    assert.strictEqual(protoSymbols[0].symbolName, 'Authenticate');
    assert.strictEqual(protoSymbols[0].symbolType, 'contract-rpc');
    assert.strictEqual(protoSymbols[0].requirementId, 'REQ-AUTH-003');
    assert.strictEqual(protoSymbols[0].metadata.specType, 'protobuf');

    // 2. GraphQL
    const gqlSymbols = await parser.parse(gqlPath, tmpDir);
    assert.strictEqual(gqlSymbols.length, 1);
    assert.strictEqual(gqlSymbols[0].symbolName, 'Account');
    assert.strictEqual(gqlSymbols[0].symbolType, 'contract-type');
    assert.strictEqual(gqlSymbols[0].requirementId, 'REQ-GRAPH-004');
    assert.strictEqual(gqlSymbols[0].metadata.specType, 'graphql');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseFile via ParserRegistry seamlessly routes openapi.json to SpecContractParser', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-pipeline-spec-'));
  const openapiPath = path.join(tmpDir, 'openapi.json');

  fs.writeFileSync(openapiPath, JSON.stringify({
    openapi: "3.0.0",
    paths: {
      "/health": {
        get: {
          summary: "Healthcheck",
          description: "@skyhook-implements REQ-HEALTH-001"
        }
      }
    }
  }, null, 2), 'utf-8');

  try {
    const symbols = await parseFile(openapiPath, tmpDir);
    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].symbolName, 'GET /health');
    assert.strictEqual(symbols[0].symbolType, 'contract-endpoint');
    assert.strictEqual(symbols[0].metadata.artifactKind, 'derived-contract');
    assert.notStrictEqual(symbols[0].symbolName, 'UnknownSymbol');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
