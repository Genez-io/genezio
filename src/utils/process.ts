import { exec } from 'child_process';
import log from "loglevel";


export function runNewProcess(command: string, cwd?: string): Promise<boolean> {
  return new Promise(function (resolve, reject) {
    exec(command, { cwd },  (err, stdout, stderr) => {
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

export function runNewProcessWithResult(command: string, cwd?: string): Promise<string> {
  return new Promise(function (resolve, reject) {
    exec(command, { cwd },  (err, stdout, stderr) => {
      if (err) {
        resolve(stderr);
      } else {
        resolve(stdout);
      }
    });
  });
}
