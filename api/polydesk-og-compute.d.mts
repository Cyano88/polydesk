import type {ZeroScoutIntelligenceResult} from './zeroscout-intelligence.js';
export function readComputeConfig(env?:NodeJS.ProcessEnv):{baseUrl:string;apiKey:string;model:string};
export function validateComputeReport(value:unknown,side:string):unknown;
export function createPrivateComputeResearch(options?:{env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch}):
  (context:Record<string,unknown>)=>Promise<ZeroScoutIntelligenceResult>;
export function createComputeResearch(options?:{env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;requireAttestation?:boolean}):
  (context:Record<string,unknown>)=>Promise<ZeroScoutIntelligenceResult>;
export function preflightCompute(options?:{env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch}):Promise<void>;
