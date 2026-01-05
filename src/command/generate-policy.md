---
description: "Generate and consolidate policies from Oracle analysis output. Usage: /generate-policy [--from-analysis <file>] [--dry-run]"
subtask: true
---

# Generate Policy Command

## Usage

```
/generate-policy [--from-analysis <file>] [--dry-run]
```

Options:
- **--from-analysis <file>**: Path to file containing Oracle analysis output (optional, can read from context)
- **--dry-run**: Preview policy generation without writing files

## What this command does

Takes Oracle analysis output (from `/analyze-plans` or `/analyze-knowledge`) and:

1. **Parses** structured policy recommendations from analysis output
2. **Generates** sequential POL-NNN IDs for new policies
3. **Creates** policy entries in category-specific files
4. **Consolidates** all policies into `policies/current.md`
5. **Archives** previous policy snapshots when threshold reached

This command is part of the llm-learning system that builds operational wisdom over time.

## Process

### 1. Input Processing

Parse Oracle analysis output to extract policy recommendations:

```python
def parse_analysis_output(analysis_content):
    """
    Parse Oracle analysis output for POLICIES section.
    
    Expected format from Oracle:
    
    POLICIES:
    
    - POL-001: [Policy Title]
      category: [category]
      confidence: [confidence]
      sources:
        - file: [path]
          section: [section]
          observation: [observation]
      rules:
        - [Rule 1]
        - [Rule 2]
      anti_patterns:
        - [Anti-pattern 1]
      rationale: [Why this matters]
    
    Returns list of policy objects
    """
    policies = []
    
    # Find POLICIES section
    policies_section = extract_section(analysis_content, "POLICIES:")
    if not policies_section:
        return []
    
    # Parse each policy entry
    current_policy = None
    for line in policies_section.split('\n'):
        if line.strip().startswith('- POL-'):
            # Start new policy
            if current_policy:
                policies.append(current_policy)
            
            # Parse POL-NNN: Title
            match = re.match(r'- POL-\d+:\s*(.+)', line.strip())
            current_policy = {
                'title': match.group(1) if match else line,
                'category': None,
                'confidence': None,
                'sources': [],
                'rules': [],
                'anti_patterns': [],
                'rationale': None
            }
        elif current_policy:
            # Parse policy fields
            if 'category:' in line:
                current_policy['category'] = extract_value(line, 'category:')
            elif 'confidence:' in line:
                current_policy['confidence'] = extract_value(line, 'confidence:')
            elif 'rationale:' in line:
                current_policy['rationale'] = extract_value(line, 'rationale:')
            # Parse nested arrays (sources, rules, anti_patterns)
            # ... (parsing logic continues)
    
    if current_policy:
        policies.append(current_policy)
    
    return policies
```

**Input Sources:**
1. **Context Mode**: If invoked from `/learn` command, receives analysis as context
2. **File Mode**: If `--from-analysis <file>` provided, reads from specified file
3. **Interactive Mode**: If no input, prompts user to paste analysis output

### 2. ID Generation

Read and increment the policy ID counter from `policies/current.md`:

```python
def generate_policy_id():
    """
    Generate sequential POL-NNN ID.
    
    Algorithm:
    1. Read current.md YAML frontmatter
    2. Extract next_policy_id value
    3. Format as POL-{NNN} (zero-padded to 3 digits)
    4. Increment counter and write back
    5. Return the generated ID
    
    IDs are NEVER reused, even after policy deletion.
    """
    # Read current.md
    current_md = read("llm-learning/policies/current.md")
    
    # Parse YAML frontmatter
    frontmatter = parse_yaml_frontmatter(current_md)
    next_id = frontmatter.get('next_policy_id', 1)
    
    # Generate formatted ID
    policy_id = f"POL-{next_id:03d}"
    
    # Increment counter for next use
    frontmatter['next_policy_id'] = next_id + 1
    
    # Write updated frontmatter back
    update_yaml_frontmatter("llm-learning/policies/current.md", frontmatter)
    
    return policy_id
```

**ID Generation Rules:**
- IDs are sequential: POL-001, POL-002, POL-003, ...
- Zero-padded to 3 digits
- Counter stored in `current.md` frontmatter as `next_policy_id`
- IDs are NEVER reused (gaps are acceptable after deletion)
- Counter is incremented atomically with each ID generation

### 3. Archival Check

Before adding new policies, check if archival is needed:

```python
def check_archival_needed():
    """
    Check if current.md should be archived before consolidation.
    
    Trigger: current.md has >= 15 policies
    Action: Copy current.md to archive/policy-{YYYYMMDD-HHMMSS}.md
    """
    # Read current.md
    current_md = read("llm-learning/policies/current.md")
    frontmatter = parse_yaml_frontmatter(current_md)
    
    policy_count = frontmatter.get('policy_count', 0)
    
    if policy_count >= 15:
        return True
    return False

def create_archive_snapshot():
    """
    Create timestamped archive of current policies.
    
    Archive path: llm-learning/policies/archive/policy-YYYYMMDD-HHMMSS.md
    """
    # Get current timestamp
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_path = f"llm-learning/policies/archive/policy-{timestamp}.md"
    
    # Read current.md
    current_content = read("llm-learning/policies/current.md")
    
    # Add archive metadata header
    archive_content = f"""---
archive_date: {datetime.now().isoformat()}Z
source: llm-learning/policies/current.md
reason: "Policy count threshold reached (>= 15 policies)"
---

# Archived Policies - {timestamp}

This is an archived snapshot of policies from current.md.

---

{current_content}
"""
    
    # Write archive file
    write(archive_path, archive_content)
    
    return archive_path
```

**Archival Strategy:**
- **Trigger**: Before consolidation if current.md has >= 15 policies
- **Action**: Copy current.md to `archive/policy-{YYYYMMDD-HHMMSS}.md`
- **Purpose**: Preserve historical policy state before major updates
- **Then**: Proceed with consolidation (new policies added to current.md)

### 4. Policy File Creation

Create individual policy entries in category-specific files:

```python
def create_policy_entry(policy, policy_id):
    """
    Create formatted policy entry in Markdown format.
    
    Returns the policy entry text to append to category file.
    """
    timestamp = datetime.now().isoformat() + 'Z'
    
    # Format sources
    sources_yaml = ""
    for source in policy.get('sources', []):
        sources_yaml += f"""
  - file: "{source.get('file', 'unknown')}"
    section: "{source.get('section', 'unknown')}"
    observation: "{source.get('observation', 'N/A')}"
    outcome: "{source.get('outcome', 'observed')}" """
    
    # Format rules
    rules_text = ""
    for i, rule in enumerate(policy.get('rules', []), 1):
        rules_text += f"\n{i}. **Rule {i}**: {rule}"
    
    # Format anti-patterns
    anti_patterns_text = ""
    for ap in policy.get('anti_patterns', []):
        anti_patterns_text += f"\n- {ap}"
    
    entry = f"""
## [{policy_id}] {policy['title']}

---
id: {policy_id}
title: "{policy['title']}"
category: "{policy['category']}"
created: {timestamp}
last_updated: {timestamp}
version: "1.0.0"
status: "active"
confidence: "{policy.get('confidence', 'Medium')}"
sources:{sources_yaml if sources_yaml else '\n  - plan: "bootstrap"\n    observation: "Derived from agent configuration"\n    outcome: "observed"'}
---

### Summary

{policy.get('rationale', 'Policy derived from analysis.')}

### Rules
{rules_text if rules_text else '\n1. **Primary Rule**: Follow best practices'}

### Anti-Patterns (What NOT to Do)
{anti_patterns_text if anti_patterns_text else '\n- Avoid violating the policy rules above'}

### Application Context

- **When to Apply**: When executing tasks in the {policy['category']} domain
- **Exceptions**: When explicitly overridden by user requirements

---
"""
    return entry

def update_category_file(policy, policy_id):
    """
    Update the appropriate category file with the new policy.
    
    Categories:
    - surgical-execution
    - redundancy-prevention
    - fast-problem-solving
    - agent-coordination
    """
    category = policy['category']
    category_file = f"llm-learning/policies/categories/{category}.md"
    
    # Read existing content
    existing_content = read(category_file)
    
    # Find insertion point (before closing comment or at end)
    if "<!-- Category-specific policies will be added here -->" in existing_content:
        # Remove placeholder comment
        existing_content = existing_content.replace(
            "<!-- Category-specific policies will be added here -->", 
            ""
        )
    
    # Create policy entry
    policy_entry = create_policy_entry(policy, policy_id)
    
    # Append to file
    updated_content = existing_content.strip() + "\n\n" + policy_entry
    
    # Update policy count in frontmatter
    frontmatter = parse_yaml_frontmatter(updated_content)
    frontmatter['policy_count'] = frontmatter.get('policy_count', 0) + 1
    frontmatter['last_updated'] = datetime.now().isoformat() + 'Z'
    updated_content = update_yaml_frontmatter_in_content(updated_content, frontmatter)
    
    # Write updated file
    write(category_file, updated_content)
    
    return category_file
```

**Category Mapping:**
| Category | File Path |
|----------|-----------|
| surgical-execution | llm-learning/policies/categories/surgical-execution.md |
| redundancy-prevention | llm-learning/policies/categories/redundancy-prevention.md |
| fast-problem-solving | llm-learning/policies/categories/fast-problem-solving.md |
| agent-coordination | llm-learning/policies/categories/agent-coordination.md |

### 5. Consolidation into current.md

Merge all policies into the main `policies/current.md` file:

```python
def consolidate_to_current(policies, new_policy_ids):
    """
    Consolidate new policies into current.md.
    
    Process:
    1. Read current.md
    2. Check for conflicts with existing policies
    3. Apply conflict resolution
    4. Append non-conflicting policies
    5. Update frontmatter (policy_count, last_consolidated)
    6. Write updated file
    """
    # Read current content
    current_content = read("llm-learning/policies/current.md")
    frontmatter = parse_yaml_frontmatter(current_content)
    
    # Extract existing policies for conflict check
    existing_policies = extract_existing_policies(current_content)
    
    # Process each new policy
    policies_to_add = []
    for policy, policy_id in zip(policies, new_policy_ids):
        # Check for conflicts
        conflict = check_for_conflict(policy, existing_policies)
        
        if conflict:
            # Apply conflict resolution
            resolved = resolve_conflict(policy, conflict)
            if resolved['action'] == 'merge':
                # Merge evidence sources
                policies_to_add.append(resolved['merged_policy'])
            elif resolved['action'] == 'skip':
                # Higher confidence version exists, skip
                continue
            elif resolved['action'] == 'replace':
                # New version is better, mark old for update
                policies_to_add.append((policy, policy_id, 'replace', conflict['id']))
        else:
            policies_to_add.append((policy, policy_id, 'add', None))
    
    # Build updated content
    updated_content = update_current_md(current_content, policies_to_add)
    
    # Update frontmatter
    frontmatter['policy_count'] = frontmatter.get('policy_count', 0) + len(policies_to_add)
    frontmatter['last_consolidated'] = datetime.now().isoformat() + 'Z'
    frontmatter['last_analysis'] = datetime.now().isoformat() + 'Z'
    
    updated_content = update_yaml_frontmatter_in_content(updated_content, frontmatter)
    
    # Write updated file
    write("llm-learning/policies/current.md", updated_content)
    
    return len(policies_to_add)

def update_current_md(current_content, policies_to_add):
    """
    Update current.md with new policies.
    
    Sections to update:
    1. Quick Reference - Add key rules per category
    2. Detailed Policies - Add full policy entries
    """
    # Organize policies by category for Quick Reference
    by_category = {
        'surgical-execution': [],
        'redundancy-prevention': [],
        'fast-problem-solving': [],
        'agent-coordination': []
    }
    
    for item in policies_to_add:
        policy, policy_id, action, _ = item if len(item) == 4 else (*item, 'add', None)
        category = policy['category']
        if category in by_category:
            # Add first rule as quick reference
            first_rule = policy.get('rules', ['No rules defined'])[0]
            by_category[category].append(f"- [{policy_id}] {first_rule[:80]}...")
    
    # Update Quick Reference section
    for category, rules in by_category.items():
        if rules:
            # Find and update category section
            category_title = category.replace('-', ' ').title()
            section_header = f"### {category_title}"
            # Update section with new rules
            # ... (section update logic)
    
    # Add to Detailed Policies section
    for item in policies_to_add:
        policy, policy_id, action, replace_id = item if len(item) == 4 else (*item, 'add', None)
        
        policy_entry = create_detailed_policy_entry(policy, policy_id)
        
        if action == 'replace':
            # Find and replace existing policy
            current_content = replace_policy_in_content(current_content, replace_id, policy_entry)
        else:
            # Append to Detailed Policies section
            insertion_marker = "## Detailed Policies"
            if insertion_marker in current_content:
                # Find end of content and append
                current_content = current_content.rstrip() + "\n\n" + policy_entry
    
    return current_content

def create_detailed_policy_entry(policy, policy_id):
    """
    Create detailed policy entry for current.md.
    """
    rules_text = ""
    for i, rule in enumerate(policy.get('rules', []), 1):
        rules_text += f"\n   {i}. {rule}"
    
    anti_patterns = ""
    for ap in policy.get('anti_patterns', []):
        anti_patterns += f"\n   - {ap}"
    
    return f"""
### [{policy_id}] {policy['title']}

**Category**: {policy['category']}
**Confidence**: {policy.get('confidence', 'Medium')}
**Status**: active

**Rules**:{rules_text if rules_text else '\n   1. Follow policy guidelines'}

**Anti-Patterns**:{anti_patterns if anti_patterns else '\n   - Avoid policy violations'}

**Rationale**: {policy.get('rationale', 'Derived from analysis.')}

---
"""
```

### 6. Conflict Resolution

Handle conflicts when similar policies exist:

```python
def check_for_conflict(new_policy, existing_policies):
    """
    Check if new policy conflicts with existing ones.
    
    Conflict Detection:
    - Same category + similar title (>70% similarity)
    - Same category + overlapping rules
    
    Returns conflict details or None if no conflict.
    """
    for existing in existing_policies:
        if existing['category'] != new_policy['category']:
            continue
        
        # Check title similarity
        title_similarity = calculate_similarity(
            existing['title'].lower(),
            new_policy['title'].lower()
        )
        
        if title_similarity > 0.7:
            return {
                'id': existing['id'],
                'type': 'similar_title',
                'existing': existing,
                'similarity': title_similarity
            }
        
        # Check rule overlap
        rule_overlap = calculate_rule_overlap(
            existing.get('rules', []),
            new_policy.get('rules', [])
        )
        
        if rule_overlap > 0.5:
            return {
                'id': existing['id'],
                'type': 'rule_overlap',
                'existing': existing,
                'overlap': rule_overlap
            }
    
    return None

def resolve_conflict(new_policy, conflict):
    """
    Resolve conflict between new and existing policy.
    
    Resolution Strategy:
    1. Compare confidence levels
    2. Higher confidence wins
    3. Merge evidence sources from both
    4. Keep more specific rules
    
    Returns:
    - action: 'merge' | 'skip' | 'replace'
    - merged_policy: (if merge)
    - reason: explanation
    """
    existing = conflict['existing']
    
    # Parse confidence levels
    confidence_order = ['Low', 'Low (bootstrap', 'Medium', 'High']
    new_conf = get_confidence_rank(new_policy.get('confidence', 'Medium'))
    existing_conf = get_confidence_rank(existing.get('confidence', 'Medium'))
    
    if new_conf > existing_conf:
        # New policy is higher confidence - replace
        # But merge evidence sources
        merged_sources = existing.get('sources', []) + new_policy.get('sources', [])
        new_policy['sources'] = deduplicate_sources(merged_sources)
        return {
            'action': 'replace',
            'merged_policy': new_policy,
            'reason': f"New policy has higher confidence ({new_policy['confidence']} > {existing['confidence']})"
        }
    elif new_conf < existing_conf:
        # Existing policy is higher confidence - skip new
        # But add new evidence to existing
        return {
            'action': 'skip',
            'reason': f"Existing policy has higher confidence ({existing['confidence']} > {new_policy['confidence']})"
        }
    else:
        # Same confidence - merge
        merged_policy = merge_policies(existing, new_policy)
        return {
            'action': 'merge',
            'merged_policy': merged_policy,
            'reason': "Same confidence level - merged evidence and rules"
        }

def merge_policies(existing, new_policy):
    """
    Merge two policies with same confidence.
    
    Merge Strategy:
    - Combine evidence sources (deduplicated)
    - Union of rules (deduplicated)
    - Union of anti-patterns
    - Keep more descriptive rationale
    """
    merged = {
        'title': existing['title'],  # Keep existing title
        'category': existing['category'],
        'confidence': existing['confidence'],
        'sources': deduplicate_sources(
            existing.get('sources', []) + new_policy.get('sources', [])
        ),
        'rules': deduplicate_list(
            existing.get('rules', []) + new_policy.get('rules', [])
        ),
        'anti_patterns': deduplicate_list(
            existing.get('anti_patterns', []) + new_policy.get('anti_patterns', [])
        ),
        'rationale': (existing.get('rationale', '') + " " + new_policy.get('rationale', '')).strip()
    }
    return merged
```

**Conflict Resolution Summary:**

| Scenario | Action | Details |
|----------|--------|---------|
| Same category + similar title | Check confidence | Higher wins, merge sources |
| Same category + overlapping rules | Check confidence | Higher wins, merge rules |
| New has higher confidence | Replace | Keep new, merge evidence |
| Existing has higher confidence | Skip | Keep existing, note new evidence |
| Same confidence | Merge | Combine sources, rules, anti-patterns |
| Contradicting rules | Flag for review | Add `status: needs-review` to both |

## Policy Schema

All generated policies follow this schema:

```markdown
---
id: POL-{NNN}
title: "{Policy Title}"
category: "{surgical-execution|redundancy-prevention|fast-problem-solving|agent-coordination}"
created: YYYY-MM-DDTHH:MM:SSZ
last_updated: YYYY-MM-DDTHH:MM:SSZ
version: "{MAJOR.MINOR.PATCH}"
status: "{active|deprecated|experimental|needs-review}"
confidence: "{High|Medium|Low|Low (bootstrap - no execution history)}"
sources:
  - plan: "{plan path}"
    observation: "{what was learned}"
    outcome: "{success|failure|partial}"
  - file: "{agent/command file path}"
    section: "{section name}"
    observation: "{what was extracted}"
hindsight_learnings:
  - original_approach: "{what was tried}"
    failure_reason: "{why it failed}"
    better_approach: "{what should be done instead}"
---

# {Policy Title}

## Summary
{One-paragraph description of the policy}

## Rules
1. **{Rule Name}**: {Description}
   - Evidence: {file:line or plan reference}
   - Rationale: {Why this rule exists}

2. **{Rule Name}**: {Description}
   ...

## Anti-Patterns (What NOT to Do)
- {Anti-pattern description}
  - Why it fails: {explanation}
  - Better approach: {alternative}

## Application Context
- **When to Apply**: {Situations where this policy is relevant}
- **Exceptions**: {When to deviate from this policy}

## Metrics
- **Success Indicators**: {How to know it's working}
- **Warning Signs**: {Indicators of policy violation}
```

## Output Format

The command outputs generation results to the terminal:

```
================================================================================
                         POLICY GENERATION RESULTS
================================================================================

Mode: {FROM_ANALYSIS|INTERACTIVE}
Input Source: {file path or "context"}
Timestamp: {current_timestamp}

--------------------------------------------------------------------------------
                            ARCHIVAL CHECK
--------------------------------------------------------------------------------

Current Policy Count: {count}
Archival Threshold: 15 policies
Archival Required: {YES|NO}
{If YES: Archive Created: llm-learning/policies/archive/policy-{timestamp}.md}

--------------------------------------------------------------------------------
                         POLICIES GENERATED
--------------------------------------------------------------------------------

[POL-001] {Policy Title}
  Category: {category}
  Confidence: {confidence}
  Status: CREATED
  Files Updated:
    - llm-learning/policies/categories/{category}.md
    - llm-learning/policies/current.md

[POL-002] {Policy Title}
  Category: {category}
  Confidence: {confidence}
  Status: CREATED
  ...

--------------------------------------------------------------------------------
                        CONFLICT RESOLUTION
--------------------------------------------------------------------------------

{If conflicts detected:}
Conflict 1:
  New Policy: {title}
  Existing Policy: [{id}] {title}
  Conflict Type: {similar_title|rule_overlap}
  Resolution: {MERGE|SKIP|REPLACE}
  Reason: {explanation}

{If no conflicts:}
No conflicts detected. All policies added successfully.

--------------------------------------------------------------------------------
                         CONSOLIDATION SUMMARY
--------------------------------------------------------------------------------

Files Updated:
  - llm-learning/policies/current.md
    - Added: {count} new policies
    - policy_count: {old} -> {new}
    - last_consolidated: {timestamp}
  
  - llm-learning/policies/categories/surgical-execution.md
    - Added: {count} policies
  
  - llm-learning/policies/categories/redundancy-prevention.md
    - Added: {count} policies
  
  - llm-learning/policies/categories/fast-problem-solving.md
    - Added: {count} policies
  
  - llm-learning/policies/categories/agent-coordination.md
    - Added: {count} policies

--------------------------------------------------------------------------------
                              SUMMARY
--------------------------------------------------------------------------------

Total Policies Generated: {count}
  - surgical-execution: {count}
  - redundancy-prevention: {count}
  - fast-problem-solving: {count}
  - agent-coordination: {count}

Conflicts Resolved: {count}
  - Merged: {count}
  - Skipped: {count}
  - Replaced: {count}

Archives Created: {count}

--------------------------------------------------------------------------------
                            NEXT STEPS
--------------------------------------------------------------------------------

Policies are now available in:
  - llm-learning/policies/current.md (consolidated view)
  - llm-learning/policies/categories/*.md (category-specific)

To use these policies:
  1. Executor agents will read current.md before task execution
  2. Orchestrator distributes relevant policies to executors
  3. Run /learn again after more plan executions to refine policies

================================================================================
```

## Dry Run Mode

When `--dry-run` is specified:

```
================================================================================
                     POLICY GENERATION DRY RUN
================================================================================

This is a DRY RUN. No files will be modified.

Would Generate:
  - POL-001: {title} in {category}
  - POL-002: {title} in {category}
  ...

Would Update Files:
  - llm-learning/policies/current.md
  - llm-learning/policies/categories/{category}.md
  ...

{If archival needed:}
Would Create Archive:
  - llm-learning/policies/archive/policy-{timestamp}.md

{Conflict preview}
Would Resolve Conflicts:
  - {conflict details}

To apply these changes, run without --dry-run flag.
================================================================================
```

## Error Handling

### No Policies in Analysis Output
```
WARNING: No POLICIES section found in analysis output.
Check that the analysis was run successfully.
Expected format:

POLICIES:
- POL-001: [Policy Title]
  category: [category]
  ...

No policies generated.
```

### Invalid Category
```
WARNING: Unknown category "{category}" for policy "{title}".
Valid categories: surgical-execution, redundancy-prevention, fast-problem-solving, agent-coordination
Skipping this policy. Fix the category in the analysis output.
```

### Current.md Not Found
```
WARNING: llm-learning/policies/current.md not found.
Creating initial current.md with template structure...
[Creates template file]
Continuing with policy generation.
```

### ID Counter Corruption
```
ERROR: Could not read next_policy_id from current.md frontmatter.
Scanning existing policies to determine highest ID...
Found highest ID: POL-{NNN}
Setting next_policy_id to {NNN + 1}
Continuing with policy generation.
```

### Write Permission Error
```
ERROR: Cannot write to {file_path}.
Check file permissions and try again.
Policy generation aborted.
```

## Integration with Other Commands

This command is designed to work with:
- `/analyze-plans` - Provides policy recommendations from plan execution analysis
- `/analyze-knowledge` - Provides policy recommendations from llm-docs analysis
- `/learn` - Orchestrates analysis + generation as part of full learning cycle
- `/generate-suggestions` - Companion command for enhancement suggestions

## Implementation Notes

### File Locking
When updating current.md, the command should:
1. Read file content
2. Parse and validate
3. Generate updates
4. Write atomically (no partial writes)

### Idempotency
The command is NOT idempotent. Running twice with same input will:
- Generate new policy IDs (IDs are never reused)
- Potentially create duplicate policies if conflict detection fails
- Create additional archive snapshots if threshold met

To avoid duplicates:
- Use `--dry-run` first to preview changes
- Ensure analysis output is not processed multiple times
- Check for conflicts manually if needed

### Bootstrap Mode Considerations
When processing bootstrap analysis output:
- All policies will have `confidence: "Low (bootstrap - no execution history)"`
- Sources will reference `agent/*.md` and `command/*.md` files
- Policies represent "design intent" not "observed behavior"
- These policies will be refined as more execution data becomes available

### Performance
For large numbers of policies:
- Category file updates are done one at a time
- Consider batching updates in future optimization
- Archive creation is synchronous and may take time for large files

## Examples

### Example 1: Generate from Analysis File

```
/generate-policy --from-analysis /tmp/oracle-analysis-20251228.txt
```

### Example 2: Dry Run Preview

```
/generate-policy --from-analysis analysis.txt --dry-run
```

### Example 3: Interactive Mode (from /learn orchestration)

When invoked from `/learn`, the command receives analysis context directly and processes without file input.

## Verification Checklist

After running the command, verify:

1. [ ] New policies have sequential POL-NNN IDs
2. [ ] Category files are updated with new policies
3. [ ] current.md contains all new policies
4. [ ] current.md policy_count is incremented correctly
5. [ ] current.md next_policy_id is updated for future use
6. [ ] Archive created if threshold was reached
7. [ ] No duplicate policies (conflict resolution worked)
8. [ ] All required schema fields are present
9. [ ] Timestamps are in ISO 8601 format
10. [ ] Confidence levels are preserved from analysis
