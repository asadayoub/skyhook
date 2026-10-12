import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { InferenceEngine } from '../lib/inference/InferenceEngine.js';
import { PythonProvider } from '../lib/inference/providers/PythonProvider.js';
import { GoModProvider } from '../lib/inference/providers/GoModProvider.js';
import { CargoTomlProvider } from '../lib/inference/providers/CargoTomlProvider.js';

test('TASK-F10: PythonProvider correctly detects modern pyproject.toml FastAPI stack', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-py-test-'));

  try {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), `
[project]
name = "fastapi-service"
version = "0.1.0"
dependencies = [
    "fastapi>=0.110.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "pytest>=8.0.0",
    "pydantic>=2.0.0",
    "uvicorn>=0.28.0"
]

[tool.uv]
dev-dependencies = ["pytest"]
`);
    fs.writeFileSync(path.join(tmpDir, 'uv.lock'), '');

    const facts = { features: [], confidence: {} };
    const provider = new PythonProvider();
    await provider.infer(tmpDir, facts);

    assert.strictEqual(facts.language, 'Python');
    assert.strictEqual(facts.framework, 'FastAPI');
    assert.strictEqual(facts.orm, 'SQLAlchemy');
    assert.strictEqual(facts.database, 'PostgreSQL');
    assert.strictEqual(facts.testing, 'pytest');
    assert.strictEqual(facts.apiStyle, 'REST (OpenAPI)');
    assert.strictEqual(facts.packageManager, 'uv');
    assert.ok(facts.features.includes('pydantic'));
    assert.ok(facts.features.includes('uvicorn'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F10: PythonProvider detects requirements.txt with Django and Celery', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-py-req-'));

  try {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), `
Django==5.0.2
psycopg2-binary>=2.9.9
redis>=5.0.0
celery>=5.3.0
alembic>=1.13.0
django-allauth>=0.61.0
`);
    fs.writeFileSync(path.join(tmpDir, 'setup.py'), `
from setuptools import setup
setup(name='django_backend')
`);

    const facts = { features: [], confidence: {} };
    const provider = new PythonProvider();
    await provider.infer(tmpDir, facts);

    assert.strictEqual(facts.language, 'Python');
    assert.strictEqual(facts.framework, 'Django');
    assert.strictEqual(facts.orm, 'Django ORM');
    assert.strictEqual(facts.database, 'PostgreSQL + Redis');
    assert.strictEqual(facts.auth, 'django-allauth');
    assert.strictEqual(facts.packageManager, 'pip');
    assert.strictEqual(facts.buildTool, 'setuptools');
    assert.ok(facts.features.includes('celery'));
    assert.ok(facts.features.includes('alembic'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F10: GoModProvider correctly detects go.mod with Gin, GORM, and testify', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-go-test-'));

  try {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), `
module github.com/skyhook/microservice

go 1.22.1

require (
	github.com/gin-gonic/gin v1.9.1
	gorm.io/gorm v1.25.7
	github.com/jackc/pgx/v5 v5.5.3
	github.com/stretchr/testify v1.8.4
	google.golang.org/grpc v1.62.0
)
`);

    const facts = { features: [], confidence: {} };
    const provider = new GoModProvider();
    await provider.infer(tmpDir, facts);

    assert.strictEqual(facts.language, 'Go');
    assert.strictEqual(facts.framework, 'Gin');
    assert.strictEqual(facts.orm, 'GORM');
    assert.strictEqual(facts.database, 'PostgreSQL');
    assert.strictEqual(facts.testing, 'testify');
    assert.strictEqual(facts.apiStyle, 'gRPC');
    assert.strictEqual(facts.packageManager, 'go modules');
    assert.ok(facts.features.includes('module:github.com/skyhook/microservice'));
    assert.ok(facts.features.includes('go:1.22.1'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F10: CargoTomlProvider correctly detects Cargo.toml workspace with Axum and SQLx', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-rust-test-'));

  try {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), `
[package]
name = "rust-core-engine"
version = "0.1.0"
edition = "2021"

[workspace]
members = ["crates/*"]

[dependencies]
axum = "0.7"
tokio = { version = "1.0", features = ["full"] }
sqlx = { version = "0.7", features = ["postgres"] }
tokio-postgres = "0.7"
tonic = "0.11"

[dev-dependencies]
criterion = "0.5"
`);

    const facts = { features: [], confidence: {} };
    const provider = new CargoTomlProvider();
    await provider.infer(tmpDir, facts);

    assert.strictEqual(facts.language, 'Rust');
    assert.strictEqual(facts.framework, 'Axum');
    assert.strictEqual(facts.orm, 'SQLx');
    assert.strictEqual(facts.database, 'PostgreSQL');
    assert.strictEqual(facts.packageManager, 'cargo');
    assert.strictEqual(facts.buildTool, 'cargo');
    assert.strictEqual(facts.monorepo, true);
    assert.strictEqual(facts.testing, 'cargo test + criterion');
    assert.strictEqual(facts.apiStyle, 'gRPC (Tonic)');
    assert.ok(facts.features.includes('edition:2021'));
    assert.ok(facts.features.includes('runtime:tokio'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F10: InferenceEngine.analyze integrates all polyglot providers seamlessly', async () => {
  const tmpGo = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-engine-go-'));
  const tmpPy = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-engine-py-'));

  try {
    // Go project
    fs.writeFileSync(path.join(tmpGo, 'go.mod'), `
module acme.corp/billing
go 1.21
require (
  github.com/labstack/echo/v4 v4.11.4
  github.com/go-sql-driver/mysql v1.7.1
)
`);
    const engine = new InferenceEngine();
    const goFacts = await engine.analyze(tmpGo);

    assert.strictEqual(goFacts.language, 'Go');
    assert.strictEqual(goFacts.framework, 'Echo');
    assert.strictEqual(goFacts.database, 'MySQL');
    assert.strictEqual(goFacts.packageManager, 'go modules');
    assert.ok(goFacts.confidence.language >= 0.9);

    // Python project
    fs.writeFileSync(path.join(tmpPy, 'pyproject.toml'), `
[tool.poetry]
name = "data-pipeline"
version = "0.1.0"
[tool.poetry.dependencies]
flask = "^3.0.0"
sqlalchemy = "^2.0.0"
aiosqlite = "^0.19.0"
pytest = "^8.0.0"
`);
    const pyFacts = await engine.analyze(tmpPy);

    assert.strictEqual(pyFacts.language, 'Python');
    assert.strictEqual(pyFacts.framework, 'Flask');
    assert.strictEqual(pyFacts.orm, 'SQLAlchemy');
    assert.strictEqual(pyFacts.database, 'SQLite');
    assert.strictEqual(pyFacts.testing, 'pytest');
    assert.strictEqual(pyFacts.packageManager, 'poetry');
    assert.ok(pyFacts.confidence.language >= 0.9);
  } finally {
    fs.rmSync(tmpGo, { recursive: true, force: true });
    fs.rmSync(tmpPy, { recursive: true, force: true });
  }
});
