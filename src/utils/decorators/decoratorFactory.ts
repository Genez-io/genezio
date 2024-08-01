import { UserError } from "../../errors.js";
import { Language } from "../../projectConfiguration/yaml/models.js";
import { DecoratorExtractor } from "./baseDecoratorExtractor.js";
import { GoDecoratorExtractor } from "./goDecorators.js";
import { JsTsDecoratorExtractor } from "./jsTsDecorators.js";

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
