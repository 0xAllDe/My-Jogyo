---
description: "Analyze llm-docs knowledge base for quality and gaps. Usage: /analyze-knowledge [--verbose] [--bootstrap]"
subtask: true
---

# Analyze Knowledge Command

## Usage

```
/analyze-knowledge [--verbose] [--bootstrap]
```

Options:
- **--verbose**: Show detailed analysis output including evidence citations and validation results
- **--bootstrap**: Force bootstrap mode (analyze project files to suggest initial knowledge entries)

## What this command does

Analyzes the `llm-docs/` knowledge base to extract meta-learning insights about project knowledge:

1. **Knowledge gaps** - conventions implied but not documented
2. **Knowledge quality** - entries with weak evidence or stale references
3. **Optimization opportunities** - patterns that could be generalized or simplified
4. **Meta-learnings** - what the knowledge base reveals about project maturity

This command is part of the llm-learning system that builds operational wisdom over time.

## Process

### 1. Read llm-docs Files

Use glob pattern to find all knowledge base files in the `llm-docs/` directory:

```python
# Find all llm-docs files
llm_docs_files = glob("llm-docs/*.md")

# Expected files:
# - llm-docs/conventions.md    (CONV- prefix entries)
# - llm-docs/patterns.md       (PAT- prefix entries)
# - llm-docs/gotchas.md        (GOTCHA- prefix entries)
# - llm-docs/commands.md       (CMD- prefix entries)
# - llm-docs/architecture.md   (ARCH- prefix entries)
```

**Discovery Output:**
- List all discovered llm-docs files
- Count total entries per file (from YAML frontmatter `total_entries`)
- Identify empty files (total_entries = 0)

### 2. Bootstrap Mode Detection

**Bootstrap mode activates when:**
1. `llm-docs/` directory is empty or missing
2. All llm-docs files have `total_entries: 0`
3. User explicitly passes `--bootstrap` flag

**Detection logic:**
```python
def is_bootstrap_mode(llm_docs_files, bootstrap_flag):
    # Check explicit flag
    if bootstrap_flag:
        return True
    
    # Check if llm-docs directory is missing or empty
    if len(llm_docs_files) == 0:
        return True
    
    # Check if all files have 0 entries
    total_entries_sum = 0
    for file in llm_docs_files:
        content = read(file)
        # Parse YAML frontmatter for total_entries
        match = re.search(r'total_entries:\s*(\d+)', content)
        if match:
            total_entries_sum += int(match.group(1))
    
    if total_entries_sum == 0:
        return True
    
    return False
```

### 3. Evidence Validation

For each entry in llm-docs files, validate that file:line references are still valid:

```python
def validate_evidence(entry):
    """
    Validate evidence references in an llm-docs entry.
    
    Evidence format: `file_path:line_number` or `file_path:start-end`
    Example: `src/api/routes.py:45-60`
    
    Returns:
        {
            'valid': [list of valid references],
            'invalid': [list of broken references],
            'stale': [list of references that exist but content may have changed]
        }
    """
    results = {'valid': [], 'invalid': [], 'stale': []}
    
    for evidence_item in entry.evidence:
        # Parse file path and line numbers
        match = re.match(r'`([^:]+):(\d+)(?:-(\d+))?`', evidence_item)
        if not match:
            results['invalid'].append(evidence_item)
            continue
        
        file_path = match.group(1)
        start_line = int(match.group(2))
        end_line = int(match.group(3)) if match.group(3) else start_line
        
        # Check if file exists
        if not file_exists(file_path):
            results['invalid'].append(evidence_item)
            continue
        
        # Check if file has enough lines
        file_content = read(file_path)
        line_count = len(file_content.split('\n'))
        
        if end_line > line_count:
            results['stale'].append(evidence_item)
            continue
        
        results['valid'].append(evidence_item)
    
    return results
```

**Validation Output:**
- For each entry with evidence, report:
  - Valid references: File and lines still exist and are accessible
  - Invalid references: Files or lines no longer exist
  - Stale references: Files exist but may have changed significantly

### 4. Data Source Selection

**Normal Mode** (existing knowledge available):
- Read all entries from each llm-docs file
- Parse YAML frontmatter for metadata
- Extract entries with their IDs, evidence, and confidence levels
- Validate evidence references
- Analyze patterns across entries

**Bootstrap Mode** (no knowledge entries exist):
- Scan project files: `agent/*.md`, `command/*.md`
- Analyze existing code patterns
- Identify conventions from code style
- Extract commands from package.json, Makefile, or scripts
- Generate suggestions for initial knowledge entries
- Label all outputs with `confidence: "Low (bootstrap - inferred from project structure)"`

```python
def get_analysis_sources(bootstrap_mode):
    if bootstrap_mode:
        return {
            "type": "bootstrap",
            "files": glob("agent/*.md") + glob("command/*.md") + glob("**/*.py") + glob("**/*.ts"),
            "analysis_focus": [
                "Code patterns and conventions",
                "Naming conventions observed",
                "Common error handling patterns",
                "Build/test commands in scripts",
                "Architecture from directory structure"
            ],
            "confidence": "Low (bootstrap - inferred from project structure)"
        }
    else:
        return {
            "type": "knowledge_analysis",
            "files": glob("llm-docs/*.md"),
            "analysis_focus": [
                "Entry quality and evidence strength",
                "Coverage gaps",
                "Stale or outdated entries",
                "Patterns that could be consolidated"
            ],
            "confidence": "Based on entry evidence"
        }
```

### 5. Knowledge Analysis (Normal Mode)

For each llm-docs file with entries:

1. **Parse Entry Structure:**
   - Extract entry ID (CONV-, PAT-, GOTCHA-, CMD-, ARCH-)
   - Extract discovery date
   - Extract source task reference
   - Parse evidence items

2. **Assess Entry Quality:**
   - Evidence count (1 = low quality, 2-3 = medium, 4+ = high)
   - Evidence validity (check file:line references)
   - Confidence level accuracy
   - Recency of discovery

3. **Identify Knowledge Gaps:**
   - File types without conventions documented
   - Common patterns not captured
   - Known issues not in gotchas
   - Build/deploy commands missing

4. **Meta-Analysis:**
   - Which areas have most knowledge?
   - Which areas are under-documented?
   - What's the average entry age?
   - How often are entries updated?

### 6. Project Analysis (Bootstrap Mode)

When no knowledge entries exist:

1. **Scan Project Structure:**
   ```python
   # Analyze directory structure
   directories = glob("**/*", directories_only=True)
   
   # Identify key patterns from structure
   has_tests = any("test" in d for d in directories)
   has_docs = any("doc" in d for d in directories)
   has_src = any("src" in d for d in directories)
   ```

2. **Analyze Agent/Command Configurations:**
   - Extract conventions from CODE OF CONDUCT sections
   - Identify patterns from workflow definitions
   - Find gotchas from error handling sections
   - Extract commands from documented verification steps

3. **Infer Conventions:**
   - Naming patterns from file/function names
   - Code style from existing implementations
   - Testing patterns from test files
   - Error handling approaches

4. **Generate Suggestions:**
   - Conventions that should be documented
   - Patterns worth capturing
   - Common gotchas to track
   - Commands to verify

### 7. Oracle Invocation

Invoke Oracle agent with consolidated analysis data:

```python
Task(
    subagent_type="oracle",
    description="Analyze llm-docs knowledge base for meta-learning",
    prompt='''
    You are analyzing the project's {mode} to extract policies and enhancement suggestions.
    
    **ANALYSIS MODE**: {bootstrap_or_knowledge_analysis}
    
    **DATA SOURCES**:
    {consolidated_file_contents}
    
    **EVIDENCE VALIDATION RESULTS** (if normal mode):
    {evidence_validation_report}
    
    **YOUR TASK**:
    Analyze the provided data and generate:
    
    1. **POLICIES** - Operational rules for knowledge management and quality
    2. **ENHANCEMENTS** - Suggestions for improving the knowledge base
    
    ---
    
    ## ANALYSIS INSTRUCTIONS
    
    ### For KNOWLEDGE GAPS Analysis:
    - What conventions are implied by code but not documented?
    - What patterns are reused but not captured?
    - What gotchas have likely been encountered but not recorded?
    - What commands work but aren't verified in docs?
    
    ### For KNOWLEDGE QUALITY Analysis:
    - Which entries have weak evidence (only 1 source)?
    - Which entries have stale references (files changed)?
    - Which entries have low confidence that should be upgraded?
    - Which entries are outdated and need refresh?
    
    ### For OPTIMIZATION OPPORTUNITIES:
    - What patterns could be generalized (merge similar entries)?
    - What conventions could be simplified?
    - What gotchas are no longer relevant?
    - What commands could be consolidated?
    
    ### For META-LEARNINGS:
    - What does the knowledge base reveal about project maturity?
    - Which areas get most attention? Least?
    - What does entry creation rate indicate?
    - How healthy are the documentation patterns?
    
    ### For POLICIES (output):
    - Create rules for maintaining knowledge quality
    - Define when to add vs update entries
    - Set evidence requirements per entry type
    - Establish review cadence recommendations
    - Categorize into: surgical-execution, redundancy-prevention, fast-problem-solving, agent-coordination
    
    ### For ENHANCEMENTS (output):
    - Suggest specific entries to add (with draft content)
    - Recommend entries to consolidate or remove
    - Propose new knowledge categories if needed
    - Identify tooling improvements for knowledge management
    - Categorize into: new-feature, refactoring, consolidation, performance, ux-enhancement
    
    ---
    
    ## REQUIRED OUTPUT FORMAT
    
    Provide your analysis in this EXACT structure:
    
    ```
    KNOWLEDGE BASE ASSESSMENT:
    
    Total Entries: {count by file}
    Evidence Health: {percentage of valid references}
    Coverage Gaps: {list of undocumented areas}
    Quality Issues: {list of low-quality entries}
    
    POLICIES:
    
    - POL-001: [Policy Title]
      category: [surgical-execution|redundancy-prevention|fast-problem-solving|agent-coordination]
      confidence: [{confidence_level}]
      sources:
        - file: [llm-docs file or project file]
          section: [relevant section]
          observation: [what was learned]
      rules:
        - [Rule 1: Specific knowledge management instruction]
        - [Rule 2: Another specific instruction]
      anti_patterns:
        - [What NOT to do with knowledge entries]
      rationale: [Why this policy matters for knowledge quality]
    
    - POL-002: [Next Policy Title]
      ...
    
    ENHANCEMENTS:
    
    - ENH-001: [Enhancement Title]
      category: [new-feature|refactoring|consolidation|performance|ux-enhancement]
      priority: [critical|high|medium|low]
      effort: [small|medium|large|xlarge]
      impact: [low|medium|high|transformative]
      problem: [What knowledge gap or quality issue does this solve?]
      evidence:
        - source: [what indicates this need]
          observation: [specific evidence]
      solution: [Proposed improvement to knowledge base]
      draft_content: |
        [For new entries, provide draft content to add]
      benefits:
        - [Benefit 1]
        - [Benefit 2]
    
    - ENH-002: [Next Enhancement Title]
      ...
    
    EVIDENCE VALIDATION REPORT:
    
    Valid References: {count}
    Invalid References: {count} - [list of broken refs]
    Stale References: {count} - [list of refs that may need update]
    
    Recommendations:
    - [Specific actions to fix evidence issues]
    
    META-ANALYSIS:
    
    Knowledge Maturity: [nascent|developing|mature|comprehensive]
    Strongest Areas: [list of well-documented areas]
    Weakest Areas: [list of underdocumented areas]
    Health Score: [1-10] with reasoning
    
    SUMMARY:
    - Total policies generated: [N]
    - Total enhancements generated: [N]
    - Key themes identified: [list of 3-5 themes]
    - Recommended next actions: [prioritized list]
    ```
    
    ---
    
    **IMPORTANT CONSTRAINTS**:
    - Generate at least 3 policies and 3 enhancements
    - Each policy must have at least 2 rules
    - Each enhancement must have clear problem/solution
    - All IDs must be sequential (POL-001, POL-002, etc.)
    - Confidence for bootstrap mode MUST be "Low (bootstrap - inferred from project structure)"
    - Evidence validation results must be incorporated into recommendations
    - Provide actionable draft content for suggested new entries
    '''
)
```

### 8. Output Processing

After Oracle returns:

1. **Parse structured output** into policy, enhancement, and validation objects
2. **Validate output format** - check for required fields
3. **Display summary** to user:
   ```
   ## Knowledge Base Analysis Results
   
   Mode: {bootstrap|knowledge_analysis}
   Files Analyzed: {count}
   Total Entries: {count across all files}
   
   ### Evidence Validation
   - Valid: {count} ({percentage}%)
   - Invalid: {count} - NEEDS ATTENTION
   - Stale: {count} - Consider updating
   
   ### Knowledge Coverage
   - Conventions: {count} entries
   - Patterns: {count} entries
   - Gotchas: {count} entries
   - Commands: {count} entries
   - Architecture: {count} entries
   
   ### Policies Generated
   - POL-001: {title} ({category})
   - POL-002: {title} ({category})
   ...
   
   ### Enhancements Suggested
   - ENH-001: {title} ({priority})
   - ENH-002: {title} ({priority})
   ...
   
   ### Meta-Analysis
   - Knowledge Maturity: {level}
   - Health Score: {score}/10
   - Primary Gaps: {list}
   
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

### Template for Knowledge Analysis (Normal Mode)

```
Analyze the following PROJECT KNOWLEDGE BASE to identify quality and gaps:

## Knowledge Base Contents

### llm-docs/conventions.md
Total Entries: {count}
{for each entry}
- [{entry.id}] {entry.title}
  - Confidence: {entry.confidence}
  - Evidence: {entry.evidence_count} items
  - Discovered: {entry.discovered_date}
{end for}

### llm-docs/patterns.md
Total Entries: {count}
{similar structure}

### llm-docs/gotchas.md
Total Entries: {count}
{similar structure}

### llm-docs/commands.md
Total Entries: {count}
{similar structure}

### llm-docs/architecture.md
Total Entries: {count}
{similar structure}

## Evidence Validation Results

{for each file}
### {file}
Valid: {list}
Invalid: {list with reasons}
Stale: {list with last-modified dates}
{end for}

## Analysis Request

Based on this knowledge base:

1. KNOWLEDGE GAPS:
   - What conventions should exist but don't?
   - What patterns are missing?
   - What gotchas are undocumented?
   - What commands need verification?

2. KNOWLEDGE QUALITY:
   - Which entries have weak evidence?
   - Which entries are outdated?
   - Which entries have broken references?

3. OPTIMIZATION OPPORTUNITIES:
   - What entries could be merged?
   - What patterns could be generalized?
   - What gotchas are obsolete?

4. META-LEARNINGS:
   - What does this knowledge base reveal about project maturity?
   - Which areas need more attention?

[Continue with structured output format...]
```

### Template for Bootstrap Analysis (No Knowledge Entries)

```
Analyze the following PROJECT STRUCTURE to suggest initial knowledge base entries.

**IMPORTANT**: This is BOOTSTRAP MODE - no knowledge entries exist.
All suggestions should be marked with: confidence: "Low (bootstrap - inferred from project structure)"

## Project Files Analyzed

### Agent Configurations
{for each file in agent/*.md}
#### {file.path}
Key sections found:
- CODE OF CONDUCT: {extracted content}
- CRITICAL RULES: {extracted content}
- WORKFLOW: {extracted content}
{end for}

### Command Definitions
{for each file in command/*.md}
#### {file.path}
Key sections found:
- Description: {from frontmatter}
- Process steps: {workflow overview}
{end for}

### Project Structure
- Directories: {list of main directories}
- File types: {list of file extensions with counts}
- Test files: {list of test directories/files}
- Config files: {list of config files}

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

[Continue with structured output format...]
```

## Output Format

The command outputs analysis results to the terminal in a structured format:

```
================================================================================
                      LLM-DOCS KNOWLEDGE BASE ANALYSIS
================================================================================

Mode: {BOOTSTRAP|KNOWLEDGE_ANALYSIS}
Files Analyzed: {count} files
Total Entries: {count} entries
Analysis Timestamp: {current_timestamp}

--------------------------------------------------------------------------------
                           EVIDENCE VALIDATION
--------------------------------------------------------------------------------

Summary:
  Valid References:   {count} ({percentage}%)
  Invalid References: {count} - REQUIRES ACTION
  Stale References:   {count} - Consider updating

Broken References:
  - `{file}:{line}` in {entry_id} - {reason}
  - ...

Stale References:
  - `{file}:{line}` in {entry_id} - File modified since entry creation
  - ...

--------------------------------------------------------------------------------
                           KNOWLEDGE COVERAGE
--------------------------------------------------------------------------------

| File              | Entries | Quality Score | Last Updated |
|-------------------|---------|---------------|--------------|
| conventions.md    | {count} | {score}/10    | {date}       |
| patterns.md       | {count} | {score}/10    | {date}       |
| gotchas.md        | {count} | {score}/10    | {date}       |
| commands.md       | {count} | {score}/10    | {date}       |
| architecture.md   | {count} | {score}/10    | {date}       |

Identified Gaps:
  - {gap description}
  - ...

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
  Draft Content:
    ```markdown
    {suggested entry content}
    ```
  Benefits:
    - {benefit 1}
    - {benefit 2}

[ENH-002] {Enhancement Title}
  ...

--------------------------------------------------------------------------------
                           META-ANALYSIS
--------------------------------------------------------------------------------

Knowledge Maturity: {nascent|developing|mature|comprehensive}
Health Score: {score}/10

Strongest Areas:
  - {area 1}: {reason}
  - {area 2}: {reason}

Weakest Areas:
  - {area 1}: {reason}  
  - {area 2}: {reason}

Key Themes:
  - {theme 1}
  - {theme 2}
  - {theme 3}

--------------------------------------------------------------------------------
                              SUMMARY
--------------------------------------------------------------------------------

Policies: {count} generated ({by category breakdown})
Enhancements: {count} suggested ({by category breakdown})

Recommended Actions (Priority Order):
  1. {action 1}
  2. {action 2}
  3. {action 3}

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

### No llm-docs Directory
```
WARNING: llm-docs/ directory not found.
Creating initial knowledge base structure...
[Creates empty template files]
Switching to BOOTSTRAP mode...
```

### All Files Empty
```
INFO: All llm-docs files have 0 entries.
Switching to BOOTSTRAP mode...
Analyzing project structure to suggest initial entries.
```

### Evidence Validation Errors
```
WARNING: Found {count} invalid evidence references.
These entries need attention:
  - {entry_id}: `{broken_ref}` - File not found
  - {entry_id}: `{broken_ref}` - Line number out of range

Recommendation: Update these entries with current file references.
```

### Oracle Output Invalid
```
WARNING: Oracle output did not match expected format (attempt {N}/3).
Retrying with stricter prompt constraints...
```

### Parse Failure After Retries
```
ERROR: Could not parse Oracle output after 3 attempts.
Raw output saved to: /tmp/oracle-knowledge-analysis-{timestamp}.txt
Generating minimal viable output from available data...
```

## Integration with Other Commands

This command is designed to work with:
- `/analyze-plans` - Companion command for plan execution analysis
- `/generate-policy` - Takes this analysis output to create policy files
- `/generate-suggestions` - Takes this analysis output to create suggestion files
- `/learn` - Orchestrates this command as part of the full learning cycle

## Bootstrap Mode Details

When in bootstrap mode:

1. **Sources**: Project structure, `agent/*.md`, `command/*.md`, config files
2. **Extraction targets**:
   - Naming conventions from file/function names
   - Patterns from repeated code structures
   - Potential gotchas from error handling
   - Commands from scripts and makefiles
3. **Confidence**: All suggestions marked as `"Low (bootstrap - inferred from project structure)"`
4. **Purpose**: Bootstrap the knowledge base with reasonable initial entries

Bootstrap mode produces suggestions for what SHOULD be documented based on project structure, rather than analyzing what IS documented.

## Evidence Validation Details

Evidence validation is a critical feature that ensures knowledge base quality:

### Validation Types

1. **File Existence Check**
   - Verify referenced file still exists at the path
   - Mark as INVALID if file not found

2. **Line Range Check**
   - Verify line numbers are within file bounds
   - Mark as STALE if file has fewer lines than referenced

3. **Content Relevance Check** (optional, with --verbose)
   - Compare referenced lines to entry description
   - Flag if content seems unrelated to documented pattern

### Validation Actions

| Status | Meaning | Recommended Action |
|--------|---------|-------------------|
| VALID | Reference accurate | No action needed |
| INVALID | File/lines missing | Update or remove entry |
| STALE | File changed significantly | Review and update reference |

### Validation Report

The command generates a validation report that includes:
- Summary statistics (valid/invalid/stale counts)
- List of problematic references with entry IDs
- Suggested actions for each issue
- Overall evidence health score

## Meta-Analysis Insights

The meta-analysis section provides strategic insights:

### Knowledge Maturity Levels

| Level | Criteria |
|-------|----------|
| Nascent | <10 entries, mostly low confidence |
| Developing | 10-30 entries, mixed confidence |
| Mature | 30-50 entries, mostly high confidence |
| Comprehensive | 50+ entries, high confidence, regular updates |

### Health Score Factors

The health score (1-10) is calculated from:
- Evidence validity rate (40%)
- Coverage completeness (30%)
- Entry recency (15%)
- Confidence distribution (15%)

### Improvement Recommendations

Based on analysis, the command provides prioritized recommendations:
1. Critical: Fix invalid evidence references
2. High: Add entries for major gaps
3. Medium: Update stale entries
4. Low: Consolidate redundant patterns
