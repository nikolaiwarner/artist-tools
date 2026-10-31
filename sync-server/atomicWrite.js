import fs from 'fs';

/** Writes via a temp file and rename, so a power cut can't leave a half-written file. */
export function writeFileAtomic(filePath, contents) {
  const tempPath = `${filePath}.tmp`;
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}
