import { UserError } from "../../errors.js";
import FileDetails from "../../models/fileDetails.js";
import { Language } from "../../yamlProjectConfiguration/models.js";
import { ClassInfo } from "./decoratorTypes.js";
import { GoDecoratorExtractor } from "./goDecorators.js";
import { JsTsDecoratorExtractor } from "./jsTsDecorators.js";

export interface DecoratorExtractor {
    getDecoratorsFromFile: (file: string) => Promise<ClassInfo[]>;
    fileFilter: (cwd: string) => (file: FileDetails) => boolean;
}

export class DecoratorExtractorFactory {
    static createExtractor = (language: Language): DecoratorExtractor => {
        switch (language) {
            case Language.js:
                return new JsTsDecoratorExtractor();
            case Language.ts:
                return new JsTsDecoratorExtractor();
            case Language.go:
                return new GoDecoratorExtractor();
            default:
                throw new UserError("Language not supported");
        }
    };
}
