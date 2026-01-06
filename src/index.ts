import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

import manifest from "./gyoshu-manifest.json";
import { GyoshuPlugin as GyoshuHooks } from "./plugin/gyoshu-hooks";

const OPENCODE_CONFIG = path.join(homedir(), ".config", "opencode");

function getPackageRoot(): string {
  const currentFile = new URL(import.meta.url).pathname;
  return path.dirname(path.dirname(currentFile));
}

function installFile(
  packageRoot: string,
  category: string,
  file: string
): { installed: boolean; skipped: boolean; error?: string } {
  const srcPath = path.join(packageRoot, "src", category, file);
  const destPath = path.join(OPENCODE_CONFIG, category, file);

  if (fs.existsSync(destPath)) {
    return { installed: false, skipped: true };
  }

  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    return { installed: true, skipped: false };
  } catch (err) {
    return {
      installed: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function installSkill(
  packageRoot: string,
  skillName: string
): { installed: boolean; skipped: boolean; error?: string } {
  const srcDir = path.join(packageRoot, "src", "skill", skillName);
  const destDir = path.join(OPENCODE_CONFIG, "skill", skillName);

  if (fs.existsSync(destDir)) {
    return { installed: false, skipped: true };
  }

  try {
    fs.cpSync(srcDir, destDir, { recursive: true });
    return { installed: true, skipped: false };
  } catch (err) {
    return {
      installed: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function autoInstall(): {
  installed: number;
  skipped: number;
  errors: string[];
} {
  const packageRoot = getPackageRoot();
  const result = { installed: 0, skipped: 0, errors: [] as string[] };

  fs.mkdirSync(OPENCODE_CONFIG, { recursive: true });

  for (const [category, files] of Object.entries(manifest.files)) {
    if (category === "skill") {
      for (const skillName of files as string[]) {
        const { installed, skipped, error } = installSkill(
          packageRoot,
          skillName
        );
        if (installed) result.installed++;
        if (skipped) result.skipped++;
        if (error) result.errors.push(`skill/${skillName}: ${error}`);
      }
    } else {
      for (const file of files as string[]) {
        const { installed, skipped, error } = installFile(
          packageRoot,
          category,
          file
        );
        if (installed) result.installed++;
        if (skipped) result.skipped++;
        if (error) result.errors.push(`${category}/${file}: ${error}`);
      }
    }
  }

  return result;
}

export const GyoshuPlugin: Plugin = async (ctx) => {
  const installResult = autoInstall();

  if (installResult.installed > 0) {
    console.log(
      `🎓 Gyoshu: Installed ${installResult.installed} files to ~/.config/opencode/`
    );
  }

  if (installResult.errors.length > 0) {
    console.warn(`⚠️  Gyoshu: Some files failed to install:`);
    for (const error of installResult.errors) {
      console.warn(`   - ${error}`);
    }
  }

  return GyoshuHooks(ctx);
};

export default GyoshuPlugin;
