/**
 * ADR Diagram Generator
 * Automatically generates Mermaid architecture and component interaction diagrams
 * tailored to the decision context, category, and tech stack.
 */

/**
 * Generate a Mermaid diagram representing the proposed architecture for an ADR
 * @param {Object} decisionData - Decision metadata (title, decision, category, context)
 * @param {Object} projectContext - Project profile and tech-stack context
 * @returns {string} Mermaid diagram code block
 */
export function generateADRDiagram(decisionData, projectContext = {}) {
  const category = (decisionData.category || 'architecture').toLowerCase();
  const title = decisionData.title || 'Architectural Decision';
  const decisionText = `${decisionData.decision || ''} ${decisionData.context || ''}`.toLowerCase();

  // Helper to sanitize node labels
  function sanitize(str) {
    return (str || '').replace(/["<>{}|#&]/g, '').replace(/\\/g, '/');
  }

  // 1. Database / Storage Decisions
  if (decisionText.includes('database') || decisionText.includes('postgres') || decisionText.includes('mysql') || decisionText.includes('prisma') || decisionText.includes('drizzle') || decisionText.includes('mongo')) {
    let dbName = 'Database';
    if (decisionText.includes('postgres')) dbName = 'PostgreSQL';
    else if (decisionText.includes('mysql')) dbName = 'MySQL';
    else if (decisionText.includes('mongo')) dbName = 'MongoDB';
    else if (decisionText.includes('sqlite')) dbName = 'SQLite';

    let ormName = 'Data Layer';
    if (decisionText.includes('prisma')) ormName = 'Prisma ORM';
    else if (decisionText.includes('drizzle')) ormName = 'Drizzle ORM';

    return `\`\`\`mermaid
flowchart TB
    subgraph ClientLayer["🖥️ Presentation Layer"]
        App["Web / API Client"]
    end

    subgraph ServiceLayer["⚙️ Application Services"]
        Service["Business Logic / Controllers"]
        ORM["💾 ${ormName}"]
    end

    subgraph StorageLayer["🗄️ Persistence"]
        DB[("💽 ${dbName}")]
    end

    App -->|"Requests"| Service
    Service -->|"Queries & Mutations"| ORM
    ORM -->|"Driver Connection"| DB

    classDef service fill:#ebf8ff,stroke:#3182ce,stroke-width:2px,color:#2b6cb0;
    classDef storage fill:#f0fff4,stroke:#38a169,stroke-width:2px,color:#22543d;
    class Service,ORM service;
    class DB storage;
\`\`\``;
  }

  // 2. Authentication / Security Decisions
  if (category === 'security' || decisionText.includes('auth') || decisionText.includes('jwt') || decisionText.includes('oauth') || decisionText.includes('session')) {
    let authMechanism = 'Auth Provider / JWT';
    if (decisionText.includes('clerk')) authMechanism = 'Clerk Auth Service';
    else if (decisionText.includes('nextauth') || decisionText.includes('auth.js')) authMechanism = 'NextAuth.js Session';
    else if (decisionText.includes('supabase')) authMechanism = 'Supabase Auth';

    return `\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User Client
    participant App as 🖥️ Application Gateway
    participant Auth as 🔐 ${authMechanism}
    participant Resource as 📦 Protected API / DB

    User->>App: 1. Login Request (Credentials / OAuth)
    App->>Auth: 2. Validate & Issue Credentials
    Auth-->>App: 3. Return Signed Token / Session
    App-->>User: 4. Set Secure Cookie / Token
    User->>App: 5. Request Protected Route + Token
    App->>Auth: 6. Verify Signature & Claims
    Auth-->>App: 7. Token Validated
    App->>Resource: 8. Execute Authorized Action
    Resource-->>User: 9. Secure Response Data
\`\`\``;
  }

  // 3. API / Protocol / Network Decisions (Fastify, Express, GraphQL, tRPC, REST)
  if (decisionText.includes('fastify') || decisionText.includes('express') || decisionText.includes('trpc') || decisionText.includes('graphql') || decisionText.includes('rest') || decisionText.includes('api')) {
    let frameworkName = 'HTTP API Engine';
    if (decisionText.includes('fastify')) frameworkName = 'Fastify Engine';
    else if (decisionText.includes('express')) frameworkName = 'Express Server';
    else if (decisionText.includes('trpc')) frameworkName = 'tRPC Router';

    return `\`\`\`mermaid
flowchart LR
    Client["🌐 API Consumer<br/>(Web / Mobile)"]
    Gateway["🛡️ ${frameworkName}"]
    Middleware["⚙️ Validation & Auth Middleware"]
    Handler["⚡ Route Handlers"]
    Backend["📦 Core Domain Services"]

    Client -->|"HTTP / RPC"| Gateway
    Gateway --> Middleware
    Middleware -->|"Validated Context"| Handler
    Handler -->|"Execute"| Backend

    classDef core fill:#f7fafc,stroke:#4a5568,stroke-width:2px;
    classDef highlight fill:#feebc8,stroke:#dd6b20,stroke-width:2px,color:#7b341e;
    class Gateway,Handler highlight;
\`\`\``;
  }

  // 4. Default Architectural Component Diagram
  const safeTitle = sanitize(title);
  return `\`\`\`mermaid
flowchart TB
    subgraph ArchitectureScope["🏛️ Architecture Scope: ${safeTitle}"]
        direction TB
        Context["📋 Context / Ingestion"]
        Core["⚙️ Proposed Core Decision"]
        Outputs["🎯 Affected Components / Targets"]

        Context -->|"Applies To"| Core
        Core -->|"Governs"| Outputs
    end

    classDef default fill:#edf2f7,stroke:#718096,stroke-width:2px;
    classDef active fill:#e6fffa,stroke:#319795,stroke-width:2px,color:#234e52;
    class Core active;
\`\`\``;
}
