import fs from "fs"
import { getBundleFolderSizeLimit } from './file.js';

export async function calculateBiggestFiles(dependencies: any, allNonJsFilesPaths: any) {
  interface FileSizeInfo {
    name: string;
    totalSize: number;
  }
  const fileSizes: FileSizeInfo[] = [];
  const nodeModulesData: { name: string; totalSize: number }[] = [];

  const promises = dependencies.map(async (file: any) => {
    const filePath = file.path;
    const depSize: any = await getBundleFolderSizeLimit(filePath);

    const { totalSize } = depSize;

    const moduleData = {
      name: file.name,
      totalSize: totalSize,
    };
    nodeModulesData.push(moduleData);
  });
  await Promise.all(promises);

  allNonJsFilesPaths.forEach((fileInfo: any) => {
    const filePath = fileInfo.path;

    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      const totalSize = stats.size;
      fileSizes.push({
        name: fileInfo.name + fileInfo.extension,
        totalSize,
      });
    }
  });

  return {
    dependenciesSize: nodeModulesData,
    filesSize: fileSizes,
  };
}
