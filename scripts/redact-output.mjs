export function redactOutput(line,secrets=[]) {
  for(const secret of secrets.filter(Boolean))line=line.split(secret).join('[REDACTED]');
  return line.replace(/((?:cookie|set-cookie|authorization|apikey)["']?\s*:)\s*[^\r\n]*/gi,'$1 [REDACTED]').replace(/cp_ppt=[^\s;"']+/g,'cp_ppt=[REDACTED]');
}
export function relayRedacted(stream,target,secrets=[]) {
  let pending='';stream.setEncoding('utf8');
  stream.on('data',chunk=>{pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)target.write(redactOutput(line,secrets)+'\n');});
  stream.on('end',()=>{if(pending)target.write(redactOutput(pending,secrets));});
}
