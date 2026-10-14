import {mkdir, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';

const root = process.cwd();
const metadata = JSON.parse(await readFile(path.join(root, 'metadata.json'), 'utf8'));
const dist = path.join(root, 'dist', metadata.uuid);
execFileSync('npm', ['run', 'check'], {cwd: root, stdio: 'inherit'});
execFileSync('npm', ['run', 'build'], {cwd: root, stdio: 'inherit'});

// `gnome-extensions pack` only picks up the entry points, stylesheet, schemas
// and po/ on its own; every other top-level entry of dist/ is passed explicitly.
const packedByDefault = new Set(['extension.js', 'prefs.js', 'metadata.json', 'stylesheet.css', 'schemas']);
const extraSources = (await readdir(dist))
    .filter(entry => !packedByDefault.has(entry))
    .map(entry => `--extra-source=${entry}`);

const output = path.join(root, 'build', 'releases');
await mkdir(output, {recursive: true});
execFileSync('gnome-extensions', [
    'pack',
    '--force',
    '--schema=schemas/org.gnome.shell.extensions.tokengrill.gschema.xml',
    ...extraSources,
    '--out-dir', output,
    dist,
], {stdio: 'inherit'});
