import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// The security-oriented rules below enforce the project constraints:
// no native DOM manipulation, no raw HTML injection sinks, no eval.
export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // --- Offline / anti-XSS hardening ---------------------------------
      "no-restricted-properties": [
        "error",
        { object: "document", property: "write", message: "Raw DOM writes are prohibited; render through React." },
        { property: "innerHTML", message: "innerHTML is an XSS sink; use React text bindings." },
        { property: "outerHTML", message: "outerHTML is an XSS sink; use React text bindings." },
        { property: "insertAdjacentHTML", message: "Raw HTML insertion is prohibited." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is prohibited; render user content as text.",
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: "eval is prohibited.",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "Dynamic Function construction is prohibited.",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Import the api client instead of calling fetch directly." },
      ],
    },
  },
  // Tests and the api client may use platform globals directly.
  {
    files: ["src/api/client.ts", "src/**/*.{test,spec}.{ts,tsx}", "src/test/**"],
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
