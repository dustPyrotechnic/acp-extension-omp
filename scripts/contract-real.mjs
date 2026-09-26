import { access } from "node:fs/promises";
import process from "node:process";

const ompPath = process.env.OMP_PATH;
if (!ompPath) {
  console.error(
    "OMP_PATH is required for the fail-closed real contract probe.",
  );
  process.exitCode = 1;
} else {
  await access(ompPath);
  console.error("Real OMP contract probes are introduced by Task 1R.");
  process.exitCode = 1;
}
