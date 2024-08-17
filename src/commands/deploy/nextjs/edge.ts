import ts from "typescript";
import fs from "fs";
import path from "path";

interface ExportedVariable {
    name: string;
    value: string;
}

export interface EdgeFunction {
    name: string;
    path: string;
    pattern: string;
}

function extractExportedVariables(filePath: string): ExportedVariable[] {
    const exportedVariables: ExportedVariable[] = [];

    // Read the file (either JS or TS)
    const sourceCode = fs.readFileSync(filePath, "utf8");

    // Infer the script kind based on the file extension (.ts or .js)
    const scriptKind = filePath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;

    // Create a SourceFile with the appropriate script kind
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.ES2015,
        true,
        scriptKind,
    );

    // Function to extract exported variables
    function extractExports(node: ts.Node) {
        // Check if the node is a variable statement with an 'export' modifier
        if (
            ts.isVariableStatement(node) &&
            node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
        ) {
            node.declarationList.declarations.forEach((declaration) => {
                if (ts.isIdentifier(declaration.name)) {
                    const variableName = declaration.name.text;
                    const initializer = declaration.initializer
                        ? declaration.initializer.getText()
                        : "undefined";
                    exportedVariables.push({ name: variableName, value: initializer });
                }
            });
        }
        // Continue traversing the children nodes
        ts.forEachChild(node, extractExports);
    }

    // Traverse the SourceFile and extract exported variables
    extractExports(sourceFile);

    return exportedVariables;
}

function walkDirectory(dir: string, callback: (filePath: string) => void) {
    // Read the directory entries synchronously
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Recursively walk through the subdirectory
            walkDirectory(fullPath, callback);
        } else if (entry.isFile()) {
            // Perform the callback operation on the file
            callback(fullPath);
        }
    });
}

function removeExtension(filePath: string) {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    return path.join(dir, fileName);
}

function walkDirectoryForEdgeFunctions(dir: string): Promise<EdgeFunction[]> {
    return new Promise((resolve) => {
        const edgeFunctions: EdgeFunction[] = [];
        let counter = 0;

        if (!fs.existsSync(dir)) {
            resolve(edgeFunctions);
        }

        walkDirectory(dir, (filePath) => {
            const filename = path.basename(filePath);
            if (filename === "route.ts" || filename === "route.js") {
                const exportedVariables = extractExportedVariables(filePath);
                const runtimeExport = exportedVariables.find(
                    (variable) => variable.name === "runtime",
                );
                if (runtimeExport) {
                    edgeFunctions.push({
                        name: `function-edge${counter++}`,
                        path: removeExtension(filePath),
                        pattern: filePath
                            .substring(3)
                            .substring(0, filePath.substring(3).length - 9),
                    });
                }
            }
        });
    });
}

export async function getEdgeFunctions(): Promise<EdgeFunction[]> {
    const edgeFunctions: EdgeFunction[] = [];
    const appFolderFunctions = await walkDirectoryForEdgeFunctions("./app/api");
    const srcAppFolderFunctions = await walkDirectoryForEdgeFunctions("./src/app/api");
    edgeFunctions.push(...appFolderFunctions, ...srcAppFolderFunctions);

    return edgeFunctions;
}
