import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findBundledClaudeExecutable } from "../src/entrypoints/run";

describe("findBundledClaudeExecutable", () => {
  let root: string;

  // Resolves `<pkg>/<file>` against a fake node_modules and throws like
  // require.resolve when the package is not installed.
  const resolver =
    (installed: string[]) =>
    (specifier: string): string => {
      const pkg = specifier.slice(0, specifier.lastIndexOf("/"));
      if (!installed.includes(pkg)) throw new Error(`Cannot find ${pkg}`);
      return join(root, "node_modules", specifier);
    };

  const install = (pkg: string, binary = "claude") => {
    const dir = join(root, "node_modules", pkg);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, binary), "");
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "bundled-claude-"));
    install("@anthropic-ai/claude-agent-sdk-linux-x64");
    install("@anthropic-ai/claude-agent-sdk-linux-arm64-musl");
    install("@anthropic-ai/claude-agent-sdk-win32-x64", "claude.exe");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the glibc binary on linux", () => {
    const resolve = resolver([
      "@anthropic-ai/claude-agent-sdk-linux-x64",
      "@anthropic-ai/claude-agent-sdk-linux-x64-musl",
    ]);
    expect(findBundledClaudeExecutable(resolve, "linux", "x64")).toBe(
      join(
        root,
        "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
      ),
    );
  });

  it("falls back to the musl binary when glibc is not installed", () => {
    const resolve = resolver([
      "@anthropic-ai/claude-agent-sdk-linux-arm64-musl",
    ]);
    expect(findBundledClaudeExecutable(resolve, "linux", "arm64")).toBe(
      join(
        root,
        "node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64-musl/claude",
      ),
    );
  });

  it("uses claude.exe on windows", () => {
    const resolve = resolver(["@anthropic-ai/claude-agent-sdk-win32-x64"]);
    expect(findBundledClaudeExecutable(resolve, "win32", "x64")).toBe(
      join(
        root,
        "node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe",
      ),
    );
  });

  it("skips a resolved path whose binary is missing", () => {
    const resolve = resolver(["@anthropic-ai/claude-agent-sdk-darwin-arm64"]);
    expect(
      findBundledClaudeExecutable(resolve, "darwin", "arm64"),
    ).toBeUndefined();
  });

  it("returns undefined when no platform package is installed", () => {
    expect(
      findBundledClaudeExecutable(resolver([]), "linux", "x64"),
    ).toBeUndefined();
  });

  it("finds the binary installed for the host platform", () => {
    // bun install fetches the host's optional SDK platform package.
    expect(findBundledClaudeExecutable()).toContain(
      `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`,
    );
  });
});
