import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {revision,verifyVeilDeskRuntime} from './veildesk-runtime-version.mjs';
export {revision} from './veildesk-runtime-version.mjs';
// Operator-controlled immutable dependency. Never selected by a buyer request.
const directory=resolve('.veildesk-runtime');
mkdirSync(directory,{recursive:true});
const git=args=>execFileSync('git',args,{cwd:directory,stdio:['ignore','pipe','pipe']}).toString().trim();
if(!existsSync(resolve(directory,'.git')))git(['init']);
git(['fetch','--depth','1','https://github.com/Cyano88/veildesk.git',revision]);
git(['checkout','--detach',revision]);
verifyVeilDeskRuntime(directory);
console.log('Pinned VeilDesk runtime ready: '+revision);

