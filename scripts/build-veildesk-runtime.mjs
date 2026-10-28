import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Operator-controlled immutable dependency. Never selected by a buyer request.
export const revision='2dd3c860cbcf6d93b9df5f30d952b3d2c962f58d';
const directory=resolve('.veildesk-runtime');
mkdirSync(directory,{recursive:true});
const git=args=>execFileSync('git',args,{cwd:directory,stdio:['ignore','pipe','pipe']}).toString().trim();
if(!existsSync(resolve(directory,'.git')))git(['init']);
git(['fetch','--depth','1','https://github.com/Cyano88/veildesk.git',revision]);
git(['checkout','--detach',revision]);
if(git(['rev-parse','HEAD'])!==revision||git(['status','--porcelain']))throw Error('VeilDesk runtime integrity check failed');
console.log('Pinned VeilDesk runtime ready: '+revision);

