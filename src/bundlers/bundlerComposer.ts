import { BundlerInput, BundlerInterface, BundlerOutput } from "./bundler.interface";

export class BundlerComposer implements BundlerInterface {
    bundlers: BundlerInterface[]

    constructor(bundlers: BundlerInterface[]) {
        this.bundlers = bundlers;
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        if (this.bundlers.length === 0) {
            throw new Error("Invalid number of bundlers.")
        }

        let arg = await this.bundlers[0].bundle(input)
        for (let i = 1; i < this.bundlers.length; i++) {
            arg = await this.bundlers[i].bundle(arg)
        }

        return arg
    }


}