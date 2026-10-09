import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Preserve npm's installed package layout, including nested dependency locations.
// SDK assets, TypeScript libraries and D2 workers stay beside their own modules.
export async function runtimePackages(project) {
  const root = resolve(project);
  const lock = JSON.parse(await fs.readFile(join(root, 'package-lock.json'), 'utf8'));
  const packages = new Map();

  async function find(name, owner, optional) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw Error(`Invalid runtime package name: ${name}`);
    for (let directory = owner; ; directory = dirname(directory)) {
      const source = join(directory, 'node_modules', name);
      try {
        const metadata = JSON.parse(await fs.readFile(join(source, 'package.json'), 'utf8'));
        const path = relative(root, source).split('\\').join('/');
        const recorded = lock.packages[path];
        if (isAbsolute(path) || !path.startsWith('node_modules/') || !recorded || recorded.link
          || recorded.dev || recorded.version !== metadata.version || metadata.name !== name
          || (await fs.lstat(source)).isSymbolicLink()) {
          throw Error(`Runtime package must be an ordinary installed package at its locked version: ${source}`);
        }
        return { source, path, metadata };
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
      }
      if (directory === root || dirname(directory) === directory) break;
    }
    if (!optional) throw Error(`Missing locked runtime package ${name}, required by ${owner}`);
  }

  async function visit(name, owner, optional = false) {
    const item = await find(name, owner, optional);
    if (!item || packages.has(item.path)) return;
    packages.set(item.path, item);
    const dependencies = { ...item.metadata.dependencies, ...item.metadata.optionalDependencies };
    for (const dependency of Object.keys(dependencies).sort()) {
      await visit(dependency, item.source, Object.hasOwn(item.metadata.optionalDependencies ?? {}, dependency));
    }
    for (const dependency of Object.keys(item.metadata.peerDependencies ?? {}).sort()) {
      await visit(dependency, item.source, item.metadata.peerDependenciesMeta?.[dependency]?.optional === true);
    }
  }

  await visit('executable-specification-language', root);
  return [...packages.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export async function packageRuntime(project, destination) {
  const packages = await runtimePackages(project);
  for (const item of packages) {
    const target = join(destination, item.path);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.cp(item.source, target, {
      recursive: true,
      // Dependency folders are copied through their own locked graph entries.
      filter: source => source !== join(item.source, 'node_modules'),
    });
  }
  return packages.length;
}
