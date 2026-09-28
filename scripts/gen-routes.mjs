import { Generator, getConfig } from "@tanstack/router-generator";

async function main() {
  try {
    const config = await getConfig({}, process.cwd());
    const generator = new Generator({ config, root: process.cwd() });
    await generator.run();
    console.log("Successfully generated routeTree.gen.ts!");
  } catch (err) {
    console.error("Failed to generate route tree:", err);
    process.exit(1);
  }
}

main();
