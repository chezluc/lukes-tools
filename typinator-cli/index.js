#!/usr/bin/env node

const { execSync } = require('child_process');

function osascript(script) {
  try {
    return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout: 10000
    }).trim();
  } catch (e) {
    if (e.stderr) {
      const msg = e.stderr.replace(/^\d+:\d+: execution error: /, '').trim();
      console.error(`Error: ${msg}`);
    } else {
      console.error(`Error: ${e.message}`);
    }
    process.exit(1);
  }
}

function listSets() {
  const result = osascript('tell application "Typinator" to name of every rule set');
  const sets = result.split(', ').map(s => s.trim());
  console.log(JSON.stringify(sets, null, 2));
}

function listRules(setName) {
  const result = osascript(`
    tell application "Typinator"
      set ruleList to {}
      repeat with r in (every rule of rule set "${setName}")
        set end of ruleList to (abbreviation of r) & "\\t" & (plain expansion of r)
      end repeat
      set AppleScript's text item delimiters to "\\n"
      return ruleList as text
    end tell
  `);
  if (!result) {
    console.log('No rules found.');
    return;
  }
  const lines = result.split('\n');
  const rules = lines.map(l => {
    const [abbr, ...rest] = l.split('\t');
    return { abbreviation: abbr, expansion: rest.join('\t') };
  });
  console.log(JSON.stringify(rules, null, 2));
}

function addRule(setName, abbreviation, expansion) {
  osascript(`
    tell application "Typinator"
      make new rule at end of rule set "${setName}" with properties {abbreviation:"${abbreviation}", plain expansion:"${expansion}"}
    end tell
  `);
  console.log(JSON.stringify({ status: 'created', set: setName, abbreviation, expansion }));
}

function searchRules(query, setName) {
  const script = setName
    ? `tell application "Typinator"
        set ruleList to {}
        repeat with r in (every rule of rule set "${setName}")
          set a to abbreviation of r
          set e to plain expansion of r
          if a contains "${query}" or e contains "${query}" then
            set end of ruleList to a & "\\t" & e & "\\t" & "${setName}"
          end if
        end repeat
        set AppleScript's text item delimiters to "\\n"
        return ruleList as text
      end tell`
    : `tell application "Typinator"
        set ruleList to {}
        repeat with s in (every rule set)
          set sName to name of s
          repeat with r in (every rule of s)
            set a to abbreviation of r
            set e to plain expansion of r
            if a contains "${query}" or e contains "${query}" then
              set end of ruleList to a & "\\t" & e & "\\t" & sName
            end if
          end repeat
        end repeat
        set AppleScript's text item delimiters to "\\n"
        return ruleList as text
      end tell`;
  const result = osascript(script);
  if (!result) {
    console.log('[]');
    return;
  }
  const rules = result.split('\n').map(l => {
    const [abbr, expansion, set] = l.split('\t');
    return { abbreviation: abbr, expansion, set };
  });
  console.log(JSON.stringify(rules, null, 2));
}

function deleteRule(setName, abbreviation) {
  osascript(`
    tell application "Typinator"
      delete (first rule of rule set "${setName}" whose abbreviation is "${abbreviation}")
    end tell
  `);
  console.log(JSON.stringify({ status: 'deleted', set: setName, abbreviation }));
}

function findDuplicates(setName) {
  const script = setName
    ? `tell application "Typinator"
        set ruleList to {}
        repeat with r in (every rule of rule set "${setName}")
          set end of ruleList to (abbreviation of r) & "\\t" & (plain expansion of r) & "\\t" & "${setName}"
        end repeat
        set AppleScript's text item delimiters to "\\n"
        return ruleList as text
      end tell`
    : `tell application "Typinator"
        set ruleList to {}
        repeat with s in (every rule set)
          set sName to name of s
          repeat with r in (every rule of s)
            set end of ruleList to (abbreviation of r) & "\\t" & (plain expansion of r) & "\\t" & sName
          end repeat
        end repeat
        set AppleScript's text item delimiters to "\\n"
        return ruleList as text
      end tell`;
  const result = osascript(script);
  if (!result) {
    console.log('No rules found.');
    return;
  }
  const lines = result.split('\n');
  const seen = {};
  const duplicates = [];

  for (const line of lines) {
    const [abbr, expansion, set] = line.split('\t');
    const key = abbr;
    if (!seen[key]) {
      seen[key] = [];
    }
    seen[key].push({ abbreviation: abbr, expansion, set });
  }

  for (const [abbr, entries] of Object.entries(seen)) {
    if (entries.length > 1) {
      duplicates.push({ abbreviation: abbr, count: entries.length, entries });
    }
  }

  console.log(JSON.stringify(duplicates, null, 2));
  if (duplicates.length === 0) {
    console.log('No duplicates found.');
  } else {
    console.log(`\nFound ${duplicates.length} duplicated abbreviation(s).`);
  }
}

function removeDuplicates(setName, keepFirst) {
  const script = setName
    ? `tell application "Typinator"
        set ruleList to {}
        repeat with r in (every rule of rule set "${setName}")
          set end of ruleList to (abbreviation of r) & "\\t" & (plain expansion of r)
        end repeat
        set AppleScript's text item delimiters to "\\n"
        return ruleList as text
      end tell`
    : null;

  if (!script) {
    console.error('Error: --set is required for remove-duplicates');
    process.exit(1);
  }

  const result = osascript(script);
  if (!result) {
    console.log('No rules found.');
    return;
  }

  const lines = result.split('\n');
  const seen = {};
  const toDelete = [];

  for (let i = 0; i < lines.length; i++) {
    const [abbr] = lines[i].split('\t');
    if (!seen[abbr]) {
      seen[abbr] = true;
    } else {
      toDelete.push({ index: i + 1, abbreviation: abbr });
    }
  }

  if (toDelete.length === 0) {
    console.log(JSON.stringify({ status: 'clean', message: 'No duplicates found' }));
    return;
  }

  // Delete in reverse order so indices stay valid
  for (let i = toDelete.length - 1; i >= 0; i--) {
    const { index, abbreviation } = toDelete[i];
    osascript(`
      tell application "Typinator"
        delete rule ${index} of rule set "${setName}"
      end tell
    `);
  }

  console.log(JSON.stringify({
    status: 'cleaned',
    set: setName,
    removed: toDelete.length,
    details: toDelete
  }, null, 2));
}

// --- CLI parsing ---
const args = process.argv.slice(2);
const command = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function hasFlag(name) {
  return args.includes(name);
}

const HELP = `typinator-cli — Manage Typinator snippets from the command line

Usage:
  typinator-cli sets                          List all rule sets
  typinator-cli list --set <name>             List rules in a set
  typinator-cli add --set <name> <abbr> <exp> Add a snippet
  typinator-cli search <query> [--set <name>] Search across sets
  typinator-cli delete --set <name> <abbr>    Delete a snippet
  typinator-cli duplicates [--set <name>]     Find duplicate abbreviations
  typinator-cli remove-duplicates --set <name> Remove duplicates (keeps first)

Options:
  --set <name>   Target rule set (or set TYPINATOR_SET env var)
  --help         Show this help

Examples:
  typinator-cli add --set "My Set" btw "by the way"
  typinator-cli search btw
  typinator-cli duplicates --set "My Set"
  typinator-cli remove-duplicates --set "My Set"
  TYPINATOR_SET="My Set" typinator-cli add btw "by the way"
`;

if (!command || command === '--help' || command === 'help') {
  console.log(HELP);
  process.exit(0);
}

const defaultSet = process.env.TYPINATOR_SET || null;
const setName = getFlag('--set') || defaultSet;

// Strip --set and its value from positional args
const positional = args.slice(1).filter((a, i, arr) => {
  if (a === '--set') return false;
  if (i > 0 && arr[i - 1] === '--set') return false;
  return true;
});

switch (command) {
  case 'sets':
    listSets();
    break;
  case 'list':
    if (!setName) { console.error('Error: --set is required (or set TYPINATOR_SET env var)'); process.exit(1); }
    listRules(setName);
    break;
  case 'add':
    if (!setName) { console.error('Error: --set is required (or set TYPINATOR_SET env var)'); process.exit(1); }
    if (positional.length < 2) {
      console.error('Usage: typinator-cli add --set <name> <abbreviation> <expansion>');
      process.exit(1);
    }
    addRule(setName, positional[0], positional.slice(1).join(' '));
    break;
  case 'search':
    if (positional.length < 1) {
      console.error('Usage: typinator-cli search <query> [--set <name>]');
      process.exit(1);
    }
    searchRules(positional[0], getFlag('--set'));
    break;
  case 'delete':
    if (!setName) { console.error('Error: --set is required (or set TYPINATOR_SET env var)'); process.exit(1); }
    if (positional.length < 1) {
      console.error('Usage: typinator-cli delete --set <name> <abbreviation>');
      process.exit(1);
    }
    deleteRule(setName, positional[0]);
    break;
  case 'duplicates':
    findDuplicates(getFlag('--set'));
    break;
  case 'remove-duplicates':
    removeDuplicates(setName);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log(HELP);
    process.exit(1);
}
