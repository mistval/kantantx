import fs from 'fs';

const KEY_PREFIX = 'KANTANTX';

export function writeToDotEnv(key: string, value: string) {
  const prefixedKey = `${KEY_PREFIX}_${key}`;
  const lineToWrite = `${prefixedKey}=${value}`;

  let existingFileContents = '';
  try {
    existingFileContents = fs.readFileSync('.env', 'utf8');
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const existingLines = existingFileContents.split('\n');
  const matchingLineIndex = existingLines.findIndex((line) => line.startsWith(`${prefixedKey}=`));

  if (matchingLineIndex === -1) {
    existingLines.push(lineToWrite);
  } else {
    existingLines[matchingLineIndex] = lineToWrite;
  }

  const newFileContents = existingLines.join('\n');
  fs.writeFileSync('.env', newFileContents.trim() + '\n');
}
