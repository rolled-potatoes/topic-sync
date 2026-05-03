/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed types must align with semantic-release releaseRules in package.json.
    // feat  → minor release
    // fix   → patch release
    // BREAKING CHANGE footer → major release
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "test", "chore", "ci", "perf", "revert"]
    ]
  }
};
