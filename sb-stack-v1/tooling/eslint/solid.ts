import solidV2 from "eslint-plugin-solid/configs/v2";
import { defineConfig } from "eslint/config";

export const solidConfig = defineConfig({
  files: ["**/*.ts", "**/*.tsx"],
  ...solidV2,
});
