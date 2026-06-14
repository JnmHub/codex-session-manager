import {startWebServer} from '../web/server.js';

export async function webCommand(options: {port?: string; host?: string; open?: boolean; scan?: boolean}) {
  const {url} = await startWebServer({
    host: options.host,
    port: options.port ? Number(options.port) : undefined,
    open: options.open !== false,
    scan: options.scan !== false
  });

  console.log(`Codex Session Manager is running at ${url}`);
  console.log('Press Ctrl+C to stop.');
}
