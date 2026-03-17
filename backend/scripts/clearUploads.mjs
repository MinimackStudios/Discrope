import fs from "node:fs";
import path from "node:path";

const uploadsDir = path.resolve(process.cwd(), "uploads");
const subdirs = ["avatars", "attachments", "server-icons"];

try {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  for (const subdir of subdirs) {
    fs.mkdirSync(path.join(uploadsDir, subdir), { recursive: true });
  }

  console.log("Uploads cleared.");
} catch (error) {
  console.error("Failed to clear uploads:", error);
  process.exit(1);
}
