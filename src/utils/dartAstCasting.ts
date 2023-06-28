import { ArrayType, AstNodeType, CustomAstNodeType, MapType, Node, PromiseType } from "../models/genezioModels.js";

function castNodeRecursively(node: Node): string {
    let implementation = "";

    switch (node.type) {
        case AstNodeType.StringLiteral:
            implementation += `e as String`;
            break;
        case AstNodeType.DoubleLiteral:
            implementation += `e as double`;
            break;
        case AstNodeType.BooleanLiteral:
            implementation += `e as bool`;
            break;
        case AstNodeType.IntegerLiteral:
            implementation += `e as int`;
            break;
        case AstNodeType.CustomNodeLiteral:
            implementation += `${(node as CustomAstNodeType).rawValue}.fromJson(e as Map<String, dynamic>),`;
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
    let implementation = "";
    implementation += `(${name} as Map<${getParamType(mapType.genericKey)}, dynamic>).map((k, e) => MapEntry(k,`;
    implementation += castNodeRecursively(mapType.genericValue);
    implementation += `))`;

    return implementation;
}

export function castArrayRecursivelyInitial(arrayType: ArrayType, name: string): string {
    let implementation = "";

    implementation += `(${name} as List<dynamic>).map((e) => `;
    implementation += castNodeRecursively(arrayType.generic);
    implementation += `).toList()`;

    return implementation;
}

function castArrayRecursively(node: Node): string {
    let implementation = "";

    implementation += '(e as List<dynamic>).map((e) =>';
    implementation += castNodeRecursively(node)
    implementation += ').toList()';

    return implementation;
}

function castMapRecursively(node: Node): string {
    let implementation = "";

    implementation += '(e as Map<String, dynamic>).map((k, e) => MapEntry(k,';
    implementation += castNodeRecursively(node)
    implementation += '))';

    return implementation;
}

export function getParamType(elem: Node): string {
    switch (elem.type) {
        case AstNodeType.StringLiteral:
            return "String";
        case AstNodeType.DoubleLiteral:
            return "double";
        case AstNodeType.BooleanLiteral:
            return "bool";
        case AstNodeType.IntegerLiteral:
            return "int";
        case AstNodeType.AnyLiteral:
            return "Object";
        case AstNodeType.VoidLiteral:
            return "void";
        case AstNodeType.ArrayType:
            return `List<${getParamType((elem as ArrayType).generic)}>`;
        case AstNodeType.MapType:
            return `Map<${getParamType((elem as MapType).genericKey)}, ${getParamType((elem as MapType).genericValue)}>`;
        case AstNodeType.CustomNodeLiteral:
            return (elem as CustomAstNodeType).rawValue;
        case AstNodeType.PromiseType:
            return getParamType((elem as PromiseType).generic);
        case AstNodeType.DateType:
            return "DateTime";
        default:
            return "Object";
    }
}
