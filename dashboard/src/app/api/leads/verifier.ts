import {backend} from '@/lib/backend';
import type {VerificationResult} from '@/lib/verification-types';
export async function verifyEmail(email:string):Promise<VerificationResult>{const result=await backend.call('leads','POST',{action:'verify',emails:[email]}) as {results:VerificationResult[]};return result.results[0];}
