import {spawn} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);

export function electronAppCommand(options: {foreground?: boolean}) {
  const electronPath = require('electron') as string;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const mainPath = path.resolve(currentDir, '../electron/main.js');

  const child = spawn(electronPath, [mainPath], {
    detached: !options.foreground,
    stdio: options.foreground ? 'inherit' : 'ignore',
    windowsHide: false
  });

  if (options.foreground) {
    child.on('exit', code => process.exit(code ?? 0));
  } else {
    child.unref();
    console.log('会话管家桌面应用正在启动。');
    process.exit(0);
  }
}
