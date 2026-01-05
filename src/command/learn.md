---
description: "Orchestrate full meta-learning cycle (analysis + generation). Usage: /learn [--plans-only] [--knowledge-only] [--policies-only] [--suggestions-only] [--bootstrap]"
subtask: true
---

# Learn Command

## Usage

```
/learn [--plans-only] [--knowledge-only] [--policies-only] [--suggestions-only] [--bootstrap]
```

Options:
- **--plans-only**: Only run plan execution history analysis + policy/suggestion generation
- **--knowledge-only**: Only run llm-docs knowledge analysis + policy/suggestion generation
- **--policies-only**: Only generate policies (skip suggestions)
- **--suggestions-only**: Only generate suggestions (skip policies)
- **--bootstrap**: Force bootstrap mode even if data exists

## What this command does

Orchestrates the **complete meta-learning cycle** for OpenCode agents:

1. **Analyzes** plan execution history (from `/plans` directory)
2. **Analyzes** project knowledge base (from `llm-docs/` directory)
3. **Generates** operational policies (in `llm-learning/policies/`)
4. **Generates** enhancement suggestions (in `llm-learning/enhancement_suggestions/`)

This is the **unified entry point** for the llm-learning system. It combines the functionality of:
- `/analyze-plans` - Plan execution history analysis
- `/analyze-knowledge` - Knowledge base quality analysis
- `/generate-policy` - Policy file creation and consolidation
- `/generate-suggestions` - Enhancement suggestion creation

**IMPORTANT**: This command uses direct `Task()` invocations to orchestrate sub-operations.
Slash commands CANNOT call other slash commands, so this command implements the orchestration
directly rather than invoking `/analyze-plans`, `/generate-policy`, etc.

## Process

### Overview

```
                                   /learn
                                      |
           +------------------+-------+-------+------------------+
           |                  |               |                  |
     Step 1/4            Step 2/4        Step 3/4           Step 4/4
  Analyze Plans      Analyze Knowledge  Generate Policies  Generate Suggestions
  (Oracle Agent)      (Oracle Agent)    (Executor Agent)   (Executor Agent)
           |                  |               |                  |
           v                  v               v                  v
    plan_analysis      knowledge_analysis   policies/        suggestions/
       output              output           *.md              *.md
```

### 1. Parse Command Flags

```python
def parse_flags(arguments):
    """
    Parse command line flags to determine execution scope.
    
    Returns a configuration object controlling which steps to execute.
    """
    flags = {
        'plans_only': '--plans-only' in arguments,
        'knowledge_only': '--knowledge-only' in arguments,
        'policies_only': '--policies-only' in arguments,
        'suggestions_only': '--suggestions-only' in arguments,
        'bootstrap': '--bootstrap' in arguments
    }
    
    # Determine which analysis steps to run
    run_plans = not flags['knowledge_only']  # Run unless knowledge-only
    run_knowledge = not flags['plans_only']  # Run unless plans-only
    
    # Determine which generation steps to run
    run_policies = not flags['suggestions_only']  # Run unless suggestions-only
    run_suggestions = not flags['policies_only']  # Run unless policies-only
    
    return {
        'run_plan_analysis': run_plans,
        'run_knowledge_analysis': run_knowledge,
        'run_policy_generation': run_policies,
        'run_suggestion_generation': run_suggestions,
        'force_bootstrap': flags['bootstrap']
    }
```

### 2. Bootstrap Mode Detection

```python
def detect_bootstrap_mode(force_bootstrap):
    """
    Determine if bootstrap mode should be activated.
    
    Bootstrap mode activates when:
    1. User explicitly passes --bootstrap flag
    2. plans/ directory has <= 1 plan file
    3. llm-docs/ has 0 total entries
    
    Returns:
    - is_bootstrap: Boolean
    - reason: String explaining why bootstrap mode is active/inactive
    """
    if force_bootstrap:
        return True, "Forced via --bootstrap flag"
    
    # Check plan count
    plan_files = glob("plans/**/ai-todolist-*.md")
    if len(plan_files) <= 1:
        return True, f"Only {len(plan_files)} plan file(s) found - insufficient historical data"
    
    # Check llm-docs entries
    llm_docs_files = glob("llm-docs/*.md")
    total_entries = 0
    for file in llm_docs_files:
        content = read(file)
        match = re.search(r'total_entries:\s*(\d+)', content)
        if match:
            total_entries += int(match.group(1))
    
    if total_entries == 0:
        return True, "llm-docs/ has 0 entries - no project knowledge exists yet"
    
    return False, f"Historical data available: {len(plan_files)} plans, {total_entries} knowledge entries"
```

### 3. Step 1/4: Analyze Plan Execution History

```python
def step1_analyze_plans(is_bootstrap, force_bootstrap):
    """
    Analyze plan execution history using Oracle agent.
    
    Uses Task() invocation to call Oracle agent directly.
    
    In NORMAL mode:
    - Reads completed plans from plans/**/*.md
    - Extracts execution outcomes, decisions, learnings
    - Identifies success/failure patterns
    
    In BOOTSTRAP mode:
    - Reads agent/*.md and command/*.md files
    - Extracts policies from CODE OF CONDUCT sections
    - Derives foundational policies from agent design intent
    """
    print("**Step 1/4: Analyzing plan execution history...**")
    
    # Build analysis prompt based on mode
    if is_bootstrap:
        # Bootstrap mode: analyze agent configurations
        agent_files = glob("agent/*.md")
        command_files = glob("command/*.md")
        source_files = agent_files + command_files
        
        file_contents = ""
        for file in source_files:
            content = read(file)
            file_contents += f"\n\n### File: {file}\n\n{content[:5000]}"  # Truncate large files
        
        analysis_prompt = f"""
You are analyzing AGENT CONFIGURATION FILES to extract foundational policies.

**IMPORTANT**: This is BOOTSTRAP MODE - no execution history exists.
All policies should be marked with: confidence: "Low (bootstrap - no execution history)"

## Agent Configuration Files

{file_contents}

## Analysis Request

Extract operational policies from these agent configurations:

1. DOCUMENTED RULES:
   - What explicit rules are defined in CODE OF CONDUCT sections?
   - What are the CRITICAL RULES and MUST NOT DO items?

2. WORKFLOW PATTERNS:
   - What workflow steps are mandatory?
   - What verification steps are required?

3. QUALITY STANDARDS:
   - What quality checks are documented?
   - What completion criteria are specified?

4. DOCUMENTATION GAPS (for enhancement suggestions):
   - What areas lack clear documentation?
   - What tooling could be improved?

## REQUIRED OUTPUT FORMAT

Provide your analysis in this EXACT structure:

POLICIES:

- POL-001: [Policy Title]
  category: [surgical-execution|redundancy-prevention|fast-problem-solving|agent-coordination]
  confidence: Low (bootstrap - no execution history)
  sources:
    - file: [source file path]
      section: [relevant section name]
      observation: [what was learned]
  rules:
    - [Rule 1: Specific, actionable instruction]
    - [Rule 2: Another specific instruction]
  anti_patterns:
    - [What NOT to do]
  rationale: [Why this policy matters]

ENHANCEMENTS:

- ENH-001: [Enhancement Title]
  category: [new-feature|refactoring|consolidation|performance|ux-enhancement]
  priority: [critical|high|medium|low]
  effort: [small|medium|large|xlarge]
  impact: [low|medium|high|transformative]
  problem: [What problem does this solve?]
  evidence:
    - source: [file or observation]
      observation: [what indicates this need]
  solution: [Proposed improvement]
  benefits:
    - [Benefit 1]
    - [Benefit 2]

SUMMARY:
- Total policies generated: [N]
- Total enhancements generated: [N]
- Key themes identified: [list]
- Confidence assessment: Low (bootstrap analysis)

**IMPORTANT CONSTRAINTS**:
- Generate at least 3 policies and 3 enhancements
- All policies MUST have confidence: "Low (bootstrap - no execution history)"
- Sources MUST reference agent/*.md or command/*.md files
"""
    else:
        # Normal mode: analyze historical plans
        plan_files = glob("plans/**/ai-todolist-*.md")
        
        file_contents = ""
        for file in plan_files[:10]:  # Limit to 10 most recent plans
            content = read(file)
            file_contents += f"\n\n### Plan: {file}\n\n{content[:3000]}"
        
        # Also read notepad files
        notepad_files = glob("plans/**/notepad.md")
        for file in notepad_files[:5]:
            content = read(file)
            file_contents += f"\n\n### Notepad: {file}\n\n{content[:2000]}"
        
        analysis_prompt = f"""
You are analyzing EXECUTED PLANS to identify meta-learning patterns.

## Execution History

{file_contents}

## Analysis Request

Based on this execution history:

1. SUCCESSFUL PATTERNS:
   - What approaches led to efficient task completion?
   - Which agent coordination patterns worked well?

2. FAILURE PATTERNS (Hindsight Learning):
   - What approaches led to wasted effort?
   - For each failure, document:
     * original_approach: what was tried
     * failure_reason: why it failed
     * better_approach: what should have been done

3. EFFICIENCY OBSERVATIONS:
   - How could execution have been faster?
   - What information was missing that caused delays?

## REQUIRED OUTPUT FORMAT

[Same structured output format as above, but with appropriate confidence levels]

**IMPORTANT CONSTRAINTS**:
- Generate at least 3 policies and 3 enhancements
- Confidence levels should be Medium or High based on evidence
- Sources should reference actual plan files
"""
    
    # Invoke Oracle agent
    plan_analysis = Task(
        subagent_type="oracle",
        description="Analyze plan execution history for meta-learning",
        prompt=analysis_prompt
    )
    
    return plan_analysis
```

### 4. Step 2/4: Analyze Knowledge Base

```python
def step2_analyze_knowledge(is_bootstrap, force_bootstrap):
    """
    Analyze llm-docs knowledge base using Oracle agent.
    
    Uses Task() invocation to call Oracle agent directly.
    
    In NORMAL mode:
    - Reads all llm-docs files
    - Validates evidence references
    - Identifies knowledge gaps and quality issues
    
    In BOOTSTRAP mode:
    - Scans project structure for conventions
    - Infers patterns from agent/command files
    - Suggests initial knowledge entries
    """
    print("**Step 2/4: Analyzing knowledge base...**")
    
    # Read llm-docs files
    llm_docs_files = glob("llm-docs/*.md")
    
    file_contents = ""
    for file in llm_docs_files:
        content = read(file)
        file_contents += f"\n\n### {file}\n\n{content}"
    
    if is_bootstrap:
        analysis_prompt = f"""
You are analyzing the PROJECT STRUCTURE to suggest initial knowledge base entries.

**IMPORTANT**: This is BOOTSTRAP MODE - no knowledge entries exist.
All suggestions should be marked with: confidence: "Low (bootstrap - inferred from project structure)"

## Current llm-docs State (Empty)

{file_contents}

## Project Files to Analyze

Also consider the agent and command files for extracting knowledge:
- agent/*.md - Agent configurations
- command/*.md - Command definitions

## Analysis Request

Based on this project structure, suggest initial knowledge entries:

1. CONVENTIONS TO DOCUMENT:
   - Naming conventions observed
   - Code organization patterns
   - Documentation standards

2. PATTERNS TO CAPTURE:
   - Reusable code patterns
   - Common implementation approaches
   - Test patterns

3. POTENTIAL GOTCHAS:
   - Complex areas likely to cause issues
   - Non-obvious requirements
   - Configuration quirks

4. COMMANDS TO VERIFY:
   - Build commands
   - Test commands
   - Deploy commands

## REQUIRED OUTPUT FORMAT

KNOWLEDGE BASE ASSESSMENT:

Total Entries: 0 (bootstrap mode)
Evidence Health: N/A
Coverage Gaps: [list of undocumented areas]

POLICIES:

- POL-001: [Policy Title]
  category: [category]
  confidence: Low (bootstrap - inferred from project structure)
  sources:
    - file: [llm-docs file or project file]
      section: [relevant section]
      observation: [what was learned]
  rules:
    - [Rule 1]
    - [Rule 2]
  anti_patterns:
    - [What NOT to do]
  rationale: [Why this policy matters for knowledge quality]

ENHANCEMENTS:

- ENH-001: [Enhancement Title]
  category: [new-feature|refactoring|consolidation|performance|ux-enhancement]
  priority: [priority]
  effort: [effort]
  impact: [impact]
  problem: [What knowledge gap does this solve?]
  solution: [Proposed improvement]
  draft_content: |
    [For new entries, provide draft content]
  benefits:
    - [Benefit 1]

META-ANALYSIS:

Knowledge Maturity: nascent
Strongest Areas: None (bootstrap)
Weakest Areas: All areas need initial entries
Health Score: 1/10 (no entries exist)

SUMMARY:
- Total policies generated: [N]
- Total enhancements generated: [N]
- Key themes identified: [list]
"""
    else:
        analysis_prompt = f"""
You are analyzing the PROJECT KNOWLEDGE BASE to identify quality and gaps.

## Knowledge Base Contents

{file_contents}

## Analysis Request

Based on this knowledge base:

1. KNOWLEDGE GAPS:
   - What conventions should exist but don't?
   - What patterns are missing?
   - What gotchas are undocumented?

2. KNOWLEDGE QUALITY:
   - Which entries have weak evidence?
   - Which entries are outdated?

3. OPTIMIZATION OPPORTUNITIES:
   - What entries could be merged?
   - What patterns could be generalized?

4. META-LEARNINGS:
   - What does this knowledge base reveal about project maturity?
   - Which areas need more attention?

## REQUIRED OUTPUT FORMAT

[Same structured output format with appropriate confidence levels]
"""
    
    # Invoke Oracle agent
    knowledge_analysis = Task(
        subagent_type="oracle",
        description="Analyze llm-docs knowledge base for meta-learning",
        prompt=analysis_prompt
    )
    
    return knowledge_analysis
```

### 5. Step 3/4: Generate Policies

```python
def step3_generate_policies(plan_analysis, knowledge_analysis, is_bootstrap):
    """
    Generate policy files from analysis outputs.
    
    Uses Task() invocation to call Executor agent for file writing.
    
    Process:
    1. Parse POLICIES sections from both analyses
    2. Generate POL-NNN IDs
    3. Create category-specific policy files
    4. Consolidate into current.md
    5. Archive if threshold reached
    """
    print("**Step 3/4: Generating policies...**")
    
    # Combine analysis outputs
    combined_analysis = f"""
## Plan Execution Analysis Results

{plan_analysis}

## Knowledge Base Analysis Results

{knowledge_analysis}
"""
    
    generation_prompt = f"""
You are generating POLICY FILES from Oracle analysis output.

## Analysis Output to Process

{combined_analysis}

## Your Task

1. **Parse** all POLICIES from the analysis output
2. **Generate** POL-NNN IDs sequentially (read next_policy_id from current.md)
3. **Categorize** each policy into one of:
   - surgical-execution
   - redundancy-prevention
   - fast-problem-solving
   - agent-coordination
4. **Create** policy entries in category files:
   - llm-learning/policies/categories/surgical-execution.md
   - llm-learning/policies/categories/redundancy-prevention.md
   - llm-learning/policies/categories/fast-problem-solving.md
   - llm-learning/policies/categories/agent-coordination.md
5. **Consolidate** all policies into llm-learning/policies/current.md
6. **Archive** if current.md has >= 15 policies before adding new ones

## Policy Entry Format

```markdown
## [POL-NNN] Policy Title

---
id: POL-NNN
title: "Policy Title"
category: "category-name"
created: YYYY-MM-DDTHH:MM:SSZ
last_updated: YYYY-MM-DDTHH:MM:SSZ
version: "1.0.0"
status: "active"
confidence: "{confidence}"
sources:
  - file: "source file"
    section: "section name"
    observation: "what was observed"
---

### Summary
[Policy summary]

### Rules
1. **Rule 1**: [description]
2. **Rule 2**: [description]

### Anti-Patterns (What NOT to Do)
- [anti-pattern]

### Application Context
- **When to Apply**: [context]
- **Exceptions**: [exceptions]
```

## IMPORTANT

- Read llm-learning/policies/current.md to get next_policy_id from frontmatter
- Increment next_policy_id after each policy
- Update policy_count in current.md frontmatter
- Update last_consolidated timestamp
- DO NOT create duplicate policies
- Bootstrap mode policies: confidence = "Low (bootstrap - no execution history)"

## Report

After writing files, report:
- Number of policies created
- Files updated
- Any conflicts resolved
"""
    
    # Invoke Executor agent to write files
    policy_result = Task(
        subagent_type="executor",
        description="Generate policy files from Oracle analysis",
        prompt=generation_prompt
    )
    
    return policy_result
```

### 6. Step 4/4: Generate Suggestions

```python
def step4_generate_suggestions(plan_analysis, knowledge_analysis, is_bootstrap):
    """
    Generate enhancement suggestion files from analysis outputs.
    
    Uses Task() invocation to call Executor agent for file writing.
    
    Process:
    1. Parse ENHANCEMENTS sections from both analyses
    2. Generate ENH-NNN IDs
    3. Create versioned suggestion file in pending/
    4. Update category-specific suggestion files
    5. Assign priority and effort/impact estimates
    """
    print("**Step 4/4: Generating enhancement suggestions...**")
    
    # Combine analysis outputs
    combined_analysis = f"""
## Plan Execution Analysis Results

{plan_analysis}

## Knowledge Base Analysis Results

{knowledge_analysis}
"""
    
    generation_prompt = f"""
You are generating ENHANCEMENT SUGGESTION FILES from Oracle analysis output.

## Analysis Output to Process

{combined_analysis}

## Your Task

1. **Parse** all ENHANCEMENTS from the analysis output
2. **Generate** ENH-NNN IDs sequentially (read next_enhancement_id from _counter.md)
3. **Categorize** each suggestion into one of:
   - new-feature
   - refactoring
   - consolidation
   - performance
   - ux-enhancement
4. **Create** versioned suggestion file:
   - llm-learning/enhancement_suggestions/pending/suggestions-YYYYMMDD-HHMMSS.md
5. **Update** category files:
   - llm-learning/enhancement_suggestions/categories/new-features.md
   - llm-learning/enhancement_suggestions/categories/refactoring.md
   - llm-learning/enhancement_suggestions/categories/consolidation.md
   - llm-learning/enhancement_suggestions/categories/performance.md
   - llm-learning/enhancement_suggestions/categories/ux-enhancements.md

## Suggestion Entry Format

```markdown
### [ENH-NNN] Suggestion Title

---
id: ENH-NNN
title: "Suggestion Title"
category: "category-name"
priority: "critical|high|medium|low"
created: YYYY-MM-DDTHH:MM:SSZ
status: "pending"
effort_estimate: "small|medium|large|xlarge"
impact_estimate: "low|medium|high|transformative"
---

#### Problem Statement
[What problem does this solve?]

#### Evidence
- **Source**: [source file/plan]
- **Observation**: [what was observed]
- **Frequency**: [how often]

#### Proposed Solution
[Detailed solution description]

#### Expected Benefits
- [Benefit 1]
- [Benefit 2]

#### Implementation Considerations
- **Dependencies**: [dependencies]
- **Risks**: [risks]
- **Alternatives**: [alternatives]
```

## IMPORTANT

- Read llm-learning/enhancement_suggestions/pending/_counter.md to get next_enhancement_id
- Increment next_enhancement_id after each suggestion
- Update suggestion_count in category files
- Validate priority values: critical, high, medium, low
- Validate effort values: small, medium, large, xlarge
- Validate impact values: low, medium, high, transformative
- DO NOT create duplicate suggestions

## Report

After writing files, report:
- Number of suggestions created
- Files updated/created
- Category breakdown
- Priority breakdown
"""
    
    # Invoke Executor agent to write files
    suggestion_result = Task(
        subagent_type="executor",
        description="Generate enhancement suggestion files from Oracle analysis",
        prompt=generation_prompt
    )
    
    return suggestion_result
```

### 7. Main Orchestration Logic

```python
def learn_command(arguments):
    """
    Main entry point for /learn command.
    
    Orchestrates the full meta-learning cycle:
    1. Parse flags
    2. Detect bootstrap mode
    3. Run analysis steps (Oracle)
    4. Run generation steps (Executor)
    5. Output summary report
    """
    # Parse command flags
    config = parse_flags(arguments)
    
    # Detect bootstrap mode
    is_bootstrap, bootstrap_reason = detect_bootstrap_mode(config['force_bootstrap'])
    
    # Display header
    print("""
================================================================================
                         META-LEARNING CYCLE
================================================================================
""")
    print(f"Mode: {'BOOTSTRAP' if is_bootstrap else 'HISTORICAL'}")
    print(f"Reason: {bootstrap_reason}")
    print("")
    
    # Track results
    results = {
        'plan_analysis': None,
        'knowledge_analysis': None,
        'policies_created': 0,
        'suggestions_created': 0,
        'files_updated': []
    }
    
    # Step 1: Analyze Plans (unless --knowledge-only)
    if config['run_plan_analysis']:
        results['plan_analysis'] = step1_analyze_plans(is_bootstrap, config['force_bootstrap'])
    else:
        print("**Step 1/4: Skipped (--knowledge-only flag)**")
    
    # Step 2: Analyze Knowledge (unless --plans-only)
    if config['run_knowledge_analysis']:
        results['knowledge_analysis'] = step2_analyze_knowledge(is_bootstrap, config['force_bootstrap'])
    else:
        print("**Step 2/4: Skipped (--plans-only flag)**")
    
    # Step 3: Generate Policies (unless --suggestions-only)
    if config['run_policy_generation']:
        policy_result = step3_generate_policies(
            results['plan_analysis'],
            results['knowledge_analysis'],
            is_bootstrap
        )
        results['policy_result'] = policy_result
    else:
        print("**Step 3/4: Skipped (--suggestions-only flag)**")
    
    # Step 4: Generate Suggestions (unless --policies-only)
    if config['run_suggestion_generation']:
        suggestion_result = step4_generate_suggestions(
            results['plan_analysis'],
            results['knowledge_analysis'],
            is_bootstrap
        )
        results['suggestion_result'] = suggestion_result
    else:
        print("**Step 4/4: Skipped (--policies-only flag)**")
    
    # Output summary report
    output_summary_report(results, is_bootstrap)
    
    return results
```

### 8. Summary Report Output

```python
def output_summary_report(results, is_bootstrap):
    """
    Output comprehensive summary of the learning cycle.
    """
    print("""
================================================================================
                         LEARNING CYCLE SUMMARY
================================================================================
""")
    
    print(f"Mode: {'BOOTSTRAP' if is_bootstrap else 'HISTORICAL'}")
    print("")
    
    # Analysis summary
    print("## Analysis Phase")
    print("")
    if results['plan_analysis']:
        print("- Plan Execution Analysis: COMPLETED")
    else:
        print("- Plan Execution Analysis: SKIPPED")
    
    if results['knowledge_analysis']:
        print("- Knowledge Base Analysis: COMPLETED")
    else:
        print("- Knowledge Base Analysis: SKIPPED")
    
    print("")
    
    # Generation summary
    print("## Generation Phase")
    print("")
    
    if 'policy_result' in results:
        print(f"- New policies created: {results.get('policies_created', 'See details above')}")
        print("- Policy files updated:")
        print("  - llm-learning/policies/current.md")
        print("  - llm-learning/policies/categories/*.md")
    else:
        print("- Policy generation: SKIPPED")
    
    print("")
    
    if 'suggestion_result' in results:
        print(f"- New suggestions created: {results.get('suggestions_created', 'See details above')}")
        print("- Suggestion files updated:")
        print("  - llm-learning/enhancement_suggestions/pending/suggestions-*.md")
        print("  - llm-learning/enhancement_suggestions/categories/*.md")
    else:
        print("- Suggestion generation: SKIPPED")
    
    print("")
    print("""
================================================================================
                              NEXT STEPS
================================================================================
""")
    
    if is_bootstrap:
        print("""
BOOTSTRAP MODE COMPLETED

This was a cold-start learning cycle. Initial policies and suggestions have been
created based on agent configurations (design intent), not execution history.

To improve policy confidence:
1. Execute more plans to build execution history
2. Run /learn again after 5+ plan completions
3. Policies will be refined with "Medium" and "High" confidence

Current state:
- All policies have: confidence = "Low (bootstrap - no execution history)"
- Policies represent DESIGN INTENT, not OBSERVED BEHAVIOR
- Suggestions identify DOCUMENTATION GAPS, not EXECUTION PROBLEMS
""")
    else:
        print("""
HISTORICAL ANALYSIS COMPLETED

Policies and suggestions have been created based on actual execution history.

To continue improving:
1. Review generated policies in llm-learning/policies/current.md
2. Implement high-priority suggestions from llm-learning/enhancement_suggestions/
3. Run /learn periodically to accumulate more learnings

Available commands:
- /analyze-plans --verbose    View detailed plan analysis
- /analyze-knowledge --verbose View detailed knowledge analysis
- /generate-policy --dry-run  Preview policy generation
- /generate-suggestions --dry-run Preview suggestion generation
""")
    
    print("================================================================================")
```

## Flag Combinations

The command supports various flag combinations to control execution scope:

### Full Learning Cycle (Default)
```
/learn
```
Runs all 4 steps: plan analysis, knowledge analysis, policy generation, suggestion generation.

### Plans-Only Analysis
```
/learn --plans-only
```
- Step 1: Analyze Plans ✓
- Step 2: Analyze Knowledge ✗ (skipped)
- Step 3: Generate Policies ✓
- Step 4: Generate Suggestions ✓

### Knowledge-Only Analysis
```
/learn --knowledge-only
```
- Step 1: Analyze Plans ✗ (skipped)
- Step 2: Analyze Knowledge ✓
- Step 3: Generate Policies ✓
- Step 4: Generate Suggestions ✓

### Policies-Only Generation
```
/learn --policies-only
```
- Step 1: Analyze Plans ✓
- Step 2: Analyze Knowledge ✓
- Step 3: Generate Policies ✓
- Step 4: Generate Suggestions ✗ (skipped)

### Suggestions-Only Generation
```
/learn --suggestions-only
```
- Step 1: Analyze Plans ✓
- Step 2: Analyze Knowledge ✓
- Step 3: Generate Policies ✗ (skipped)
- Step 4: Generate Suggestions ✓

### Force Bootstrap Mode
```
/learn --bootstrap
```
Forces bootstrap mode regardless of available data. Useful for:
- Re-deriving foundational policies
- Testing bootstrap logic
- Starting fresh after major agent configuration changes

### Combined Flags
```
/learn --plans-only --policies-only
```
Only analyzes plans, only generates policies (no knowledge analysis, no suggestions).

## Output Format

The command outputs progress and results in a structured format:

```
================================================================================
                         META-LEARNING CYCLE
================================================================================

Mode: BOOTSTRAP
Reason: Only 1 plan file(s) found - insufficient historical data

**Step 1/4: Analyzing plan execution history...**

[Oracle agent output showing policy and enhancement recommendations]

**Step 2/4: Analyzing knowledge base...**

[Oracle agent output showing knowledge gaps and recommendations]

**Step 3/4: Generating policies...**

[Executor agent output showing files created/updated]
- Created: POL-001, POL-002, POL-003
- Updated: llm-learning/policies/current.md
- Updated: llm-learning/policies/categories/surgical-execution.md

**Step 4/4: Generating enhancement suggestions...**

[Executor agent output showing files created/updated]
- Created: ENH-001, ENH-002, ENH-003
- Created: llm-learning/enhancement_suggestions/pending/suggestions-20251228-143052.md
- Updated: llm-learning/enhancement_suggestions/categories/new-features.md

================================================================================
                         LEARNING CYCLE SUMMARY
================================================================================

Mode: BOOTSTRAP

## Analysis Phase

- Plan Execution Analysis: COMPLETED
- Knowledge Base Analysis: COMPLETED

## Generation Phase

- New policies created: 3
- Policy files updated:
  - llm-learning/policies/current.md
  - llm-learning/policies/categories/*.md

- New suggestions created: 3
- Suggestion files updated:
  - llm-learning/enhancement_suggestions/pending/suggestions-*.md
  - llm-learning/enhancement_suggestions/categories/*.md

================================================================================
                              NEXT STEPS
================================================================================

[Mode-specific guidance]

================================================================================
```

## Error Handling

### Oracle Analysis Failure

```python
def handle_oracle_failure(step_name, error, attempt):
    """
    Handle Oracle agent failure with retry logic.
    
    Strategy:
    1. Retry up to 3 times with increasingly specific prompts
    2. Log error details
    3. Continue with available data if possible
    4. Report failure clearly to user
    """
    if attempt < 3:
        print(f"WARNING: Oracle analysis failed for {step_name} (attempt {attempt}/3)")
        print(f"Error: {error}")
        print("Retrying with stricter prompt...")
        return {'action': 'retry', 'attempt': attempt + 1}
    else:
        print(f"ERROR: Oracle analysis failed for {step_name} after 3 attempts")
        print(f"Error: {error}")
        print("Continuing with available data...")
        return {'action': 'continue_partial', 'error': error}
```

### File Write Failure

```python
def handle_write_failure(file_path, error):
    """
    Handle file write failure.
    """
    print(f"ERROR: Failed to write {file_path}")
    print(f"Error: {error}")
    print("Check file permissions and disk space.")
    return {'action': 'abort', 'error': error}
```

### Invalid Analysis Output

```python
def handle_invalid_output(step_name, output):
    """
    Handle invalid/unparseable Oracle output.
    """
    print(f"WARNING: Invalid output format from {step_name}")
    print("Expected POLICIES and ENHANCEMENTS sections not found.")
    print("Raw output saved for debugging.")
    
    # Save raw output for debugging
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    debug_file = f"/tmp/oracle-{step_name}-{timestamp}.txt"
    write(debug_file, output)
    
    print(f"Debug output: {debug_file}")
    return {'action': 'skip', 'debug_file': debug_file}
```

## Integration with Other Commands

This command orchestrates functionality from:

| Command | Role in /learn |
|---------|----------------|
| /analyze-plans | Logic embedded in step1_analyze_plans() |
| /analyze-knowledge | Logic embedded in step2_analyze_knowledge() |
| /generate-policy | Logic embedded in step3_generate_policies() |
| /generate-suggestions | Logic embedded in step4_generate_suggestions() |

**Why not call sub-commands?**

Slash commands CANNOT call other slash commands in OpenCode. The `/learn` command must
implement the orchestration directly using `Task()` invocations:

- `Task(subagent_type="oracle", ...)` for analysis steps
- `Task(subagent_type="executor", ...)` for generation steps

This ensures proper data flow between steps without relying on inter-command communication.

## Bootstrap Mode Details

When in bootstrap mode:

1. **Sources**: `agent/executor.md`, `agent/task-orchestrator.md`, `agent/plan.md`, `agent/plan-reviewer.md`, `command/*.md`

2. **Extraction targets**:
   - CODE OF CONDUCT sections
   - CRITICAL RULES sections
   - MUST DO / MUST NOT DO items
   - Workflow step requirements
   - Quality checklists

3. **Confidence**: All policies marked as `"Low (bootstrap - no execution history)"`

4. **Purpose**: Establish foundational policies from documented agent design intent

5. **Output**: Policies representing "what agents are designed to do" rather than "what we observed agents doing successfully"

## Examples

### Example 1: Full Learning Cycle

```
/learn
```

Runs all 4 steps with auto-detection of bootstrap vs historical mode.

### Example 2: Plans-Only with Bootstrap

```
/learn --plans-only --bootstrap
```

Only analyzes plan execution history (or agent configs in bootstrap mode) and generates both policies and suggestions.

### Example 3: Generate Only Policies

```
/learn --policies-only
```

Runs both analyses but only generates policy files, not suggestions.

### Example 4: Quick Knowledge Check

```
/learn --knowledge-only --suggestions-only
```

Only analyzes knowledge base and generates suggestions (no plan analysis, no policies).

## Verification Checklist

After running the command, verify:

1. [ ] Bootstrap mode correctly detected based on available data
2. [ ] Progress indicators shown for each step (1/4, 2/4, 3/4, 4/4)
3. [ ] Oracle agents invoked for analysis steps
4. [ ] Executor agents invoked for generation steps
5. [ ] Policies created with sequential POL-NNN IDs
6. [ ] Suggestions created with sequential ENH-NNN IDs
7. [ ] current.md updated with new policies
8. [ ] Category files updated appropriately
9. [ ] Summary report shows accurate counts
10. [ ] Flags correctly control execution scope

## Quick Reference

### Flags

| Flag | Effect |
|------|--------|
| `--plans-only` | Skip knowledge analysis |
| `--knowledge-only` | Skip plan analysis |
| `--policies-only` | Skip suggestion generation |
| `--suggestions-only` | Skip policy generation |
| `--bootstrap` | Force bootstrap mode |

### Output Files

| File | Description |
|------|-------------|
| `llm-learning/policies/current.md` | Consolidated active policies |
| `llm-learning/policies/categories/*.md` | Category-specific policies |
| `llm-learning/enhancement_suggestions/pending/*.md` | New suggestions |
| `llm-learning/enhancement_suggestions/categories/*.md` | Categorized suggestions |

### Agent Types Used

| Agent | Purpose |
|-------|---------|
| `oracle` | Deep analysis of plans and knowledge |
| `executor` | File writing and updates |
