import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Operator-controlled immutable dependency. Never selected by a buyer request.
export const revision='5f548a80d77410bf4ebbd23bc59589217bb1adef';
const directory=resolve('.veildesk-runtime');
mkdirSync(directory,{recursive:true});
const git=args=>execFileSync('git',args,{cwd:directory,stdio:['ignore','pipe','pipe']}).toString().trim();
if(!existsSync(resolve(directory,'.git')))git(['init']);
git(['fetch','--depth','1','https://github.com/Cyano88/veildesk.git',revision]);
git(['checkout','--detach',revision]);
if(git(['rev-parse','HEAD'])!==revision||git(['status','--porcelain']))throw Error('VeilDesk runtime integrity check failed');
console.log('Pinned VeilDesk runtime ready: '+revision);
