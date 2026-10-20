import esbuild from "esbuild";

const mode = process.argv[2] ?? "dev";

if (mode === "test") {
  await esbuild.build({
    entryPoints: ["src/ids.ts", "src/status.ts", "src/encoding.ts", "src/hidden-id.ts", "src/verify.ts"],
    outdir: "test-build",
    bundle: false,
    format: "esm",
    outExtension: { ".js": ".mjs" },
    target: "es2020",
    logLevel: "info",
  });
} else {
  const production = mode === "production";
  const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
  });
  if (production) {
    await context.rebuild();
    await context.dispose();
  } else {
    await context.watch();
  }
}
