---
description: "Generate enhancement suggestions from Oracle analysis output. Usage: /generate-suggestions [--from-analysis <file>] [--dry-run]"
subtask: true
---

# Generate Suggestions Command

## Usage

```
/generate-suggestions [--from-analysis <file>] [--dry-run]
```

Options:
- **--from-analysis <file>**: Path to file containing Oracle analysis output (optional, can read from context)
- **--dry-run**: Preview suggestion generation without writing files

## What this command does

Takes Oracle analysis output (from `/analyze-plans` or `/analyze-knowledge`) and:

1. **Parses** structured enhancement suggestions from analysis output
2. **Generates** sequential ENH-NNN IDs for new suggestions
3. **Creates** versioned suggestion files in `enhancement_suggestions/pending/`
4. **Updates** category-specific suggestion files
5. **Assigns** priority and effort/impact estimates

This command is part of the llm-learning system that identifies improvement opportunities over time.

## Process

### 1. Input Processing

Parse Oracle analysis output to extract enhancement suggestions:

```python
def parse_analysis_output(analysis_content):
    """
    Parse Oracle analysis output for ENHANCEMENTS section.
    
    Expected format from Oracle:
    
    ENHANCEMENTS:
    
    - ENH-001: [Suggestion Title]
      category: [category]
      priority: [priority]
      effort_estimate: [effort]
      impact_estimate: [impact]
      problem_statement: [What problem does this solve?]
      evidence:
        - source: [file path or plan reference]
          observation: [What was observed]
          frequency: [How often this occurs]
      proposed_solution: [Detailed description]
      expected_benefits:
        - [Benefit 1]
        - [Benefit 2]
      implementation_considerations:
        dependencies: [What needs to exist first]
        risks: [Potential issues]
        alternatives: [Other approaches considered]
      related:
        policies: [Related policy IDs]
        suggestions: [Related enhancement IDs]
    
    Returns list of suggestion objects
    """
    suggestions = []
    
    # Find ENHANCEMENTS section
    enhancements_section = extract_section(analysis_content, "ENHANCEMENTS:")
    if not enhancements_section:
        return []
    
    # Parse each suggestion entry
    current_suggestion = None
    for line in enhancements_section.split('\n'):
        if line.strip().startswith('- ENH-'):
            # Start new suggestion
            if current_suggestion:
                suggestions.append(current_suggestion)
            
            # Parse ENH-NNN: Title
            match = re.match(r'- ENH-\d+:\s*(.+)', line.strip())
            current_suggestion = {
                'title': match.group(1) if match else line,
                'category': None,
                'priority': 'medium',
                'effort_estimate': 'medium',
                'impact_estimate': 'medium',
                'problem_statement': None,
                'evidence': [],
                'proposed_solution': None,
                'expected_benefits': [],
                'implementation_considerations': {
                    'dependencies': None,
                    'risks': None,
                    'alternatives': None
                },
                'related': {
                    'policies': [],
                    'suggestions': []
                }
            }
        elif current_suggestion:
            # Parse suggestion fields
            if 'category:' in line:
                current_suggestion['category'] = extract_value(line, 'category:')
            elif 'priority:' in line:
                current_suggestion['priority'] = extract_value(line, 'priority:')
            elif 'effort_estimate:' in line:
                current_suggestion['effort_estimate'] = extract_value(line, 'effort_estimate:')
            elif 'impact_estimate:' in line:
                current_suggestion['impact_estimate'] = extract_value(line, 'impact_estimate:')
            elif 'problem_statement:' in line:
                current_suggestion['problem_statement'] = extract_value(line, 'problem_statement:')
            elif 'proposed_solution:' in line:
                current_suggestion['proposed_solution'] = extract_value(line, 'proposed_solution:')
            # Parse nested arrays (evidence, expected_benefits, etc.)
            # ... (parsing logic continues)
    
    if current_suggestion:
        suggestions.append(current_suggestion)
    
    return suggestions
```

**Input Sources:**
1. **Context Mode**: If invoked from `/learn` command, receives analysis as context
2. **File Mode**: If `--from-analysis <file>` provided, reads from specified file
3. **Interactive Mode**: If no input, prompts user to paste analysis output

### 2. ID Generation

Read and increment the suggestion ID counter from `enhancement_suggestions/pending/_counter.md`:

```python
def generate_suggestion_id():
    """
    Generate sequential ENH-NNN ID.
    
    Algorithm:
    1. Read _counter.md YAML frontmatter
    2. Extract next_enhancement_id value
    3. Format as ENH-{NNN} (zero-padded to 3 digits)
    4. Increment counter and write back
    5. Return the generated ID
    
    IDs are NEVER reused, even after suggestion deletion or implementation.
    """
    # Read counter file
    counter_file = "llm-learning/enhancement_suggestions/pending/_counter.md"
    counter_md = read(counter_file)
    
    # Parse YAML frontmatter
    frontmatter = parse_yaml_frontmatter(counter_md)
    next_id = frontmatter.get('next_enhancement_id', 1)
    
    # Generate formatted ID
    suggestion_id = f"ENH-{next_id:03d}"
    
    # Increment counter for next use
    frontmatter['next_enhancement_id'] = next_id + 1
    frontmatter['last_updated'] = datetime.now().isoformat() + 'Z'
    
    # Write updated frontmatter back
    update_yaml_frontmatter(counter_file, frontmatter)
    
    return suggestion_id
```

**ID Generation Rules:**
- IDs are sequential: ENH-001, ENH-002, ENH-003, ...
- Zero-padded to 3 digits
- Counter stored in `_counter.md` frontmatter as `next_enhancement_id`
- IDs are NEVER reused (gaps are acceptable after deletion or implementation)
- Counter is incremented atomically with each ID generation

### 3. Category Validation

Validate and normalize category values:

```python
def validate_category(category):
    """
    Validate category is one of the 5 allowed values.
    
    Valid categories:
    - new-feature
    - refactoring
    - consolidation
    - performance
    - ux-enhancement
    
    Returns normalized category or None if invalid.
    """
    valid_categories = [
        'new-feature',
        'refactoring', 
        'consolidation',
        'performance',
        'ux-enhancement'
    ]
    
    # Normalize input (lowercase, handle common variations)
    normalized = category.lower().strip()
    
    # Handle common variations
    category_aliases = {
        'new-features': 'new-feature',
        'feature': 'new-feature',
        'features': 'new-feature',
        'new feature': 'new-feature',
        'refactor': 'refactoring',
        'restructure': 'refactoring',
        'consolidate': 'consolidation',
        'merge': 'consolidation',
        'perf': 'performance',
        'speed': 'performance',
        'optimization': 'performance',
        'ux': 'ux-enhancement',
        'ux-enhancements': 'ux-enhancement',
        'ui': 'ux-enhancement',
        'usability': 'ux-enhancement',
        'user-experience': 'ux-enhancement'
    }
    
    if normalized in valid_categories:
        return normalized
    elif normalized in category_aliases:
        return category_aliases[normalized]
    else:
        return None

def get_category_file(category):
    """
    Get file path for category-specific suggestion file.
    
    Category to file mapping:
    - new-feature -> new-features.md
    - refactoring -> refactoring.md
    - consolidation -> consolidation.md
    - performance -> performance.md
    - ux-enhancement -> ux-enhancements.md
    """
    category_files = {
        'new-feature': 'new-features.md',
        'refactoring': 'refactoring.md',
        'consolidation': 'consolidation.md',
        'performance': 'performance.md',
        'ux-enhancement': 'ux-enhancements.md'
    }
    
    filename = category_files.get(category)
    if filename:
        return f"llm-learning/enhancement_suggestions/categories/{filename}"
    return None
```

**Category Mapping:**
| Category | File Path |
|----------|-----------|
| new-feature | llm-learning/enhancement_suggestions/categories/new-features.md |
| refactoring | llm-learning/enhancement_suggestions/categories/refactoring.md |
| consolidation | llm-learning/enhancement_suggestions/categories/consolidation.md |
| performance | llm-learning/enhancement_suggestions/categories/performance.md |
| ux-enhancement | llm-learning/enhancement_suggestions/categories/ux-enhancements.md |

### 4. Priority and Effort Estimation

Validate and normalize priority and effort/impact values:

```python
def validate_priority(priority):
    """
    Validate priority is one of the 4 allowed values.
    
    Valid priorities (from highest to lowest):
    - critical: Blocks other work or causes major issues
    - high: Important for efficiency or user experience
    - medium: Beneficial but not urgent
    - low: Nice to have, can be deferred
    
    Returns normalized priority or 'medium' as default.
    """
    valid_priorities = ['critical', 'high', 'medium', 'low']
    
    normalized = priority.lower().strip() if priority else 'medium'
    
    if normalized in valid_priorities:
        return normalized
    
    # Default to medium if invalid
    return 'medium'

def validate_effort_estimate(effort):
    """
    Validate effort estimate is one of the 4 allowed values.
    
    Valid effort levels:
    - small: Hours to 1 day
    - medium: 1-3 days
    - large: 3-7 days
    - xlarge: 1+ weeks
    
    Returns normalized effort or 'medium' as default.
    """
    valid_efforts = ['small', 'medium', 'large', 'xlarge']
    
    normalized = effort.lower().strip() if effort else 'medium'
    
    # Handle variations
    effort_aliases = {
        'xs': 'small',
        's': 'small',
        'm': 'medium',
        'l': 'large',
        'xl': 'xlarge',
        'x-large': 'xlarge',
        'extra-large': 'xlarge'
    }
    
    if normalized in valid_efforts:
        return normalized
    elif normalized in effort_aliases:
        return effort_aliases[normalized]
    
    return 'medium'

def validate_impact_estimate(impact):
    """
    Validate impact estimate is one of the 4 allowed values.
    
    Valid impact levels:
    - low: Minor improvement
    - medium: Noticeable improvement
    - high: Significant improvement
    - transformative: Game-changing improvement
    
    Returns normalized impact or 'medium' as default.
    """
    valid_impacts = ['low', 'medium', 'high', 'transformative']
    
    normalized = impact.lower().strip() if impact else 'medium'
    
    # Handle variations
    impact_aliases = {
        'minor': 'low',
        'significant': 'high',
        'major': 'high',
        'game-changer': 'transformative',
        'game-changing': 'transformative'
    }
    
    if normalized in valid_impacts:
        return normalized
    elif normalized in impact_aliases:
        return impact_aliases[normalized]
    
    return 'medium'
```

**Priority Matrix:**
| Priority | Response Time | Description |
|----------|---------------|-------------|
| critical | Immediate | Blocks work or causes major issues |
| high | Within sprint | Important for efficiency or UX |
| medium | Next sprint | Beneficial but not urgent |
| low | Backlog | Nice to have, can be deferred |

**Effort/Impact Matrix:**
| Effort | Duration | Impact | Value |
|--------|----------|--------|-------|
| small | Hours-1d | transformative | Highest priority |
| small | Hours-1d | high | High priority |
| medium | 1-3d | high | Medium-high priority |
| large | 3-7d | transformative | Medium priority |
| xlarge | 1+w | transformative | Evaluate carefully |

### 5. Versioned Suggestion File Creation

Create timestamped suggestion files in pending/ directory:

```python
def create_versioned_suggestion_file(suggestions, suggestion_ids):
    """
    Create versioned suggestion file in pending/ directory.
    
    File path: llm-learning/enhancement_suggestions/pending/suggestions-YYYYMMDD-HHMMSS.md
    
    Contains all suggestions from this generation run.
    """
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    file_path = f"llm-learning/enhancement_suggestions/pending/suggestions-{timestamp}.md"
    
    # Build content
    content = f"""---
title: "Enhancement Suggestions - {timestamp}"
created: {datetime.now().isoformat()}Z
source_analysis: {datetime.now().isoformat()}Z
suggestion_count: {len(suggestions)}
status: "pending"
schema_version: 1
---

# Enhancement Suggestions - {timestamp}

This file contains enhancement suggestions generated from Oracle analysis.

## Summary

| ID | Title | Category | Priority | Effort | Impact |
|----|-------|----------|----------|--------|--------|
"""
    
    # Add summary table
    for suggestion, sid in zip(suggestions, suggestion_ids):
        content += f"| {sid} | {suggestion['title'][:40]}... | {suggestion['category']} | {suggestion['priority']} | {suggestion['effort_estimate']} | {suggestion['impact_estimate']} |\n"
    
    content += "\n---\n\n## Detailed Suggestions\n\n"
    
    # Add full suggestion entries
    for suggestion, sid in zip(suggestions, suggestion_ids):
        entry = create_suggestion_entry(suggestion, sid)
        content += entry + "\n"
    
    # Write file
    write(file_path, content)
    
    return file_path

def create_suggestion_entry(suggestion, suggestion_id):
    """
    Create formatted suggestion entry in Markdown format.
    
    Returns the suggestion entry text.
    """
    timestamp = datetime.now().isoformat() + 'Z'
    
    # Format evidence
    evidence_text = ""
    for ev in suggestion.get('evidence', []):
        evidence_text += f"""
- **Source**: {ev.get('source', 'unknown')}
- **Observation**: {ev.get('observation', 'N/A')}
- **Frequency**: {ev.get('frequency', 'N/A')}
"""
    
    # Format benefits
    benefits_text = ""
    for benefit in suggestion.get('expected_benefits', []):
        benefits_text += f"\n- {benefit}"
    
    # Format implementation considerations
    impl = suggestion.get('implementation_considerations', {})
    
    # Format related items
    related = suggestion.get('related', {})
    related_policies = ', '.join(related.get('policies', [])) or 'None'
    related_suggestions = ', '.join(related.get('suggestions', [])) or 'None'
    
    entry = f"""### [{suggestion_id}] {suggestion['title']}

---
id: {suggestion_id}
title: "{suggestion['title']}"
category: "{suggestion['category']}"
priority: "{suggestion['priority']}"
created: {timestamp}
status: "pending"
source_analysis: {timestamp}
effort_estimate: "{suggestion['effort_estimate']}"
impact_estimate: "{suggestion['impact_estimate']}"
---

#### Problem Statement

{suggestion.get('problem_statement', 'No problem statement provided.')}

#### Evidence
{evidence_text if evidence_text else '- **Source**: Analysis output\n- **Observation**: Identified during Oracle analysis\n- **Frequency**: To be determined'}

#### Proposed Solution

{suggestion.get('proposed_solution', 'Solution to be elaborated during implementation planning.')}

#### Expected Benefits
{benefits_text if benefits_text else '- Improved efficiency\n- Better user experience'}

#### Implementation Considerations

- **Dependencies**: {impl.get('dependencies', 'None identified')}
- **Risks**: {impl.get('risks', 'None identified')}
- **Alternatives**: {impl.get('alternatives', 'None considered')}

#### Related

- **Policies**: {related_policies}
- **Other Suggestions**: {related_suggestions}

---
"""
    return entry
```

### 6. Category File Update

Update category-specific suggestion files:

```python
def update_category_file(suggestion, suggestion_id):
    """
    Update the appropriate category file with the new suggestion.
    
    Categories:
    - new-feature -> new-features.md
    - refactoring -> refactoring.md
    - consolidation -> consolidation.md
    - performance -> performance.md
    - ux-enhancement -> ux-enhancements.md
    """
    category = suggestion['category']
    category_file = get_category_file(category)
    
    if not category_file:
        print(f"WARNING: Unknown category '{category}' - skipping category update")
        return None
    
    # Read existing content
    existing_content = read(category_file)
    
    # Find insertion point (before closing comment or at end)
    if "<!-- Category-specific suggestions will be added here -->" in existing_content:
        # Remove placeholder comment
        existing_content = existing_content.replace(
            "<!-- Category-specific suggestions will be added here -->", 
            ""
        )
    
    # Create suggestion summary for category file
    suggestion_summary = create_category_summary(suggestion, suggestion_id)
    
    # Append to file
    updated_content = existing_content.strip() + "\n\n" + suggestion_summary
    
    # Update suggestion count in frontmatter
    frontmatter = parse_yaml_frontmatter(updated_content)
    frontmatter['suggestion_count'] = frontmatter.get('suggestion_count', 0) + 1
    frontmatter['last_updated'] = datetime.now().isoformat() + 'Z'
    updated_content = update_yaml_frontmatter_in_content(updated_content, frontmatter)
    
    # Write updated file
    write(category_file, updated_content)
    
    return category_file

def create_category_summary(suggestion, suggestion_id):
    """
    Create a summary entry for the category file.
    
    Category files contain brief summaries; full details are in pending/ files.
    """
    return f"""## [{suggestion_id}] {suggestion['title']}

**Priority**: {suggestion['priority']} | **Effort**: {suggestion['effort_estimate']} | **Impact**: {suggestion['impact_estimate']}

**Problem**: {suggestion.get('problem_statement', 'See full suggestion for details.')[:200]}...

**Status**: pending

---
"""
```

### 7. Duplicate Detection

Check for similar existing suggestions to avoid duplicates:

```python
def check_for_duplicate(new_suggestion, existing_suggestions):
    """
    Check if new suggestion is a duplicate of existing ones.
    
    Duplicate Detection:
    - Same category + similar title (>70% similarity)
    - Same category + similar problem statement (>60% similarity)
    
    Returns duplicate details or None if no duplicate.
    """
    for existing in existing_suggestions:
        if existing['category'] != new_suggestion['category']:
            continue
        
        # Check title similarity
        title_similarity = calculate_similarity(
            existing['title'].lower(),
            new_suggestion['title'].lower()
        )
        
        if title_similarity > 0.7:
            return {
                'id': existing['id'],
                'type': 'similar_title',
                'existing': existing,
                'similarity': title_similarity
            }
        
        # Check problem statement similarity
        existing_problem = existing.get('problem_statement', '')
        new_problem = new_suggestion.get('problem_statement', '')
        
        if existing_problem and new_problem:
            problem_similarity = calculate_similarity(
                existing_problem.lower(),
                new_problem.lower()
            )
            
            if problem_similarity > 0.6:
                return {
                    'id': existing['id'],
                    'type': 'similar_problem',
                    'existing': existing,
                    'similarity': problem_similarity
                }
    
    return None

def handle_duplicate(new_suggestion, duplicate):
    """
    Handle duplicate suggestion.
    
    Strategy:
    - If new suggestion has higher priority -> update existing
    - If same priority -> merge evidence
    - If lower priority -> skip
    
    Returns action to take: 'update', 'merge', 'skip'
    """
    existing = duplicate['existing']
    
    priority_order = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}
    
    new_priority = priority_order.get(new_suggestion['priority'], 2)
    existing_priority = priority_order.get(existing['priority'], 2)
    
    if new_priority > existing_priority:
        return {
            'action': 'update',
            'reason': f"New suggestion has higher priority ({new_suggestion['priority']} > {existing['priority']})"
        }
    elif new_priority == existing_priority:
        return {
            'action': 'merge',
            'reason': "Same priority - merging evidence and benefits"
        }
    else:
        return {
            'action': 'skip',
            'reason': f"Existing suggestion has higher priority ({existing['priority']} > {new_suggestion['priority']})"
        }
```

## Enhancement Suggestion Schema

All generated suggestions follow this schema:

```markdown
---
id: ENH-{NNN}
title: "{Suggestion Title}"
category: "{new-feature|refactoring|consolidation|performance|ux-enhancement}"
priority: "{critical|high|medium|low}"
created: YYYY-MM-DDTHH:MM:SSZ
status: "{pending|in-progress|implemented|rejected}"
source_analysis: YYYY-MM-DDTHH:MM:SSZ
effort_estimate: "{small|medium|large|xlarge}"
impact_estimate: "{low|medium|high|transformative}"
---

# {Suggestion Title}

## Problem Statement
{What problem does this solve? What opportunity does it address?}

## Evidence
- **Source**: {plan/llm-doc/notepad reference}
- **Observation**: {What was observed}
- **Frequency**: {How often this occurs}

## Proposed Solution
{Detailed description of the enhancement}

## Expected Benefits
- {Benefit 1}
- {Benefit 2}

## Implementation Considerations
- **Dependencies**: {What needs to exist first}
- **Risks**: {Potential issues}
- **Alternatives**: {Other approaches considered}

## Related
- Policies: {Related policy IDs}
- Other Suggestions: {Related enhancement IDs}
```

## Output Format

The command outputs generation results to the terminal:

```
================================================================================
                    ENHANCEMENT SUGGESTION GENERATION RESULTS
================================================================================

Mode: {FROM_ANALYSIS|INTERACTIVE}
Input Source: {file path or "context"}
Timestamp: {current_timestamp}

--------------------------------------------------------------------------------
                          SUGGESTIONS GENERATED
--------------------------------------------------------------------------------

[ENH-001] {Suggestion Title}
  Category: {category}
  Priority: {priority}
  Effort: {effort_estimate}
  Impact: {impact_estimate}
  Status: CREATED
  Files Updated:
    - llm-learning/enhancement_suggestions/pending/suggestions-{timestamp}.md
    - llm-learning/enhancement_suggestions/categories/{category}.md

[ENH-002] {Suggestion Title}
  Category: {category}
  Priority: {priority}
  Effort: {effort_estimate}
  Impact: {impact_estimate}
  Status: CREATED
  ...

--------------------------------------------------------------------------------
                        DUPLICATE DETECTION
--------------------------------------------------------------------------------

{If duplicates detected:}
Duplicate 1:
  New Suggestion: {title}
  Existing Suggestion: [{id}] {title}
  Similarity: {percentage}%
  Resolution: {MERGE|SKIP|UPDATE}
  Reason: {explanation}

{If no duplicates:}
No duplicates detected. All suggestions are new.

--------------------------------------------------------------------------------
                        CATEGORY BREAKDOWN
--------------------------------------------------------------------------------

new-feature: {count} suggestions
  - [ENH-001] {title}
  - [ENH-003] {title}

refactoring: {count} suggestions
  - [ENH-002] {title}

consolidation: {count} suggestions
  - (none)

performance: {count} suggestions
  - [ENH-004] {title}

ux-enhancement: {count} suggestions
  - [ENH-005] {title}

--------------------------------------------------------------------------------
                        PRIORITY BREAKDOWN
--------------------------------------------------------------------------------

critical: {count}
high: {count}
medium: {count}
low: {count}

--------------------------------------------------------------------------------
                        EFFORT/IMPACT MATRIX
--------------------------------------------------------------------------------

                  | Low Impact | Med Impact | High Impact | Transformative |
Small Effort      |     0      |     1      |      2      |       1        |
Medium Effort     |     1      |     2      |      1      |       0        |
Large Effort      |     0      |     1      |      0      |       1        |
XLarge Effort     |     0      |     0      |      1      |       0        |

Quick Wins (Small/High+): {count} - Prioritize these!
Strategic (Large+/Transformative): {count} - Plan carefully
Avoid (Large+/Low): {count} - Reconsider necessity

--------------------------------------------------------------------------------
                              SUMMARY
--------------------------------------------------------------------------------

Total Suggestions Generated: {count}
  - new-feature: {count}
  - refactoring: {count}
  - consolidation: {count}
  - performance: {count}
  - ux-enhancement: {count}

Duplicates Resolved: {count}
  - Merged: {count}
  - Skipped: {count}
  - Updated: {count}

Files Created:
  - llm-learning/enhancement_suggestions/pending/suggestions-{timestamp}.md

Files Updated:
  - llm-learning/enhancement_suggestions/pending/_counter.md
  - llm-learning/enhancement_suggestions/categories/new-features.md
  - llm-learning/enhancement_suggestions/categories/refactoring.md
  - (etc.)

--------------------------------------------------------------------------------
                            NEXT STEPS
--------------------------------------------------------------------------------

Suggestions are now available in:
  - llm-learning/enhancement_suggestions/pending/suggestions-{timestamp}.md (full details)
  - llm-learning/enhancement_suggestions/categories/*.md (categorized views)

To work on suggestions:
  1. Review pending suggestions by priority
  2. Move to 'in-progress' when starting work
  3. Move to 'implemented/' after completion
  4. Run /learn again after more plan executions

================================================================================
```

## Dry Run Mode

When `--dry-run` is specified:

```
================================================================================
                  ENHANCEMENT SUGGESTION GENERATION DRY RUN
================================================================================

This is a DRY RUN. No files will be modified.

Would Generate:
  - ENH-001: {title} in {category}
  - ENH-002: {title} in {category}
  ...

Would Create Files:
  - llm-learning/enhancement_suggestions/pending/suggestions-{timestamp}.md

Would Update Files:
  - llm-learning/enhancement_suggestions/pending/_counter.md
  - llm-learning/enhancement_suggestions/categories/{category}.md
  ...

{Duplicate preview}
Would Handle Duplicates:
  - {duplicate details}

To apply these changes, run without --dry-run flag.
================================================================================
```

## Error Handling

### No Suggestions in Analysis Output
```
WARNING: No ENHANCEMENTS section found in analysis output.
Check that the analysis was run successfully.
Expected format:

ENHANCEMENTS:
- ENH-001: [Suggestion Title]
  category: [category]
  ...

No suggestions generated.
```

### Invalid Category
```
WARNING: Unknown category "{category}" for suggestion "{title}".
Valid categories: new-feature, refactoring, consolidation, performance, ux-enhancement
Attempting to normalize... Found match: {normalized_category}
{OR}
Skipping this suggestion. Fix the category in the analysis output.
```

### Counter File Not Found
```
WARNING: llm-learning/enhancement_suggestions/pending/_counter.md not found.
Creating initial counter file with next_enhancement_id: 1...
[Creates counter file]
Continuing with suggestion generation.
```

### ID Counter Corruption
```
ERROR: Could not read next_enhancement_id from _counter.md frontmatter.
Scanning existing suggestions to determine highest ID...
Found highest ID: ENH-{NNN}
Setting next_enhancement_id to {NNN + 1}
Continuing with suggestion generation.
```

### Write Permission Error
```
ERROR: Cannot write to {file_path}.
Check file permissions and try again.
Suggestion generation aborted.
```

### Invalid Priority/Effort/Impact
```
WARNING: Invalid priority "{value}" for suggestion "{title}".
Valid priorities: critical, high, medium, low
Defaulting to: medium
```

## Integration with Other Commands

This command is designed to work with:
- `/analyze-plans` - Provides enhancement suggestions from plan execution analysis
- `/analyze-knowledge` - Provides enhancement suggestions from llm-docs analysis
- `/learn` - Orchestrates analysis + generation as part of full learning cycle
- `/generate-policy` - Companion command for policy generation

## Implementation Notes

### File Locking
When updating counter file and category files, the command should:
1. Read file content
2. Parse and validate
3. Generate updates
4. Write atomically (no partial writes)

### Idempotency
The command is NOT idempotent. Running twice with same input will:
- Generate new suggestion IDs (IDs are never reused)
- Potentially create duplicate suggestions if duplicate detection fails
- Create additional versioned files in pending/

To avoid duplicates:
- Use `--dry-run` first to preview changes
- Ensure analysis output is not processed multiple times
- Check for duplicates manually if needed

### Bootstrap Mode Considerations
When processing bootstrap analysis output:
- Suggestions identify gaps in current documentation/tooling
- Sources will reference `agent/*.md` and `command/*.md` files
- Priority may default to 'medium' without execution history
- These suggestions highlight areas for improvement before real usage data exists

### Status Transitions
```
pending -> in-progress -> implemented
                      \-> rejected
```

When a suggestion is implemented:
1. Update status in pending file to "implemented"
2. Move suggestion to `enhancement_suggestions/implemented/` directory
3. Update category file to reflect new status
4. Optionally link to the commit/PR that implemented it

### Performance
For large numbers of suggestions:
- Category file updates are done one at a time
- Consider batching updates in future optimization
- Versioned file creation is synchronous

## Movement to Implemented

When a suggestion is implemented, use this process:

```python
def mark_implemented(suggestion_id, implementation_details):
    """
    Mark a suggestion as implemented and move to implemented/ directory.
    
    Process:
    1. Find suggestion in pending/ files
    2. Update status to 'implemented'
    3. Add implementation details
    4. Create entry in implemented/ directory
    5. Update category file status
    """
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    
    # Find suggestion in pending files
    suggestion = find_suggestion_by_id(suggestion_id)
    
    if not suggestion:
        print(f"ERROR: Suggestion {suggestion_id} not found in pending/")
        return
    
    # Update status
    suggestion['status'] = 'implemented'
    suggestion['implemented_date'] = datetime.now().isoformat() + 'Z'
    suggestion['implementation_details'] = implementation_details
    
    # Create entry in implemented/ directory
    impl_file = f"llm-learning/enhancement_suggestions/implemented/suggestions-{timestamp}.md"
    
    impl_content = f"""---
title: "Implemented Suggestions - {timestamp}"
created: {datetime.now().isoformat()}Z
status: "implemented"
schema_version: 1
---

# Implemented Suggestions - {timestamp}

## [{suggestion_id}] {suggestion['title']}

**Category**: {suggestion['category']}
**Priority**: {suggestion['priority']}
**Effort**: {suggestion['effort_estimate']}
**Impact**: {suggestion['impact_estimate']}

**Implemented**: {datetime.now().isoformat()}Z
**Implementation Details**: {implementation_details}

---
"""
    
    write(impl_file, impl_content)
    
    # Update category file
    update_category_status(suggestion_id, 'implemented')
    
    return impl_file
```

## Examples

### Example 1: Generate from Analysis File

```
/generate-suggestions --from-analysis /tmp/oracle-analysis-20251228.txt
```

### Example 2: Dry Run Preview

```
/generate-suggestions --from-analysis analysis.txt --dry-run
```

### Example 3: Interactive Mode (from /learn orchestration)

When invoked from `/learn`, the command receives analysis context directly and processes without file input.

## Verification Checklist

After running the command, verify:

1. [ ] New suggestions have sequential ENH-NNN IDs
2. [ ] Counter file (_counter.md) is updated with incremented next_enhancement_id
3. [ ] Versioned file created in pending/ directory with timestamp
4. [ ] Category files are updated with new suggestion summaries
5. [ ] No duplicate suggestions (duplicate detection worked)
6. [ ] All required schema fields are present
7. [ ] Timestamps are in ISO 8601 format
8. [ ] Priority, effort, and impact values are valid
9. [ ] Category values are from the allowed list
10. [ ] Suggestion count in category files is incremented

## Quick Reference

### Valid Categories
- `new-feature` - New capabilities and features
- `refactoring` - Code restructuring and improvements
- `consolidation` - Merging and simplifying
- `performance` - Speed and efficiency improvements
- `ux-enhancement` - User experience improvements

### Valid Priorities
- `critical` - Blocks other work
- `high` - Important for efficiency
- `medium` - Beneficial but not urgent
- `low` - Nice to have

### Valid Effort Estimates
- `small` - Hours to 1 day
- `medium` - 1-3 days
- `large` - 3-7 days
- `xlarge` - 1+ weeks

### Valid Impact Estimates
- `low` - Minor improvement
- `medium` - Noticeable improvement
- `high` - Significant improvement
- `transformative` - Game-changing improvement

### File Paths
- Counter: `llm-learning/enhancement_suggestions/pending/_counter.md`
- Pending: `llm-learning/enhancement_suggestions/pending/suggestions-YYYYMMDD-HHMMSS.md`
- Implemented: `llm-learning/enhancement_suggestions/implemented/suggestions-YYYYMMDD-HHMMSS.md`
- Categories: `llm-learning/enhancement_suggestions/categories/{category}.md`
