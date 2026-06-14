import fs from 'node:fs';
import readline from 'node:readline';

export async function readJsonl<T>(
  filePath: string,
  onRow: (row: T, line: number) => void | boolean | Promise<void | boolean>
) {
  const stream = fs.createReadStream(filePath, {encoding: 'utf8'});
  const rl = readline.createInterface({input: stream, crlfDelay: Infinity});
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    let parsed: T;
    try {
      parsed = JSON.parse(line) as T;
    } catch {
      continue;
    }

    const shouldStop = await onRow(parsed, lineNumber);
    if (shouldStop === false) {
      rl.close();
      stream.destroy();
      break;
    }
  }
}
