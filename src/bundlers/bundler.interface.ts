import { ClassConfiguration } from "../models/projectConfiguration"

export type BundlerInput = {
    configuration: ClassConfiguration
    path: string
    extra?: { [id: string]: any; }
}

export type BundlerOutput = {
    configuration: ClassConfiguration
    path: string
    extra?: { [id: string]: any; }
}

export interface BundlerInterface {
    bundle: (input: BundlerInput) => Promise<BundlerOutput>
}