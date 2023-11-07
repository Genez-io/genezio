import {
    ArrayType,
    AstNodeType,
    CustomAstNodeType,
    MapType,
    Node,
    PromiseType,
} from "../models/genezioModels.js";

function castNodeRecursively(node: Node): string {
    let implementation = "";

    switch (node.type) {
        case AstNodeType.StringLiteral:
            implementation += `e.toString().substring(1, e.toString().length - 1)`;
            break;
        case AstNodeType.DoubleLiteral:
            implementation += `e.toDouble()`;
            break;
        case AstNodeType.BooleanLiteral:
            implementation += `e.toString().toBoolean()`;
            break;
        case AstNodeType.IntegerLiteral:
            implementation += `Integer.parseInt(e.toString())`;
            break;
        case AstNodeType.CustomNodeLiteral:
            implementation += `Json.decodeFromString<${
                (node as CustomAstNodeType).rawValue
            }>(e.toString())`;
            break;
        case AstNodeType.ArrayType:
            implementation += castArrayRecursively((node as ArrayType).generic);
            break;
        case AstNodeType.MapType:
            implementation += castMapRecursively((node as MapType).genericValue);
    }

    return implementation;
}

export function castMapRecursivelyInitial(mapType: MapType, name: string): string {
    let implementation = "run {";
    implementation += `var map = mutableMapOf<${getParamType(mapType.genericKey)}, ${getParamType(
        mapType.genericValue,
    )}>(`;
    implementation += `*${name}.jsonObject.map{map_entry -> `;
    implementation += `var key = map_entry.key; var e = map_entry.value;`;
    implementation += `Pair(key, `;
    implementation += castNodeRecursively(mapType.genericValue);
    implementation += `)`;
    implementation += `}.toTypedArray())`;
    implementation += `;map`;
    implementation += "}";

    return implementation;
}

export function castArrayRecursivelyInitial(arrayType: ArrayType, name: string): string {
    let implementation = "";

    implementation += `(${name}.jsonArray.map{e -> `;
    implementation += castNodeRecursively(arrayType.generic);
    implementation += ` } )`;

    return implementation;
}

function castArrayRecursively(node: Node): string {
    let implementation = "";

    implementation += "(e.jsonArray.map{e -> ";
    implementation += castNodeRecursively(node);
    implementation += "} )";

    return implementation;
}

function castMapRecursively(node: Node): string {
    let implementation = "run {";
    implementation += `var map = mutableMapOf<String, Any>(`;
    implementation += `*e.jsonObject.map{map_entry -> `;
    implementation += `var key = map_entry.key; var e = map_entry.value;`;
    implementation += `Pair(key, `;
    implementation += castNodeRecursively(node);
    implementation += `)`;
    implementation += `}.toTypedArray())`;
    implementation += `;map`;
    implementation += "}";

    return implementation;
}

export function getParamType(elem: Node): string {
    switch (elem.type) {
        case AstNodeType.StringLiteral:
            return "String";
        case AstNodeType.DoubleLiteral:
            return "Double";
        case AstNodeType.BooleanLiteral:
            return "Boolean";
        case AstNodeType.IntegerLiteral:
            return "Int";
        case AstNodeType.AnyLiteral:
            return "Any";
        case AstNodeType.ArrayType:
            return `List<${getParamType((elem as ArrayType).generic)}>`;
        case AstNodeType.MapType:
            return `Map<${getParamType((elem as MapType).genericKey)}, ${getParamType(
                (elem as MapType).genericValue,
            )}>`;
        case AstNodeType.CustomNodeLiteral:
            return (elem as CustomAstNodeType).rawValue;
        case AstNodeType.PromiseType:
            return getParamType((elem as PromiseType).generic);
        default:
            return "Any";
    }
}
