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

                    if (declaration.initializer) {
                        // Case 1: If the initializer is an object literal (e.g., `export const config = { runtime: 'edge', preferredRegion: 'lhr1' };`)
                        if (ts.isObjectLiteralExpression(declaration.initializer)) {
                            declaration.initializer.properties.forEach((prop) => {
                                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                                    const propName = prop.name.text;
                                    if (ts.isStringLiteral(prop.initializer)) {
                                        const propValue = prop.initializer.getText(); // Get the text with quotes
                                        exportedVariables.push({
                                            name: propName,
                                            value: propValue,
                                        });
                                    }
                                }
                            });
                        }
                        // Case 2: If it's a direct variable assignment (e.g., `export const runtime = "edge";`)
                        else if (ts.isStringLiteral(declaration.initializer)) {
                            const initializerValue = declaration.initializer.getText(); // Get the text with quotes
                            exportedVariables.push({ name: variableName, value: initializerValue });
                        }
                    }
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

function getPatternFromPath(filePath: string): string {
    // Normalize the path for cross-platform compatibility
    const normalizedPath = path.posix.normalize(filePath);

    // Remove the prefix 'app' or 'src/app' regardless of whether './' is present
    const cleanedPath = normalizedPath.replace(/^(?:\.\/)?(src\/)?app\//, "");

    // Remove the filename (page.tsx, page.js, route.tsx, route.js, route.ts)
    const pattern = cleanedPath.replace(/\/(page|route)\.(tsx|js|ts)$/, "");

    // Prepend a slash to the resulting path
    return `/${pattern}`;
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
            if (
                filename === "route.ts" ||
                filename === "route.js" ||
                filename === "page.tsx" ||
                filename === "page.jsx" ||
                filename === "page.js"
            ) {
                const exportedVariables = extractExportedVariables(filePath);
                const edgeRuntimeExport = exportedVariables.find(
                    (variable) => variable.name === "runtime" && variable.value === '"edge"',
                );

                if (edgeRuntimeExport) {
                    edgeFunctions.push({
                        name: `function-edge${counter++}`,
                        path: removeExtension(filePath),
                        pattern: getPatternFromPath(filePath),
                    });
                }
            }
        });

        resolve(edgeFunctions);
    });
}

export async function getEdgeFunctions(cwd?: string): Promise<EdgeFunction[]> {
    const edgeFunctions: EdgeFunction[] = [];
    const pathForAppAbsolute = path.join(cwd || process.cwd(), "app");
    const pathForSrcAbsolute = path.join(cwd || process.cwd(), "src", "app");

    const pathForApp = path.relative(cwd || process.cwd(), pathForAppAbsolute);
    const pathForSrc = path.relative(cwd || process.cwd(), pathForSrcAbsolute);

    const appFolderFunctions = await walkDirectoryForEdgeFunctions(pathForApp);
    const srcAppFolderFunctions = await walkDirectoryForEdgeFunctions(pathForSrc);
    edgeFunctions.push(...appFolderFunctions, ...srcAppFolderFunctions);

    return edgeFunctions;
}
