# Rule Lifecycle

## Storage

Every rule is stored in the SQLite catalog with its complete authored payload,
canonical rule identifier, enablement state, and catalog position. Named rule
configurations under `config/rules/` store the complete rule details needed to
recreate a configuration, including conditions, filters, grouping, logic,
identifier, name, description, and display options.

The same canonical rule may appear in any number of named configurations. It
is reused in the catalog rather than inserted again. A duplicate is rejected
only when the same canonical rule occurs more than once in one configuration.

## Configuration Loading

The rules panel lists all non-deleted catalog rules. Loading a named
configuration changes enablement and selection to match that configuration;
rules not in the configuration are deselected.

When a configuration is saved, the current complete rule payload is persisted
to the named YAML file and its canonical identifier is retained.

## Deletion

Deleting a rule requires two confirmations:

1. `Delete Rule` confirms the rule selected for deletion.
2. `Delete for ALL Configs` archives the rule globally.

Archived rules are not shown in the normal catalog list. If a named
configuration still refers to an archived rule, loading it presents the rule's
name and description with two choices:

- `Remove from Config` removes the rule from the loaded configuration.
- `Reinstate Rule` restores it from the catalog and enables it for the config.

## Modification

If editing changes the canonical rule identity, the original catalog row is
marked superseded and points to the new rule row. The new rule receives its
own catalog identity. Loading a configuration that refers to the original
rule presents:

- `Maintain Original Rule` keeps the original configuration entry.
- `Accept Updated Rule` replaces it with the superseding rule.

The selected decision is written back to the named configuration.
