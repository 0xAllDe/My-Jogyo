---
description: "Analyze plan execution history for meta-learning. Usage: /analyze-plans [--verbose] [--bootstrap]"
subtask: true
---

# Analyze Plans Command

## Usage

```
/analyze-plans [--verbose] [--bootstrap]
```

Options:
- **--verbose**: Show detailed analysis output including evidence citations
- **--bootstrap**: Force bootstrap mode (analyze agent/command files instead of plans)

## What this command does

Analyzes executed plans from the `plans/` directory to extract meta-learning insights:

1. **Successful patterns** and approaches that led to efficient task completion
2. **Failure patterns** and what to avoid (hindsight learning)
3. **Policy recommendations** for efficient agent operation
4. **Enhancement suggestions** for improvements to tooling and processes

This command is part of the llm-learning system that builds operational wisdom over time.

## Process

### 1. Plan Discovery

Use glob pattern to find all plans in the `plans/` directory:

```python
# Find all versioned plans
plans = glob("plans/**/ai-todolist-*.md")

# Also check for legacy format
legacy_plans = glob("plans/**/*.md")

# Combine and deduplicate
all_plans = list(set(plans + legacy_plans))
```

**Discovery Output:**
- List all discovered plan files
- Count total plans found
- Identify completed plans (those with `is_all_goals_accomplished = TRUE` or majority `[x]` checkboxes)

### 2. Bootstrap Mode Detection

**Bootstrap mode activates when:**
1. Only 1 plan exists (the current plan being executed)
2. `llm-docs/` directory is empty or has 0 entries
3. User explicitly passes `--bootstrap` flag

**Detection logic:**
```python
def is_bootstrap_mode(plans, bootstrap_flag):
    # Check explicit flag
    if bootstrap_flag:
        return True
    
    # Check if minimal plan data
    if len(plans) <= 1:
        return True
    
    # Check if llm-docs is empty (no entries)
    llm_docs_files = glob("llm-docs/*.md")
    total_entries = 0
    for file in llm_docs_files:
        content = read(file)
        # Check YAML frontmatter for total_entries
        if "total_entries: 0" in content or total_entries == 0:
            continue
        total_entries += 1
    
    if total_entries == 0:
        return True
    
    return False
```

### 3. Data Source Selection

**Normal Mode** (historical execution data available):
- Read all completed plans from `plans/**/*.md`
- Extract execution outcomes, decisions, and learnings
- Analyze notepad.md files for session insights
- Identify patterns across multiple executions

**Bootstrap Mode** (cold-start, no historical data):
- Read agent configuration files: `agent/*.md`
- Read command definition files: `command/*.md`
- Extract policies from CODE OF CONDUCT sections
- Extract rules from MUST DO / MUST NOT DO sections
- Extract patterns from workflow documentation
- Label all outputs with `confidence: "Low (bootstrap - no execution history)"`

```python
def get_analysis_sources(bootstrap_mode):
    if bootstrap_mode:
        return {
            "type": "bootstrap",
            "files": glob("agent/*.md") + glob("command/*.md"),
            "sections_to_analyze": [
                "CODE OF CONDUCT",
                "CRITICAL RULES",
                "MUST DO",
                "MUST NOT DO",
                "WORKFLOW",
                "QUALITY ASSURANCE"
            ],
            "confidence": "Low (bootstrap - no execution history)"
        }
    else:
        return {
            "type": "historical",
            "files": glob("plans/**/ai-todolist-*.md"),
            "sections_to_analyze": [
                "notepad.md contents",
                "DISCOVERED ISSUES",
                "IMPLEMENTATION DECISIONS",
                "LEARNINGS",
                "VERIFICATION RESULTS"
            ],
            "confidence": "Medium to High (based on execution data)"
        }
```

### 4. Plan Analysis (Normal Mode)

For each completed plan:
1. **Read plan content** and associated notepad.md
2. **Extract execution metadata:**
   - Start time, completion time, duration
   - Number of tasks, success rate
   - Executor iterations per task
3. **Identify success patterns:**
   - Tasks completed on first attempt
   - Efficient workflows
   - Good decision-making examples
4. **Identify failure patterns (Hindsight Learning):**
   - Tasks requiring multiple retries
   - Documented failed approaches
   - Time wasted on dead ends
5. **Extract learnings:**
   - Project-specific conventions discovered
   - Commands that worked
   - Gotchas encountered

### 5. Agent Analysis (Bootstrap Mode)

For agent configuration files:
1. **Read agent/*.md and command/*.md files**
2. **Extract behavioral rules from:**
   - CODE OF CONDUCT sections
   - CRITICAL RULES sections
   - Workflow step requirements
   - Quality assurance checklists
3. **Categorize into policy areas:**
   - surgical-execution: Focus and precision rules
   - redundancy-prevention: Avoiding duplicate work
   - fast-problem-solving: Efficiency patterns
   - agent-coordination: Multi-agent interaction rules
4. **Identify documentation gaps** for enhancement suggestions

### 6. Oracle Invocation

Invoke Oracle agent with consolidated analysis data:

```python
Task(
    subagent_type="oracle",
    description="Analyze plan execution history for meta-learning",
    prompt='''
    You are analyzing {mode} data to extract operational policies and enhancement suggestions.
    
    **ANALYSIS MODE**: {bootstrap_or_historical}
    
    **DATA SOURCES**:
    {consolidated_file_contents}
    
    **YOUR TASK**:
    Analyze the provided data and generate:
    
    1. **POLICIES** - Operational rules for efficient agent execution
    2. **ENHANCEMENTS** - Suggestions for improving the system
    
    ---
    
    ## ANALYSIS INSTRUCTIONS
    
    ### For POLICIES:
    - Extract concrete, actionable rules from the source data
    - Categorize each policy into one of:
      * surgical-execution (focus, precision, no scope creep)
      * redundancy-prevention (avoid duplicate work, reuse patterns)
      * fast-problem-solving (efficiency, quick debugging, minimal iterations)
      * agent-coordination (knowledge transfer, handoff, parallel execution)
    - Include evidence citations (file:line or section references)
    - Rate confidence based on evidence strength
    
    ### For ENHANCEMENTS:
    - Identify gaps, inefficiencies, or improvement opportunities
    - Categorize each suggestion into one of:
      * new-feature (new capabilities to add)
      * refactoring (code/structure improvements)
      * consolidation (merging/simplifying)
      * performance (speed/efficiency improvements)
      * ux-enhancement (user experience improvements)
    - Estimate effort (small/medium/large/xlarge)
    - Estimate impact (low/medium/high/transformative)
    
    ---
    
    ## REQUIRED OUTPUT FORMAT
    
    Provide your analysis in this EXACT structure:
    
    ```
    POLICIES:
    
    - POL-001: [Policy Title]
      category: [surgical-execution|redundancy-prevention|fast-problem-solving|agent-coordination]
      confidence: [{confidence_level}]
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
    
    - POL-002: [Next Policy Title]
      ...
    
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
    
    - ENH-002: [Next Enhancement Title]
      ...
    
    SUMMARY:
    - Total policies generated: [N]
    - Total enhancements generated: [N]
    - Key themes identified: [list of 3-5 themes]
    - Confidence assessment: [overall confidence in analysis]
    ```
    
    ---
    
    **IMPORTANT CONSTRAINTS**:
    - Generate at least 3 policies and 3 enhancements
    - Each policy must have at least 2 rules
    - Each enhancement must have clear problem/solution
    - All IDs must be sequential (POL-001, POL-002, etc.)
    - Confidence for bootstrap mode MUST be "Low (bootstrap - no execution history)"
    - Evidence must reference actual content from source files
    '''
)
```

### 7. Output Processing

After Oracle returns:
1. **Parse structured output** into policy and enhancement objects
2. **Validate output format** - check for required fields
3. **Display summary** to user:
   ```
   ## Analysis Results
   
   Mode: {bootstrap|historical}
   Plans Analyzed: {count}
   
   ### Policies Generated
   - POL-001: {title} ({category})
   - POL-002: {title} ({category})
   ...
   
   ### Enhancements Suggested
   - ENH-001: {title} ({priority})
   - ENH-002: {title} ({priority})
   ...
   
   ### Next Steps
   - Run `/generate-policy` to create policy files from this analysis
   - Run `/generate-suggestions` to create enhancement files
   - Or run `/learn` to execute the full learning cycle
   ```

4. **Handle parse failures:**
   - If output lacks required structure, retry with stricter prompt (max 3 attempts)
   - Log raw output for debugging
   - Fall back to minimal viable output if retries exhausted

## Oracle Analysis Prompt Templates

### Template for Historical Plan Analysis

```
Analyze the following EXECUTED PLANS to identify patterns:

## Execution History

{for each plan in completed_plans}
### Plan: {plan.path}
- Status: {completed|partial|failed}
- Tasks: {total_tasks} total, {completed_tasks} completed
- Duration: {execution_duration}
- Key Decisions: {extracted_decisions}
- Learnings: {extracted_learnings}
- Issues Discovered: {extracted_issues}
{end for}

## Notepad Insights

{consolidated notepad.md content}

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

[Continue with structured output format...]
```

### Template for Bootstrap Analysis (No Historical Data)

```
Analyze the following AGENT CONFIGURATIONS to extract foundational policies.

**IMPORTANT**: This is BOOTSTRAP MODE - no execution history exists.
All policies should be marked with: confidence: "Low (bootstrap - no execution history)"

## Agent Configuration Files

{for each file in agent/*.md + command/*.md}
### File: {file.path}

#### CODE OF CONDUCT Section:
{extracted content}

#### CRITICAL RULES Section:
{extracted content}

#### WORKFLOW Section:
{extracted content}
{end for}

## Analysis Request

Extract operational policies from these agent configurations:

1. DOCUMENTED RULES:
   - What explicit rules are defined in CODE OF CONDUCT?
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

[Continue with structured output format...]
```

## Output Format

The command outputs analysis results to the terminal in a structured format:

```
================================================================================
                      PLAN EXECUTION HISTORY ANALYSIS
================================================================================

Mode: {BOOTSTRAP|HISTORICAL}
Sources Analyzed: {count} files
Analysis Timestamp: {current_timestamp}

--------------------------------------------------------------------------------
                              POLICIES GENERATED
--------------------------------------------------------------------------------

[POL-001] {Policy Title}
  Category: {category}
  Confidence: {confidence}
  Rules:
    1. {Rule 1}
    2. {Rule 2}
  Anti-patterns:
    - {What not to do}
  Source: {file references}

[POL-002] {Policy Title}
  ...

--------------------------------------------------------------------------------
                          ENHANCEMENT SUGGESTIONS
--------------------------------------------------------------------------------

[ENH-001] {Enhancement Title}
  Category: {category}
  Priority: {priority} | Effort: {effort} | Impact: {impact}
  Problem: {problem statement}
  Solution: {proposed solution}
  Benefits:
    - {benefit 1}
    - {benefit 2}

[ENH-002] {Enhancement Title}
  ...

--------------------------------------------------------------------------------
                                 SUMMARY
--------------------------------------------------------------------------------

Policies: {count} generated ({by category breakdown})
Enhancements: {count} suggested ({by category breakdown})
Key Themes: {theme1}, {theme2}, {theme3}

--------------------------------------------------------------------------------
                               NEXT STEPS
--------------------------------------------------------------------------------

To persist these results:
  /generate-policy    - Create policy files in llm-learning/policies/
  /generate-suggestions - Create suggestion files in llm-learning/enhancement_suggestions/
  /learn              - Run full learning cycle (recommended)

================================================================================
```

## Error Handling

### No Plans Found
```
WARNING: No plan files found in plans/ directory.
Switching to BOOTSTRAP mode...
Analyzing agent configurations instead.
```

### Oracle Output Invalid
```
WARNING: Oracle output did not match expected format (attempt {N}/3).
Retrying with stricter prompt constraints...
```

### Parse Failure After Retries
```
ERROR: Could not parse Oracle output after 3 attempts.
Raw output saved to: /tmp/oracle-analysis-{timestamp}.txt
Generating minimal viable output from available data...
```

## Integration with Other Commands

This command is designed to work with:
- `/generate-policy` - Takes this analysis output to create policy files
- `/generate-suggestions` - Takes this analysis output to create suggestion files
- `/learn` - Orchestrates this command as part of the full learning cycle

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

Bootstrap mode produces policies that represent "what agents are designed to do" rather than "what we observed agents doing successfully."
