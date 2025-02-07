import colors from "colors";
import { createHash as _createHash } from "crypto";

export const asciiCapybara = `        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣶⠛⢻⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣄⣼⡦⠴⠒⠒⠶⣤⣀⠀⣾⢧⡋⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⣀⡤⠶⠚⠉⠁⠀⠀⠀⠀⠀⠀⠀⠈⣿⣷⣋⡿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⢀⡤⠖⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣶⣶⣦⠈⠻⠻⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⢀⡠⠞⠃⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⡇⠀⡀⠙⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⡞⠁⠀⠀⠀⠀⢀⡴⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠛⠛⠟⠀⠀⠙⠀⠸⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⡿⣤⡀⠀⢀⡴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠘⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⡇⠀⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠳⣄⠀⠀⡀⠀⠈⢳⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⢹⡀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢈⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠙⢦⡀⠀⠙⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠘⣇⠀⠘⣆⠀⠀⠀⠀⠀⠀⠀⢀⣴⠞⠀⠹⠆⠀⠀⠈⢳⠀⠀⠀⠀⠀⠁⠀⠀⠀⠉⠳⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠘⢦⣤⣹⣄⣀⣀⣀⣠⣤⠴⠊⠀⠀⠀⠀⠀⠀⠀⠀⠈⠃⠀⠀⠀⠀⠲⣤⡀⠀⠀⠀⠀⠈⠙⠲⢤⡀⠀⠀⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠙⠲⢤⡀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⢰⡄⠀⠀⠀⠀⠁⠀⠀⠀⠀⠈⠑⠢⣄⡙⠷⣄⠀⠀⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠈⡇⠀⠀⡀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠈⠀⠀⠈⠳⣄⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⣻⠀⠀⢳⠀⠀⠀⠘⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠑⢄⠙⢆⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡇⠀⠈⠂⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⢀⣤⠴⠚⠃⠀⠀⠘⢢⡀⠀⠀⠉⠀⠀⠈⠧⠘⢧⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⢈⡇⠀⠀⠀⠀⠀⠀⠀⠘⠋⠀⠀⠀⠀⠀⣴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠙⢦⡀⠀⢦⠀⠀⠀⠀⠈⣇⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢹⠀⢰⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠀⠈⢳⡀⠀⠀⠀⠸⡆
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠘⠷⠀⠀⠀⠀⠀⢠⠀⠀⠀⠠⡏⠀⠀⢠⠀⠀⠀⠀⠀⢠⡀⠀⠀⠀⡀⠀⠀⠷⠀⢸⡄⠀⢳
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⡇⠀⠀⠀⠀⡄⠀⠀⢸⡇⠀⠀⢸⣧⠀⠀⠈⢣⠀⠀⠀⠀⢀⣳⠀⠀⠀⢹⡄⠀⠀⠀⠈⠁⠀⢸
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⡄⠀⠀⠀⣷⠀⠀⠘⠃⠀⠀⢀⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠁⠀⠀⠸⢳⡀⢀⡀⠀⢠⠀⢸
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⣄⠀⠀⢻⡇⠀⠀⠀⠀⠀⣸⠉⢧⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠀⠐⣧⠀⠸⠀⡼
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣿⣦⡀⣸⣷⠀⠀⠀⠀⠀⡇⠀⠈⠳⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⢸⠇
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣖⡿⣿⡟⣻⣿⣷⡄⠀⠀⢾⣁⡀⠀⠀⣨⡷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠏⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠿⠷⠿⣿⣥⠟⠀⣹⣾⠦⡿⡾⠇⠉⢻⣟⣀⣀⡬⠟⠲⢤⣀⣀⣀⣀⠀⠀⠀⠀⢀⣀⡴⠋⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠋⠁⢰⣿⡽⢛⡧⢠⡇⠀⠀⠀⠉⠉⠙⠓⠒⠒⠚⠉⠁⠀⠉⠑⠒⠒⠉⠉⠁⠀⠀⠀⠀
        ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠛⠒⣿⣤⠞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;

export const reset = "%s" + "\x1b[0m";
export const red = "\x1b[31m" + reset;
export const cyan = "\x1b[36m" + reset;

export const displayHint = function (message: string) {
    return `${colors.green(`Hint:`)} ${message}`;
};

/**
 * Replace an expression of format <prefix>${{<variable>}}<suffix>
 * to <prefix><value><suffix>
 *
 * ${{<variable>}} can be any alphanumeric string with special characters
 * like /, -, ., _ and whitespace
 *
 * @param {string} expression - The original resource string
 * @param {string} value - The value to replace the placeholder with.
 * @returns {string} - The updated string with the placeholder replaced.
 */
export function replaceExpression(expression: string, value: string|number|boolean): string {
    // ${{<variable>}} can be any alphanumeric string with special characters
    const placeholderPattern = /\${{[A-Za-z0-9\s/.\-_]+}}/;
    return expression.replace(placeholderPattern, value.toString());
}

/**
 * Create a fixed length hash of the data
 * @param {data} data - The data to hash
 * @param {number} len - The length of the random string to generate
 * */
export function createHash(data: string, len: number): string {
    return _createHash("shake256", { outputLength: len }).update(data).digest("hex");
}
