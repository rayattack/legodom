/**
 * `lego-studio dev`: start the dev server and stay up until the terminal says
 * otherwise. The promise this returns is what keeps the process alive, so the
 * bin script's `process.exit` only runs once the server has actually closed.
 */

import { startDevServer } from '../dev/server.js';

/**
 * @param {object} flags
 * @returns {Promise<number>}
 */
export async function run(flags = {}) {
  const { server, url, close } = await startDevServer({
    root: flags.root || process.cwd(),
    port: flags.port,
    open: flags.open === true,
    include: flags.include,
    exclude: flags.exclude
  });

  console.log('');
  console.log(`  Lego Studio  ${url}`);
  console.log(`  preview      ${new URL('/preview', url).href}`);
  console.log(`  blocks from  ${flags.root || process.cwd()}`);
  console.log('');

  return new Promise((resolve) => {
    let closing = false;
    const stop = async () => {
      if (closing) return;
      closing = true;
      try {
        await close();
      } catch {
        // A server that failed to close cleanly should not change the exit
        // code: the user asked it to stop and it is stopping.
      }
      resolve(0);
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    server.httpServer?.once('close', () => {
      if (!closing) resolve(0);
    });
  });
}

export default run;
