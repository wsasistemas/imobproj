// O app mora dentro do repositório do portal (Next.js), que tem o próprio node_modules com outra versão
// do React. Bloqueia o node_modules da raiz para o Metro nunca empacotar dois Reacts.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const raizDoPortal = path.resolve(__dirname, "../..", "node_modules");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.blockList = [new RegExp(`^${escapar(raizDoPortal)}[\\\\/].*`)];

module.exports = config;
