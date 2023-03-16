import { exec } from 'child_process';
import log from "loglevel";


export function runNewProcess(command: string): Promise<boolean> {
  return new Promise(function (resolve, reject) {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        log.error(err);
        resolve(false);
      } else {
        log.info(stdout);
        log.info(stderr);
        resolve(true);
      }
    });
  });
}

