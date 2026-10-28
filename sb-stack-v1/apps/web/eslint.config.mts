import { defineConfig } from "eslint/config";

import { baseConfig } from "@acme/eslint-config/base";
import { solidConfig } from "@acme/eslint-config/solid";

export default defineConfig(
  {
    ignores: ["env.d.ts", "file-routes.d.ts"],
  },
  baseConfig,
  solidConfig,
);
