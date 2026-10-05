// The game engines in ../src are shared with the server and imported straight from source.
// Metro watches that folder, and bare imports made from it (h3-js) resolve from the app's node_modules,
// so the bundle never picks up a second copy from the repo root's install.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const appRoot = __dirname;
const sharedSrc = path.resolve(appRoot, "../src");

const config = getDefaultConfig(appRoot);
config.watchFolders = [sharedSrc];

const resolveDefault = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveDefault ?? context.resolveRequest;
  if (context.originModulePath.startsWith(sharedSrc + path.sep) && !moduleName.startsWith(".")) {
    return resolve({ ...context, originModulePath: path.join(appRoot, "index.ts") }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
