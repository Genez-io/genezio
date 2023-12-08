import fs from "fs";
import { getBundleFolderSizeLimit } from "./file.js";
import { Dependency } from "../bundlers/bundler.interface.js";
import FileDetails from "../models/fileDetails.js";

type PackageInfo = {
    name: string;
    totalSize: number;
};

function getTop5LargestPackages(packages: PackageInfo[]): string[] {
    const sortedPackages = packages.sort((a, b) => b.totalSize - a.totalSize);
    const top5Packages = sortedPackages.slice(0, 5);
    const formatedSizes = top5Packages.map((pkg) => `${pkg.name} -> ${pkg.totalSize.toFixed(3)}mb`);
    return formatedSizes;
}

export async function calculateBiggestFiles(
    dependencies: Dependency[],
    allNonJsFilesPaths: FileDetails[],
) {
    const fileSizes: { name: string; totalSize: number }[] = [];
    const nodeModulesData: { name: string; totalSize: number }[] = [];

    const promises = dependencies.map(async (file) => {
        const depSize: number = await getBundleFolderSizeLimit(file.path);
        const moduleData = {
            name: file.name,
            totalSize: depSize / 1024 ** 2,
        };
        nodeModulesData.push(moduleData);
    });
    await Promise.all(promises);

    allNonJsFilesPaths.forEach((fileInfo) => {
        const stats = fs.statSync(fileInfo.path);

        if (!stats.isFile()) {
            return;
        }

        const totalSize = stats.size;
        fileSizes.push({
            name: fileInfo.name + fileInfo.extension,
            totalSize: totalSize / 1024 ** 2,
        });
    });

    return {
        dependenciesSize: getTop5LargestPackages(nodeModulesData),
        filesSize: getTop5LargestPackages(fileSizes),
    };
}
