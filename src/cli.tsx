#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {Command} from 'commander';
import {bindCommand, doctorCommand, listCommand, noteCommand, openCommand, projectsCommand, scanCommand} from './commands/basic.js';
import {electronAppCommand} from './commands/electronApp.js';
import {webCommand} from './commands/web.js';
import {App} from './ui/App.js';

const program = new Command();

program
  .name('cxm')
  .description('Modern CLI and web UI for Codex CLI sessions')
  .version('0.1.1');

program
  .command('scan')
  .description('Scan Codex sessions and refresh the local index')
  .action(run(scanCommand));

program
  .command('list')
  .description('List indexed sessions')
  .option('--all', 'include archived sessions')
  .option('-n, --limit <number>', 'limit rows', '30')
  .option('-q, --query <text>', 'search sessions')
  .option('-p, --project <name>', 'filter by project name')
  .action(run(listCommand));

program
  .command('open')
  .description('Open a Codex session in PowerShell')
  .argument('<sessionId>', 'session id or unique prefix')
  .option('--dry-run', 'print the PowerShell command')
  .option('--inline', 'run in the current terminal')
  .option('-p, --profile <name>', 'Codex profile')
  .option('--yolo', 'pass Codex dangerous bypass flag')
  .action(run(openCommand));

program
  .command('note')
  .description('Set a note for a session')
  .argument('<sessionId>', 'session id or unique prefix')
  .argument('<note>', 'note text')
  .action(run(noteCommand));

program
  .command('bind')
  .description('Bind a session to a new project path')
  .argument('<sessionId>', 'session id or unique prefix')
  .argument('<path>', 'new project path')
  .action(run(bindCommand));

program
  .command('projects')
  .description('List projects inferred from sessions')
  .action(run(projectsCommand));

program
  .command('doctor')
  .description('Check Codex and cxm paths')
  .action(doctorCommand);

program
  .command('app')
  .description('Open the Electron desktop app')
  .option('--foreground', 'keep Electron attached to this terminal')
  .action(electronAppCommand);

program
  .command('web')
  .description('Open the local browser UI')
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--port <port>', 'port to bind', '8765')
  .option('--no-open', 'do not open the browser automatically')
  .option('--no-scan', 'skip scan before starting')
  .action(run(webCommand));

program
  .command('tui', {isDefault: true})
  .description('Open the interactive terminal UI')
  .option('--no-scan', 'skip scan before opening UI')
  .action((options: {scan?: boolean}) => {
    render(<App shouldScan={options.scan !== false} />);
  });

program.parse();

function run<Args extends unknown[]>(fn: (...args: Args) => Promise<void>) {
  return (...args: Args) => {
    fn(...args).catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  };
}
