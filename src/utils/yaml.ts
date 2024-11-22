import { uniqueNamesGenerator, adjectives, colors, animals } from "unique-names-generator";

export function generateRandomSubdomain(): string {
    const name: string = uniqueNamesGenerator({
        dictionaries: [colors, adjectives, animals],
        separator: "-",
        style: "lowerCase",
        length: 3,
    });

    return name;
}

export function isUnique<T>(units: T[] | undefined, fieldName: keyof T): boolean {
    const unitSet = new Set<T[keyof T]>();
    for (const unit of units || []) {
        if (unitSet.has(unit[fieldName])) {
            return false;
        }
        unitSet.add(unit[fieldName]);
    }
    return true;
}
