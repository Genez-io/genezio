import { uniqueNamesGenerator, adjectives, colors, animals } from "unique-names-generator";
import { YamlCron, YamlFunction } from "../projectConfiguration/yaml/v2.js";

export function generateRandomSubdomain(): string {
    const name: string = uniqueNamesGenerator({
        dictionaries: [colors, adjectives, animals],
        separator: "-",
        style: "lowerCase",
        length: 3,
    });

    return name;
}

type FieldName = "name";

export function isUnique(units: YamlCron[] | YamlFunction[], fieldName: FieldName): boolean {
    const unitMap = new Map<string, string>();
    for (const unit of units || []) {
        if (unitMap.has(unit[fieldName])) {
            return false;
        }
        unitMap.set(unit[fieldName], unit[fieldName]);
    }
    return true;
}
