import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "emulator-data/**", "next-env.d.ts", "coverage/**", "playwright-report/**", ".claude/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", { paths: [{ name: "firebase-admin", message: "Import Admin SDK only from src/server/firebase/admin.ts" }] }],
    },
  },
  {
    files: ["src/server/firebase/**", "scripts/**", "tests/**"],
    rules: { "no-restricted-imports": "off" },
  },
];
