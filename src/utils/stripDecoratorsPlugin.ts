import { NodePath } from "@babel/traverse";
import { Decorator } from "@babel/types";

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
