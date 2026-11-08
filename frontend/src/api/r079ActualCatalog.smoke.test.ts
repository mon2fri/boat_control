import { describe, expect, it } from "vitest";
import { getRuleLogicGrouping } from "../features/rules/logicOutcomes";
import { mapRuleToWireDraft, mapWireRule } from "./mapping";
import { wireRuleSchema } from "./wire";

const runtimeEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const actualRuleJson = runtimeEnvironment?.R079_CATALOG_RULE_JSON;

describe("isolated R079 catalog response", () => {
  it.skipIf(!actualRuleJson)(
    "hydrates the canonical custom tree and serializes the same API expression",
    () => {
      const wire = wireRuleSchema.parse(JSON.parse(actualRuleJson!));
      const rule = mapWireRule(wire);
      const grouping = getRuleLogicGrouping(rule);

      expect(rule.index).toBe("R079");
      expect(rule.logicClauses).toHaveLength(4);
      expect(rule.logicRelation).toBe("or");
      expect(grouping).toMatchObject({ mode: "custom" });
      expect(grouping.tree).toEqual({
        kind: "or",
        children: [
          { kind: "and", children: [
            { kind: "leaf", conditionId: "l0" },
            { kind: "leaf", conditionId: "l1" },
          ] },
          { kind: "and", children: [
            { kind: "leaf", conditionId: "l2" },
            { kind: "leaf", conditionId: "l3" },
          ] },
        ],
      });

      const payload = mapRuleToWireDraft(rule);
      expect(payload.logic_relation).toBe("or");
      expect(payload.logic_clauses).toHaveLength(4);
      expect(payload.logic_grouping_tree).toEqual(wire.logic_grouping_tree);
    },
  );
});
