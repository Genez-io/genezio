import { promises as fs, Dirent } from "fs";
import path from "path";

export function listFilesWithExtension(
    folderPath: string,
    fileExtension: string,
): Promise<string[]> {
    return fs.readdir(folderPath, { withFileTypes: true }).then((dirents: Dirent[]) => {
        return dirents
            .filter(
                (dirent: Dirent) => dirent.isFile() && path.extname(dirent.name) === fileExtension,
            )
            .map((dirent: Dirent) => path.join(folderPath, dirent.name));
    });
}
