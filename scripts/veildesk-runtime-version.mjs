import {execFileSync} from 'node:child_process';

// Build and startup must consume the same operator-controlled immutable pin.
export const revision='9c55226ba7a2f9789a6e169e87557ee12551dcf1';
export function verifyVeilDeskRuntime(directory,run=execFileSync){
 const git=args=>run('git',args,{cwd:directory,encoding:'utf8'}).trim();
 if(git(['rev-parse','HEAD'])!==revision||git(['status','--porcelain']))throw Error('Unverified VeilDesk runtime');
 return revision;
}
