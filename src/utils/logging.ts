import log from 'loglevel';

export async function setLogLevel(verbose: boolean): Promise<void> {
    if (verbose) {
        log.setLevel("trace");
    }
}
