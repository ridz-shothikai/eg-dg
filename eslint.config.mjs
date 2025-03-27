import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Base config from Next.js
const baseConfig = compat.extends("next/core-web-vitals");

// Custom rules configuration
const customConfig = {
  rules: {
    "react/no-unescaped-entities": "off", // Disable the rule causing build errors
  },
  // Apply this rule override globally or specify files/ignores if needed
  // files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"], // Example: Apply to JS/TS/JSX/TSX
};

const eslintConfig = [
  ...baseConfig, // Spread the base config array
  customConfig,  // Add the custom rules object
];

export default eslintConfig;
