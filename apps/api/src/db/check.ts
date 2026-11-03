import 'dotenv/config';
import { parseEnv } from '../config/env.js';
import { createDatabase, probeDatabase } from './client.js';

const database = createDatabase(parseEnv(process.env));
try {
  const status = await probeDatabase(database);
  console.log(`Database: ${status}`);
  if (status !== 'connected' || !database) process.exitCode = 1;
  else {
    const client = await database.pool.connect();
    try {
      // pg_stat_ssl describes the pooler's server-side leg, not our TLS socket.
      const stream = (client as unknown as { connection: { stream: { encrypted?: boolean; authorized?: boolean } } }).connection.stream;
      const secure = stream.encrypted === true && stream.authorized === true;
      console.log(`Client TLS with certificate verification: ${secure ? 'verified' : 'not verified'}`);
      const upstream = await client.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()');
      console.log(`PostgreSQL-reported upstream TLS: ${upstream.rows[0]?.ssl === true ? 'enabled' : 'not enabled (pooler leg)'}`);
      if (parseEnv(process.env).DATABASE_SSL && !secure) process.exitCode = 1;
    } finally { client.release(); }
    const extension = await database.pool.query("select e.extversion, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'");
    if (!extension.rowCount) {
      const available = await database.pool.query("select 1 from pg_available_extensions where name='vector'");
      console.log(`pgvector: ${available.rowCount ? 'available; migration required' : 'not available'}`);
      process.exitCode = 1;
    } else {
      const schema = `"${String(extension.rows[0].nspname).replace(/"/g, '""')}"`;
      const result = await database.pool.query(`select '[1,2,3]'::${schema}.vector OPERATOR(${schema}.<->) '[1,2,3]'::${schema}.vector as distance`);
      console.log(`pgvector: ${result.rows[0].distance === 0 ? 'verified' : 'failed'}`);
      if (result.rows[0].distance !== 0) process.exitCode = 1;
    }
  }
} catch {
  console.error('Database verification failed; no connection details are logged.');
  process.exitCode = 1;
} finally {
  await database?.pool.end();
}
