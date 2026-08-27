#!/usr/bin/env py
# Bulk fix loading skeletons: replace structural Spinner usages with skeleton divs
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORG = ROOT / "src/features/org"
TABS = ROOT / "src/features/project/tabs"

# Generic skeletons (raw div, no extra imports, uses animate-pulse bg-elevated)
SKELETON_DATATABLE = '''<div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>'''

SKELETON_FULL = '''<div role="status" aria-label="Loading" aria-busy="true" className="space-y-4 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-4 space-y-2">
            <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
            <div className="h-4 bg-elevated rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-40 bg-elevated rounded-2xl animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-elevated rounded-xl animate-pulse" />
        ))}
      </div>
    </div>'''

SKELETON_LIST = '''<div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-lg bg-elevated px-3 py-2 flex items-center gap-2">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-bg-secondary rounded animate-pulse w-2/3" />
            <div className="h-3 bg-bg-secondary rounded animate-pulse w-1/3" />
          </div>
          <div className="h-5 bg-bg-secondary rounded animate-pulse w-24" />
        </div>
      ))}
    </div>'''

SKELETON_SMALL = '''<div role="status" aria-label="Loading" aria-busy="true" className="space-y-2 py-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-10 bg-elevated rounded-xl animate-pulse" />
      ))}
    </div>'''

def patch_file(path: Path):
    text = path.read_text(encoding="utf-8")
    orig = text
    # Track if we change anything
    changed = False

    # Patterns to replace:

    # 1. Early return full-page: if (loading) return <div className="grid place-items-center ..."><Spinner ... /></div>;
    # Also covers: if (loadState === "loading"), if (planLoading), if (!session), if (dataLoading)
    # Use regex for if (...) return <div...><Spinner.../></div>;  with optional extra span
    # We need to handle multiline and variations including <Spinner size={24} /><span>Loading project data...</span>
    # We'll replace the whole return expression with skeleton full.

    # Helper to decide skeleton for early returns: use full skeleton
    # Pattern: if (<cond>) return <div className="grid place-items-center[^"]*">...Spinner...</div>;
    # Also pattern without wrapper div: if (loading) return <Spinner ... />;
    # Let's do two passes.

    # Pass A: if (...) return <div ...><Spinner .../>...</div>;  (with wrapper)
    # Matches: if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
    # and dataLoading variant with extra span: if (dataLoading) return <div className="grid place-items-center p-12"><Spinner size={24} /><span className="mt-3 text-sm text-fg-secondary">Loading project data...</span></div>;
    pattern_early_wrap = re.compile(
        r'if\s*\((?:loading|dataLoading|loadState\s*===\s*\"loading\"|planLoading|!session)\)\s*return\s*<div[^>]*className="[^"]*grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*(?:<span[^>]*>[^<]*<\/span>\s*)?<\/div>\s*;',
        re.DOTALL
    )
    def repl_early_wrap(m):
        return f'if ({m.group(0).split("if (")[1].split(")")[0]}) return (\n    {SKELETON_FULL}\n  );'
        # But we lost condition; better to reconstruct condition
    # Actually we need to preserve condition exactly
    def repl_early_wrap2(m):
        full = m.group(0)
        # extract condition between if ( and ) return
        cond_match = re.search(r'if\s*\((.*?)\)\s*return', full, re.DOTALL)
        cond = cond_match.group(1) if cond_match else "loading"
        # Need to handle !session etc which may contain spaces
        return f'if ({cond}) return (\n    {SKELETON_FULL}\n  );'

    new_text, n = pattern_early_wrap.subn(repl_early_wrap2, text)
    if n:
        text = new_text
        changed = True

    # Pass B: if (loading) return <Spinner ... />;
    pattern_bare = re.compile(r'if\s*\(loading\)\s*return\s*<Spinner[^>]*\/>\s*;')
    def repl_bare(m):
        return f'if (loading) return (\n    {SKELETON_SMALL}\n  );'
    new_text, n = pattern_bare.subn(repl_bare, text)
    if n:
        text = new_text
        changed = True

    # Pass C: if (!session) return <div...><Spinner/></div>;
    pattern_session = re.compile(r'if\s*\(!session\)\s*return\s*<div[^>]*className="grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>\s*;')
    def repl_session(m):
        return f'if (!session) return (\n    {SKELETON_FULL}\n  );'
    new_text, n = pattern_session.subn(repl_session, text)
    if n:
        text = new_text
        changed = True

    # Pass D: if (planLoading) return <div...><Spinner/></div>;
    pattern_plan = re.compile(r'if\s*\(planLoading\)\s*return\s*<div[^>]*className="grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>\s*;')
    def repl_plan(m):
        return f'if (planLoading) return (\n    {SKELETON_FULL}\n  );'
    new_text, n = pattern_plan.subn(repl_plan, text)
    if n:
        text = new_text
        changed = True

    # Pass E: ternary loading ? <div className="grid place-items-center ..."><Spinner .../></div>
    # This is the most common: {loading ? <div className="grid place-items-center ..."><Spinner size={22} /></div>
    # We want to replace just the div block with skeleton, keeping the ternary ?: and following colon
    # Use regex to find the div with Spinner inside a ternary
    # We need to handle variations: {loading ? <div...><Spinner/></div> : or  : loading ? <div...><Spinner/></div> etc also with newline
    # We'll search for pattern: (\{?\s*loading\s*\?\s*)<div[^>]*className="[^"]*grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>
    # But there are also: {loading ? <div className="grid place-items-center ..."><Spinner /></div> : rows.length===0...
    # And: {loading ? <div className="grid place-items-center py-16"><Spinner size={22} /></div> : (
    # Replace with the condition part kept + skeleton
    pattern_ternary = re.compile(
        r'(\{\s*loading\s*\?\s*)<div[^>]*className="[^"]*grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>',
        re.DOTALL
    )
    # This captures the prefix "{loading ? " and replaces div with skeleton
    # We need to ensure we don't consume the following " :"
    # Replacement: keep prefix + skeleton
    new_text, n = pattern_ternary.subn(lambda m: m.group(1) + SKELETON_DATATABLE, text)
    if n:
        text = new_text
        changed = True

    # Pass F: loading ternary with : loading ? <div...Spinner> : loading ? ... but also bare  <div className="grid place-items-center py-16"><Spinner size={22} /></div> inside next JSX without explicit loading ? but inside {loading ? ( <div...Spinner></div> ) : ... } with parentheses
    # Already handled.

    # Pass G: Cases where the spinner div is not preceded by loading ? but is inside a larger ternary like:
    # {loading ? (
    #         <div className="grid place-items-center py-16"><Spinner size={22} /></div>
    #       ) : (
    # We already handled? The pattern above requires "{loading ?" directly before div, but there may be newline and "(" between.
    # Let's handle: \{\s*loading\s*\?\s*\(\s*<div[^>]*>...Spinner...</div>
    pattern_ternary_paren = re.compile(
        r'(\{\s*loading\s*\?\s*\(\s*)<div[^>]*className="[^"]*grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>',
        re.DOTALL
    )
    new_text, n = pattern_ternary_paren.subn(lambda m: m.group(1) + SKELETON_DATATABLE, text)
    if n:
        text = new_text
        changed = True

    # Pass H: Bare spinner div not in ternary but as standalone inside render: <div className="grid place-items-center py-16"><Spinner size={22} /></div>
    # These appear inside: {loading ? ( <div...Spinner>) : rows.length...} but if we missed them, catch any remaining such divs that are structural (py-10, py-16, py-12, py-8, p-12, py-20 etc) and replace with skeleton datatable
    # But be careful not to replace button spinners (they are not inside such divs). So we can safely replace any remaining <div ...grid place-items-center...><Spinner.../></div> that remains (should be all structural)
    # However we should not replace those that are inside a button (not this pattern)
    # So find all remaining such divs
    pattern_remaining_wrap = re.compile(
        r'<div[^>]*className="[^"]*grid place-items-center[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*(?:<span[^>]*>[^<]*<\/span>\s*)?<\/div>',
        re.DOTALL
    )
    # Replace with skeleton datatable (for remaining, use datatable skeleton)
    new_text, n = pattern_remaining_wrap.subn(SKELETON_DATATABLE, text)
    if n:
        text = new_text
        changed = True

    # Pass I: Remaining bare <Spinner size={22} /> not in wrapper but inside something like <div className="grid place-items-center py-10"><Spinner size={22} /></div> already handled.
    # But also bare <Spinner size={18} /> after if (loading) return ... already handled.
    # Also cases like <Spinner size={22} /> inside a bare div without grid? Example InvoicesTab: <Spinner size={22} /> inside a wrapper? Let's check
    # For remaining bare spinners that are structural (size 22,24,18 etc) not inside button context, we could replace with small skeleton.
    # Heuristic: if file still has Spinner size 22/24 and previous patterns didn't catch because wrapper different (e.g., <div className="grid place-items-center py-10"><Spinner size={22} /></div> already handled, but <Spinner size={22} /> alone at top level like "if (loading) return <Spinner ...>" already handled)
    # Let's also handle:  <div className="flex justify-center py-10"><Spinner /></div> (PartnersTab) and <div className="grid place-items-center py-3"><Spinner size={18} /></div> (OverviewTab)
    pattern_flex = re.compile(r'<div[^>]*className="[^"]*(?:flex justify-center|grid place-items-center)[^"]*"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>')
    new_text, n = pattern_flex.subn(SKELETON_DATATABLE, text)
    if n:
        text = new_text
        changed = True

    # Pass J: Special case AuditTab has two early returns: if (loading) return <Spinner size={18} />; and if (loading) return <Spinner size={22} />; already handled via bare pattern for loading, but the file has two identical conditions; both will be replaced with small skeleton
    # For AuditTab's second occurrence inside function, pattern bare will handle one, but we need both. Our pattern bare handles any if (loading) return <Spinner ... />; already.

    # Pass K: ReceiptsPanel has <div className="grid place-items-center py-4"><Spinner size={16} /></div> – this is small inline loading inside panel, not full page; replace with skeleton list
    pattern_receipt = re.compile(r'<div[^>]*className="grid place-items-center py-4"[^>]*>\s*<Spinner[^>]*\/>\s*<\/div>')
    new_text, n = pattern_receipt.subn(SKELETON_LIST, text)
    if n:
        text = new_text
        changed = True

    # After all replacements, handle Spinner import cleanup
    # If file still contains <Spinner (meaning button spinners remain), keep import; otherwise remove Spinner from import
    if changed:
        # Check if still has Spinner usage
        has_spinner = "<Spinner" in text
        if not has_spinner:
            # Remove Spinner from import lines
            # Pattern: import { ..., Spinner, ... } from "@/components/ui/atoms";
            # Remove Spinner, and maybe comma handling
            # Also pattern: import { Card, Spinner, Alert } from...
            text = re.sub(r',\s*Spinner\s*,', ',', text)
            text = re.sub(r'\bSpinner\s*,\s*', '', text)
            text = re.sub(r',\s*Spinner\b', '', text)
            text = re.sub(r'\bSpinner\b', '', text)
            # Clean up double commas or empty braces: import { , } -> import { }
            text = re.sub(r'import\s*\{\s*,', 'import { ', text)
            text = re.sub(r',\s*,', ',', text)
            text = re.sub(r'\{\s*\}', '{}', text)
            # Remove empty import? If import becomes "import {  } from" we should clean
            # But easier: if line becomes import { Card,  , Alert } -> fix via above
            # Also handle "import { Card, Spinner, Alert, Badge, DataTable } from "@/components/ui";" where Spinner removal leaves double comma?
            # Already handled.
            # Also handle case where import line had only Spinner: "import { Spinner } from" -> remove whole line? But none should.
            # Ensure we don't leave "import { , Alert" -> fix
            text = re.sub(r'\{\s*,\s*', '{ ', text)
            text = re.sub(r',\s*\}', ' }', text)
        # If we introduced skeleton that uses map with [0,1,2,3] we need to ensure no missing key issues; fine.
        # Also need to ensure we didn't leave unused import for Skeleton? But we use raw divs, no Skeleton import needed. So no import addition needed for now.
        # However some files we already patched manually to use Skeleton component; those will keep Skeleton import.
        # For bulk patched files using raw divs, no new import needed.
        path.write_text(text, encoding="utf-8")
        print(f"PATCHED {path.name}")
    else:
        # No change, but still report if file had structural spinner but not patched (for debugging)
        pass

for folder in [ORG, TABS]:
    for p in folder.glob("*.tsx"):
        text = p.read_text(encoding="utf-8")
        if "Spinner" in text:
            # Check if structural pattern exists
            if 'place-items-center' in text and 'Spinner' in text:
                # Will be handled by script, but also check naive
                pass
            patch_file(p)

print("DONE")
