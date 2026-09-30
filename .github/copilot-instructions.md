<!-- SKYHOOK_RULES_START -->
# Skyhook Project Intelligence & Governance Rules

This repository is governed by Skyhook. As an AI Agent working in this codebase, you MUST adhere to the following rules:

1. **Backlog & Task Leases**:
   - Query 'skyhook_get_next_task' or inspect 'skyhook://backlog' before starting any feature work.
   - Acquire an advisory lease for your assigned story to avoid stepping on concurrent agent tasks.
   - Transition tasks using 'skyhook_update_status' (e.g. backlog -> ready -> in-progress -> in-review -> done).

2. **Architectural Governance & Boundary Policies**:
   - Never bypass Domain-Driven Design (DDD) module boundaries or introduce circular dependencies.
   - Call 'skyhook_verify_policies' before modifying code across modules.
   - If an architectural decision is made, record it via 'skyhook_record_decision'.

3. **Traceability Annotations**:
   - Tag exported symbols (classes, functions, interfaces) with JSDoc/docstring comments linking to story or requirement IDs:
     `@skyhook-implements REQ-XXX` or `@skyhook-story STORY-YYY`
   - Verify traceability using 'skyhook_trace_requirement' or the 'skyhook trace' CLI.
<!-- SKYHOOK_RULES_END -->
