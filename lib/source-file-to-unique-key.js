/**
 * Takes a source file object and turns it into a unique key
 *
 * @param {import('..').SourceFile} sourceFile
 * @returns {string}
 */
export function sourceFilesToUniqueKey(sourceFile) {
  return [sourceFile.owner, sourceFile.repo, sourceFile.path].join("-");
}
