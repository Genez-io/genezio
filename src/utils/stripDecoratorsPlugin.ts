import { NodePath } from "@babel/traverse";
import { Decorator } from "typescript";

export default function () {
    return {
        name: "strip-decorators",
        visitor: {
            Decorator(path: NodePath<Decorator>) {
                path.remove();
            },
        },
    };
}
