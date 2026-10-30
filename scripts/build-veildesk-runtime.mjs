import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Operator-controlled immutable dependency. Never selected by a buyer request.
export const revision='9c55226ba7a2f9789a6e169e87557ee12551dcf1';
const directory=resolve('.veildesk-runtime');
mkdirSync(directory,{recursive:true});
const git=args=>execFileSync('git',args,{cwd:directory,stdio:['ignore','pipe','pipe']}).toString().trim();
if(!existsSync(resolve(directory,'.git')))git(['init']);
git(['fetch','--depth','1','https://github.com/Cyano88/veildesk.git',revision]);
git(['checkout','--detach',revision]);
if(git(['rev-parse','HEAD'])!==revision||git(['status','--porcelain']))throw Error('VeilDesk runtime integrity check failed');
console.log('Pinned VeilDesk runtime ready: '+revision);

