import { generateWithOpenAI } from './openai-provider.mjs';
import { validateWorkoutPlan } from './validator.mjs';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
class AppError extends Error {constructor(code,status=503){super(code);this.status=status;}}
export function environmentKey(env,single,collection,legacy){
 const direct=env(single)||env(legacy);if(direct)return direct;
 try{const keys=JSON.parse(env(collection)||'{}');if(record(keys)){const key=keys.default??Object.values(keys)[0];if(typeof key==='string'&&key)return key;}}catch{}
 throw new AppError('HGAI_SERVER_CONFIG_REQUIRED');
}
async function readRequest(req){
 if(Number(req.headers.get('content-length')??0)>2048)throw new AppError('HGAI_REQUEST_TOO_LARGE',413);
 const reader=req.body?.getReader();let size=0;const chunks=[];
 if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>2048){await reader.cancel();throw new AppError('HGAI_REQUEST_TOO_LARGE',413);}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('HGAI_INVALID_REQUEST',400);}
 if(!record(body)||Object.keys(body).length!==1||!uuid(body.requestId))throw new AppError('HGAI_INVALID_REQUEST',400);
 return body;
}
/** Factory para pruebas: NO puede cambiar modelo/usuario/propuesta desde el body móvil. */
export function createHandler({env,fetchImpl=fetch,logger=console}){
 return async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return reply({error:'HGAI_METHOD_NOT_ALLOWED'},405);
  try{
   const auth=req.headers.get('Authorization');
   if(!auth||!/^Bearer\s+\S+$/i.test(auth))return reply({error:'AUTH_REQUIRED'},401);
   const body=await readRequest(req);
   const base=env('SUPABASE_URL');if(!base)throw new AppError('HGAI_SERVER_CONFIG_REQUIRED');
   const anon=environmentKey(env,'SUPABASE_PUBLISHABLE_KEY','SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
   const service=environmentKey(env,'SUPABASE_SECRET_KEY','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
   const apiKey=env('OPENAI_API_KEY');if(!apiKey)throw new AppError('HGAI_OPENAI_KEY_MISSING');
   const authResponse=await fetchImpl(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:auth},signal:AbortSignal.timeout(10000)});
   if(!authResponse.ok)return reply({error:'AUTH_REQUIRED'},401);
   const user=await authResponse.json();
   if(!record(user)||!uuid(user.id)||user.role!=='authenticated')return reply({error:'AUTH_REQUIRED'},401);
   const headers={apikey:service,'Content-Type':'application/json'};
   if(!service.startsWith('sb_secret_'))headers.Authorization=`Bearer ${service}`;
   const rpc=async(name,payload)=>{
    const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const data=await response.json().catch(()=>null);
    if(!response.ok){const code=record(data)&&typeof data.message==='string'?data.message.match(/\b(HGAI_[A-Z_]+|HOME_GYM_[A-Z_]+|AUTH_REQUIRED)\b/)?.[1]:null;
     throw new AppError(code??'HGAI_BACKEND_ERROR',response.status===401?401:response.status===403?403:503);}
    return data;
   };
   const claim=await rpc('claim_home_gym_openai_request',{p_request_id:body.requestId,p_user_id:user.id});
   if(!record(claim))throw new AppError('HGAI_INVALID_SERVER_RESPONSE');
   if(claim.claimed!==true)return reply(claim.result);
   if(!uuid(claim.lease_token)||!record(claim.context))throw new AppError('HGAI_INVALID_SERVER_RESPONSE');
   const result=await generateWithOpenAI(claim.context,apiKey,{fetchImpl,model:claim.model});
   if(!result.error_code){
    try{const report=validateWorkoutPlan(result.candidate,claim.context);
     // PostgreSQL vuelve a validar y conserva códigos concretos para una respuesta inválida.
     if(!report.valid)logger.warn('home-gym-openai candidate rejected by prevalidator',body.requestId);
    }catch{result.error_code='HGAI_VALIDATION_FAILED';result.candidate=null;}
   }
   const finished=await rpc('finish_home_gym_openai_request',{
    p_request_id:body.requestId,p_user_id:user.id,p_lease_token:claim.lease_token,p_result:result
   });
   return reply(finished);
  }catch(error){
   const code=error instanceof AppError?error.message:'HGAI_TEMPORARY_FAILURE';
   // No imprimir claves, JWT, contexto ni cuerpo completo del proveedor.
   logger.error('home-gym-generate-openai:',code);
   return reply({error:code},error instanceof AppError?error.status:503);
  }
 };
}
