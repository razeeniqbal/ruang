// One error shape for every provider, so callers can tell a cancel from a timeout from a bad key.
const CODES=Object.freeze(['CANCELLED','TIMEOUT','AUTH','RATE_LIMIT','INVALID_MODEL','NETWORK','PROVIDER','INVALID_REQUEST','REFUSAL','EMPTY','NOT_CONNECTED']);
class ModelError extends Error{
  constructor(code,message){super(message);this.name='ModelError';this.code=CODES.includes(code)?code:'PROVIDER'}
}
// Map an HTTP status from a provider to a code and a short message; never includes the response body.
function fromStatus(company,status){
  if(status===401||status===403)return new ModelError('AUTH',`${company} rejected the saved key. Replace it under Settings, AI Connections.`);
  if(status===404)return new ModelError('INVALID_MODEL',`${company} does not recognise that model name.`);
  if(status===429)return new ModelError('RATE_LIMIT',`${company} rate limit reached. Try again shortly.`);
  if(status===400||status===422)return new ModelError('INVALID_REQUEST',`${company} did not accept the request (${status}).`);
  return new ModelError('PROVIDER',`${company} returned an error (${status}).`);
}
// Errors may cross into the page; make sure a key can never ride along in a message.
function redact(message,secret){let text=String(message||'');if(secret&&secret.length>=8)text=text.split(secret).join('[hidden]');return text.replace(/\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})\b/g,'[hidden]')}
module.exports={ModelError,CODES,fromStatus,redact};
