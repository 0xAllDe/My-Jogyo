---
description: "Create systematic work plans. Usage: /planner <work-description> [--edit] [--review] [--parallelable]"
subtask: true
---

# Planner - Integrated Work Planning Expert

## Usage

```
/planner <work-description> [--edit] [--review] [--parallelable]
```

## User Request

$ARGUMENTS

### Options

- **--edit**: Open existing plan in edit mode. Can specify path: `--edit plans/backend/ai-todolist-20250101-120000-add-user-auth.md`
- **--review**: Get review from plan-reviewer agent (default: no review required)
- **--parallelable**: Mark tasks that can be executed in parallel ONLY when they have ZERO dependencies and NO conflicts or overlapping parts after conservative review. Use this option sparingly and only when you are certain tasks are completely independent. When enabled, each task will include a `**Parallelizable**: YES (with Task X, Y)` or `**Parallelizable**: NO (reason)` annotation. (default: false)
  **Parallel Execution Criteria (Conservative):**
  - Tasks MUST have zero dependencies on each other
  - Tasks MUST NOT modify the same files or components
  - Tasks MUST NOT share state or data
  - Tasks MUST be independently testable
  - When in doubt, DO NOT mark as parallel - sequential execution is safer
- **--output**: Custom output path override (e.g., `--output ./my-custom-todolist.md`). When specified, bypasses automatic path generation and uses the exact path provided.

## What this command does

Analyzes user requirements to create or modify systematic work plans. Understands project structure, gathers implementation information, and generates detailed actionable plans that workers can follow.

**Output Path**: Plans are saved to versioned, categorized paths:
```
plans/{group}/ai-todolist-{YYYYMMDD-HHMMSS}-{slug}.md
```
Example: `plans/backend/ai-todolist-20250128-125930-add-user-authentication-oauth.md`

## Path Generation System

### 1. Timestamp Generation
Generate timestamp in format `YYYYMMDD-HHMMSS` using the current date/time.
Generate current timestamp in YYYYMMDD-HHMMSS format (e.g., via system time or appropriate tool).

Example output: `20250128-125930`

### 2. Group Inference (Keyword Matching)
Analyze the work description to determine the appropriate group category:

| Group | Trigger Keywords |
|-------|------------------|
| `backend` | api, database, server, endpoint, model, auth, service, query, migration |
| `frontend` | ui, component, page, style, layout, css, react, vue, button, form |
| `refactor` | refactor, cleanup, restructure, reorganize, simplify, optimize |
| `docs` | document, readme, guide, tutorial, documentation, comment |
| `infra` | deploy, ci, docker, config, build, pipeline, kubernetes, terraform |
| `feature` | *(default fallback - no keyword matching, used when no other group matches)* |
| `bugfix` | fix, bug, issue, error, patch, resolve, debug |
| `test` | test, spec, coverage, e2e, unit, integration |

**Matching Rules:**
1. Convert work description to lowercase
2. Check each group's keywords in priority order (bugfix > refactor > test > backend > frontend > infra > docs)
3. First match wins (priority ensures specificity, e.g., "fix API endpoint" → `bugfix` not `backend`)
4. If no keywords match, default to `feature` (fallback group)

**Implementation (pseudo-code):**
```python
def infer_group(description: str) -> str:
    desc_lower = description.lower()
    
    # Priority-ordered keyword groups
    groups = [
        ("bugfix", ["fix", "bug", "issue", "error", "patch", "resolve", "debug"]),
        ("refactor", ["refactor", "cleanup", "restructure", "reorganize", "simplify", "optimize"]),
        ("test", ["test", "spec", "coverage", "e2e", "unit", "integration"]),
        ("backend", ["api", "database", "server", "endpoint", "model", "auth", "service", "query", "migration"]),
        ("frontend", ["ui", "component", "page", "style", "layout", "css", "react", "vue", "button", "form"]),
        ("infra", ["deploy", "ci", "docker", "config", "build", "pipeline", "kubernetes", "terraform"]),
        ("docs", ["document", "readme", "guide", "tutorial", "documentation", "comment"]),
    ]
    
    for group, keywords in groups:
        for keyword in keywords:
            if keyword in desc_lower:
                return group
    
    return "feature"  # Default fallback
```

### 3. Slug Generation
Create a URL-friendly slug from the work description:

**Rules:**
1. Extract meaningful words from description (ASCII alphanumeric only)
2. Remove stop words: `the, a, an, to, for, with, in, on, of, and, or, is, are, be, this, that, it`
3. Convert to lowercase
4. Replace spaces/special chars with hyphens
5. Remove consecutive hyphens
6. Limit to **40 characters maximum**
7. Target **5-7 meaningful words**
8. **Fallback to `plan`** if slug is empty after processing (handles: all stop words, all punctuation, all non-ASCII)

**Implementation (pseudo-code):**
```python
def generate_slug(description: str, max_length: int = 40) -> str:
    import re
    
    stop_words = {"the", "a", "an", "to", "for", "with", "in", "on", "of", 
                  "and", "or", "is", "are", "be", "this", "that", "it"}
    
    # Lowercase and extract ASCII alphanumeric words only
    # Note: Non-ASCII characters are removed (transliterate externally if i18n needed)
    words = re.findall(r'[a-zA-Z0-9]+', description.lower())
    
    # Remove stop words
    meaningful_words = [w for w in words if w not in stop_words]
    
    # Take up to 7 words
    selected_words = meaningful_words[:7]
    
    # Join with hyphens
    slug = "-".join(selected_words)
    
    # Truncate to max length (at word boundary if possible)
    if len(slug) > max_length:
        slug = slug[:max_length].rsplit("-", 1)[0]
    
    # Edge case fallback: empty result (all stop words, all punctuation, all non-ASCII)
    if not slug:
        slug = "plan"
    
    return slug
```

**Slug Examples:**
| Input | Output |
|-------|--------|
| "Add user authentication with OAuth" | `add-user-authentication-oauth` |
| "Fix the login button on the homepage" | `fix-login-button-homepage` |
| "Implement API endpoint for product search" | `implement-api-endpoint-product-search` |
| "Refactor database connection pooling and optimize query performance" | `refactor-database-connection-pooling` |
| "这是一个测试" (all non-ASCII) | `plan` (fallback) |
| "...!!!" (all punctuation) | `plan` (fallback) |
| "the a an to for" (all stop words) | `plan` (fallback) |

### 4. Path Construction

**Final path format:**
```
plans/{group}/ai-todolist-{YYYYMMDD-HHMMSS}-{slug}.md
```

**Directory Creation:**
Before writing the plan file, ensure the directory exists using the Write tool.
The Write tool will automatically create parent directories when writing the plan file to `plans/{group}/ai-todolist-{timestamp}-{slug}.md`.

### 5. Full Path Examples by Category

Complete examples showing the full versioned output path for each group category:

| Work Description | Group | Matched Keyword | Full Output Path |
|------------------|-------|-----------------|------------------|
| "Fix the login button not responding" | `bugfix` | "fix" | `plans/bugfix/ai-todolist-20251228-143022-fix-login-button-responding.md` |
| "Refactor user service to use dependency injection" | `refactor` | "refactor" | `plans/refactor/ai-todolist-20251228-143022-refactor-user-service-dependency.md` |
| "Add unit tests for authentication module" | `test` | "test" | `plans/test/ai-todolist-20251228-143022-add-unit-tests-authentication.md` |
| "Implement REST API for user management" | `backend` | "api" | `plans/backend/ai-todolist-20251228-143022-implement-rest-api-user-management.md` |
| "Create dashboard UI components" | `frontend` | "ui" | `plans/frontend/ai-todolist-20251228-143022-create-dashboard-ui-components.md` |
| "Set up Docker deployment pipeline" | `infra` | "docker" | `plans/infra/ai-todolist-20251228-143022-set-up-docker-deployment-pipeline.md` |
| "Write API documentation for endpoints" | `docs` | "documentation" | `plans/docs/ai-todolist-20251228-143022-write-api-documentation-endpoints.md` |
| "Add shopping cart functionality" | `feature` | (default) | `plans/feature/ai-todolist-20251228-143022-add-shopping-cart-functionality.md` |

**Priority Examples (First Match Wins):**
| Work Description | Expected Group | Why |
|------------------|----------------|-----|
| "Fix API endpoint for user auth" | `bugfix` | "fix" matches first (priority: bugfix > backend) |
| "Refactor test utilities" | `refactor` | "refactor" matches first (priority: refactor > test) |
| "Add integration tests for API" | `test` | "test" matches first (priority: test > backend) |

### 6. Backward Compatibility

The path generation system maintains backward compatibility:

1. **--output flag**: If specified, uses exact path provided (no automatic generation)
   ```
   /planner "Add feature" --output ./custom-plan.md  # Uses exact path provided
   ```

2. **--edit with path**: If --edit specifies a path, uses that path
   ```
   /planner --edit plans/feature/ai-todolist-20251228-143022-user-auth.md  # Edits specified versioned file
   /planner --edit plans/backend/ai-todolist-20250128-120000-add-auth.md  # Edits specified file
   ```

3. **Default behavior**: When no overrides, generates versioned path
   ```
   /planner "Add user auth"  # Creates plans/feature/ai-todolist-20250128-125930-add-user-auth.md
   ```

## Core Principles

### Planning Standards
- **Specific Direction**: Concrete guidelines that workers can directly follow
- **Code Snippet Citations**: Include all relevant code and patterns found during analysis
- **Balanced Detail**: Omit excessive explanation for contextually obvious parts
- **Practical Focus**: Concentrate on actual implementation, exclude unnecessary theory

## Work Process

## Phase 1: Initial Analysis and Information Gathering

### 1.1 Option Processing and Path Determination
Check command options to determine workflow and output path:

**Step 1: Process Options**
- If `--output <path>` specified: Use exact path provided (skip path generation)
- If `--edit <path>` specified: Use the specified path for editing
- If `--edit` without path: Prompt user or find most recent plan in `plans/` directory
- If `--review` flag: Mark for review after creation
- Default: New plan creation mode with automatic path generation

**Step 2: Generate Output Path (if not overridden)**
Execute path generation when creating new plans:

1. **Get timestamp**: Generate current timestamp in YYYYMMDD-HHMMSS format
2. **Infer group**: Analyze work description using keyword matching (see Path Generation System section)
3. **Generate slug**: Create URL-friendly slug from description (see Path Generation System section)
4. **Construct final path**: `plans/{group}/ai-todolist-{timestamp}-{slug}.md`
5. **Write file**: Use Write tool - it automatically creates parent directories

**Step 3: Announce Path Decision**
```
Output path: plans/{group}/ai-todolist-{timestamp}-{slug}.md
Group: {inferred group} (based on keyword: "{matched keyword}")
```

### 1.2 Requirements Analysis
1. **Identify Work Goals**
   - Clarify final objectives user wants to achieve
   - Distinguish functional and non-functional requirements
   - Define success criteria

2. **Scope Setting**
   - Separate what's included vs excluded
   - Set priorities
   - Review phased implementation feasibility

### 1.3 Codebase Analysis for Implementation
1. **Find Related Code Patterns**
   - Search for similar functionality already implemented
   - Identify existing patterns that can be reused or extended
   - Look for related modules and components

2. **Analyze Implementation Context**
   - Find where similar features are implemented
   - Understand how existing code handles similar requirements
   - Identify integration points and dependencies

3. **Extract Project Conventions**
   - Review recent commit history to understand commit message style and project conventions
   - Observe code organization and naming conventions
   - Understand testing and validation approaches used in project

### 1.4 Smart Code Exploration
1. **Semantic Code Search**
   - Use `ck --sem "[concept]"` for understanding code by meaning
   - Use `ck --hybrid "[keyword]"` for both exact and semantic matches
   - Fallback to `Grep` for specific text patterns

2. **Pattern Discovery**
   - Identify existing implementation patterns in project
   - Find reusable components and conventions
   - Map architectural decisions from actual code

## Phase 2: Plan Creation

### 2.1 Plan Structure (Standard Template)

Use this comprehensive template for all work plans:

   ```markdown
   # Original User Request (For Record)
   [Record exactly what the user said when initially requesting the plan, verbatim.]

   ## Additional User Requests (For Record)
   [Record all additional requests made after the initial plan request]

   # Work Objectives
   [List objectives briefly like a tl;dr]
   [List specific goals to achieve]

   # Work Background
   [Explain why this work is needed and the current situation]

   # Execution Started
   is_execution_started = FALSE

   # All Goals Accomplished
   is_all_goals_accomplished = FALSE

   # Parallel Execution Requested
   parallel_requested = FALSE

   # Current Work In Progress
   - Work has not started yet.
      - When starting work, change the value of `is_execution_started` above to TRUE.
      - NEVER start work until the user explicitly says "start the work".
      - **NEVER start even if you received OKAY from plan reviewer**
      - NEVER start work until the user explicitly says "start the work".


   # Prerequisites
   [Domain knowledge, tech stack, etc. needed to perform this work]

   ## File Structure and Roles
   [Describe files affected by the work and each file's role]

   ## Reference Files for Context Understanding
   ### 1. [File Path]
   - **Role**: [What this file does]
   - **Key Sections**: [Which parts to review]
   - **Expected Code Structure**:
      ```python
      # Approximate code structure for workers to find
      class SomeClass:
         def method_to_check(self):
               # Need to verify the logic in this section
               pass
      ```

   ### 2. [Another File Path]
   - **Role**: [Role of this file]
   - **Cautions**: [Points requiring special attention]

   [Note: This file list serves as 'global context' - include only essential references needed for most tasks. Task-specific context should be placed within each 'todo' item.]


   # Work Plan

   ## PRDs & Structures
   [To Understand the big picture easily, write followings:]
   [PRD to create through this work, showing how components and elements interact, in mermaid]
   [Structures Overview to create through this work, in mermaid]

   ## Implementation Details
   [How to implement and what precautions to take]

   ## Project Commit Message Style
   [Summary of this project's commit message patterns based on git log analysis]

   # TODOs

   - [ ] 1. [Feature 1 - e.g.: Modify User model and test. Implementation and testing must always be one Task]
      - [ ] 1.1 Implementation: Modify [specific function/class name] in [specific filename]
         ```python
         {Reference code for this task}
         ```
         - Current: [Current code or state]
         - Change: [Code or state after change]
      - [ ] 1.2 Write Tests: Add tests for this feature in [test_filename.py]
      - [ ] 1.3 Run Tests: `pytest -xvs test_filename.py::test_function_name`
      - [ ] 1.4 Lint and Type Check
         - [ ] `ruff check [modified files]`
         - [ ] `basedpyright [modified files]`
      - [ ] 1.5 Commit after confirming tests pass (**commit per work unit is mandatory**)
         - Write according to project conventions (based on git log analysis)
         - Example: `git add [implementation files + test files] && git commit -m "Add last_login field to User model"`
      - [ ] Orchestrator Task 1 Verification Success (when following the guide below)
         - [Acceptance criteria for Orchestrator: Specific and detailed method/guide to verify task completion.]
         - [ ] [Example: Was the code actually written correctly?]
         - [ ] [Example: After searching the entire existing codebase, is it certain the work follows the existing codebase style?]
         - [ ] [Example: Was the commit actually made?]
         - [ ] [Example: Do tests & type checks actually pass?]
         - [ ] [Example: When actually invoking the feature using python & playwright & terminal etc. (specify the originally intended feature), does it work as originally intended?]

   - [ ] 2. [Feature 2 - e.g.: Implement Login API and test]
      [Write according to detail level]
      - [ ] Orchestrator Task 2 Verification Success (when following the guide below)
         - [Specific and detailed method/guide to verify task completion.]


   - [ ] 3. [Feature 3 - e.g.: Implement authenticated board post creation API and test]
      **Parallelizable**: YES (with Task 4) - Completely independent, modifies different files, zero dependencies
      - [ ] Orchestrator Task 3 Verification Success (when following the guide below)
         - [Specific and detailed method/guide to verify task completion.]


   - [ ] 4. [Feature 4 - e.g.: Implement authenticated board post deletion API and test]
      **Parallelizable**: YES (with Task 3) - Completely independent, modifies different files, zero dependencies
      - [ ] Orchestrator Task 4 Verification Success (when following the guide below)
         - [Specific and detailed method/guide to verify task completion.]


   # Final Work Verification Checklist
   - [ ] 1. [What parts work - how to verify them]
   - [ ] 2. [Checklist to verify correct implementation: things user said not to do, common mistakes per project conventions, points requiring attention during work]
   - [ ] 3. [What changed, whether implementation differs from original plan or has excessive additions]
   - [ ] 4. [Verify existing features potentially affected by modified files still work correctly]
   ```

### 2.2 Plan Creation Strategy

1. **Adaptive Detail Level**
   - Small task: Focus on WHAT and WHERE
   - Medium task: Add HOW with examples
   - Large task: Include WHY and full context

2. **Use `todowrite` for Final Plan**
   - Create todo items ONLY for the actual work steps
   - Each todo = one verifiable action
   - Mark items as workers complete them

3. **Success Criteria**
   - Each step has a clear DONE definition
   - Include exact commands to verify
   - No ambiguous terms like "properly" or "correctly"

4. **Parallel Task Marking (when --parallelable is used)**
   - **BE CONSERVATIVE**: Only mark tasks as parallel when absolutely certain they are independent
   - **Verify Independence**: Check that tasks:
     - Modify completely different files
     - Have zero shared dependencies
     - Do not require sequential execution
     - Can be tested independently
   - **When Uncertain**: Default to sequential execution - it's safer
   - **Mark Pattern**: Add `**Parallelizable**: YES (with Task X, Y)` or `**Parallelizable**: NO (reason)` annotation after each task description
   - **Document Reasoning**: The parallelizable annotation must include WHY tasks can run in parallel or why they cannot

## Phase 3: Option Processing

### --review Option Processing
Execute only when option is specified, but as exactly as following (always send as "This is my first draft" - this makes plan reviewer to review in detail.)

1. **Request Review from plan-reviewer**
   ```python
   Task(
       subagent_type="plan-reviewer",
       description="Review work plan",
       prompt="""
        Please review the created work plan. This is my first draft and may contain errors or omissions. Please perform a thorough review to identify any issues.

       Plan location: @{output_path}  # Use the determined output path

       Please evaluate from these perspectives:
       1. Clarity and achievability of goals
       2. Logical order of implementation steps
       3. Appropriateness of technical approach
       4. Risk identification and mitigation
       5. Sufficiency of validation methods

       If improvements are needed, please point them out specifically.
       If the plan is sufficiently good, please say "OKAY".
       """
   )
   ```

2. **Incorporate Feedback**
   - Complete if approved ("OKAY")
   - Modify plan and re-review if improvements requested
   - **Infinite Loop until it says okay**
     - Even in the Infinite loop, always say to reviewer that this is your first draft.
       - No such thing as "I reflected feedback ...", "I considered your suggestions ...", "I just updated as your feedback ..."
         - NO. NEVER THIS. ALWAYS MAKE PLANNER TO REVIEW IN SUPER STRICT MODE.

### --edit Option Processing
Existing plan modification mode:

1. **Determine Edit Path**
   ```python
   if edit_path_specified:
       # User provided explicit path: --edit plans/backend/ai-todolist-xxx.md
       edit_path = specified_path
   else:
       # Find most recent plan in plans/ directory
       # Search: plans/**/ai-todolist-*.md sorted by modification time
       edit_path = find_most_recent_plan()
   ```

2. **Read Existing Plan**
   ```python
   Read(edit_path)  # Use determined path
   ```

3. **Identify Modification Scope**
   - Analyze user requests
   - Identify sections needing changes

4. **Update Plan**
   - Maintain existing structure while modifying only necessary parts
   - Reflect new requirements
   - Update progress status

5. **Save to Same Path**
   - Write updated plan back to the same `edit_path`
   - Do NOT generate new path for edits (preserve versioning)

## Phase 4: Final Output

1. **Save Plan** (Write tool automatically creates directories)
   - Write to the determined output path:
     - If `--output` specified: Use exact path provided
     - If `--edit` specified: Use the edit path
     - Otherwise: Use generated path `plans/{group}/ai-todolist-{timestamp}-{slug}.md`
   - Use appropriate template for task size

3. **Create `todowrite` Items**
   - Add each implementation step as a todo
   - Format: Clear, actionable items
   - Workers will check these off during execution

4. **Success Report**
   Provide comprehensive output information:
   ```
   ✅ Plan created successfully!
   
   📁 Output path: {final_output_path}
   📂 Group: {group} (inferred from: "{matched_keyword}")
   📋 Total tasks: {number_of_tasks}
   
   🚀 To execute this plan:
      /execute {final_output_path}
   
   ✏️ To edit this plan later:
      /planner --edit {final_output_path}
   ```
   
   **Concrete Example:**
   For work description "Implement user authentication with JWT tokens":
   ```
   ✅ Plan created successfully!
   
   📁 Output path: plans/backend/ai-todolist-20251228-143022-implement-user-authentication-jwt-tokens.md
   📂 Group: backend (inferred from: "auth")
   📋 Total tasks: 5
   
   🚀 To execute this plan:
      /execute plans/backend/ai-todolist-20251228-143022-implement-user-authentication-jwt-tokens.md
   
   ✏️ To edit this plan later:
      /planner --edit plans/backend/ai-todolist-20251228-143022-implement-user-authentication-jwt-tokens.md
   ```

## Quality Checklist

### Plan Quality Standards
- [ ] Are goals clear and measurable?
- [ ] Are implementation steps in logical order?
- [ ] Are completion criteria clear for each step?
- [ ] Does it match existing code patterns?
- [ ] Are test and validation methods specific?
- [ ] Are exception handling plans present?

### Information Fidelity
- [ ] Are related file paths accurate?
- [ ] Is reference code from actual project?
- [ ] Are commit conventions reflected?
- [ ] Is tech stack accurately identified?

## Core Constraints

1. **Information Gathering First**: Sufficient project analysis before planning
2. **Practical Approach**: Focus on actual implementation over theory
3. **Incremental Improvement**: Iterative improvement over one-time perfection
4. **Verifiability**: All steps must be testable
5. **Maintain Existing Patterns**: Keep project's existing style

## Work Completion Message

When plan creation is complete, provide:
- Save location: `plans/{group}/ai-todolist-{timestamp}-{slug}.md` (or custom path if --output used)
- Group category and reasoning
- Total number of work steps
- Expected implementation scope
- Command to execute the plan: `/execute {output_path}`
- Command to edit later: `/planner --edit {output_path}`

**Example Output Messages:**

**Standard Plan Creation:**
```
✅ Plan created successfully!

📁 Output path: plans/backend/ai-todolist-20251228-143022-add-user-authentication-oauth.md
📂 Group: backend (matched keyword: "auth")
📋 Total tasks: 7
📝 Scope: User authentication with OAuth2 integration

🚀 To execute: /execute plans/backend/ai-todolist-20251228-143022-add-user-authentication-oauth.md
✏️ To edit:    /planner --edit plans/backend/ai-todolist-20251228-143022-add-user-authentication-oauth.md
```

**Bugfix Plan:**
```
✅ Plan created successfully!

📁 Output path: plans/bugfix/ai-todolist-20251228-150530-fix-memory-leak-websocket.md
📂 Group: bugfix (matched keyword: "fix")
📋 Total tasks: 4
📝 Scope: Fix memory leak in WebSocket connection handler

🚀 To execute: /execute plans/bugfix/ai-todolist-20251228-150530-fix-memory-leak-websocket.md
✏️ To edit:    /planner --edit plans/bugfix/ai-todolist-20251228-150530-fix-memory-leak-websocket.md
```

**Frontend Feature Plan:**
```
✅ Plan created successfully!

📁 Output path: plans/frontend/ai-todolist-20251228-091245-create-dashboard-components.md
📂 Group: frontend (matched keyword: "component")
📋 Total tasks: 6
📝 Scope: Create reusable dashboard UI components

🚀 To execute: /execute plans/frontend/ai-todolist-20251228-091245-create-dashboard-components.md
✏️ To edit:    /planner --edit plans/frontend/ai-todolist-20251228-091245-create-dashboard-components.md
```

**Custom Output Path (--output flag):**
```
✅ Plan created successfully!

📁 Output path: ./my-custom-todolist.md (custom path specified)
📋 Total tasks: 3
📝 Scope: Quick prototype implementation

🚀 To execute: /execute ./my-custom-todolist.md
✏️ To edit:    /planner --edit ./my-custom-todolist.md
```
